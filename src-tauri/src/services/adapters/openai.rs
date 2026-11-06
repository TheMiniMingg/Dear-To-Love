//! OpenAI-compatible chat completions (`POST {base}/chat/completions`).
//!
//! "Compatible" servers differ, so parsing is lenient: content may be null,
//! usage may be missing or arrive in its own final chunk, `[DONE]` may be
//! absent, errors may arrive inside the stream, and a server may ignore
//! `stream: true` and answer with one JSON body.

use std::time::Duration;

use reqwest::header::{HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde_json::{json, Value};
use tokio_util::sync::CancellationToken;

use super::sse::SseReader;
use super::{Completion, GenerateError};
use crate::domain::provider::{is_loopback, GenerateRequest, NormalizedUsage, Role};
use crate::errors::{AppError, ErrorCode};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const MAX_ERROR_BODY: usize = 8 * 1024;

pub struct OpenAiCompatible {
    base_url: String,
    api_key: Option<String>,
    client: reqwest::Client,
}

impl OpenAiCompatible {
    pub fn new(base_url: &str, api_key: Option<String>) -> Result<Self, AppError> {
        let mut builder = reqwest::Client::builder()
            .connect_timeout(CONNECT_TIMEOUT)
            .user_agent(concat!("DearToLove/", env!("CARGO_PKG_VERSION")));
        if is_loopback(base_url) {
            // A local model server must never be routed through a proxy.
            builder = builder.no_proxy();
        }
        let client = builder
            .build()
            .map_err(|e| AppError::internal(format!("could not create HTTP client: {e}")))?;
        Ok(Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            api_key: api_key.filter(|k| !k.trim().is_empty()),
            client,
        })
    }

    fn auth(&self, rb: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        match &self.api_key {
            Some(k) => match HeaderValue::from_str(&format!("Bearer {}", k.trim())) {
                Ok(mut v) => {
                    v.set_sensitive(true);
                    rb.header(AUTHORIZATION, v)
                }
                Err(_) => rb,
            },
            None => rb,
        }
    }

    /// Official OpenAI rejects `max_tokens` for newer models; most other
    /// compatible servers only know `max_tokens`.
    fn uses_max_completion_tokens(&self) -> bool {
        url::Url::parse(&self.base_url)
            .ok()
            .and_then(|u| {
                u.host_str()
                    .map(|h| h.eq_ignore_ascii_case("api.openai.com"))
            })
            .unwrap_or(false)
    }

    pub fn request_body(&self, req: &GenerateRequest) -> Value {
        let messages: Vec<Value> = req
            .messages
            .iter()
            .map(|m| {
                json!({
                    "role": match m.role {
                        Role::System => "system",
                        Role::User => "user",
                        Role::Assistant => "assistant",
                    },
                    "content": m.content,
                })
            })
            .collect();
        let mut body = json!({
            "model": req.model_id,
            "messages": messages,
            "stream": true,
            "stream_options": { "include_usage": true },
        });
        let limit_field = if self.uses_max_completion_tokens() {
            "max_completion_tokens"
        } else {
            "max_tokens"
        };
        body[limit_field] = json!(req.max_output_tokens);
        if let Some(t) = req.temperature {
            body["temperature"] = json!(t);
        }
        body
    }

    /// Stream one reply. `on_delta` receives display-only draft text.
    pub async fn generate(
        &self,
        req: &GenerateRequest,
        cancel: &CancellationToken,
        on_delta: &mut (dyn FnMut(&str) + Send),
    ) -> Result<Completion, GenerateError> {
        let idle = Duration::from_millis(req.timeout_ms as u64);
        let body = serde_json::to_vec(&self.request_body(req))
            .map_err(|e| GenerateError::not_sent(AppError::internal(e.to_string())))?;
        let send = self
            .auth(
                self.client
                    .post(format!("{}/chat/completions", self.base_url))
                    .header(CONTENT_TYPE, "application/json"),
            )
            .body(body)
            .send();

        let resp = tokio::select! {
            _ = cancel.cancelled() => return Err(GenerateError::cancelled()),
            r = tokio::time::timeout(idle, send) => match r {
                Err(_) => return Err(GenerateError::maybe_charged(unreachable_err(
                    "the AI service did not answer in time",
                ))),
                Ok(Err(e)) => return Err(send_error(e)),
                Ok(Ok(resp)) => resp,
            },
        };

        let status = resp.status();
        if !status.is_success() {
            let text = read_limited(resp, cancel, idle).await;
            return Err(http_error(status.as_u16(), &text));
        }
        let is_json = resp
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .is_some_and(|v| v.starts_with("application/json"));

        let mut state = StreamState::default();
        if is_json {
            let text = read_limited_large(resp, cancel, idle).await?;
            let v: Value = serde_json::from_str(&text).map_err(|_| {
                GenerateError::maybe_charged(provider_err(
                    "the AI service sent a reply this app could not read",
                ))
            })?;
            state.apply_whole(&v)?;
            if !state.text.is_empty() {
                on_delta(&state.text);
            }
        } else {
            let mut resp = resp;
            let mut sse = SseReader::default();
            'read: loop {
                let chunk = tokio::select! {
                    _ = cancel.cancelled() => return Err(GenerateError::cancelled()),
                    r = tokio::time::timeout(idle, resp.chunk()) => match r {
                        Err(_) => return Err(GenerateError::maybe_charged(unreachable_err(
                            "the AI service stopped responding mid-reply",
                        ))),
                        Ok(Err(e)) => return Err(GenerateError::maybe_charged(unreachable_err(
                            format!("the connection dropped mid-reply ({})", short(&e.to_string())),
                        ))),
                        Ok(Ok(c)) => c,
                    },
                };
                let events = match chunk {
                    Some(bytes) => sse.push(&bytes),
                    None => {
                        let rest = sse.finish();
                        for data in rest {
                            if state.apply_event(&data, on_delta)? {
                                break 'read;
                            }
                        }
                        break 'read;
                    }
                };
                for data in events {
                    if state.apply_event(&data, on_delta)? {
                        break 'read;
                    }
                }
            }
            if !state.done && state.finish_reason.is_none() {
                return Err(GenerateError::maybe_charged(unreachable_err(
                    "the connection closed before the reply finished",
                )));
            }
        }

        if state.text.trim().is_empty() {
            return Err(GenerateError::maybe_charged(provider_err(
                "the AI service returned an empty reply",
            )));
        }
        Ok(Completion {
            text: state.text,
            finish_reason: state.finish_reason.unwrap_or_else(|| "stop".into()),
            usage: state.usage,
        })
    }

    /// Free connection check: lists models. Never sends story text.
    pub async fn list_models(&self) -> Result<Vec<String>, AppError> {
        let resp = tokio::time::timeout(
            Duration::from_secs(20),
            self.auth(self.client.get(format!("{}/models", self.base_url)))
                .send(),
        )
        .await
        .map_err(|_| unreachable_err("the AI service did not answer in time"))?
        .map_err(|e| send_error(e).error)?;
        let status = resp.status();
        let text = read_limited(resp, &CancellationToken::new(), Duration::from_secs(20)).await;
        if !status.is_success() {
            return Err(http_error(status.as_u16(), &text).error);
        }
        let v: Value = serde_json::from_str(&text)
            .map_err(|_| provider_err("the server answered, but not with a model list"))?;
        let list = v
            .get("data")
            .or_else(|| v.get("models"))
            .and_then(Value::as_array)
            .ok_or_else(|| provider_err("the server answered, but not with a model list"))?;
        Ok(list
            .iter()
            .filter_map(|m| {
                m.get("id")
                    .or_else(|| m.get("name"))
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .collect())
    }
}

#[derive(Default)]
struct StreamState {
    text: String,
    finish_reason: Option<String>,
    usage: NormalizedUsage,
    done: bool,
}

impl StreamState {
    /// Returns true when the stream signalled its end.
    fn apply_event(
        &mut self,
        data: &str,
        on_delta: &mut (dyn FnMut(&str) + Send),
    ) -> Result<bool, GenerateError> {
        let data = data.trim();
        if data.is_empty() {
            return Ok(false);
        }
        if data == "[DONE]" {
            self.done = true;
            return Ok(true);
        }
        match serde_json::from_str::<Value>(data) {
            Ok(v) => self.apply_chunk(&v, on_delta),
            // Some servers omit blank lines between events; try line by line.
            Err(_) if data.contains('\n') => {
                for line in data.lines() {
                    let line = line.trim();
                    if line == "[DONE]" {
                        self.done = true;
                        return Ok(true);
                    }
                    if let Ok(v) = serde_json::from_str::<Value>(line) {
                        self.apply_chunk(&v, on_delta)?;
                    }
                }
                Ok(false)
            }
            Err(_) => Ok(false), // ignore unknown non-JSON events
        }
    }

    fn apply_chunk(
        &mut self,
        v: &Value,
        on_delta: &mut (dyn FnMut(&str) + Send),
    ) -> Result<bool, GenerateError> {
        if let Some(err) = v.get("error") {
            return Err(GenerateError::maybe_charged(in_stream_error(err)));
        }
        if let Some(u) = v.get("usage").filter(|u| !u.is_null()) {
            self.usage = parse_usage(u);
        }
        if let Some(choice) = v.get("choices").and_then(|c| c.get(0)) {
            if let Some(t) = choice
                .get("delta")
                .and_then(|d| d.get("content"))
                .and_then(Value::as_str)
            {
                if !t.is_empty() {
                    self.text.push_str(t);
                    on_delta(t);
                }
            }
            if let Some(f) = choice.get("finish_reason").and_then(Value::as_str) {
                self.finish_reason = Some(f.to_string());
            }
        }
        Ok(false)
    }

    fn apply_whole(&mut self, v: &Value) -> Result<(), GenerateError> {
        if let Some(err) = v.get("error") {
            return Err(GenerateError::maybe_charged(in_stream_error(err)));
        }
        if let Some(u) = v.get("usage").filter(|u| !u.is_null()) {
            self.usage = parse_usage(u);
        }
        let choice = v.get("choices").and_then(|c| c.get(0));
        if let Some(t) = choice
            .and_then(|c| c.get("message"))
            .and_then(|m| m.get("content"))
            .and_then(Value::as_str)
        {
            self.text = t.to_string();
        }
        self.finish_reason = choice
            .and_then(|c| c.get("finish_reason"))
            .and_then(Value::as_str)
            .map(str::to_string)
            .or(Some("stop".into()));
        self.done = true;
        Ok(())
    }
}

/// Normalize `usage`: prompt/completion tokens plus cached prompt tokens
/// (`prompt_tokens_details.cached_tokens`, or `prompt_cache_hit_tokens`).
pub fn parse_usage(u: &Value) -> NormalizedUsage {
    let n = |v: Option<&Value>| v.and_then(Value::as_u64);
    NormalizedUsage {
        input_tokens: n(u.get("prompt_tokens")).or(n(u.get("input_tokens"))),
        cached_input_tokens: n(u
            .get("prompt_tokens_details")
            .and_then(|d| d.get("cached_tokens")))
        .or(n(u.get("prompt_cache_hit_tokens"))),
        output_tokens: n(u.get("completion_tokens")).or(n(u.get("output_tokens"))),
    }
}

fn short(s: &str) -> String {
    let s = s.trim();
    if s.chars().count() > 300 {
        format!("{}…", s.chars().take(300).collect::<String>())
    } else {
        s.to_string()
    }
}

fn unreachable_err(msg: impl Into<String>) -> AppError {
    AppError::new(ErrorCode::ProviderUnreachable, msg)
}

fn provider_err(msg: impl Into<String>) -> AppError {
    AppError::new(ErrorCode::ProviderError, msg)
}

fn send_error(e: reqwest::Error) -> GenerateError {
    if e.is_connect() {
        GenerateError::not_sent(unreachable_err(
            "could not reach the AI service; check the address and your connection",
        ))
    } else if e.is_timeout() {
        GenerateError::maybe_charged(unreachable_err("the AI service did not answer in time"))
    } else if e.is_builder() {
        GenerateError::not_sent(AppError::invalid_input(format!(
            "the connection settings are not valid ({})",
            short(&e.without_url().to_string())
        )))
    } else {
        GenerateError::maybe_charged(unreachable_err(format!(
            "the request to the AI service failed ({})",
            short(&e.without_url().to_string())
        )))
    }
}

fn provider_message(body: &str) -> Option<String> {
    let v: Value = serde_json::from_str(body).ok()?;
    let e = v.get("error").unwrap_or(&v);
    e.get("message")
        .and_then(Value::as_str)
        .or_else(|| e.as_str())
        .map(short)
}

fn looks_like_context_limit(body: &str) -> bool {
    let b = body.to_ascii_lowercase();
    b.contains("context_length")
        || b.contains("context length")
        || b.contains("maximum context")
        || b.contains("too many tokens")
        || b.contains("prompt is too long")
}

/// Map an HTTP error status. Requests refused outright (bad key, rate limit,
/// unknown model) are not charged; server errors might have been.
fn http_error(status: u16, body: &str) -> GenerateError {
    let detail = provider_message(body);
    let with = |base: &str| match &detail {
        Some(d) => format!("{base}: {d}"),
        None => base.to_string(),
    };
    match status {
        401 | 403 => GenerateError::not_charged(AppError::new(
            ErrorCode::AuthFailed,
            with("the AI service refused the API key"),
        )),
        429 => GenerateError::not_charged(AppError::new(
            ErrorCode::RateLimited,
            with("the AI service is limiting requests or the account is out of credit"),
        )),
        400 | 413 | 422 if looks_like_context_limit(body) => {
            GenerateError::not_charged(AppError::new(
                ErrorCode::ContextTooLong,
                with("the story is too long for this model"),
            ))
        }
        404 => GenerateError::not_charged(provider_err(with(
            "the AI service could not find that model or address",
        ))),
        400..=499 => GenerateError::not_charged(provider_err(with(&format!(
            "the AI service rejected the request (HTTP {status})"
        )))),
        _ => GenerateError::maybe_charged(provider_err(with(&format!(
            "the AI service had a problem (HTTP {status})"
        )))),
    }
}

fn in_stream_error(err: &Value) -> AppError {
    let msg = err
        .get("message")
        .and_then(Value::as_str)
        .or_else(|| err.as_str())
        .map(short)
        .unwrap_or_else(|| "the AI service reported an error".into());
    let code = err
        .get("code")
        .map(|c| c.to_string().to_ascii_lowercase())
        .unwrap_or_default();
    if code.contains("context") || looks_like_context_limit(&msg) {
        AppError::new(ErrorCode::ContextTooLong, msg)
    } else if code.contains("rate") || code.contains("429") {
        AppError::new(ErrorCode::RateLimited, msg)
    } else {
        provider_err(msg)
    }
}

async fn read_limited(
    resp: reqwest::Response,
    cancel: &CancellationToken,
    idle: Duration,
) -> String {
    let mut resp = resp;
    let mut out = Vec::new();
    while out.len() < MAX_ERROR_BODY {
        let next = tokio::select! {
            _ = cancel.cancelled() => break,
            r = tokio::time::timeout(idle, resp.chunk()) => r,
        };
        match next {
            Ok(Ok(Some(b))) => out.extend_from_slice(&b),
            _ => break,
        }
    }
    out.truncate(MAX_ERROR_BODY);
    String::from_utf8_lossy(&out).into_owned()
}

async fn read_limited_large(
    resp: reqwest::Response,
    cancel: &CancellationToken,
    idle: Duration,
) -> Result<String, GenerateError> {
    const MAX: usize = 4 * 1024 * 1024;
    let mut resp = resp;
    let mut out = Vec::new();
    loop {
        let next = tokio::select! {
            _ = cancel.cancelled() => return Err(GenerateError::cancelled()),
            r = tokio::time::timeout(idle, resp.chunk()) => r,
        };
        match next {
            Ok(Ok(Some(b))) => {
                out.extend_from_slice(&b);
                if out.len() > MAX {
                    return Err(GenerateError::maybe_charged(provider_err(
                        "the AI service sent an unexpectedly large reply",
                    )));
                }
            }
            Ok(Ok(None)) => break,
            Ok(Err(_)) | Err(_) => {
                return Err(GenerateError::maybe_charged(unreachable_err(
                    "the connection dropped mid-reply",
                )))
            }
        }
    }
    Ok(String::from_utf8_lossy(&out).into_owned())
}

#[cfg(test)]
mod tests;

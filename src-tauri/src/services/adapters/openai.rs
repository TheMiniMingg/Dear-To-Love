//! OpenAI-compatible chat completions (`POST {base}/chat/completions`).
//!
//! "Compatible" servers differ, so parsing is lenient: content may be null,
//! usage may be missing or arrive in its own final chunk, `[DONE]` may be
//! absent, errors may arrive inside the stream, and a server may ignore
//! `stream: true` and answer with one JSON body.

use std::time::Duration;

use reqwest::header::CONTENT_TYPE;
use serde_json::{json, Value};
use tokio_util::sync::CancellationToken;

use super::http::{
    self, http_error, in_stream_error, provider_err, read_limited, read_limited_large, send_error,
    short, unreachable_err,
};
use super::sse::SseReader;
use super::{empty_reply_error, Completion, GenerateError};
use crate::domain::provider::{GenerateRequest, NormalizedUsage, Role};
use crate::errors::AppError;

pub struct OpenAiCompatible {
    base_url: String,
    api_key: Option<String>,
    client: reqwest::Client,
    host: Host,
}

/// The services whose models are asked differently. Any other server gets
/// the request exactly as the connection's settings say.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Host {
    OpenAi,
    Google,
    Xai,
    OpenRouter,
    Other,
}

impl Host {
    fn of(base_url: &str) -> Self {
        let host = url::Url::parse(base_url)
            .ok()
            .and_then(|u| u.host_str().map(str::to_ascii_lowercase))
            .unwrap_or_default();
        match host.as_str() {
            "api.openai.com" => Self::OpenAi,
            "generativelanguage.googleapis.com" => Self::Google,
            "api.x.ai" => Self::Xai,
            "openrouter.ai" => Self::OpenRouter,
            _ => Self::Other,
        }
    }
}

/// How a model that thinks before it writes is asked to keep that short.
/// Story replies need little planning, and thinking spends the same token
/// limit the reply does.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ThinksFirst {
    /// OpenRouter takes `reasoning: {effort}`; the others `reasoning_effort`.
    nested: bool,
    /// Whether the model still takes a temperature of its own.
    pub temperature: bool,
}

/// Settings this app adds by itself, and how an error names each one. A
/// request refused for one of them is sent once more without it.
const OPTIONAL: &[(&str, &[&str])] = &[
    ("temperature", &["temperature"]),
    (
        "reasoning_effort",
        &["reasoning_effort", "reasoningeffort", "reasoning effort"],
    ),
    ("reasoning", &["reasoning"]),
    ("stream_options", &["stream_options"]),
];

impl OpenAiCompatible {
    pub fn new(base_url: &str, api_key: Option<String>) -> Result<Self, AppError> {
        let client = http::client(base_url)?;
        Ok(Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            api_key: api_key.filter(|k| !k.trim().is_empty()),
            client,
            host: Host::of(base_url),
        })
    }

    fn auth(&self, rb: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        http::bearer(rb, self.api_key.as_deref())
    }

    /// Official OpenAI rejects `max_tokens` for newer models; most other
    /// compatible servers only know `max_tokens`.
    fn uses_max_completion_tokens(&self) -> bool {
        self.host == Host::OpenAi
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
        match self.thinking(&req.model_id) {
            Some(t) => {
                if t.nested {
                    body["reasoning"] = json!({ "effort": "low" });
                } else {
                    body["reasoning_effort"] = json!("low");
                }
                if let Some(temp) = req.temperature.filter(|_| t.temperature) {
                    body["temperature"] = json!(temp);
                }
            }
            None => {
                if let Some(temp) = req.temperature {
                    body["temperature"] = json!(temp);
                }
            }
        }
        body
    }

    /// A model that thinks before it writes on a service known to count
    /// that thinking against the token limit: OpenAI's reasoning models,
    /// Gemini 2.5 and later, Grok 4 and later, and those models through
    /// OpenRouter. Other servers are sent the settings as they are.
    pub fn thinking(&self, model_id: &str) -> Option<ThinksFirst> {
        let m = model_id.trim().to_ascii_lowercase();
        let (thinks, temperature) = match self.host {
            Host::OpenAi => (reasoning_model(&m), false),
            Host::Google => (gemini_thinks(&m), !gemini_fixed_temperature(&m)),
            Host::Xai => (grok_thinks(&m), true),
            Host::OpenRouter => (routed_thinks(&m), false),
            Host::Other => (false, true),
        };
        thinks.then_some(ThinksFirst {
            nested: self.host == Host::OpenRouter,
            temperature,
        })
    }

    pub fn thinks_first(&self, model_id: &str) -> bool {
        self.thinking(model_id).is_some()
    }

    /// Send one request; a refusal for a setting this app added is sent
    /// once more without it. Nothing is charged for a refused request.
    async fn post(
        &self,
        body: &mut Value,
        cancel: &CancellationToken,
        idle: Duration,
    ) -> Result<reqwest::Response, GenerateError> {
        let mut resent = false;
        loop {
            let bytes = serde_json::to_vec(body)
                .map_err(|e| GenerateError::not_sent(AppError::internal(e.to_string())))?;
            let send = self
                .auth(
                    self.client
                        .post(format!("{}/chat/completions", self.base_url))
                        .header(CONTENT_TYPE, "application/json"),
                )
                .body(bytes)
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
            if status.is_success() {
                return Ok(resp);
            }
            let text = read_limited(resp, cancel, idle).await;
            if !resent && loosen(body, status.as_u16(), &text) {
                resent = true;
                continue;
            }
            return Err(http_error(status.as_u16(), &text));
        }
    }

    /// Stream one reply. `on_delta` receives display-only draft text.
    pub async fn generate(
        &self,
        req: &GenerateRequest,
        cancel: &CancellationToken,
        on_delta: &mut (dyn FnMut(&str) + Send),
    ) -> Result<Completion, GenerateError> {
        let idle = Duration::from_millis(req.timeout_ms as u64);
        let mut body = self.request_body(req);
        let resp = self.post(&mut body, cancel, idle).await?;
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
            return Err(empty_reply_error(state.finish_reason.as_deref()));
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
                    // Google lists "models/gemini-…" but takes "gemini-…".
                    .map(|id| id.strip_prefix("models/").unwrap_or(id).to_string())
            })
            .collect())
    }
}

/// OpenAI's reasoning models: the o-series (o1, o3, o4-mini…) and GPT-5,
/// GPT-6 and later (gpt-5.6-sol, gpt-6.1-terra…). They take only their
/// default temperature while they reason. The "-chat" models don't reason.
fn reasoning_model(model_id: &str) -> bool {
    let m = model_id.trim().to_ascii_lowercase();
    let m = m.rsplit('/').next().unwrap_or(&m);
    if m.contains("-chat") || m == "o1-mini" {
        return false;
    }
    let version = |rest: &str| -> Option<u32> {
        let digits: String = rest.chars().take_while(char::is_ascii_digit).collect();
        let after = rest[digits.len()..].chars().next();
        if digits.is_empty() || !matches!(after, None | Some('.' | '-')) {
            return None;
        }
        digits.parse().ok()
    };
    if let Some(rest) = m.strip_prefix("gpt-") {
        return version(rest).is_some_and(|v| v >= 5);
    }
    m.strip_prefix('o').and_then(version).is_some()
}

/// Take out what a refused request names, or switch the token limit's
/// name when the error asks for the other one.
fn loosen(body: &mut Value, status: u16, error: &str) -> bool {
    let mut changed = http::drop_refused(body, status, error, OPTIONAL);
    let said = error.to_ascii_lowercase();
    if matches!(status, 400 | 422) && said.contains("max_completion_tokens") {
        if let Some(fields) = body.as_object_mut() {
            let (from, to) = if fields.contains_key("max_tokens") {
                ("max_tokens", "max_completion_tokens")
            } else {
                ("max_completion_tokens", "max_tokens")
            };
            if let Some(v) = fields.remove(from) {
                fields.insert(to.into(), v);
                changed = true;
            }
        }
    }
    changed
}

/// The model's name without a service prefix ("google/", "models/").
fn bare(m: &str) -> &str {
    m.rsplit('/').next().unwrap_or(m)
}

/// The leading version in "3.8-flash" or "2.5-pro" as tenths (38, 25).
fn tenths(rest: &str) -> Option<u32> {
    let mut parts = rest.split(['-', ':']).next()?.split('.');
    let major: u32 = parts.next()?.parse().ok()?;
    let minor: u32 = match parts.next() {
        Some(d) => d.chars().next()?.to_digit(10)?,
        None => 0,
    };
    Some(major * 10 + minor)
}

/// Gemini 2.5 and later think before they write; 2.5 Flash-Lite only
/// when asked. "-latest" names point at a current, thinking model.
fn gemini_thinks(m: &str) -> bool {
    let Some(rest) = bare(m).strip_prefix("gemini-") else {
        return false;
    };
    if rest.ends_with("-latest") && !rest.starts_with(|c: char| c.is_ascii_digit()) {
        return true;
    }
    match tenths(rest) {
        Some(25) => !rest.contains("lite"),
        Some(v) => v > 25,
        None => false,
    }
}

/// Gemini 3 and later keep their own temperature: Google deprecated the
/// setting and plans to refuse it.
fn gemini_fixed_temperature(m: &str) -> bool {
    let Some(rest) = bare(m).strip_prefix("gemini-") else {
        return false;
    };
    tenths(rest).map_or(rest.ends_with("-latest"), |v| v >= 30)
}

/// Grok 3 Mini and Grok 4 and later reason first, unless the name says
/// it doesn't.
fn grok_thinks(m: &str) -> bool {
    let Some(rest) = bare(m).strip_prefix("grok-") else {
        return false;
    };
    if rest.contains("non-reasoning") {
        return false;
    }
    rest.starts_with("3-mini") || tenths(rest).is_some_and(|v| v >= 40)
}

/// Through OpenRouter, the model's maker comes first ("openai/gpt-6.1-sol").
fn routed_thinks(m: &str) -> bool {
    let (maker, model) = m.split_once('/').unwrap_or(("", m));
    let model = model.split(':').next().unwrap_or(model);
    match maker {
        "openai" => reasoning_model(model),
        "anthropic" => super::anthropic::thinks_by_default(model),
        "google" => gemini_thinks(model),
        "x-ai" => grok_thinks(model),
        _ => model.contains("thinking") || model.contains("reasoner") || model.ends_with("-r1"),
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

#[cfg(test)]
mod tests;

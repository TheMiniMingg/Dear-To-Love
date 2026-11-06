//! Anthropic's Messages API (`POST {base}/messages`), for Claude models.
//!
//! The system prompt has its own field, turns must start with the player's
//! and alternate, and the reply streams as typed server-sent events. Text
//! deltas are the reply; thinking blocks are skipped. Sampling settings
//! (temperature) are not sent: current Claude models choose their own and
//! reject them.

use std::time::Duration;

use reqwest::header::{HeaderValue, CONTENT_TYPE};
use serde_json::{json, Value};
use tokio_util::sync::CancellationToken;

use super::http::{
    self, http_error, in_stream_error, provider_err, read_limited, read_limited_large, send_error,
    short, unreachable_err,
};
use super::sse::SseReader;
use super::{empty_reply_error, Completion, GenerateError};
use crate::domain::provider::{GenerateRequest, NormalizedUsage, Role};
use crate::errors::{AppError, ErrorCode};

/// The `anthropic-version` header every request carries.
pub const API_VERSION: &str = "2023-06-01";

/// Said on the player's behalf when a window would otherwise start with a
/// story reply, which the API does not accept.
const OPENING_TURN: &str = "(The story continues.)";

pub struct Anthropic {
    base_url: String,
    api_key: Option<String>,
    client: reqwest::Client,
}

impl Anthropic {
    pub fn new(base_url: &str, api_key: Option<String>) -> Result<Self, AppError> {
        let client = http::client(base_url)?;
        Ok(Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            api_key: api_key.filter(|k| !k.trim().is_empty()),
            client,
        })
    }

    /// `x-api-key` (marked sensitive) and the API version.
    fn headers(&self, rb: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        let rb = rb.header("anthropic-version", API_VERSION);
        match self
            .api_key
            .as_deref()
            .map(str::trim)
            .and_then(|k| HeaderValue::from_str(k).ok())
        {
            Some(mut v) => {
                v.set_sensitive(true);
                rb.header("x-api-key", v)
            }
            None => rb,
        }
    }

    pub fn request_body(&self, req: &GenerateRequest) -> Value {
        let system: Vec<&str> = req
            .messages
            .iter()
            .filter(|m| m.role == Role::System)
            .map(|m| m.content.trim())
            .filter(|c| !c.is_empty())
            .collect();
        // Same-role neighbours become one turn; the first turn is the player's.
        let mut turns: Vec<(&'static str, String)> = Vec::new();
        for m in req.messages.iter().filter(|m| m.role != Role::System) {
            let role = if m.role == Role::Assistant {
                "assistant"
            } else {
                "user"
            };
            match turns.last_mut() {
                Some((r, text)) if *r == role => {
                    text.push_str("\n\n");
                    text.push_str(&m.content);
                }
                _ => turns.push((role, m.content.clone())),
            }
        }
        if turns.first().is_none_or(|(r, _)| *r != "user") {
            turns.insert(0, ("user", OPENING_TURN.into()));
        }
        let messages: Vec<Value> = turns
            .into_iter()
            .map(|(role, content)| json!({ "role": role, "content": content }))
            .collect();
        let mut body = json!({
            "model": req.model_id,
            "max_tokens": req.max_output_tokens,
            "messages": messages,
            "stream": true,
        });
        if !system.is_empty() {
            body["system"] = json!(system.join("\n\n"));
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
            .headers(
                self.client
                    .post(format!("{}/messages", self.base_url))
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
            // A proxy that ignores `stream: true` answers with one message.
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
                let events = match &chunk {
                    Some(bytes) => sse.push(bytes),
                    None => sse.finish(),
                };
                for data in events {
                    if state.apply_event(&data, on_delta)? {
                        break 'read;
                    }
                }
                if chunk.is_none() {
                    break 'read;
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
            self.headers(
                self.client
                    .get(format!("{}/models?limit=1000", self.base_url)),
            )
            .send(),
        )
        .await
        .map_err(|_| unreachable_err("the AI service did not answer in time"))?
        .map_err(|e| send_error(e).error)?;
        let status = resp.status();
        let text = read_limited_large(resp, &CancellationToken::new(), Duration::from_secs(20))
            .await
            .map_err(|e| e.error)?;
        if !status.is_success() {
            return Err(http_error(status.as_u16(), &text).error);
        }
        let v: Value = serde_json::from_str(&text)
            .map_err(|_| provider_err("the server answered, but not with a model list"))?;
        let list = v
            .get("data")
            .and_then(Value::as_array)
            .ok_or_else(|| provider_err("the server answered, but not with a model list"))?;
        Ok(list
            .iter()
            .filter_map(|m| m.get("id").and_then(Value::as_str).map(str::to_string))
            .collect())
    }
}

/// `end_turn` -> `stop`, `max_tokens` -> `length`, `refusal` ->
/// `content_filter`, like the other adapters report them.
fn finish_reason(stop_reason: &str) -> String {
    match stop_reason {
        "end_turn" | "stop_sequence" => "stop",
        "max_tokens" | "model_context_window_exceeded" => "length",
        "refusal" => "content_filter",
        other => other,
    }
    .to_string()
}

/// Input tokens include cache reads and writes; cached = cache reads.
fn merge_usage(into: &mut NormalizedUsage, u: &Value) {
    let n = |k: &str| u.get(k).and_then(Value::as_u64);
    let fresh = n("input_tokens");
    let read = n("cache_read_input_tokens");
    let written = n("cache_creation_input_tokens");
    if fresh.is_some() || read.is_some() || written.is_some() {
        into.input_tokens = Some(fresh.unwrap_or(0) + read.unwrap_or(0) + written.unwrap_or(0));
        into.cached_input_tokens = read.or(into.cached_input_tokens);
    }
    if let Some(o) = n("output_tokens") {
        into.output_tokens = Some(o);
    }
}

fn stream_error(err: &Value) -> AppError {
    let kind = err.get("type").and_then(Value::as_str).unwrap_or_default();
    let msg = err
        .get("message")
        .and_then(Value::as_str)
        .map(short)
        .unwrap_or_else(|| "the AI service reported an error".into());
    match kind {
        "overloaded_error" => provider_err(format!(
            "the AI service is overloaded right now; try again in a moment ({msg})"
        )),
        "rate_limit_error" => AppError::new(ErrorCode::RateLimited, msg),
        _ => in_stream_error(err),
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
        let Ok(v) = serde_json::from_str::<Value>(data.trim()) else {
            return Ok(false); // keep-alives and unknown events
        };
        match v.get("type").and_then(Value::as_str).unwrap_or_default() {
            "message_start" => {
                if let Some(u) = v.get("message").and_then(|m| m.get("usage")) {
                    merge_usage(&mut self.usage, u);
                }
            }
            "content_block_start" => {
                // A text block may arrive with its first words already in it.
                let block = v.get("content_block");
                if block.and_then(|b| b.get("type")).and_then(Value::as_str) == Some("text") {
                    if let Some(t) = block.and_then(|b| b.get("text")).and_then(Value::as_str) {
                        self.push(t, on_delta);
                    }
                }
            }
            "content_block_delta" => {
                let delta = v.get("delta");
                if delta.and_then(|d| d.get("type")).and_then(Value::as_str) == Some("text_delta") {
                    if let Some(t) = delta.and_then(|d| d.get("text")).and_then(Value::as_str) {
                        self.push(t, on_delta);
                    }
                }
            }
            "message_delta" => {
                if let Some(r) = v
                    .get("delta")
                    .and_then(|d| d.get("stop_reason"))
                    .and_then(Value::as_str)
                {
                    self.finish_reason = Some(finish_reason(r));
                }
                if let Some(u) = v.get("usage") {
                    merge_usage(&mut self.usage, u);
                }
            }
            "message_stop" => {
                self.done = true;
                return Ok(true);
            }
            "error" => {
                let err = v.get("error").unwrap_or(&v);
                return Err(GenerateError::maybe_charged(stream_error(err)));
            }
            _ => {} // ping, content_block_stop, thinking and future events
        }
        Ok(false)
    }

    fn push(&mut self, t: &str, on_delta: &mut (dyn FnMut(&str) + Send)) {
        if !t.is_empty() {
            self.text.push_str(t);
            on_delta(t);
        }
    }

    fn apply_whole(&mut self, v: &Value) -> Result<(), GenerateError> {
        if v.get("type").and_then(Value::as_str) == Some("error") {
            let err = v.get("error").unwrap_or(v);
            return Err(GenerateError::maybe_charged(stream_error(err)));
        }
        if let Some(u) = v.get("usage") {
            merge_usage(&mut self.usage, u);
        }
        if let Some(blocks) = v.get("content").and_then(Value::as_array) {
            for b in blocks {
                if b.get("type").and_then(Value::as_str) == Some("text") {
                    if let Some(t) = b.get("text").and_then(Value::as_str) {
                        self.text.push_str(t);
                    }
                }
            }
        }
        self.finish_reason = Some(finish_reason(
            v.get("stop_reason")
                .and_then(Value::as_str)
                .unwrap_or("end_turn"),
        ));
        self.done = true;
        Ok(())
    }
}

#[cfg(test)]
mod tests;

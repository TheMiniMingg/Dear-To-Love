//! Ollama's native chat API (`POST {base}/api/chat`, newline-delimited JSON).
//!
//! Preferred over Ollama's OpenAI-compatible endpoint because it lets each
//! request set `num_ctx`: otherwise Ollama loads the model with its own
//! default context and silently cuts the start of longer prompts, which is
//! where the story's rules and characters live. It also reports token
//! counts (`prompt_eval_count`, `eval_count`).

use std::time::Duration;

use reqwest::header::CONTENT_TYPE;
use serde_json::{json, Value};
use tokio_util::sync::CancellationToken;

use super::http::{
    self, http_error, in_stream_error, provider_err, read_limited, read_limited_large, send_error,
    short, unreachable_err,
};
use super::{Completion, GenerateError};
use crate::domain::provider::{GenerateRequest, NormalizedUsage, Role};
use crate::errors::AppError;

pub const DEFAULT_BASE_URL: &str = "http://localhost:11434";

pub struct Ollama {
    base_url: String,
    api_key: Option<String>,
    client: reqwest::Client,
}

/// `http://host:11434/api` or `.../v1` (the OpenAI-style path) -> the root.
pub fn api_root(base_url: &str) -> String {
    let mut b = base_url.trim().trim_end_matches('/');
    for suffix in ["/api", "/v1"] {
        if let Some(stripped) = b.strip_suffix(suffix) {
            b = stripped;
        }
    }
    b.to_string()
}

impl Ollama {
    /// `api_key` is only for a remote Ollama behind an authenticating proxy.
    pub fn new(base_url: &str, api_key: Option<String>) -> Result<Self, AppError> {
        Ok(Self {
            client: http::client(base_url)?,
            base_url: api_root(base_url),
            api_key: api_key.filter(|k| !k.trim().is_empty()),
        })
    }

    fn auth(&self, rb: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        http::bearer(rb, self.api_key.as_deref())
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
        let mut options = json!({ "num_predict": req.max_output_tokens });
        if let Some(c) = req.context_tokens {
            options["num_ctx"] = json!(c);
        }
        if let Some(t) = req.temperature {
            options["temperature"] = json!(t);
        }
        json!({
            "model": req.model_id,
            "messages": messages,
            "stream": true,
            "options": options,
        })
    }

    pub async fn generate(
        &self,
        req: &GenerateRequest,
        cancel: &CancellationToken,
        on_delta: &mut (dyn FnMut(&str) + Send),
    ) -> Result<Completion, GenerateError> {
        let idle = Duration::from_millis(u64::from(req.timeout_ms));
        let body = serde_json::to_vec(&self.request_body(req))
            .map_err(|e| GenerateError::not_sent(AppError::internal(e.to_string())))?;
        let send = self
            .auth(
                self.client
                    .post(format!("{}/api/chat", self.base_url))
                    .header(CONTENT_TYPE, "application/json"),
            )
            .body(body)
            .send();
        // Loading a model can take a while before the first byte.
        let resp = tokio::select! {
            _ = cancel.cancelled() => return Err(GenerateError::cancelled()),
            r = tokio::time::timeout(idle, send) => match r {
                Err(_) => return Err(GenerateError::maybe_charged(unreachable_err(
                    "the local model server did not answer in time",
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

        let mut state = State::default();
        let streamed = !resp
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .is_some_and(|v| v.starts_with("application/json"));
        if streamed {
            let mut resp = resp;
            let mut pending: Vec<u8> = Vec::new();
            'read: loop {
                let chunk = tokio::select! {
                    _ = cancel.cancelled() => return Err(GenerateError::cancelled()),
                    r = tokio::time::timeout(idle, resp.chunk()) => match r {
                        Err(_) => return Err(GenerateError::maybe_charged(unreachable_err(
                            "the local model server stopped responding mid-reply",
                        ))),
                        Ok(Err(e)) => return Err(GenerateError::maybe_charged(unreachable_err(
                            format!("the connection dropped mid-reply ({})", short(&e.to_string())),
                        ))),
                        Ok(Ok(c)) => c,
                    },
                };
                let Some(bytes) = chunk else {
                    if !pending.is_empty() {
                        let line = String::from_utf8_lossy(&pending).into_owned();
                        state.apply_line(&line, on_delta)?;
                    }
                    break 'read;
                };
                pending.extend_from_slice(&bytes);
                while let Some(nl) = pending.iter().position(|&b| b == b'\n') {
                    let line: Vec<u8> = pending.drain(..=nl).collect();
                    if state.apply_line(&String::from_utf8_lossy(&line), on_delta)? {
                        break 'read;
                    }
                }
            }
        } else {
            // `stream` ignored: one JSON object.
            let text = read_limited_large(resp, cancel, idle).await?;
            state.apply_line(&text, on_delta)?;
        }

        if !state.done {
            return Err(GenerateError::maybe_charged(unreachable_err(
                "the connection closed before the reply finished",
            )));
        }
        if state.text.trim().is_empty() {
            return Err(GenerateError::maybe_charged(provider_err(
                "the local model returned an empty reply",
            )));
        }
        Ok(Completion {
            text: state.text,
            finish_reason: state.finish_reason.unwrap_or_else(|| "stop".into()),
            usage: state.usage,
        })
    }

    /// Free connection check: lists installed models (`GET /api/tags`).
    pub async fn list_models(&self) -> Result<Vec<String>, AppError> {
        let wait = Duration::from_secs(20);
        let resp = tokio::time::timeout(
            wait,
            self.auth(self.client.get(format!("{}/api/tags", self.base_url)))
                .send(),
        )
        .await
        .map_err(|_| unreachable_err("the local model server did not answer in time"))?
        .map_err(|e| send_error(e).error)?;
        let status = resp.status();
        let text = read_limited_large(resp, &CancellationToken::new(), wait)
            .await
            .map_err(|e| e.error)?;
        if !status.is_success() {
            return Err(http_error(status.as_u16(), &text).error);
        }
        let v: Value = serde_json::from_str(&text)
            .map_err(|_| provider_err("the server answered, but not with an Ollama model list"))?;
        let list = v.get("models").and_then(Value::as_array).ok_or_else(|| {
            provider_err("the server answered, but not with an Ollama model list")
        })?;
        Ok(list
            .iter()
            .filter_map(|m| {
                m.get("name")
                    .or_else(|| m.get("model"))
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .collect())
    }
}

#[derive(Default)]
struct State {
    text: String,
    finish_reason: Option<String>,
    usage: NormalizedUsage,
    done: bool,
}

impl State {
    /// One NDJSON line. Returns true once the final (`done`) line arrives.
    fn apply_line(
        &mut self,
        line: &str,
        on_delta: &mut (dyn FnMut(&str) + Send),
    ) -> Result<bool, GenerateError> {
        let line = line.trim();
        if line.is_empty() {
            return Ok(false);
        }
        let Ok(v) = serde_json::from_str::<Value>(line) else {
            return Ok(false); // ignore anything that is not JSON
        };
        if let Some(err) = v.get("error") {
            return Err(GenerateError::maybe_charged(in_stream_error(err)));
        }
        // Thinking models also send `message.thinking`; only content is story.
        if let Some(t) = v
            .get("message")
            .and_then(|m| m.get("content"))
            .and_then(Value::as_str)
        {
            if !t.is_empty() {
                self.text.push_str(t);
                on_delta(t);
            }
        }
        if v.get("done").and_then(Value::as_bool) == Some(true) {
            self.done = true;
            self.finish_reason = v
                .get("done_reason")
                .and_then(Value::as_str)
                .map(str::to_string);
            self.usage = parse_usage(&v);
            return Ok(true);
        }
        Ok(false)
    }
}

/// `prompt_eval_count` is omitted when Ollama reuses a cached prompt, so a
/// missing input count stays unknown rather than zero.
pub fn parse_usage(v: &Value) -> NormalizedUsage {
    let n = |k: &str| v.get(k).and_then(Value::as_u64);
    NormalizedUsage {
        input_tokens: n("prompt_eval_count"),
        cached_input_tokens: None,
        output_tokens: n("eval_count"),
    }
}

#[cfg(test)]
mod tests;

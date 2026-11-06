//! HTTP plumbing shared by the model adapters: client setup, error
//! mapping and bounded body reads.

use std::time::Duration;

use reqwest::header::{HeaderValue, AUTHORIZATION};
use serde_json::Value;
use tokio_util::sync::CancellationToken;

use super::GenerateError;
use crate::domain::provider::is_loopback;
use crate::errors::{AppError, ErrorCode};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const MAX_ERROR_BODY: usize = 8 * 1024;

/// A client for one base URL. Local model servers never go through a proxy.
pub fn client(base_url: &str) -> Result<reqwest::Client, AppError> {
    let mut builder = reqwest::Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .user_agent(concat!("DearToLove/", env!("CARGO_PKG_VERSION")));
    if is_loopback(base_url) {
        builder = builder.no_proxy();
    }
    builder
        .build()
        .map_err(|e| AppError::internal(format!("could not create HTTP client: {e}")))
}

/// Add `Authorization: Bearer <key>` (marked sensitive) when there is a key.
pub fn bearer(rb: reqwest::RequestBuilder, key: Option<&str>) -> reqwest::RequestBuilder {
    match key.map(str::trim).filter(|k| !k.is_empty()) {
        Some(k) => match HeaderValue::from_str(&format!("Bearer {k}")) {
            Ok(mut v) => {
                v.set_sensitive(true);
                rb.header(AUTHORIZATION, v)
            }
            Err(_) => rb,
        },
        None => rb,
    }
}

pub fn short(s: &str) -> String {
    let s = s.trim();
    if s.chars().count() > 300 {
        format!("{}…", s.chars().take(300).collect::<String>())
    } else {
        s.to_string()
    }
}

pub fn unreachable_err(msg: impl Into<String>) -> AppError {
    AppError::new(ErrorCode::ProviderUnreachable, msg)
}

pub fn provider_err(msg: impl Into<String>) -> AppError {
    AppError::new(ErrorCode::ProviderError, msg)
}

pub fn send_error(e: reqwest::Error) -> GenerateError {
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

pub fn provider_message(body: &str) -> Option<String> {
    let v: Value = serde_json::from_str(body).ok()?;
    let e = v.get("error").unwrap_or(&v);
    e.get("message")
        .and_then(Value::as_str)
        .or_else(|| e.as_str())
        .map(short)
}

pub fn looks_like_context_limit(body: &str) -> bool {
    let b = body.to_ascii_lowercase();
    b.contains("context_length")
        || b.contains("context length")
        || b.contains("maximum context")
        || b.contains("too many tokens")
        || b.contains("prompt is too long")
}

/// Map an HTTP error status. Requests refused outright (bad key, rate limit,
/// unknown model) are not charged; server errors might have been.
pub fn http_error(status: u16, body: &str) -> GenerateError {
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

pub fn in_stream_error(err: &Value) -> AppError {
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

pub async fn read_limited(
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

pub async fn read_limited_large(
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

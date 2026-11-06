//! Model adapters. Each turns a provider-neutral `GenerateRequest` into one
//! outbound call and streams draft text back. Adapters never retry: every
//! retry is a new generation run with its own ledger row.

pub mod http;
pub mod offline;
pub mod ollama;
pub mod openai;
pub mod sse;
#[cfg(test)]
pub mod test_server;

use tokio_util::sync::CancellationToken;

use crate::domain::provider::{AdapterKind, GenerateRequest, NormalizedUsage};
use crate::errors::{AppError, AppResult, ErrorCode};

#[derive(Debug, Clone, PartialEq)]
pub struct Completion {
    pub text: String,
    pub finish_reason: String,
    pub usage: NormalizedUsage,
}

/// What we know about charges when a call fails.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Charge {
    /// Nothing reached the provider, or it refused the request outright.
    None,
    /// The provider may have done (and billed) work we never saw.
    Unknown,
}

#[derive(Debug, Clone)]
pub struct GenerateError {
    pub error: AppError,
    pub charge: Charge,
}

impl GenerateError {
    pub fn not_sent(error: AppError) -> Self {
        Self {
            error,
            charge: Charge::None,
        }
    }

    pub fn not_charged(error: AppError) -> Self {
        Self {
            error,
            charge: Charge::None,
        }
    }

    pub fn maybe_charged(error: AppError) -> Self {
        Self {
            error,
            charge: Charge::Unknown,
        }
    }

    /// Cancelling after sending may still be billed by the provider.
    pub fn cancelled() -> Self {
        Self::maybe_charged(AppError::new(
            ErrorCode::Cancelled,
            "the reply was cancelled",
        ))
    }
}

/// A ready-to-call adapter for one run.
pub enum Adapter {
    OpenAi(openai::OpenAiCompatible),
    Ollama(ollama::Ollama),
    Offline(offline::Offline),
}

impl Adapter {
    /// The network adapter for a saved connection.
    pub fn live(kind: AdapterKind, base_url: &str, api_key: Option<String>) -> AppResult<Self> {
        Ok(match kind {
            AdapterKind::OpenaiCompatible => {
                Self::OpenAi(openai::OpenAiCompatible::new(base_url, api_key)?)
            }
            AdapterKind::Ollama => Self::Ollama(ollama::Ollama::new(base_url, api_key)?),
        })
    }

    /// Free connection check. Never sends story text.
    pub async fn list_models(&self) -> AppResult<Vec<String>> {
        match self {
            Self::OpenAi(a) => a.list_models().await,
            Self::Ollama(a) => a.list_models().await,
            Self::Offline(_) => Ok(vec!["offline".into()]),
        }
    }

    pub async fn generate(
        &self,
        req: &GenerateRequest,
        cancel: &CancellationToken,
        on_delta: &mut (dyn FnMut(&str) + Send),
    ) -> Result<Completion, GenerateError> {
        match self {
            Self::OpenAi(a) => a.generate(req, cancel, on_delta).await,
            Self::Ollama(a) => a.generate(req, cancel, on_delta).await,
            Self::Offline(a) => a.generate(cancel, on_delta).await,
        }
    }
}

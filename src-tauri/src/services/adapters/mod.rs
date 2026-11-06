//! Model adapters. Each turns a provider-neutral `GenerateRequest` into one
//! outbound call and streams draft text back. Adapters never retry: every
//! retry is a new generation run with its own ledger row.

pub mod offline;
pub mod openai;
pub mod sse;
#[cfg(test)]
pub mod test_server;

use tokio_util::sync::CancellationToken;

use crate::domain::provider::{GenerateRequest, NormalizedUsage};
use crate::errors::{AppError, ErrorCode};

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
    Offline(offline::Offline),
}

impl Adapter {
    pub async fn generate(
        &self,
        req: &GenerateRequest,
        cancel: &CancellationToken,
        on_delta: &mut (dyn FnMut(&str) + Send),
    ) -> Result<Completion, GenerateError> {
        match self {
            Self::OpenAi(a) => a.generate(req, cancel, on_delta).await,
            Self::Offline(a) => a.generate(cancel, on_delta).await,
        }
    }
}

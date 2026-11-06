//! Typed errors returned by every Tauri command.
//!
//! The frontend receives `{ code, message }`. `code` is a stable,
//! machine-readable identifier; `message` is for display and logs.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Stable error codes shared with the frontend. Adding a variant is fine;
/// renaming or removing one is a breaking contract change.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(export)]
pub enum ErrorCode {
    HeadChanged,
    InvalidAncestor,
    WrongStory,
    RunNotActive,
    RunInterrupted,
    ProviderUnreachable,
    AuthFailed,
    RateLimited,
    Cancelled,
    ContextTooLong,
    MigrationFailed,
    AssetMissing,
    ArchiveInvalid,
    BudgetPaused,
    BudgetOverrideRequired,
    NoProvider,
    SecretStoreUnavailable,
    NotFound,
    InvalidInput,
    Io,
    Database,
    Internal,
}

#[derive(Debug, Clone, thiserror::Error, Serialize, Deserialize, TS)]
#[error("{code:?}: {message}")]
#[ts(export)]
pub struct AppError {
    pub code: ErrorCode,
    pub message: String,
}

impl AppError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::Internal, message)
    }

    pub fn invalid_input(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::InvalidInput, message)
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::NotFound, message)
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        Self::new(ErrorCode::Io, err.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_as_code_and_message() {
        let err = AppError::new(ErrorCode::HeadChanged, "route moved");
        let json = serde_json::to_value(&err).unwrap();
        assert_eq!(json["code"], "HEAD_CHANGED");
        assert_eq!(json["message"], "route moved");
    }
}

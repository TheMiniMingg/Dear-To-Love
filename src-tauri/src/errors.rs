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
    /// A reply is already being written for this route.
    RunActive,
    ProviderUnreachable,
    AuthFailed,
    RateLimited,
    /// The provider answered with an error that has no specific code.
    ProviderError,
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
    /// The disk is full; nothing new could be written.
    DiskFull,
    /// The provider's content filter stopped the reply.
    ContentFiltered,
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

    pub fn disk_full() -> Self {
        Self::new(ErrorCode::DiskFull, DISK_FULL_MESSAGE)
    }
}

pub const DISK_FULL_MESSAGE: &str = "The disk is full, so this could not be saved. Everything \
     saved before is safe. Free up some space, then try again.";

/// Whether an I/O error means the disk (or the user's quota) is full.
pub fn is_disk_full(err: &std::io::Error) -> bool {
    use std::io::ErrorKind;
    if matches!(
        err.kind(),
        ErrorKind::StorageFull | ErrorKind::QuotaExceeded
    ) {
        return true;
    }
    // ENOSPC/EDQUOT on Unix; ERROR_HANDLE_DISK_FULL and ERROR_DISK_FULL on
    // Windows.
    match err.raw_os_error() {
        Some(code) if cfg!(windows) => matches!(code, 39 | 112),
        Some(code) => code == 28 || (cfg!(target_os = "linux") && code == 122),
        None => false,
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        if is_disk_full(&err) {
            return Self::disk_full();
        }
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

    #[test]
    fn a_full_disk_gets_its_own_code() {
        let full = std::io::Error::from(std::io::ErrorKind::StorageFull);
        assert_eq!(AppError::from(full).code, ErrorCode::DiskFull);
        let os = std::io::Error::from_raw_os_error(if cfg!(windows) { 112 } else { 28 });
        let err = AppError::from(os);
        assert_eq!(err.code, ErrorCode::DiskFull);
        assert_eq!(err.message, DISK_FULL_MESSAGE);
        let other = std::io::Error::from(std::io::ErrorKind::NotFound);
        assert_eq!(AppError::from(other).code, ErrorCode::Io);
    }
}

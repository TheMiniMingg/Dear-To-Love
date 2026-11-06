use std::path::PathBuf;
use std::sync::Arc;

use crate::db::Database;
use crate::errors::{AppError, AppResult, ErrorCode};
use crate::services::generation::RunRegistry;
use crate::services::memory::MemoryJobs;
use crate::services::secrets::SecretStore;

/// Process-wide state managed by Tauri.
pub struct AppState {
    pub product_name: String,
    pub version: String,
    /// Resolved app-data directory, or why it could not be resolved/created.
    /// Startup never fails on this; Diagnostics reports it instead.
    pub data_dir: Result<PathBuf, String>,
    /// The story database, or the error that stopped it from opening.
    pub db: Result<Database, AppError>,
    pub secrets: Arc<dyn SecretStore>,
    /// Generated at launch; groups API usage into "this session".
    pub session_id: String,
    /// Cancel handles for replies being written right now.
    pub runs: RunRegistry,
    /// Background story summaries running or failed this session.
    pub memory: MemoryJobs,
}

impl AppState {
    pub fn db(&self) -> AppResult<&Database> {
        self.db.as_ref().map_err(|e| {
            AppError::new(
                if e.code == ErrorCode::MigrationFailed {
                    ErrorCode::MigrationFailed
                } else {
                    ErrorCode::Database
                },
                e.message.clone(),
            )
        })
    }
}

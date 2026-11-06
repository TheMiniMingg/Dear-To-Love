use std::path::PathBuf;

/// Process-wide state managed by Tauri.
pub struct AppState {
    pub product_name: String,
    pub version: String,
    /// Resolved app-data directory, or why it could not be resolved/created.
    /// Startup never fails on this; Diagnostics reports it instead.
    pub data_dir: Result<PathBuf, String>,
}

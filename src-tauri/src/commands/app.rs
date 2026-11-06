use tauri::State;

use crate::domain::app_info::{AppInfo, BuildProfile};
use crate::domain::diagnostics::DiagnosticCheck;
use crate::errors::{AppError, AppResult};
use crate::services::diagnostics::{self, DiagnosticsContext};
use crate::state::AppState;

#[tauri::command]
pub fn get_app_info(state: State<'_, AppState>) -> AppInfo {
    AppInfo {
        name: state.product_name.clone(),
        version: state.version.clone(),
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        build_profile: BuildProfile::current(),
    }
}

#[tauri::command]
pub async fn run_diagnostics(state: State<'_, AppState>) -> AppResult<Vec<DiagnosticCheck>> {
    let ctx = DiagnosticsContext {
        version: state.version.clone(),
        data_dir: state.data_dir.clone(),
    };
    tauri::async_runtime::spawn_blocking(move || diagnostics::run_all(&ctx))
        .await
        .map_err(|e| AppError::internal(format!("diagnostics task failed: {e}")))
}

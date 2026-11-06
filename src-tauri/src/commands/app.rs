use tauri::State;

use crate::domain::app_info::{AppInfo, BuildProfile};
use crate::domain::diagnostics::DiagnosticCheck;
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

/// Runs local health checks. `deep` adds slow checks (database page scan).
/// Never makes network requests.
#[tauri::command]
pub async fn run_diagnostics(
    state: State<'_, AppState>,
    deep: Option<bool>,
) -> Result<Vec<DiagnosticCheck>, crate::errors::AppError> {
    Ok(diagnostics::run_all(DiagnosticsContext {
        version: state.version.clone(),
        data_dir: state.data_dir.clone(),
        db: state.db.clone(),
        secrets: state.secrets.clone(),
        deep: deep.unwrap_or(false),
    })
    .await)
}

use std::path::PathBuf;

use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use crate::domain::app_info::{AppInfo, BuildProfile};
use crate::domain::diagnostics::DiagnosticCheck;
use crate::errors::{AppError, AppResult};
use crate::services::diagnostics::{self, DiagnosticsContext};
use crate::services::support_report::{self, ReportInput, HEADER, MAX_REPORT};
use crate::services::updates::{self, public_links};
use crate::state::AppState;

fn app_info(state: &AppState) -> AppInfo {
    let links = public_links();
    AppInfo {
        name: state.product_name.clone(),
        version: state.version.clone(),
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        build_profile: BuildProfile::current(),
        repository_url: format!("https://github.com/{}/{}", links.owner, links.repo),
        support_url: links.donation_url.clone(),
    }
}

#[tauri::command]
pub fn get_app_info(state: State<'_, AppState>) -> AppInfo {
    app_info(&state)
}

fn context(state: &AppState, deep: bool) -> DiagnosticsContext {
    DiagnosticsContext {
        version: state.version.clone(),
        data_dir: state.data_dir.clone(),
        db: state.db.clone(),
        secrets: state.secrets.clone(),
        deep,
    }
}

/// Runs local health checks. `deep` adds slow checks (database page scan,
/// a model list request to the chosen AI service). Never checks for updates.
#[tauri::command]
pub async fn run_diagnostics(
    state: State<'_, AppState>,
    deep: Option<bool>,
) -> Result<Vec<DiagnosticCheck>, AppError> {
    Ok(diagnostics::run_all(context(&state, deep.unwrap_or(false))).await)
}

/// Runs the checks and returns the report to copy into a support request:
/// versions, counts and results only (T50).
#[tauri::command]
pub async fn diagnostics_report(
    state: State<'_, AppState>,
    deep: Option<bool>,
) -> AppResult<String> {
    let deep = deep.unwrap_or(false);
    let checks = diagnostics::run_all(context(&state, deep)).await;
    let (schema_version, counts, updates) = match state.db.as_ref() {
        Ok(db) => (
            db.schema_version().await.ok(),
            support_report::counts(db).await.ok(),
            updates::status(db, &state.version).await.ok(),
        ),
        Err(_) => (None, None, None),
    };
    Ok(support_report::render(&ReportInput {
        app: &app_info(&state),
        generated_at: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
        schema_version,
        counts,
        updates,
        checks: &checks,
        deep,
        private: support_report::private_paths(state.data_dir.clone().ok()),
    }))
}

/// Saves a report from `diagnostics_report` where the save dialog chose.
#[tauri::command]
pub async fn save_diagnostics_report(path: String, report: String) -> AppResult<String> {
    if !report.starts_with(HEADER) || report.len() > MAX_REPORT {
        return Err(AppError::invalid_input("that is not a diagnostics report"));
    }
    let dest: PathBuf = crate::commands::archive::target(&path, "txt")?;
    tokio::fs::write(&dest, report.as_bytes()).await?;
    Ok(dest
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default())
}

/// Opens the public repository (About → Source code) in the system browser.
#[tauri::command]
pub fn open_repository_page(app: AppHandle) -> AppResult<()> {
    let links = public_links();
    app.opener()
        .open_url(
            format!("https://github.com/{}/{}", links.owner, links.repo),
            None::<&str>,
        )
        .map_err(|e| AppError::internal(format!("could not open the browser: {e}")))
}

/// Opens the configured "Support development" page in the system browser.
#[tauri::command]
pub fn open_support_page(app: AppHandle) -> AppResult<()> {
    let url = public_links()
        .donation_url
        .clone()
        .ok_or_else(|| AppError::not_found("no support page is configured"))?;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| AppError::internal(format!("could not open the browser: {e}")))
}

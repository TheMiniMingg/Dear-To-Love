use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;

use crate::domain::app_info::{AppInfo, BuildProfile};
use crate::domain::diagnostics::DiagnosticCheck;
use crate::errors::{AppError, AppResult};
use crate::services::diagnostics::{self, DiagnosticsContext};
use crate::services::smoke::{self, SmokeArgs};
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

/// The setup guide's outside pages, by name. The interface reads the same
/// file (src/features/guide/links.json), so it can only ask for one of these
/// pages, never for an address of its own.
const GUIDE_LINKS: &str = include_str!("../../../src/features/guide/links.json");

fn guide_link(id: &str) -> Option<String> {
    let links: std::collections::HashMap<String, String> =
        serde_json::from_str(GUIDE_LINKS).ok()?;
    links.get(id).filter(|u| u.starts_with("https://")).cloned()
}

/// Opens one of the setup guide's pages (a service's key or model page) in
/// the system browser.
#[tauri::command]
pub fn open_guide_link(app: AppHandle, id: String) -> AppResult<()> {
    let url = guide_link(&id).ok_or_else(|| AppError::not_found("no such guide page"))?;
    app.opener()
        .open_url(url, None::<&str>)
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

/// The installer smoke test's arguments, until its report is written.
#[derive(Default)]
pub struct Smoke(pub Mutex<Option<SmokeArgs>>);

/// Called by the interface once it has loaded. A normal start does nothing
/// here; under `--smoke-test` it writes the report and quits (T49).
#[tauri::command]
pub async fn frontend_ready(app: AppHandle) {
    finish_smoke(app, true).await;
}

/// Writes the smoke-test report once (from the interface, or after the
/// timeout without it) and exits: 0 when the report was written.
pub async fn finish_smoke(app: AppHandle, frontend: bool) {
    let args = match app.state::<Smoke>().0.lock() {
        Ok(mut guard) => guard.take(),
        Err(_) => None,
    };
    let Some(args) = args else {
        return;
    };
    let scratch = args
        .report
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .map(Path::to_path_buf)
        .unwrap_or_else(std::env::temp_dir);
    let ctx = context(&app.state::<AppState>(), false);
    let report = smoke::run(ctx, args.seed, frontend, &scratch).await;
    let code = match smoke::write_report(&args.report, &report) {
        Ok(()) => 0,
        Err(e) => {
            eprintln!("could not write the smoke-test report: {e}");
            1
        }
    };
    app.exit(code);
}

#[cfg(test)]
mod guide_link_tests {
    use super::*;

    #[test]
    fn guide_links_are_https_pages_looked_up_by_name() {
        let links: std::collections::HashMap<String, String> =
            serde_json::from_str(GUIDE_LINKS).expect("links.json parses");
        assert!(links.len() > 20);
        for (id, url) in &links {
            assert!(url.starts_with("https://"), "{id} is not https: {url}");
            assert!(!url.contains(char::is_whitespace), "{id} has a space");
        }
        assert_eq!(
            guide_link("openai-keys").as_deref(),
            Some("https://platform.openai.com/api-keys")
        );
        assert_eq!(guide_link("https://example.com"), None);
        assert_eq!(guide_link("nope"), None);
    }
}

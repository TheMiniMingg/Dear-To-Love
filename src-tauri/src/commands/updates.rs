use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;

use crate::errors::{AppError, AppResult};
use crate::services::updates::{self, public_links, UpdateStatus};
use crate::state::AppState;

/// What is known about updates. Never contacts GitHub.
#[tauri::command]
pub async fn get_update_status(state: State<'_, AppState>) -> AppResult<UpdateStatus> {
    updates::status(state.db()?, &state.version).await
}

/// `manual`: the user pressed Check now. Otherwise this is the daily check,
/// which does nothing while checks are off.
#[tauri::command]
pub async fn check_for_updates(
    state: State<'_, AppState>,
    manual: bool,
) -> AppResult<UpdateStatus> {
    updates::check(
        state.db()?,
        &state.version,
        &updates::releases_api(),
        public_links(),
        manual,
        chrono::Utc::now(),
    )
    .await
}

#[tauri::command]
pub async fn set_update_checks(
    state: State<'_, AppState>,
    enabled: bool,
) -> AppResult<UpdateStatus> {
    updates::set_enabled(state.db()?, &state.version, enabled).await
}

#[tauri::command]
pub async fn acknowledge_update(
    state: State<'_, AppState>,
    version: String,
) -> AppResult<UpdateStatus> {
    updates::acknowledge(state.db()?, &state.version, &version).await
}

/// Opens the newest release's page on GitHub. Only a release page of the
/// configured repository is ever opened (T46); nothing is installed.
#[tauri::command]
pub async fn open_release_page(app: AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    let url = updates::release_page(state.db()?, &state.version, public_links()).await?;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| AppError::internal(format!("could not open the browser: {e}")))
}

/// Whether this copy can install updates itself: a release build from an
/// installer, made with an update signing key (its public key is in the
/// build's config). Otherwise updates are downloaded from the release page.
#[tauri::command]
pub fn can_install_updates(app: AppHandle) -> bool {
    !cfg!(debug_assertions)
        && tauri::utils::platform::bundle_type().is_some()
        && updater_pubkey(&app).is_some()
}

fn updater_pubkey(app: &AppHandle) -> Option<String> {
    app.config()
        .plugins
        .0
        .get("updater")
        .and_then(|u| u.get("pubkey"))
        .and_then(|k| k.as_str())
        .map(str::trim)
        .filter(|k| !k.is_empty())
        .map(str::to_string)
}

/// Downloads the newest release for this system from GitHub, checks its
/// signature against the build's public key, and installs it. Returns the
/// version installed, or `None` when this copy is already the newest. The
/// app is then restarted with `restart_app` (Windows' installer closes it
/// itself).
#[tauri::command]
pub async fn install_update(app: AppHandle) -> AppResult<Option<String>> {
    if !can_install_updates(app.clone()) {
        return Err(AppError::invalid_input(
            "this copy can't install updates itself; download the new version from the release page",
        ));
    }
    let failed = |e: tauri_plugin_updater::Error| {
        AppError::internal(format!("the update could not be installed ({e})"))
    };
    let Some(update) = app
        .updater()
        .map_err(failed)?
        .check()
        .await
        .map_err(failed)?
    else {
        return Ok(None);
    };
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(failed)?;
    Ok(Some(update.version))
}

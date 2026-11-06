use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

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

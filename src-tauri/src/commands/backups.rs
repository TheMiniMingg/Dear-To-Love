//! Backups and restore. Paths come from the system save and open dialogs.

use std::path::Path;

use tauri::{AppHandle, State};

use crate::commands::archive::target;
use crate::errors::{AppError, AppResult, ErrorCode};
use crate::services::backups::{
    self, BackupExport, BackupInfo, Limits, RestorePlan, RestoreResult, RestoreSource,
    BACKUP_EXTENSION,
};
use crate::state::AppState;

fn data_dir(state: &AppState) -> AppResult<&Path> {
    state
        .data_dir
        .as_deref()
        .map_err(|r| AppError::new(ErrorCode::Io, format!("app data folder unavailable: {r}")))
}

#[tauri::command]
pub async fn list_backups(state: State<'_, AppState>) -> AppResult<Vec<BackupInfo>> {
    backups::list_backups(data_dir(&state)?)
}

/// Everything (stories, settings, connections without keys, usage, images)
/// in one `.dtlbackup` file at `path`.
#[tauri::command]
pub async fn export_backup(state: State<'_, AppState>, path: String) -> AppResult<BackupExport> {
    let dest = target(&path, BACKUP_EXTENSION)?;
    backups::export_backup(state.db()?, data_dir(&state)?, &state.version, &dest).await
}

/// Unpacks and checks a backup; nothing changes until `confirm_restore`.
#[tauri::command]
pub async fn prepare_restore(
    state: State<'_, AppState>,
    source: RestoreSource,
) -> AppResult<RestorePlan> {
    backups::prepare_restore(data_dir(&state)?, &source, &Limits::default()).await
}

#[tauri::command]
pub async fn cancel_restore(state: State<'_, AppState>) -> AppResult<()> {
    backups::cancel_restore(data_dir(&state)?)
}

/// Saves the current data as a backup and sets the restore to finish at
/// the next start. The app then restarts with `restart_app`.
#[tauri::command]
pub async fn confirm_restore(state: State<'_, AppState>, token: String) -> AppResult<BackupInfo> {
    backups::confirm_restore(state.db()?, data_dir(&state)?, &token).await
}

#[tauri::command]
pub fn restart_app(app: AppHandle) {
    app.restart();
}

/// What the last restore did, once (shown after the restart).
#[tauri::command]
pub async fn take_restore_result(state: State<'_, AppState>) -> AppResult<Option<RestoreResult>> {
    Ok(backups::take_restore_result(data_dir(&state)?))
}

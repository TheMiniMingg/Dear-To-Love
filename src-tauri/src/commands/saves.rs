use tauri::State;

use crate::db::saves::{self, SaveDto, SaveView};
use crate::errors::AppResult;
use crate::services::reader::{self, RouteView};
use crate::state::AppState;

#[tauri::command]
pub async fn list_saves(state: State<'_, AppState>, story_id: String) -> AppResult<Vec<SaveDto>> {
    saves::list_saves(state.db()?, &story_id).await
}

#[tauri::command]
pub async fn create_save(
    state: State<'_, AppState>,
    story_id: String,
    route_id: String,
    label: String,
) -> AppResult<SaveDto> {
    saves::create_save(state.db()?, &story_id, &route_id, &label).await
}

#[tauri::command]
pub async fn quick_save(
    state: State<'_, AppState>,
    story_id: String,
    route_id: String,
) -> AppResult<SaveDto> {
    saves::quick_save(state.db()?, &story_id, &route_id).await
}

#[tauri::command]
pub async fn view_save(state: State<'_, AppState>, save_id: String) -> AppResult<SaveView> {
    saves::view_save(state.db()?, &save_id).await
}

/// Continue from a save: same route at its head, otherwise a new branch.
#[tauri::command]
pub async fn resume_save(state: State<'_, AppState>, save_id: String) -> AppResult<RouteView> {
    let db = state.db()?;
    let r = saves::resume_save(db, &save_id).await?;
    reader::route_view(db, &r.route.id).await
}

#[tauri::command]
pub async fn delete_save(
    state: State<'_, AppState>,
    story_id: String,
    save_id: String,
) -> AppResult<()> {
    saves::delete_save(state.db()?, &story_id, &save_id).await
}

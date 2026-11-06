use tauri::State;

use crate::db::timeline::{self, RouteDto};
use crate::errors::AppResult;
use crate::services::reader::{self, RouteView};
use crate::state::AppState;

#[tauri::command]
pub async fn get_route_view(state: State<'_, AppState>, route_id: String) -> AppResult<RouteView> {
    reader::route_view(state.db()?, &route_id).await
}

#[tauri::command]
pub async fn play_mock_turn(
    state: State<'_, AppState>,
    story_id: String,
    route_id: String,
    expected_head_id: String,
    text: String,
) -> AppResult<RouteView> {
    reader::play_mock_turn(state.db()?, &story_id, &route_id, &expected_head_id, &text).await
}

#[tauri::command]
pub async fn next_chapter(
    state: State<'_, AppState>,
    story_id: String,
    route_id: String,
    expected_head_id: String,
    title: Option<String>,
) -> AppResult<RouteView> {
    let db = state.db()?;
    timeline::next_chapter(db, &story_id, &route_id, &expected_head_id, title).await?;
    reader::route_view(db, &route_id).await
}

/// Start a new branch at `event_id` (must be in the route's history).
#[tauri::command]
pub async fn fork_route(
    state: State<'_, AppState>,
    story_id: String,
    route_id: String,
    event_id: String,
    label: Option<String>,
) -> AppResult<RouteView> {
    let db = state.db()?;
    let r = timeline::fork_route(db, &story_id, &route_id, &event_id, label).await?;
    reader::route_view(db, &r.id).await
}

#[tauri::command]
pub async fn restart_chapter(
    state: State<'_, AppState>,
    story_id: String,
    route_id: String,
    chapter_event_id: String,
) -> AppResult<RouteView> {
    let db = state.db()?;
    let r = timeline::restart_chapter(db, &story_id, &route_id, &chapter_event_id).await?;
    reader::route_view(db, &r.id).await
}

#[tauri::command]
pub async fn rename_route(
    state: State<'_, AppState>,
    story_id: String,
    route_id: String,
    label: String,
) -> AppResult<RouteDto> {
    timeline::rename_route(state.db()?, &story_id, &route_id, &label).await
}

#[tauri::command]
pub async fn set_route_hidden(
    state: State<'_, AppState>,
    story_id: String,
    route_id: String,
    hidden: bool,
) -> AppResult<RouteDto> {
    timeline::set_route_hidden(state.db()?, &story_id, &route_id, hidden).await
}

use tauri::State;

use crate::db::bookmarks::{self, BookmarkDto};
use crate::errors::AppResult;
use crate::services::search::{self, SearchResults};
use crate::state::AppState;

/// Search the route's history (T37).
#[tauri::command]
pub async fn search_route(
    state: State<'_, AppState>,
    route_id: String,
    query: String,
) -> AppResult<SearchResults> {
    search::search_route(state.db()?, &route_id, &query).await
}

#[tauri::command]
pub async fn list_bookmarks(
    state: State<'_, AppState>,
    route_id: String,
) -> AppResult<Vec<BookmarkDto>> {
    bookmarks::list_bookmarks(state.db()?, &route_id).await
}

#[tauri::command]
pub async fn add_bookmark(
    state: State<'_, AppState>,
    story_id: String,
    route_id: String,
    event_id: String,
    label: Option<String>,
) -> AppResult<BookmarkDto> {
    bookmarks::add_bookmark(
        state.db()?,
        &story_id,
        &route_id,
        &event_id,
        label.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn rename_bookmark(
    state: State<'_, AppState>,
    story_id: String,
    bookmark_id: String,
    label: String,
) -> AppResult<BookmarkDto> {
    bookmarks::rename_bookmark(state.db()?, &story_id, &bookmark_id, &label).await
}

#[tauri::command]
pub async fn delete_bookmark(
    state: State<'_, AppState>,
    story_id: String,
    bookmark_id: String,
) -> AppResult<()> {
    bookmarks::delete_bookmark(state.db()?, &story_id, &bookmark_id).await
}

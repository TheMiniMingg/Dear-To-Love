use std::time::Duration;

use tauri::ipc::Channel;
use tauri::State;

use crate::db::timeline::{self, RouteDto};
use crate::domain::provider::StreamMessage;
use crate::errors::AppResult;
use crate::services::generation::{self, Ctx, Submitted};
use crate::services::reader::{self, RouteView};
use crate::state::AppState;

#[tauri::command]
pub async fn get_route_view(state: State<'_, AppState>, route_id: String) -> AppResult<RouteView> {
    reader::route_view(state.db()?, &route_id).await
}

/// Commit the player's action and create a pending reply.
#[tauri::command]
pub async fn submit_action(
    state: State<'_, AppState>,
    story_id: String,
    route_id: String,
    expected_head_id: String,
    text: String,
) -> AppResult<Submitted> {
    generation::submit_action(state.db()?, &story_id, &route_id, &expected_head_id, &text).await
}

/// Write the reply for a pending run, streaming drafts over `on_event`.
/// Resolves with the route view once the reply is committed.
#[tauri::command]
pub async fn generate_reply(
    state: State<'_, AppState>,
    run_id: String,
    on_event: Channel<StreamMessage>,
) -> AppResult<RouteView> {
    let ctx = Ctx {
        db: state.db()?,
        secrets: state.secrets.as_ref(),
        registry: &state.runs,
        session_id: &state.session_id,
        offline_delay: Duration::from_millis(18),
    };
    // A closed window just stops the drafts; the reply still commits.
    generation::generate(&ctx, &run_id, &mut |m| {
        let _ = on_event.send(m);
    })
    .await
}

#[tauri::command]
pub async fn retry_reply(
    state: State<'_, AppState>,
    story_id: String,
    route_id: String,
    expected_head_id: String,
) -> AppResult<Submitted> {
    generation::retry_reply(state.db()?, &story_id, &route_id, &expected_head_id).await
}

#[tauri::command]
pub async fn cancel_reply(state: State<'_, AppState>, run_id: String) -> AppResult<()> {
    generation::cancel(state.db()?, &state.runs, &run_id).await
}

/// Change an action: a new branch with the new text and a pending reply.
#[tauri::command]
pub async fn edit_action(
    state: State<'_, AppState>,
    story_id: String,
    route_id: String,
    player_event_id: String,
    text: String,
) -> AppResult<Submitted> {
    generation::edit_action(state.db()?, &story_id, &route_id, &player_event_id, &text).await
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

use std::time::Duration;

use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};

use crate::db::runs;
use crate::db::timeline::{self, RouteDto};
use crate::domain::dice::RollRequest;
use crate::domain::events::StateEdit;
use crate::domain::provider::StreamMessage;
use crate::errors::AppResult;
use crate::services::chapters::{self, ChapterRecapDraft};
use crate::services::context::{self, ContextPreview};
use crate::services::generation::{self, Ctx, Submitted};
use crate::services::memory::{self, SummaryEnv};
use crate::services::reader::{self, RouteView};
use crate::services::route_map::{self, RouteNode};
use crate::services::story_memory::{self, StoryMemory};
use crate::state::AppState;

#[tauri::command]
pub async fn get_route_view(state: State<'_, AppState>, route_id: String) -> AppResult<RouteView> {
    reader::route_view(state.db()?, &route_id).await
}

/// Commit the player's action and create a pending reply. With `roll`,
/// the app rolls the dice and stores the result with the action.
#[tauri::command]
pub async fn submit_action(
    state: State<'_, AppState>,
    story_id: String,
    route_id: String,
    expected_head_id: String,
    text: String,
    roll: Option<RollRequest>,
) -> AppResult<Submitted> {
    generation::submit_action(
        state.db()?,
        &story_id,
        &route_id,
        &expected_head_id,
        &text,
        roll.as_ref(),
    )
    .await
}

/// Write the reply for a pending run, streaming drafts over `on_event`.
/// Resolves with the route view once the reply is committed.
/// Once the reply is in, a story summary is written in the background if
/// one is due; it never delays or blocks play.
#[tauri::command]
pub async fn generate_reply(
    app: AppHandle,
    state: State<'_, AppState>,
    run_id: String,
    on_event: Channel<StreamMessage>,
    budget_override: Option<bool>,
) -> AppResult<RouteView> {
    let db = state.db()?;
    let ctx = Ctx {
        db,
        secrets: state.secrets.as_ref(),
        registry: &state.runs,
        session_id: &state.session_id,
        offline_delay: Duration::from_millis(18),
        budget_override: budget_override.unwrap_or(false),
    };
    // A closed window just stops the drafts; the reply still commits.
    let view = generation::generate(&ctx, &run_id, &mut |m| {
        let _ = on_event.send(m);
    })
    .await?;
    let run = {
        let mut conn = db.reader().acquire().await?;
        runs::get_run(&mut conn, &run_id).await?
    };
    tauri::async_runtime::spawn(async move {
        let state = app.state::<AppState>();
        let Ok(db) = state.db() else { return };
        let env = SummaryEnv {
            db,
            secrets: state.secrets.as_ref(),
            jobs: &state.memory,
            session_id: &state.session_id,
        };
        if let Err(e) =
            memory::maybe_summarize(&env, &run.route_id, run.provider_profile_id.as_deref()).await
        {
            eprintln!("story summary skipped: {}", e.message);
        }
    });
    Ok(view)
}

/// The exact prompt the next reply on this route would send. Local only.
#[tauri::command]
pub async fn preview_context(
    state: State<'_, AppState>,
    route_id: String,
) -> AppResult<ContextPreview> {
    context::preview_context(state.db()?, &route_id).await
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

/// Another reply to an earlier action, on a new branch.
#[tauri::command]
pub async fn regenerate_reply(
    state: State<'_, AppState>,
    story_id: String,
    route_id: String,
    assistant_event_id: String,
) -> AppResult<Submitted> {
    generation::regenerate_reply(state.db()?, &story_id, &route_id, &assistant_event_id).await
}

/// Change story details (characters, world, narration, scene, facts) from
/// the current point of this route on. Earlier turns and other routes keep
/// what they had.
#[tauri::command]
pub async fn edit_story_details(
    state: State<'_, AppState>,
    story_id: String,
    route_id: String,
    expected_head_id: String,
    changes: Vec<StateEdit>,
    note: Option<String>,
) -> AppResult<RouteView> {
    let db = state.db()?;
    reader::edit_details(db, &story_id, &route_id, &expected_head_id, changes, note).await?;
    reader::route_view(db, &route_id).await
}

/// A recap of the chapter being played, written by the chosen storyteller
/// (one possibly paid request) or offline. Nothing is stored yet.
#[tauri::command]
pub async fn draft_chapter_recap(
    state: State<'_, AppState>,
    route_id: String,
) -> AppResult<ChapterRecapDraft> {
    let env = SummaryEnv {
        db: state.db()?,
        secrets: state.secrets.as_ref(),
        jobs: &state.memory,
        session_id: &state.session_id,
    };
    chapters::draft_recap(&env, &route_id).await
}

/// End the chapter: keep the recap on this route, save, and start the next
/// chapter.
#[tauri::command]
pub async fn end_chapter(
    state: State<'_, AppState>,
    story_id: String,
    route_id: String,
    expected_head_id: String,
    recap: String,
    next_title: Option<String>,
) -> AppResult<RouteView> {
    let db = state.db()?;
    chapters::end_chapter(
        db,
        &story_id,
        &route_id,
        &expected_head_id,
        &recap,
        next_title,
    )
    .await?;
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

/// Every route of the story with where it branched and how far it got,
/// for the list, map and timeline views.
#[tauri::command]
pub async fn get_route_map(
    state: State<'_, AppState>,
    story_id: String,
) -> AppResult<Vec<RouteNode>> {
    route_map::route_map(state.db()?, &story_id).await
}

/// What the route's storyteller remembers beyond the newest turns: the
/// summary of earlier turns and the recaps of ended chapters.
#[tauri::command]
pub async fn get_story_memory(
    state: State<'_, AppState>,
    route_id: String,
) -> AppResult<StoryMemory> {
    story_memory::story_memory(state.db()?, &route_id).await
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

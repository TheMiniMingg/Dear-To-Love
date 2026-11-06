//! Reader-facing view that combines timeline, state, saves and the reply
//! status of the route head into one DTO.

use serde::Serialize;
use sqlx::FromRow;
use ts_rs::TS;

use crate::db::assets::{self, StoryVisual};
use crate::db::providers;
use crate::db::runs::{self, RunDto};
use crate::db::state::StateView;
use crate::db::timeline::{
    append_event, get_route, list_routes, route_chapters, route_history, AppendEvent, Appended,
    ChapterDto, EventDto, RouteDto,
};
use crate::db::Database;
use crate::domain::events::{EditPayload, EventBody, StateEdit};
use crate::domain::provider::Billing;
use crate::domain::visuals::VisualSlot;
use crate::errors::{AppError, AppResult};
use crate::services::mock_storyteller::MOCK_PROVIDER_LABEL;

#[derive(Debug, Clone, Serialize, TS, FromRow)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct StoryHeader {
    pub id: String,
    pub title: String,
    pub description: String,
}

/// Who writes new replies.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct StorytellerInfo {
    /// `None` = the built-in offline storyteller.
    pub profile_id: Option<String>,
    pub label: String,
    pub model_id: Option<String>,
    pub billing: Billing,
}

/// Present when the route head is a player action without a reply.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AwaitingReply {
    pub input_event_id: String,
    /// A run that is pending or streaming right now.
    pub active_run: Option<RunDto>,
    /// The most recent finished attempt (failed, cancelled, interrupted).
    pub last_run: Option<RunDto>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RouteView {
    pub story: StoryHeader,
    pub route: RouteDto,
    pub routes: Vec<RouteDto>,
    pub history: Vec<EventDto>,
    pub chapters: Vec<ChapterDto>,
    pub state: StateView,
    pub awaiting_reply: Option<AwaitingReply>,
    pub storyteller: StorytellerInfo,
    /// Story-default pictures. A route's own choices are in
    /// `state.state.visualRefs` and win over these.
    pub visuals: Vec<StoryVisual>,
}

pub async fn storyteller_info(db: &Database) -> AppResult<StorytellerInfo> {
    if let Some(id) = providers::storyteller(db).await? {
        if let Ok(row) = providers::get_profile_row(db, &id).await {
            return Ok(StorytellerInfo {
                profile_id: Some(row.id.clone()),
                label: row.label.clone(),
                model_id: Some(row.model_id.clone()),
                billing: row.billing(),
            });
        }
    }
    Ok(StorytellerInfo {
        profile_id: None,
        label: MOCK_PROVIDER_LABEL.into(),
        model_id: None,
        billing: Billing::Local,
    })
}

pub async fn route_view(db: &Database, route_id: &str) -> AppResult<RouteView> {
    let route = {
        let mut conn = db.reader().acquire().await?;
        get_route(&mut conn, route_id).await?
    };
    let story =
        sqlx::query_as::<_, StoryHeader>("SELECT id, title, description FROM stories WHERE id = ?")
            .bind(&route.story_id)
            .fetch_one(db.reader())
            .await?;
    let head = route
        .head_event_id
        .clone()
        .ok_or_else(|| AppError::internal("route has no head event"))?;
    let history = route_history(db, route_id).await?;
    let awaiting_reply = match history.last() {
        Some(e) if matches!(e.body, EventBody::Player(_)) => {
            let active_run = runs::active_run_for_route(db, route_id)
                .await?
                .filter(|r| r.input_event_id == e.id);
            let last_run = match &active_run {
                Some(_) => None,
                None => runs::latest_run_for_input(db, route_id, &e.id).await?,
            };
            Some(AwaitingReply {
                input_event_id: e.id.clone(),
                active_run,
                last_run,
            })
        }
        _ => None,
    };
    Ok(RouteView {
        routes: list_routes(db, &route.story_id).await?,
        chapters: route_chapters(db, route_id).await?,
        state: crate::db::state::state_at(db, &route.story_id, &head).await?,
        storyteller: storyteller_info(db).await?,
        visuals: assets::story_visuals(db, &route.story_id).await?,
        history,
        awaiting_reply,
        story,
        route,
    })
}

/// Longest note kept on a story-details edit (shown in the story).
const MAX_EDIT_NOTE: usize = 500;

/// Change structured story details from the head of this route on. The
/// edit is one event: earlier turns and other routes are untouched, and an
/// edit that would leave an invalid state is refused before anything is
/// written.
pub async fn edit_details(
    db: &Database,
    story_id: &str,
    route_id: &str,
    expected_head_id: &str,
    changes: Vec<StateEdit>,
    note: Option<String>,
) -> AppResult<Appended> {
    let note = note
        .map(|n| n.trim().to_string())
        .filter(|n| !n.is_empty())
        .map(|n| {
            if n.chars().count() > MAX_EDIT_NOTE {
                n.chars().take(MAX_EDIT_NOTE - 1).chain(['…']).collect()
            } else {
                n
            }
        });
    check_pictures(db, story_id, expected_head_id, &changes).await?;
    append_event(
        db,
        AppendEvent {
            story_id: story_id.into(),
            route_id: route_id.into(),
            expected_head_id: expected_head_id.into(),
            body: EventBody::Edit(EditPayload { changes, note }),
            generation_run_id: None,
        },
    )
    .await
}

/// A route-specific picture must name a real slot, an image that is in
/// the library, and (for a portrait) a character who is in the story here.
async fn check_pictures(
    db: &Database,
    story_id: &str,
    head_id: &str,
    changes: &[StateEdit],
) -> AppResult<()> {
    let mut characters = None;
    for change in changes {
        let StateEdit::SetVisualRef { slot, asset_id } = change else {
            continue;
        };
        let parsed = VisualSlot::parse(slot)?;
        if !parsed.route_scoped() {
            return Err(AppError::invalid_input(
                "the cover belongs to the whole story; set it as a story default",
            ));
        }
        if let Some(id) = asset_id {
            assets::get(db, id).await?;
        }
        if let VisualSlot::Portrait(cid) = &parsed {
            if characters.is_none() {
                characters = Some(
                    crate::db::state::state_at(db, story_id, head_id)
                        .await?
                        .effective
                        .state
                        .characters,
                );
            }
            let known = characters.as_ref().is_some_and(|c| c.contains_key(cid));
            let added = changes.iter().any(
                |c| matches!(c, StateEdit::UpsertCharacter { character } if &character.id == cid),
            );
            if !known && !added {
                return Err(AppError::invalid_input(format!(
                    "no character {cid} is in the story at this point"
                )));
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests;

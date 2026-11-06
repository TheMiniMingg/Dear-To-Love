//! Reader-facing view that combines timeline, state, saves and the reply
//! status of the route head into one DTO.

use serde::Serialize;
use sqlx::FromRow;
use ts_rs::TS;

use crate::db::providers;
use crate::db::runs::{self, RunDto};
use crate::db::state::StateView;
use crate::db::timeline::{
    get_route, list_routes, route_chapters, route_history, ChapterDto, EventDto, RouteDto,
};
use crate::db::Database;
use crate::domain::events::EventBody;
use crate::domain::provider::Billing;
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
        history,
        awaiting_reply,
        story,
        route,
    })
}

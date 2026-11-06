//! Reader-facing operations that combine timeline, state and saves into one
//! view, plus offline play with the deterministic storyteller.

use serde::Serialize;
use sqlx::FromRow;
use ts_rs::TS;

use crate::db::state::{state_with_snapshots, store_snapshots, StateView};
use crate::db::timeline::{
    ancestors, append_event_tx, get_route, list_routes, route_chapters, route_history, AppendEvent,
    ChapterDto, EventDto, RouteDto,
};
use crate::db::Database;
use crate::domain::events::{AssistantPayload, EventBody, EventKind, PlayerPayload};
use crate::errors::{AppError, AppResult};
use crate::services::mock_storyteller;

#[derive(Debug, Clone, Serialize, TS, FromRow)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct StoryHeader {
    pub id: String,
    pub title: String,
    pub description: String,
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
    Ok(RouteView {
        routes: list_routes(db, &route.story_id).await?,
        history: route_history(db, route_id).await?,
        chapters: route_chapters(db, route_id).await?,
        state: crate::db::state::state_at(db, &route.story_id, &head).await?,
        story,
        route,
    })
}

/// Commit the player's action and a deterministic offline reply in one
/// transaction. Live models use generation runs instead (PR 06).
pub async fn play_mock_turn(
    db: &Database,
    story_id: &str,
    route_id: &str,
    expected_head_id: &str,
    text: &str,
) -> AppResult<RouteView> {
    let mut tx = db.write_txn().await?;
    let player = append_event_tx(
        &mut tx,
        AppendEvent {
            story_id: story_id.into(),
            route_id: route_id.into(),
            expected_head_id: expected_head_id.into(),
            body: EventBody::Player(PlayerPayload { text: text.into() }),
            generation_run_id: None,
        },
    )
    .await?;
    let (state, snaps) = state_with_snapshots(&mut tx, story_id, &player.event_id).await?;
    let turn = ancestors(&mut tx, story_id, &player.event_id)
        .await?
        .iter()
        .filter(|e| e.kind() == Some(EventKind::Player))
        .count();
    append_event_tx(
        &mut tx,
        AppendEvent {
            story_id: story_id.into(),
            route_id: route_id.into(),
            expected_head_id: player.event_id,
            body: EventBody::Assistant(AssistantPayload {
                text: mock_storyteller::reply(&state, text, turn),
                finish_reason: Some("stop".into()),
                provider_label: Some(mock_storyteller::MOCK_PROVIDER_LABEL.into()),
                model_id: None,
            }),
            generation_run_id: None,
        },
    )
    .await?;
    tx.commit().await?;
    let _ = store_snapshots(db, &snaps).await;
    route_view(db, route_id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::stories::{create_story, list_stories};
    use crate::db::test_support::test_db;
    use crate::domain::templates::{QuickStartInput, TemplateCatalog};
    use crate::errors::ErrorCode;

    /// T01 + T52 at service level: Quick Start, play offline, reopen.
    #[tokio::test]
    async fn quick_start_and_offline_play() {
        let t = test_db().await;
        let draft = TemplateCatalog::bundled()
            .resolve_quick_start(&QuickStartInput {
                world_id: "starter:harbor-town".into(),
                scenario_id: "starter:unsigned-letter".into(),
                character_id: "starter:new-keeper".into(),
                perspective: None,
                detail: None,
            })
            .unwrap();
        let created = create_story(&t.db, draft).await.unwrap();
        let v = route_view(&t.db, &created.main_route_id).await.unwrap();
        assert_eq!(v.chapters[0].title, "The Lamp Room");
        assert_eq!(
            v.state.effective.active_chapter.as_ref().unwrap().ordinal,
            1
        );
        assert!(v.route.is_main);

        let v = play_mock_turn(
            &t.db,
            &created.story_id,
            &created.main_route_id,
            &created.head_event_id,
            "Read the letter",
        )
        .await
        .unwrap();
        assert_eq!(v.history.len(), 3);
        assert!(matches!(v.history[2].body, EventBody::Assistant(_)));

        // A stale head is refused and nothing is written.
        let e = play_mock_turn(
            &t.db,
            &created.story_id,
            &created.main_route_id,
            &created.head_event_id,
            "again",
        )
        .await
        .unwrap_err();
        assert_eq!(e.code, ErrorCode::HeadChanged);
        assert_eq!(
            route_view(&t.db, &created.main_route_id)
                .await
                .unwrap()
                .history
                .len(),
            3
        );
        let s = &list_stories(&t.db).await.unwrap()[0];
        assert_eq!(s.last_route_id, created.main_route_id);
    }
}

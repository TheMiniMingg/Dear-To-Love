//! "Test Story Engine": a deterministic, fully offline run of the timeline
//! on a throwaway database. Never touches the user's stories.

use std::path::Path;

use serde::Serialize;
use ts_rs::TS;

use crate::db::saves::{create_save, resume_save};
use crate::db::state::{full_replay, state_with_snapshots};
use crate::db::stories::create_story;
use crate::db::timeline::{append_event, fork_route, get_route, route_history, AppendEvent};
use crate::db::{contract, new_id, Database};
use crate::domain::events::{AssistantPayload, EditPayload, EventBody, PlayerPayload, StateEdit};
use crate::domain::story::CreateStoryInput;
use crate::domain::story_state::sample_lighthouse;
use crate::errors::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SelfTestReport {
    pub turns: u32,
    pub routes: u32,
    pub checks_passed: Vec<String>,
}

fn fail(msg: impl Into<String>) -> AppError {
    AppError::internal(msg)
}

async fn head(db: &Database, route: &str) -> AppResult<String> {
    let mut c = db.reader().acquire().await?;
    get_route(&mut c, route)
        .await?
        .head_event_id
        .ok_or_else(|| fail("route without head"))
}

async fn push(db: &Database, story: &str, route: &str, body: EventBody) -> AppResult<String> {
    let h = head(db, route).await?;
    Ok(append_event(
        db,
        AppendEvent {
            story_id: story.into(),
            route_id: route.into(),
            expected_head_id: h,
            body,
            generation_run_id: None,
        },
    )
    .await?
    .event_id)
}

/// Mock storyteller turn: deterministic action and reply text.
async fn mock_turn(db: &Database, story: &str, route: &str, n: u32) -> AppResult<String> {
    push(
        db,
        story,
        route,
        EventBody::Player(PlayerPayload {
            text: format!("Test action {n}"),
        }),
    )
    .await?;
    push(
        db,
        story,
        route,
        EventBody::Assistant(AssistantPayload {
            text: format!("Test reply {n}"),
            finish_reason: Some("stop".into()),
            provider_label: Some("Self-test".into()),
            model_id: None,
        }),
    )
    .await
}

pub async fn run(scratch_root: &Path) -> AppResult<SelfTestReport> {
    let dir = scratch_root.join(format!("selftest-{}", new_id()));
    let result = run_in(&dir).await;
    let _ = std::fs::remove_dir_all(&dir);
    result
}

async fn run_in(dir: &Path) -> AppResult<SelfTestReport> {
    let (db, _) = Database::open(&dir.join("story.db"), &dir.join("backups")).await?;
    let mut passed = Vec::new();
    let created = create_story(
        &db,
        CreateStoryInput {
            title: "Self-test".into(),
            description: String::new(),
            base_state: sample_lighthouse(),
            first_chapter_title: "One".into(),
            chapter_outlines: vec![],
        },
    )
    .await?;
    let story = created.story_id.as_str();
    let main = created.main_route_id.as_str();

    let mut fork_at = String::new();
    let mut turns = 0;
    for n in 0..24 {
        if n % 6 == 0 {
            push(
                &db,
                story,
                main,
                EventBody::Edit(EditPayload {
                    changes: vec![StateEdit::SetOpenThreads {
                        open_threads: vec![format!("Thread {n}")],
                    }],
                    note: None,
                }),
            )
            .await?;
        }
        let e = mock_turn(&db, story, main, n).await?;
        turns += 1;
        if n == 10 {
            fork_at = e;
        }
    }
    passed.push("create and play 24 turns".to_string());

    let main_before = route_history(&db, main).await?;
    let alt = fork_route(&db, story, main, &fork_at, None).await?;
    for n in 100..105 {
        mock_turn(&db, story, &alt.id, n).await?;
        turns += 1;
    }
    if route_history(&db, main).await? != main_before {
        return Err(fail("playing a fork changed the main route"));
    }
    passed.push("fork leaves the original route unchanged".to_string());

    let save = create_save(&db, story, &alt.id, "Self-test save").await?;
    mock_turn(&db, story, &alt.id, 200).await?;
    turns += 1;
    let resumed = resume_save(&db, &save.id).await?;
    if !resumed.forked || resumed.route.head_event_id.as_deref() != Some(save.event_id.as_str()) {
        return Err(fail("resuming an older save did not branch at the save"));
    }
    passed.push("save and resume as a new branch".to_string());

    for route in [main, alt.id.as_str(), resumed.route.id.as_str()] {
        let h = head(&db, route).await?;
        let mut conn = db.reader().acquire().await?;
        let (cached, snaps) = state_with_snapshots(&mut conn, story, &h).await?;
        let full = full_replay(&mut conn, story, &h).await?;
        drop(conn);
        crate::db::state::store_snapshots(&db, &snaps).await?;
        let mut conn = db.reader().acquire().await?;
        let (again, _) = state_with_snapshots(&mut conn, story, &h).await?;
        if cached.hash() != full.hash() || again.hash() != full.hash() {
            return Err(fail("snapshot replay differs from full replay"));
        }
    }
    passed.push("snapshot replay matches full replay".to_string());

    let problems = contract::verify(&db).await?;
    if !problems.is_empty() {
        return Err(fail(format!("consistency: {}", problems.join("; "))));
    }
    passed.push("database consistency".to_string());
    db.close().await;

    Ok(SelfTestReport {
        turns,
        routes: 3,
        checks_passed: passed,
    })
}

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn self_test_passes_and_cleans_up() {
        let tmp = tempfile::tempdir().unwrap();
        let report = super::run(tmp.path()).await.unwrap();
        assert_eq!(report.checks_passed.len(), 5);
        assert_eq!(std::fs::read_dir(tmp.path()).unwrap().count(), 0);
    }
}

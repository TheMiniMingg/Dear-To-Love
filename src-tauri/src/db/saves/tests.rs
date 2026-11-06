use super::*;
use crate::db::state::{full_replay, state_with_snapshots, store_snapshots, SNAPSHOT_INTERVAL};
use crate::db::stories::create_story;
use crate::db::test_support::test_db;
use crate::db::timeline::{append_event, route_history, AppendEvent};
use crate::db::{contract, Database};
use crate::domain::events::{AssistantPayload, EditPayload, EventBody, PlayerPayload, StateEdit};
use crate::domain::story::{CreateStoryInput, StoryCreated};
use crate::domain::story_state::fixtures::lighthouse;
use crate::errors::ErrorCode;

async fn story(db: &Database) -> StoryCreated {
    create_story(
        db,
        CreateStoryInput {
            title: "Lamp".into(),
            description: String::new(),
            base_state: lighthouse(),
            first_chapter_title: "One".into(),
            chapter_outlines: vec![],
        },
    )
    .await
    .unwrap()
}

async fn head(db: &Database, route_id: &str) -> String {
    let mut c = db.reader().acquire().await.unwrap();
    get_route(&mut c, route_id)
        .await
        .unwrap()
        .head_event_id
        .unwrap()
}

async fn push(db: &Database, s: &StoryCreated, route: &str, body: EventBody) -> String {
    let h = head(db, route).await;
    append_event(
        db,
        AppendEvent {
            story_id: s.story_id.clone(),
            route_id: route.into(),
            expected_head_id: h,
            body,
            generation_run_id: None,
        },
    )
    .await
    .unwrap()
    .event_id
}

async fn turn(db: &Database, s: &StoryCreated, route: &str, n: usize) -> String {
    push(
        db,
        s,
        route,
        EventBody::Player(PlayerPayload {
            text: format!("act {n}"),
        }),
    )
    .await;
    push(
        db,
        s,
        route,
        EventBody::Assistant(AssistantPayload {
            text: format!("reply {n}"),
            finish_reason: None,
            provider_label: None,
            model_id: None,
        }),
    )
    .await
}

fn threads(n: usize) -> EventBody {
    EventBody::Edit(EditPayload {
        changes: vec![StateEdit::SetOpenThreads {
            open_threads: vec![format!("thread {n}")],
        }],
        note: None,
    })
}

/// T02: close and reopen after 10 turns restores exact narrative and state.
#[tokio::test]
async fn reopen_after_ten_turns_restores_history_and_state() {
    let t = test_db().await;
    let s = story(&t.db).await;
    for n in 0..10 {
        turn(&t.db, &s, &s.main_route_id, n).await;
    }
    push(&t.db, &s, &s.main_route_id, threads(1)).await;
    let hist = route_history(&t.db, &s.main_route_id).await.unwrap();
    let state = crate::db::state::route_state(&t.db, &s.main_route_id)
        .await
        .unwrap();
    let path = t.db.path().to_path_buf();
    t.db.close().await;

    let (db, _) = Database::open(&path, &t.dir.path().join("backups"))
        .await
        .unwrap();
    assert_eq!(route_history(&db, &s.main_route_id).await.unwrap(), hist);
    let again = crate::db::state::route_state(&db, &s.main_route_id)
        .await
        .unwrap();
    assert_eq!(again.state_hash, state.state_hash);
    assert_eq!(
        again.effective.state.open_threads,
        vec!["thread 1".to_string()]
    );
}

/// T05: a historical save resumes as a new fork; the old head is unchanged.
#[tokio::test]
async fn resume_historical_save_forks() {
    let t = test_db().await;
    let s = story(&t.db).await;
    turn(&t.db, &s, &s.main_route_id, 1).await;
    let save = create_save(&t.db, &s.story_id, &s.main_route_id, "Before storm")
        .await
        .unwrap();
    assert!(save.is_route_head);
    turn(&t.db, &s, &s.main_route_id, 2).await;
    let main_head = head(&t.db, &s.main_route_id).await;

    let view = view_save(&t.db, &save.id).await.unwrap();
    assert!(!view.save.is_route_head);
    assert_eq!(view.history.last().unwrap().id, save.event_id);

    let resumed = resume_save(&t.db, &save.id).await.unwrap();
    assert!(resumed.forked);
    assert_eq!(
        resumed.route.head_event_id.as_deref(),
        Some(save.event_id.as_str())
    );
    turn(&t.db, &s, &resumed.route.id, 3).await;
    assert_eq!(head(&t.db, &s.main_route_id).await, main_head);

    // A save at the head continues on its own route.
    let at_head = create_save(&t.db, &s.story_id, &resumed.route.id, "Tip")
        .await
        .unwrap();
    let r = resume_save(&t.db, &at_head.id).await.unwrap();
    assert!(!r.forked);
    assert_eq!(r.route.id, resumed.route.id);
    assert!(contract::verify(&t.db).await.unwrap().is_empty());
}

#[tokio::test]
async fn quick_save_moves_one_slot_and_autosaves_rotate() {
    let t = test_db().await;
    let s = story(&t.db).await;
    turn(&t.db, &s, &s.main_route_id, 1).await;
    let q1 = quick_save(&t.db, &s.story_id, &s.main_route_id)
        .await
        .unwrap();
    turn(&t.db, &s, &s.main_route_id, 2).await;
    let q2 = quick_save(&t.db, &s.story_id, &s.main_route_id)
        .await
        .unwrap();
    assert_eq!(q1.id, q2.id);
    assert_ne!(q1.event_id, q2.event_id);

    for n in 3..12 {
        turn(&t.db, &s, &s.main_route_id, n).await;
    }
    let saves = list_saves(&t.db, &s.story_id).await.unwrap();
    let autos: Vec<_> = saves.iter().filter(|s| s.save_type == "auto").collect();
    assert_eq!(autos.len() as i64, AUTO_SLOTS);
    let latest = head(&t.db, &s.main_route_id).await;
    assert!(autos.iter().any(|a| a.event_id == latest));
    assert_eq!(saves.iter().filter(|s| s.save_type == "quick").count(), 1);
}

#[tokio::test]
async fn delete_save_checks_story() {
    let t = test_db().await;
    let s = story(&t.db).await;
    let other = story(&t.db).await;
    let save = create_save(&t.db, &s.story_id, &s.main_route_id, "x")
        .await
        .unwrap();
    let e = delete_save(&t.db, &other.story_id, &save.id)
        .await
        .unwrap_err();
    assert_eq!(e.code, ErrorCode::NotFound);
    delete_save(&t.db, &s.story_id, &save.id).await.unwrap();
    assert!(list_saves(&t.db, &s.story_id).await.unwrap().is_empty());
}

/// T07: snapshot + suffix replay equals full replay, including after
/// branching across a snapshot boundary.
#[tokio::test]
async fn snapshot_plus_suffix_matches_full_replay() {
    let t = test_db().await;
    let s = story(&t.db).await;
    let mut fork_point = String::new();
    for n in 0..30 {
        if n % 4 == 0 {
            push(&t.db, &s, &s.main_route_id, threads(n)).await;
        }
        let e = turn(&t.db, &s, &s.main_route_id, n).await;
        if n == 15 {
            fork_point = e;
        }
    }
    let alt =
        crate::db::timeline::fork_route(&t.db, &s.story_id, &s.main_route_id, &fork_point, None)
            .await
            .unwrap();
    push(&t.db, &s, &alt.id, threads(999)).await;
    turn(&t.db, &s, &alt.id, 100).await;

    for route in [&s.main_route_id, &alt.id] {
        let h = head(&t.db, route).await;
        let mut conn = t.db.reader().acquire().await.unwrap();
        let (first, snaps) = state_with_snapshots(&mut conn, &s.story_id, &h)
            .await
            .unwrap();
        drop(conn);
        assert!(
            !snaps.is_empty(),
            "history longer than {SNAPSHOT_INTERVAL} creates snapshots"
        );
        store_snapshots(&t.db, &snaps).await.unwrap();

        let mut conn = t.db.reader().acquire().await.unwrap();
        let (cached, more) = state_with_snapshots(&mut conn, &s.story_id, &h)
            .await
            .unwrap();
        let full = full_replay(&mut conn, &s.story_id, &h).await.unwrap();
        assert!(more.is_empty());
        assert_eq!(cached.hash(), full.hash());
        assert_eq!(first.hash(), full.hash());
    }
    let main = crate::db::state::route_state(&t.db, &s.main_route_id)
        .await
        .unwrap();
    let alt_state = crate::db::state::route_state(&t.db, &alt.id).await.unwrap();
    assert_ne!(
        main.effective.state.open_threads,
        alt_state.effective.state.open_threads
    );
    assert_eq!(
        alt_state.effective.state.open_threads,
        vec!["thread 999".to_string()]
    );
}

#[tokio::test]
async fn tampered_snapshot_is_ignored() {
    let t = test_db().await;
    let s = story(&t.db).await;
    for n in 0..12 {
        turn(&t.db, &s, &s.main_route_id, n).await;
    }
    let good = crate::db::state::route_state(&t.db, &s.main_route_id)
        .await
        .unwrap();
    sqlx::query("UPDATE snapshots SET state_json = replace(state_json, 'Wren', 'Evil')")
        .execute(t.db.writer())
        .await
        .unwrap();
    let again = crate::db::state::route_state(&t.db, &s.main_route_id)
        .await
        .unwrap();
    assert_eq!(again.state_hash, good.state_hash);
}

/// T16 (reducer level): an edit applies only from its event on its branch.
#[tokio::test]
async fn edit_applies_only_on_its_branch_and_after_it() {
    let t = test_db().await;
    let s = story(&t.db).await;
    let before_edit = turn(&t.db, &s, &s.main_route_id, 1).await;
    let alt =
        crate::db::timeline::fork_route(&t.db, &s.story_id, &s.main_route_id, &before_edit, None)
            .await
            .unwrap();
    push(&t.db, &s, &s.main_route_id, threads(7)).await;

    let at_before = crate::db::state::state_at(&t.db, &s.story_id, &before_edit)
        .await
        .unwrap();
    let main_now = crate::db::state::route_state(&t.db, &s.main_route_id)
        .await
        .unwrap();
    let alt_now = crate::db::state::route_state(&t.db, &alt.id).await.unwrap();
    assert_eq!(
        main_now.effective.state.open_threads,
        vec!["thread 7".to_string()]
    );
    assert_eq!(alt_now.effective.state, at_before.effective.state);
    assert_eq!(alt_now.effective.state, lighthouse());
}

#[tokio::test]
async fn invalid_edit_is_refused_before_commit() {
    let t = test_db().await;
    let s = story(&t.db).await;
    let h = head(&t.db, &s.main_route_id).await;
    let e = append_event(
        &t.db,
        AppendEvent {
            story_id: s.story_id.clone(),
            route_id: s.main_route_id.clone(),
            expected_head_id: h.clone(),
            body: EventBody::Edit(EditPayload {
                changes: vec![StateEdit::RemoveCharacter {
                    character_id: "pc".into(),
                }],
                note: None,
            }),
            generation_run_id: None,
        },
    )
    .await
    .unwrap_err();
    assert_eq!(e.code, ErrorCode::InvalidInput);
    assert_eq!(head(&t.db, &s.main_route_id).await, h);
}

/// A transaction that never commits (process killed mid-write) leaves no trace.
#[tokio::test]
async fn interrupted_write_leaves_route_unchanged() {
    let t = test_db().await;
    let s = story(&t.db).await;
    {
        let mut tx = t.db.write_txn().await.unwrap();
        crate::db::timeline::append_event_tx(
            &mut tx,
            AppendEvent {
                story_id: s.story_id.clone(),
                route_id: s.main_route_id.clone(),
                expected_head_id: s.head_event_id.clone(),
                body: EventBody::Player(PlayerPayload {
                    text: "lost".into(),
                }),
                generation_run_id: None,
            },
        )
        .await
        .unwrap();
        // Dropped without commit.
    }
    let path = t.db.path().to_path_buf();
    t.db.close().await;
    let (db, _) = Database::open(&path, &t.dir.path().join("backups"))
        .await
        .unwrap();
    assert_eq!(head(&db, &s.main_route_id).await, s.head_event_id);
    assert_eq!(route_history(&db, &s.main_route_id).await.unwrap().len(), 1);
    assert!(contract::verify(&db).await.unwrap().is_empty());
}

use super::*;
use crate::db::stories::create_story;
use crate::db::test_support::{test_db, TestDb};
use crate::db::timeline::fork_route;
use crate::domain::events::StateEdit;
use crate::domain::story::StoryCreated;
use crate::domain::templates::{QuickStartInput, TemplateCatalog};
use crate::errors::ErrorCode;
use crate::services::generation::submit_action;

async fn story() -> (TestDb, StoryCreated) {
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
    let s = create_story(&t.db, draft).await.unwrap();
    (t, s)
}

fn rename_mara(state: &crate::domain::story_state::StoryStateV1, role: &str) -> StateEdit {
    let mut mara = state.characters["starter:npc-mara"].clone();
    mara.role = Some(role.into());
    StateEdit::UpsertCharacter { character: mara }
}

/// M7 + T29: an edit applies from this point of this route only.
#[tokio::test]
async fn edits_are_route_scoped_and_forward_only() {
    let (t, s) = story().await;
    let before = route_view(&t.db, &s.main_route_id).await.unwrap();
    let start = s.head_event_id.clone();
    let alt = fork_route(&t.db, &s.story_id, &s.main_route_id, &start, None)
        .await
        .unwrap();

    let edit = rename_mara(&before.state.effective.state, "Harbor master");
    let appended = edit_details(
        &t.db,
        &s.story_id,
        &s.main_route_id,
        &start,
        vec![edit],
        Some("  Mara's new job  ".into()),
    )
    .await
    .unwrap();

    let main = route_view(&t.db, &s.main_route_id).await.unwrap();
    let mara = |v: &RouteView| {
        v.state.effective.state.characters["starter:npc-mara"]
            .role
            .clone()
    };
    assert_eq!(mara(&main).as_deref(), Some("Harbor master"));
    match &main.history.last().unwrap().body {
        EventBody::Edit(p) => assert_eq!(p.note.as_deref(), Some("Mara's new job")),
        other => panic!("expected an edit, got {other:?}"),
    }
    assert_eq!(
        main.route.head_event_id.as_deref(),
        Some(appended.event_id.as_str())
    );
    // The other route and the earlier point keep what they had.
    let other = route_view(&t.db, &alt.id).await.unwrap();
    assert_eq!(mara(&other).as_deref(), Some("Ferry captain"));
    let earlier = crate::db::state::state_at(&t.db, &s.story_id, &start)
        .await
        .unwrap();
    assert_eq!(
        earlier.effective.state.characters["starter:npc-mara"]
            .role
            .as_deref(),
        Some("Ferry captain")
    );
}

#[tokio::test]
async fn invalid_or_stale_edits_write_nothing() {
    let (t, s) = story().await;
    let head = s.head_event_id.clone();
    let remove_player = StateEdit::RemoveCharacter {
        character_id: "starter:new-keeper".into(),
    };
    let err = edit_details(
        &t.db,
        &s.story_id,
        &s.main_route_id,
        &head,
        vec![remove_player],
        None,
    )
    .await
    .unwrap_err();
    assert_eq!(err.code, ErrorCode::InvalidInput);
    let err = edit_details(&t.db, &s.story_id, &s.main_route_id, &head, vec![], None)
        .await
        .unwrap_err();
    assert_eq!(err.code, ErrorCode::InvalidInput);

    // While an action waits for its reply, details can't change under it.
    let state = route_view(&t.db, &s.main_route_id).await.unwrap().state;
    let sub = submit_action(&t.db, &s.story_id, &s.main_route_id, &head, "Wait")
        .await
        .unwrap();
    let waiting = sub.view.route.head_event_id.clone().unwrap();
    let err = edit_details(
        &t.db,
        &s.story_id,
        &s.main_route_id,
        &waiting,
        vec![rename_mara(&state.effective.state, "x")],
        None,
    )
    .await
    .unwrap_err();
    assert_eq!(err.code, ErrorCode::InvalidInput);
    // A stale head is refused too.
    let err = edit_details(
        &t.db,
        &s.story_id,
        &s.main_route_id,
        &head,
        vec![rename_mara(&state.effective.state, "x")],
        None,
    )
    .await
    .unwrap_err();
    assert_eq!(err.code, ErrorCode::HeadChanged);
    let v = route_view(&t.db, &s.main_route_id).await.unwrap();
    assert_eq!(v.route.head_event_id.as_deref(), Some(waiting.as_str()));
}

#[tokio::test]
async fn long_notes_are_shortened() {
    let (t, s) = story().await;
    let state = route_view(&t.db, &s.main_route_id).await.unwrap().state;
    edit_details(
        &t.db,
        &s.story_id,
        &s.main_route_id,
        &s.head_event_id,
        vec![rename_mara(&state.effective.state, "Pilot")],
        Some("n".repeat(900)),
    )
    .await
    .unwrap();
    let v = route_view(&t.db, &s.main_route_id).await.unwrap();
    match &v.history.last().unwrap().body {
        EventBody::Edit(p) => assert_eq!(p.note.as_ref().unwrap().chars().count(), MAX_EDIT_NOTE),
        other => panic!("expected an edit, got {other:?}"),
    }
}

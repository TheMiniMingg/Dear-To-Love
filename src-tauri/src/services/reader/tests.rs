use super::*;
use crate::db::stories::create_story;
use crate::db::test_support::{test_db, TestDb};
use crate::db::timeline::fork_route;
use crate::domain::events::StateEdit;
use crate::domain::notes::{MemoryNote, NoteKind};
use crate::domain::reply_options::ReplyOptions;
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
            story_type: None,
            language: None,
            next_move: None,
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
    let sub = submit_action(
        &t.db,
        &s.story_id,
        &s.main_route_id,
        &head,
        "Wait",
        None,
        &ReplyOptions::default(),
    )
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

#[tokio::test]
async fn route_pictures_need_a_real_slot_image_and_character() {
    use crate::services::assets::{import_bytes, AssetStore};
    let (t, s) = story().await;
    let mut png = Vec::new();
    image::RgbImage::new(4, 4)
        .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
        .unwrap();
    let img = import_bytes(
        &t.db,
        &AssetStore::new(t.dir.path()),
        png,
        "x",
        &crate::db::assets::ImportScope::Shared,
    )
    .await
    .unwrap()
    .asset;
    let set = |slot: &str, asset: Option<&str>| StateEdit::SetVisualRef {
        slot: slot.into(),
        asset_id: asset.map(String::from),
    };
    let attempt = |changes: Vec<StateEdit>| {
        edit_details(
            &t.db,
            &s.story_id,
            &s.main_route_id,
            &s.head_event_id,
            changes,
            None,
        )
    };
    for (changes, needle) in [
        (vec![set("cover", Some(&img.id))], "whole story"),
        (
            vec![set("background", Some("no-such-image"))],
            "not in the library",
        ),
        (
            vec![set("portrait:nobody", Some(&img.id))],
            "no character nobody",
        ),
        (vec![set("hat:mara", Some(&img.id))], "unknown picture slot"),
    ] {
        let e = attempt(changes).await.unwrap_err();
        assert!(e.message.contains(needle), "{}", e.message);
    }
    attempt(vec![
        set("background", Some(&img.id)),
        set("portrait:starter:npc-mara", Some(&img.id)),
    ])
    .await
    .unwrap();
    let v = route_view(&t.db, &s.main_route_id).await.unwrap();
    assert_eq!(v.state.effective.state.visual_refs.len(), 2);
    assert!(v.visuals.is_empty(), "story defaults are untouched");
}

/// One action and the storyteller's reply, straight onto the main route.
async fn exchange(t: &TestDb, s: &StoryCreated, head: &str, reply: &str) -> String {
    use crate::domain::events::{AssistantPayload, PlayerPayload};
    let player = append_event(
        &t.db,
        AppendEvent {
            story_id: s.story_id.clone(),
            route_id: s.main_route_id.clone(),
            expected_head_id: head.into(),
            body: EventBody::Player(PlayerPayload::new("Go on")),
            generation_run_id: None,
        },
    )
    .await
    .unwrap();
    append_event(
        &t.db,
        AppendEvent {
            story_id: s.story_id.clone(),
            route_id: s.main_route_id.clone(),
            expected_head_id: player.event_id,
            body: EventBody::Assistant(AssistantPayload {
                text: reply.into(),
                finish_reason: None,
                provider_label: None,
                model_id: None,
            }),
            generation_run_id: None,
        },
    )
    .await
    .unwrap()
    .event_id
}

fn note_texts(v: &RouteView) -> Vec<(String, String)> {
    v.state
        .effective
        .state
        .notes
        .iter()
        .map(|n| (n.name.clone(), n.text.clone()))
        .collect()
}

#[tokio::test]
async fn replies_keep_memory_notes_and_one_reply_can_be_undone() {
    let (t, s) = story().await;
    let first = exchange(
        &t,
        &s,
        &s.head_event_id,
        "Mara nods. <remember person=\"Mara\">Trusts the keeper.</remember>\
         <remember place=\"Lighthouse\">The lamp room door sticks.</remember>",
    )
    .await;
    let second = exchange(
        &t,
        &s,
        &first,
        "She slips a ring on. <remember person=\"Mara\">Engaged to the keeper; wears a silver \
         ring.</remember><remember item=\"Silver ring\">Mara's engagement ring.</remember>\
         <forget place=\"Lighthouse\"/>",
    )
    .await;
    let v = route_view(&t.db, &s.main_route_id).await.unwrap();
    assert_eq!(
        note_texts(&v),
        [
            (
                "Mara".to_string(),
                "Engaged to the keeper; wears a silver ring.".to_string()
            ),
            ("Silver ring".into(), "Mara's engagement ring.".into()),
        ]
    );
    assert_eq!(
        v.state.effective.state.notes[0].source_event_id.as_deref(),
        Some(second.as_str())
    );

    // Undo the second reply's notes: Mara and the lighthouse go back to
    // how the first reply left them, and the ring note goes.
    undo_reply_notes(
        &t.db,
        &s.story_id,
        &s.main_route_id,
        &second,
        &second,
        Some("took back Mara, Lighthouse and Ring".into()),
    )
    .await
    .unwrap();
    let v = route_view(&t.db, &s.main_route_id).await.unwrap();
    match &v.history.last().unwrap().body {
        EventBody::Edit(p) => {
            assert_eq!(
                p.note.as_deref(),
                Some("took back Mara, Lighthouse and Ring")
            )
        }
        other => panic!("expected an edit, got {other:?}"),
    }
    let mut got = note_texts(&v);
    got.sort();
    assert_eq!(
        got,
        [
            (
                "Lighthouse".to_string(),
                "The lamp room door sticks.".to_string()
            ),
            ("Mara".into(), "Trusts the keeper.".into()),
        ]
    );
    let head = v.state.head_event_id.clone();
    // Nothing left to undo for that reply now.
    let again = undo_reply_notes(&t.db, &s.story_id, &s.main_route_id, &head, &second, None).await;
    assert!(again.is_err());

    // A note changed since a reply is not undone with it.
    let changed = edit_details(
        &t.db,
        &s.story_id,
        &s.main_route_id,
        &head,
        vec![StateEdit::UpsertNote {
            note: MemoryNote {
                kind: NoteKind::Person,
                name: "Mara".into(),
                text: "Rewritten by the player.".into(),
                chapter: None,
                source_event_id: None,
            },
        }],
        None,
    )
    .await
    .unwrap();
    undo_reply_notes(
        &t.db,
        &s.story_id,
        &s.main_route_id,
        &changed.event_id,
        &first,
        None,
    )
    .await
    .unwrap();
    let v = route_view(&t.db, &s.main_route_id).await.unwrap();
    assert_eq!(
        note_texts(&v),
        [("Mara".to_string(), "Rewritten by the player.".to_string())]
    );
    let mara = &v.state.effective.state.notes[0];
    assert_eq!(
        mara.source_event_id.as_deref(),
        Some(changed.event_id.as_str())
    );
}

#[tokio::test]
async fn a_story_can_keep_its_notes_by_hand() {
    let (t, s) = story().await;
    let v = route_view(&t.db, &s.main_route_id).await.unwrap();
    let mut narration = v.state.effective.state.narration.clone();
    narration.manual_memory = true;
    let off = edit_details(
        &t.db,
        &s.story_id,
        &s.main_route_id,
        &s.head_event_id,
        vec![StateEdit::SetNarration { narration }],
        None,
    )
    .await
    .unwrap();
    let reply = exchange(
        &t,
        &s,
        &off.event_id,
        "Hi. <remember person=\"Mara\">Ignored.</remember>",
    )
    .await;
    let v = route_view(&t.db, &s.main_route_id).await.unwrap();
    assert!(v.state.effective.state.notes.is_empty());
    let err = undo_reply_notes(&t.db, &s.story_id, &s.main_route_id, &reply, &reply, None).await;
    assert!(err.is_err());
}

#[tokio::test]
async fn a_reply_keeps_the_quest_log_and_its_threads_can_be_undone() {
    let (t, s) = story().await;
    let open_of = |v: &RouteView| v.state.effective.state.open_threads.clone();
    let done_of = |v: &RouteView| v.state.effective.state.done_threads.clone();
    let start = route_view(&t.db, &s.main_route_id).await.unwrap();
    let mut first_open = open_of(&start);
    first_open.push("Find who sent the letter".into());
    let first = exchange(
        &t,
        &s,
        &s.head_event_id,
        "A letter. <thread>Find who sent the letter</thread>",
    )
    .await;
    let v = route_view(&t.db, &s.main_route_id).await.unwrap();
    assert_eq!(open_of(&v), first_open);

    let second = exchange(
        &t,
        &s,
        &first,
        "It was Kip. <thread done>find who sent the letter.</thread>\
         <thread>Pay Kip back</thread>",
    )
    .await;
    let v = route_view(&t.db, &s.main_route_id).await.unwrap();
    assert!(open_of(&v).contains(&"Pay Kip back".to_string()));
    assert_eq!(done_of(&v), vec!["Find who sent the letter".to_string()]);

    // Undo the second reply: the letter is open again where it stood, and
    // Kip's debt goes.
    undo_reply_notes(&t.db, &s.story_id, &s.main_route_id, &second, &second, None)
        .await
        .unwrap();
    let v = route_view(&t.db, &s.main_route_id).await.unwrap();
    assert_eq!(open_of(&v), first_open);
    assert!(done_of(&v).is_empty());
    match &v.history.last().unwrap().body {
        EventBody::Edit(p) => assert_eq!(
            p.note.as_deref(),
            Some("Find who sent the letter, Pay Kip back")
        ),
        other => panic!("expected an edit, got {other:?}"),
    }

    // A thread the player moved since is left where they put it.
    let head = v.state.head_event_id.clone();
    let moved = edit_details(
        &t.db,
        &s.story_id,
        &s.main_route_id,
        &head,
        vec![
            StateEdit::SetOpenThreads {
                open_threads: vec![],
            },
            StateEdit::SetDoneThreads {
                done_threads: vec!["Find who sent the letter".into()],
            },
        ],
        None,
    )
    .await
    .unwrap();
    let err = undo_reply_notes(
        &t.db,
        &s.story_id,
        &s.main_route_id,
        &moved.event_id,
        &first,
        None,
    )
    .await
    .unwrap_err();
    assert!(err.message.contains("changed since"), "{}", err.message);
}

#[tokio::test]
async fn a_reply_moves_how_someone_feels_and_its_undo_moves_it_back() {
    use crate::domain::story_state::{Bond, BondKind};
    let (t, s) = story().await;
    let feeling = |v: &RouteView| {
        let st = &v.state.effective.state;
        st.relationships
            .iter()
            .find(|r| r.from_id == "starter:npc-mara" && r.to_id == st.player_character_id)
            .map(|r| (r.status.clone(), r.bond))
    };
    let start = feeling(&route_view(&t.db, &s.main_route_id).await.unwrap());
    let first = exchange(
        &t,
        &s,
        &s.head_event_id,
        "She smiles. <bond name=\"Mara\" heart=\"+10\">Warmer since the lamp</bond>",
    )
    .await;
    let heart = |value| {
        Some(Bond {
            kind: BondKind::Heart,
            value,
        })
    };
    let v = route_view(&t.db, &s.main_route_id).await.unwrap();
    assert_eq!(
        feeling(&v),
        Some(("Warmer since the lamp".into(), heart(60)))
    );
    let second = exchange(&t, &s, &first, "<bond name=\"Mara\" heart=\"+5\"/>").await;
    let v = route_view(&t.db, &s.main_route_id).await.unwrap();
    assert_eq!(
        feeling(&v),
        Some(("Warmer since the lamp".into(), heart(65)))
    );

    // Undo the second reply: the bar is back where the first left it.
    undo_reply_notes(&t.db, &s.story_id, &s.main_route_id, &second, &second, None)
        .await
        .unwrap();
    let v = route_view(&t.db, &s.main_route_id).await.unwrap();
    assert_eq!(
        feeling(&v),
        Some(("Warmer since the lamp".into(), heart(60)))
    );
    match &v.history.last().unwrap().body {
        EventBody::Edit(p) => assert_eq!(p.note.as_deref(), Some("Mara Quill")),
        other => panic!("expected an edit, got {other:?}"),
    }
    // Undo the first: Mara feels as she did when the story began.
    let head = v.state.head_event_id.clone();
    undo_reply_notes(&t.db, &s.story_id, &s.main_route_id, &head, &first, None)
        .await
        .unwrap();
    let v = route_view(&t.db, &s.main_route_id).await.unwrap();
    assert_eq!(feeling(&v), start);
    let err = undo_reply_notes(
        &t.db,
        &s.story_id,
        &s.main_route_id,
        &v.state.head_event_id,
        &first,
        None,
    )
    .await
    .unwrap_err();
    assert!(err.message.contains("changed since"), "{}", err.message);
}

/// A reply appended to `route_id` after `head`.
async fn reply_on(t: &TestDb, s: &StoryCreated, route_id: &str, head: &str, text: &str) -> String {
    use crate::domain::events::AssistantPayload;
    append_event(
        &t.db,
        AppendEvent {
            story_id: s.story_id.clone(),
            route_id: route_id.into(),
            expected_head_id: head.into(),
            body: EventBody::Assistant(AssistantPayload {
                text: text.into(),
                finish_reason: None,
                provider_label: None,
                model_id: None,
            }),
            generation_run_id: None,
        },
    )
    .await
    .unwrap()
    .event_id
}

async fn played_at(t: &TestDb, route_id: &str, at: &str) {
    sqlx::query("UPDATE routes SET updated_at = ? WHERE id = ?")
        .bind(at)
        .bind(route_id)
        .execute(t.db.writer())
        .await
        .unwrap();
}

/// Another reply: each version of a reply can be flipped to, and opens the
/// route where it was played last.
#[tokio::test]
async fn another_reply_gives_versions_to_flip_between() {
    use crate::db::timeline::{regenerate_fork, set_route_hidden};
    let (t, s) = story().await;
    let first = exchange(&t, &s, &s.head_event_id, "The lamp gutters.").await;
    let main = route_view(&t.db, &s.main_route_id).await.unwrap();
    assert!(
        main.reply_versions.is_empty(),
        "one version, nothing to flip"
    );

    let other = regenerate_fork(&t.db, &s.story_id, &s.main_route_id, &first)
        .await
        .unwrap();
    let action = other.head_event_id.clone().unwrap();
    // While the new reply is being written there is still only one version.
    assert!(route_view(&t.db, &other.id)
        .await
        .unwrap()
        .reply_versions
        .is_empty());
    let second = reply_on(&t, &s, &other.id, &action, "The lamp flares.").await;

    let main = route_view(&t.db, &s.main_route_id).await.unwrap();
    assert_eq!(
        main.reply_versions,
        vec![ReplyVersions {
            event_id: first.clone(),
            route_ids: vec![s.main_route_id.clone(), other.id.clone()],
            current: 0,
        }]
    );
    let alt = route_view(&t.db, &other.id).await.unwrap();
    assert_eq!(
        alt.reply_versions,
        vec![ReplyVersions {
            event_id: second.clone(),
            route_ids: vec![s.main_route_id.clone(), other.id.clone()],
            current: 1,
        }]
    );

    // Played on from the second version, on a branch of its own: flipping
    // back from the first opens that branch, where the player was last.
    let later = fork_route(&t.db, &s.story_id, &other.id, &second, None)
        .await
        .unwrap();
    played_at(&t, &other.id, "2030-01-01T00:00:00Z").await;
    played_at(&t, &later.id, "2030-01-02T00:00:00Z").await;
    let main = route_view(&t.db, &s.main_route_id).await.unwrap();
    assert_eq!(main.reply_versions[0].route_ids[1], later.id);

    // Hidden routes are not offered.
    set_route_hidden(&t.db, &s.story_id, &later.id, true)
        .await
        .unwrap();
    let main = route_view(&t.db, &s.main_route_id).await.unwrap();
    assert_eq!(main.reply_versions[0].route_ids[1], other.id);
    set_route_hidden(&t.db, &s.story_id, &other.id, true)
        .await
        .unwrap();
    let main = route_view(&t.db, &s.main_route_id).await.unwrap();
    assert!(main.reply_versions.is_empty());
}

/// Editing a reply keeps the old words on a hidden branch: not a version.
#[tokio::test]
async fn an_edited_reply_is_not_a_second_version() {
    let (t, s) = story().await;
    let first = exchange(&t, &s, &s.head_event_id, "The lamp gutters.").await;
    let view = crate::services::generation::edit_reply(
        &t.db,
        &s.story_id,
        &s.main_route_id,
        &first,
        &first,
        "The lamp gutters and goes out.",
    )
    .await
    .unwrap();
    assert!(view.reply_versions.is_empty());
}

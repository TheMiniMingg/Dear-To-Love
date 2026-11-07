use super::*;
use crate::db::stories::create_story;
use crate::db::test_support::{test_db, TestDb};
use crate::db::timeline::{append_event, fork_route, set_route_hidden, AppendEvent};
use crate::domain::events::{AssistantPayload, PlayerPayload};
use crate::domain::story::{CreateStoryInput, StoryCreated};
use crate::domain::story_state::fixtures::lighthouse;

async fn story(t: &TestDb) -> StoryCreated {
    create_story(
        &t.db,
        CreateStoryInput {
            title: "Lighthouse".into(),
            description: String::new(),
            base_state: lighthouse(),
            first_chapter_title: "The Lamp".into(),
            chapter_outlines: vec![],
        },
    )
    .await
    .unwrap()
}

async fn add(t: &TestDb, s: &StoryCreated, route: &str, head: &str, body: EventBody) -> String {
    append_event(
        &t.db,
        AppendEvent {
            story_id: s.story_id.clone(),
            route_id: route.into(),
            expected_head_id: head.into(),
            body,
            generation_run_id: None,
        },
    )
    .await
    .unwrap()
    .event_id
}

fn act(text: &str) -> EventBody {
    EventBody::Player(PlayerPayload::new(text))
}

fn reply(text: &str) -> EventBody {
    EventBody::Assistant(AssistantPayload {
        text: text.into(),
        finish_reason: None,
        provider_label: None,
        model_id: None,
    })
}

#[tokio::test]
async fn routes_know_where_they_branched_and_how_far_they_got() {
    let t = test_db().await;
    let s = story(&t).await;
    let main = s.main_route_id.clone();
    let a1 = add(&t, &s, &main, &s.head_event_id, act("I climb the stairs.")).await;
    let r1 = add(&t, &s, &main, &a1, reply("The lamp flickers.")).await;
    let a2 = add(&t, &s, &main, &r1, act("I trim the wick.")).await;
    add(&t, &s, &main, &a2, reply("The flame steadies.")).await;

    // Another reply to the second action.
    let again = fork_route(&t.db, &s.story_id, &main, &a2, Some("Another reply".into()))
        .await
        .unwrap();
    add(&t, &s, &again.id, &a2, reply("The   flame\n gutters out.")).await;

    // A different second action, answered with a text message.
    let other = fork_route(&t.db, &s.story_id, &main, &r1, Some("Other action".into()))
        .await
        .unwrap();
    let a2c = add(&t, &s, &other.id, &r1, act("I read the logbook.")).await;
    add(
        &t,
        &s,
        &other.id,
        &a2c,
        reply("<text from=\"Mara\">Meet me at the pier.</text> The page is torn."),
    )
    .await;

    // A branch that hasn't done anything yet, and a hidden one.
    let idle = fork_route(&t.db, &s.story_id, &other.id, &a2c, Some("Idle".into()))
        .await
        .unwrap();
    set_route_hidden(&t.db, &s.story_id, &idle.id, true)
        .await
        .unwrap();

    let map = route_map(&t.db, &s.story_id).await.unwrap();
    let by = |label: &str| map.iter().find(|n| n.route.label == label).unwrap();
    assert_eq!(map.len(), 4, "hidden routes are listed too");

    let m = &map[0];
    assert!(m.route.is_main);
    assert_eq!((m.turns, m.fork_turn), (2, None));
    assert_eq!(m.branch, None);
    assert_eq!(m.latest.as_deref(), Some("The flame steadies."));
    assert_eq!(
        m.chapter,
        Some(ChapterRef {
            ordinal: 1,
            title: "The Lamp".into()
        })
    );

    let b = by("Another reply");
    assert_eq!((b.turns, b.fork_turn), (2, Some(2)));
    assert_eq!(
        b.branch,
        Some(BranchStart {
            kind: BranchKind::Reply,
            text: "The flame gutters out.".into()
        })
    );
    assert_eq!(b.route.parent_route_id.as_deref(), Some(main.as_str()));

    let o = by("Other action");
    assert_eq!((o.turns, o.fork_turn), (2, Some(1)));
    assert_eq!(
        o.branch,
        Some(BranchStart {
            kind: BranchKind::Action,
            text: "I read the logbook.".into()
        })
    );
    let latest = o.latest.as_deref().unwrap();
    assert!(latest.contains("Meet me at the pier.") && latest.contains("The page is torn."));
    assert!(
        !latest.contains("<text"),
        "message tags are shown as words: {latest}"
    );

    let i = by("Idle");
    assert!(i.route.hidden);
    assert_eq!((i.turns, i.fork_turn), (2, Some(2)));
    assert_eq!(i.branch, None, "nothing different yet");
    assert_eq!(i.latest.as_deref(), Some("I read the logbook."));
}

#[tokio::test]
async fn long_routes_are_cut_short_and_unknown_stories_refused() {
    let t = test_db().await;
    let s = story(&t).await;
    let main = s.main_route_id.clone();
    let long = "word ".repeat(100);
    add(&t, &s, &main, &s.head_event_id, act(&long)).await;
    let map = route_map(&t.db, &s.story_id).await.unwrap();
    let latest = map[0].latest.as_deref().unwrap();
    assert!(latest.chars().count() <= EXCERPT_CHARS + 1 && latest.ends_with('…'));
    assert_eq!(map[0].turns, 1);

    assert!(route_map(&t.db, "no-such-story").await.is_err());
}

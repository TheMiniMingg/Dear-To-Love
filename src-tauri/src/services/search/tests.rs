use super::*;
use crate::db::stories::create_story;
use crate::db::test_support::test_db;
use crate::db::timeline::{append_event, fork_route, list_routes, next_chapter, AppendEvent};
use crate::domain::events::{AssistantPayload, PlayerPayload};
use crate::domain::story::CreateStoryInput;
use crate::domain::story_state::fixtures::lighthouse;
use crate::errors::ErrorCode;

fn words(q: &str) -> Vec<Vec<char>> {
    terms(q).unwrap()
}

fn render(parts: &[SnippetPart]) -> String {
    parts
        .iter()
        .map(|p| {
            if p.mark {
                format!("[{}]", p.text)
            } else {
                p.text.clone()
            }
        })
        .collect()
}

#[test]
fn every_word_must_match_in_any_order_and_case() {
    let text = "The lamp hums.\n\nMara climbs the stairs to the LAMP room.";
    let got = match_text(text, &words("lamp  mara")).unwrap();
    assert_eq!(
        render(&got),
        "The [lamp] hums. [Mara] climbs the stairs to the [LAMP] room."
    );
    assert!(match_text(text, &words("lamp ferry")).is_none());
    // Repeated words count once; parts of words match too.
    assert_eq!(
        render(&match_text(text, &words("Stair stair")).unwrap()),
        "The lamp hums. Mara climbs the [stair]s to the LAMP room."
    );
    // Overlapping words mark one run.
    assert_eq!(
        render(&match_text("lighthouse", &words("light ghth")).unwrap()),
        "[lighth]ouse"
    );
}

#[test]
fn long_text_gets_a_window_around_the_first_match() {
    let before = "word ".repeat(100);
    let after = " more".repeat(100);
    let text = format!("{before}the brass key{after}");
    let got = render(&match_text(&text, &words("brass")).unwrap());
    assert!(got.starts_with("… word"), "{got}");
    assert!(got.contains("the [brass] key more"), "{got}");
    assert!(got.ends_with("more …"), "{got}");
    let plain = got.replace(['[', ']'], "");
    assert!(
        plain.chars().count() <= SNIPPET + 4,
        "{}",
        plain.chars().count()
    );
    // No word is cut at either end.
    assert!(!got.contains(" wor ") && !got.contains("mor …"));

    // Near the end, the window reaches back instead.
    let text = format!("{before}the end");
    let got = render(&match_text(&text, &words("end")).unwrap());
    assert!(got.ends_with("the [end]"), "{got}");
    assert!(got.starts_with("… "));
}

#[test]
fn queries_are_checked() {
    for (q, msg) in [
        ("   ", "type something"),
        (&"x".repeat(MAX_QUERY + 1), "at most 200 characters"),
        ("a b c d e f g h i", "at most 8 words"),
    ] {
        let err = terms(q).expect_err(q);
        assert_eq!(err.code, ErrorCode::InvalidInput);
        assert!(err.message.contains(msg), "{}", err.message);
    }
    assert_eq!(words(" Lamp lamp LAMP ").len(), 1);
}

async fn push(db: &Database, story: &str, route: &str, body: EventBody) -> String {
    let head = list_routes(db, story)
        .await
        .unwrap()
        .into_iter()
        .find(|r| r.id == route)
        .unwrap()
        .head_event_id
        .unwrap();
    append_event(
        db,
        AppendEvent {
            story_id: story.into(),
            route_id: route.into(),
            expected_head_id: head,
            body,
            generation_run_id: None,
        },
    )
    .await
    .unwrap()
    .event_id
}

fn act(t: &str) -> EventBody {
    EventBody::Player(PlayerPayload { text: t.into() })
}

fn reply(t: &str) -> EventBody {
    EventBody::Assistant(AssistantPayload {
        text: t.into(),
        finish_reason: None,
        provider_label: None,
        model_id: None,
    })
}

/// T37: results come only from the route's own history, in story order,
/// with the chapter each one is in.
#[tokio::test]
async fn search_is_scoped_to_the_route() {
    let t = test_db().await;
    let s = create_story(
        &t.db,
        CreateStoryInput {
            title: "Lamp".into(),
            description: String::new(),
            base_state: lighthouse(),
            first_chapter_title: "The Stairs".into(),
            chapter_outlines: vec![],
        },
    )
    .await
    .unwrap();
    let (sid, main) = (s.story_id.as_str(), s.main_route_id.as_str());
    push(&t.db, sid, main, act("I light the lamp.")).await;
    let shared = push(&t.db, sid, main, reply("The lamp hums like a hive.")).await;
    let alt = fork_route(&t.db, sid, main, &shared, None)
        .await
        .unwrap()
        .id;
    push(&t.db, sid, &alt, act("I follow the humming to the ferry.")).await;
    let head = push(&t.db, sid, main, act("I wait for the keeper.")).await;
    let reply_id = push(&t.db, sid, main, reply("The keeper's lamp is cold.")).await;
    next_chapter(&t.db, sid, main, &reply_id, Some("The Keeper".into()))
        .await
        .unwrap();
    push(&t.db, sid, main, act("I ask the keeper about the lamp.")).await;

    let found = search_route(&t.db, main, "lamp").await.unwrap();
    assert_eq!(found.total, 4);
    let chapters: Vec<_> = found
        .hits
        .iter()
        .map(|h| (h.kind, h.chapter_ordinal, h.chapter_title.as_deref()))
        .collect();
    assert_eq!(
        chapters,
        [
            (EventKind::Player, Some(1), Some("The Stairs")),
            (EventKind::Assistant, Some(1), Some("The Stairs")),
            (EventKind::Assistant, Some(1), Some("The Stairs")),
            (EventKind::Player, Some(2), Some("The Keeper")),
        ]
    );
    assert_ne!(found.hits[2].event_id, head);

    // The branch's own words stay on the branch; shared history is on both.
    assert_eq!(search_route(&t.db, main, "ferry").await.unwrap().total, 0);
    let on_alt = search_route(&t.db, &alt, "hum").await.unwrap();
    assert_eq!(on_alt.total, 2);
    assert_eq!(on_alt.hits[0].event_id, shared);
    assert_eq!(search_route(&t.db, &alt, "keeper").await.unwrap().total, 0);

    // Chapter titles are searchable too.
    let ch = search_route(&t.db, main, "keeper chapter").await.unwrap();
    assert_eq!(ch.total, 1);
    assert_eq!(ch.hits[0].kind, EventKind::ChapterStart);
    assert_eq!(render(&ch.hits[0].snippet), "[Chapter] 2: The [Keeper]");

    let err = search_route(&t.db, "no-such-route", "lamp")
        .await
        .unwrap_err();
    assert_eq!(err.code, ErrorCode::NotFound);
}

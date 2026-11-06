use super::*;
use crate::db::contract;
use crate::db::stories::create_story;
use crate::db::test_support::test_db;
use crate::db::timeline::{append_event, fork_route, list_routes, AppendEvent};
use crate::db::DB_FILE_NAME;
use crate::domain::events::{AssistantPayload, PlayerPayload};
use crate::domain::story::{CreateStoryInput, StoryCreated};
use crate::domain::story_state::fixtures::lighthouse;

async fn story(db: &Database, title: &str) -> StoryCreated {
    create_story(
        db,
        CreateStoryInput {
            title: title.into(),
            description: String::new(),
            base_state: lighthouse(),
            first_chapter_title: "The Stairs".into(),
            chapter_outlines: vec![],
        },
    )
    .await
    .unwrap()
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

fn labels(list: &[BookmarkDto]) -> Vec<&str> {
    list.iter().map(|b| b.label.as_str()).collect()
}

#[tokio::test]
async fn add_rename_and_remove_bookmarks() {
    let t = test_db().await;
    let s = story(&t.db, "Lamp").await;
    let (sid, main) = (s.story_id.as_str(), s.main_route_id.as_str());
    let chapter = s.head_event_id.clone();
    let action = push(&t.db, sid, main, act("I climb the stairs.")).await;
    let long = "The lamp hums. ".repeat(20);
    let answer = push(&t.db, sid, main, reply(&long)).await;

    // Without a name, a bookmark is named after its text.
    let b = add_bookmark(&t.db, sid, main, &answer, None).await.unwrap();
    assert_eq!(b.kind, EventKind::Assistant);
    assert!(b.label.starts_with("The lamp hums. The lamp") && b.label.ends_with('…'));
    assert!(b.label.chars().count() <= AUTO_LABEL + 1);
    assert_eq!(b.chapter_ordinal, Some(1));
    assert_eq!(b.chapter_title.as_deref(), Some("The Stairs"));
    add_bookmark(&t.db, sid, main, &chapter, Some("  Start "))
        .await
        .unwrap();
    add_bookmark(&t.db, sid, main, &action, None).await.unwrap();

    // Listed in story order, not creation order.
    let list = list_bookmarks(&t.db, main).await.unwrap();
    assert_eq!(
        labels(&list),
        ["Start", "I climb the stairs.", b.label.as_str()]
    );
    assert_eq!(list[0].excerpt, "Chapter 1: The Stairs");

    // Bookmarking the same place again keeps one bookmark and can rename it.
    let again = add_bookmark(&t.db, sid, main, &answer, None).await.unwrap();
    assert_eq!(
        (again.id.as_str(), again.label.as_str()),
        (b.id.as_str(), b.label.as_str())
    );
    let named = add_bookmark(&t.db, sid, main, &answer, Some("The hum"))
        .await
        .unwrap();
    assert_eq!(
        (named.id.as_str(), named.label.as_str()),
        (b.id.as_str(), "The hum")
    );
    let renamed = rename_bookmark(&t.db, sid, &b.id, "Humming").await.unwrap();
    assert_eq!(renamed.label, "Humming");
    assert_eq!(list_bookmarks(&t.db, main).await.unwrap().len(), 3);

    for bad in ["", "   ", &"x".repeat(MAX_LABEL + 1)] {
        let err = rename_bookmark(&t.db, sid, &b.id, bad).await.unwrap_err();
        assert_eq!(err.code, ErrorCode::InvalidInput);
    }

    // Another story can't touch it.
    let other = story(&t.db, "Other").await;
    let err = delete_bookmark(&t.db, &other.story_id, &b.id)
        .await
        .unwrap_err();
    assert_eq!(err.code, ErrorCode::NotFound);
    let err = add_bookmark(&t.db, &other.story_id, main, &answer, None)
        .await
        .unwrap_err();
    assert_eq!(err.code, ErrorCode::WrongStory);

    delete_bookmark(&t.db, sid, &b.id).await.unwrap();
    assert_eq!(
        labels(&list_bookmarks(&t.db, main).await.unwrap()),
        ["Start", "I climb the stairs."]
    );
    assert!(contract::verify(&t.db).await.unwrap().is_empty());
}

#[tokio::test]
async fn bookmarks_stay_on_their_route_and_branches_keep_shared_ones() {
    let t = test_db().await;
    let s = story(&t.db, "Lamp").await;
    let (sid, main) = (s.story_id.as_str(), s.main_route_id.as_str());
    let first = push(&t.db, sid, main, act("I climb.")).await;
    let shared = push(&t.db, sid, main, reply("The lamp hums.")).await;
    let later = push(&t.db, sid, main, act("I call out.")).await;
    add_bookmark(&t.db, sid, main, &first, Some("Climb"))
        .await
        .unwrap();
    add_bookmark(&t.db, sid, main, &later, Some("Call"))
        .await
        .unwrap();

    // A branch from the reply keeps "Climb" (shared) but not "Call".
    let alt = fork_route(&t.db, sid, main, &shared, None)
        .await
        .unwrap()
        .id;
    let own = push(&t.db, sid, &alt, act("I run to the ferry.")).await;
    assert_eq!(
        labels(&list_bookmarks(&t.db, &alt).await.unwrap()),
        ["Climb"]
    );
    add_bookmark(&t.db, sid, &alt, &own, Some("Ferry"))
        .await
        .unwrap();

    // An event from the other branch can't be bookmarked here.
    let err = add_bookmark(&t.db, sid, main, &own, None)
        .await
        .unwrap_err();
    assert_eq!(err.code, ErrorCode::InvalidAncestor);
    let err = add_bookmark(&t.db, sid, &alt, &later, None)
        .await
        .unwrap_err();
    assert_eq!(err.code, ErrorCode::InvalidAncestor);

    // Each route's bookmarks are its own.
    let alt_climb = list_bookmarks(&t.db, &alt).await.unwrap()[0].id.clone();
    rename_bookmark(&t.db, sid, &alt_climb, "Climb (ferry)")
        .await
        .unwrap();
    assert_eq!(
        labels(&list_bookmarks(&t.db, main).await.unwrap()),
        ["Climb", "Call"]
    );
    assert_eq!(
        labels(&list_bookmarks(&t.db, &alt).await.unwrap()),
        ["Climb (ferry)", "Ferry"]
    );
    assert!(contract::verify(&t.db).await.unwrap().is_empty());

    // A bookmark that points outside its route is reported at startup.
    let mut tx = t.db.write_txn().await.unwrap();
    sqlx::query(
        "INSERT INTO bookmarks (id, route_id, event_id, label, created_at, updated_at) \
         VALUES ('stray', ?, ?, 'Stray', '', '')",
    )
    .bind(main)
    .bind(&own)
    .execute(&mut *tx)
    .await
    .unwrap();
    tx.commit().await.unwrap();
    assert_eq!(
        contract::verify(&t.db).await.unwrap(),
        ["bookmark stray does not point into its route history"]
    );
    // ...and left out of the list rather than shown in the wrong place.
    assert_eq!(list_bookmarks(&t.db, main).await.unwrap().len(), 2);
}

/// T37: bookmarks resolve after the app is closed and opened again.
#[tokio::test]
async fn bookmarks_resolve_after_reopen() {
    let t = test_db().await;
    let s = story(&t.db, "Lamp").await;
    let (sid, main) = (s.story_id.clone(), s.main_route_id.clone());
    push(&t.db, &sid, &main, act("I climb.")).await;
    let reply_id = push(&t.db, &sid, &main, reply("The lamp hums.")).await;
    let b = add_bookmark(&t.db, &sid, &main, &reply_id, Some("Hum"))
        .await
        .unwrap();
    push(&t.db, &sid, &main, act("I call out.")).await;
    t.db.close().await;

    let (db, _) = Database::open(
        &t.dir.path().join(DB_FILE_NAME),
        &t.dir.path().join("backups"),
    )
    .await
    .unwrap();
    assert!(contract::verify(&db).await.unwrap().is_empty());
    let list = list_bookmarks(&db, &main).await.unwrap();
    assert_eq!(list, std::slice::from_ref(&b));
    assert_eq!(
        (list[0].event_id.as_str(), list[0].excerpt.as_str()),
        (reply_id.as_str(), "The lamp hums.")
    );

    // Deleting the story takes its bookmarks with it.
    crate::db::stories::delete_story(&db, &sid).await.unwrap();
    let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM bookmarks")
        .fetch_one(db.reader())
        .await
        .unwrap();
    assert_eq!(n, 0);
}

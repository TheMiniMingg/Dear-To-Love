//! Story rows: create (with main route and first chapter), list, rename,
//! delete.

use sqlx::{Row, SqliteConnection};

use super::{assets, new_id, now, providers, Database};
use crate::domain::events::{ChapterStartPayload, EventKind, EVENT_PAYLOAD_VERSION};
use crate::domain::story::{CreateStoryInput, StoryCreated, StorySetup, StorySummary};
use crate::domain::story_state::{StoryStateV1, STORY_STATE_SCHEMA_VERSION};
use crate::domain::visuals::VisualSlot;
use crate::errors::{AppError, AppResult, ErrorCode};
use crate::services::prompt::StoryFrame;

const MAX_TITLE: usize = 200;

/// Creates the story, its main route and the first `chapter_start` event in
/// one transaction. The base state is immutable from here on.
pub async fn create_story(db: &Database, input: CreateStoryInput) -> AppResult<StoryCreated> {
    create_story_with(db, input, &StorySetup::default()).await
}

/// [`create_story`] plus the choices made while creating it (pictures, the
/// story's own images, its storyteller), all in the same transaction.
pub async fn create_story_with(
    db: &Database,
    input: CreateStoryInput,
    setup: &StorySetup,
) -> AppResult<StoryCreated> {
    let title = input.title.trim();
    if title.is_empty() || title.chars().count() > MAX_TITLE {
        return Err(AppError::invalid_input(format!(
            "story title must be 1 to {MAX_TITLE} characters"
        )));
    }
    let chapter_title = input.first_chapter_title.trim();
    if chapter_title.is_empty() || chapter_title.chars().count() > MAX_TITLE {
        return Err(AppError::invalid_input("chapter title must not be empty"));
    }
    input.base_state.validate()?;

    let story_id = new_id();
    let route_id = new_id();
    let event_id = new_id();
    let ts = now();

    let first_outline_id = if input.chapter_outlines.is_empty() {
        None
    } else {
        Some(new_id())
    };
    let payload = ChapterStartPayload {
        chapter_instance_id: new_id(),
        title: chapter_title.to_string(),
        ordinal: 1,
        source_outline_id: first_outline_id.clone(),
        previous_chapter_recap: None,
    };

    let mut tx = db.write_txn().await?;
    sqlx::query(
        "INSERT INTO stories (id, title, description, base_state_json, schema_version, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&story_id)
    .bind(title)
    .bind(input.description.trim())
    .bind(input.base_state.to_canonical_json())
    .bind(STORY_STATE_SCHEMA_VERSION as i64)
    .bind(&ts)
    .bind(&ts)
    .execute(&mut *tx)
    .await?;

    for (i, outline) in input.chapter_outlines.iter().enumerate() {
        let id = if i == 0 {
            first_outline_id.clone().unwrap_or_else(new_id)
        } else {
            new_id()
        };
        sqlx::query(
            "INSERT INTO chapter_outlines (id, story_id, ordinal, title, outline) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(id)
        .bind(&story_id)
        .bind((i + 1) as i64)
        .bind(outline.title.trim())
        .bind(&outline.outline)
        .execute(&mut *tx)
        .await?;
    }

    sqlx::query(
        "INSERT INTO routes (id, story_id, label, is_main, version, created_at, updated_at) \
         VALUES (?, ?, 'Main', 1, 0, ?, ?)",
    )
    .bind(&route_id)
    .bind(&story_id)
    .bind(&ts)
    .bind(&ts)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        "INSERT INTO events (id, story_id, origin_route_id, parent_event_id, kind, payload_json, payload_version, created_at) \
         VALUES (?, ?, ?, NULL, ?, ?, ?, ?)",
    )
    .bind(&event_id)
    .bind(&story_id)
    .bind(&route_id)
    .bind(EventKind::ChapterStart.as_str())
    .bind(serde_json::to_string(&payload).expect("payload serializes"))
    .bind(EVENT_PAYLOAD_VERSION as i64)
    .bind(&ts)
    .execute(&mut *tx)
    .await?;

    sqlx::query("UPDATE routes SET head_event_id = ?, version = 1, updated_at = ? WHERE id = ?")
        .bind(&event_id)
        .bind(&ts)
        .bind(&route_id)
        .execute(&mut *tx)
        .await?;
    apply_setup(&mut tx, &story_id, &input.base_state, setup).await?;
    tx.commit().await?;

    Ok(StoryCreated {
        story_id,
        main_route_id: route_id,
        head_event_id: event_id,
        route_version: 1,
    })
}

#[derive(sqlx::FromRow)]
struct SummaryRow {
    id: String,
    title: String,
    description: String,
    created_at: String,
    updated_at: String,
    route_count: i32,
    main_route_id: String,
    last_route_id: String,
    cover_asset_id: Option<String>,
    writing: bool,
    genres_json: Option<String>,
    last_head_id: Option<String>,
}

pub async fn list_stories(db: &Database) -> AppResult<Vec<StorySummary>> {
    let mut conn = db.reader().acquire().await?;
    let rows = sqlx::query_as::<_, SummaryRow>(
        "WITH last AS ( \
           SELECT s.id AS story_id, \
                  (SELECT r.id FROM routes r WHERE r.story_id = s.id AND r.hidden = 0 \
                     ORDER BY r.updated_at DESC, r.id DESC LIMIT 1) AS route_id \
           FROM stories s) \
         SELECT s.id, s.title, s.description, s.created_at, s.updated_at, \
                (SELECT COUNT(*) FROM routes r WHERE r.story_id = s.id AND r.hidden = 0) AS route_count, \
                (SELECT r.id FROM routes r WHERE r.story_id = s.id AND r.is_main = 1) AS main_route_id, \
                last.route_id AS last_route_id, \
                (SELECT l.asset_id FROM asset_links l WHERE l.story_id = s.id \
                   AND l.owner_type = 'story' AND l.variant = 'cover') AS cover_asset_id, \
                EXISTS (SELECT 1 FROM generation_runs g JOIN routes r ON r.id = g.route_id \
                   WHERE r.story_id = s.id AND g.status = 'streaming') AS writing, \
                json_extract(s.base_state_json, '$.narration.genres') AS genres_json, \
                (SELECT r.head_event_id FROM routes r WHERE r.id = last.route_id) AS last_head_id \
         FROM stories s JOIN last ON last.story_id = s.id \
         WHERE NOT EXISTS (SELECT 1 FROM archive_operations a \
                           WHERE a.story_id = s.id AND a.status = 'committed') \
         ORDER BY s.updated_at DESC, s.id DESC",
    )
    .fetch_all(&mut *conn)
    .await?;
    let mut out = Vec::with_capacity(rows.len());
    for r in rows {
        let progress = match &r.last_head_id {
            Some(head) => route_progress(&mut conn, head).await?,
            None => Progress::default(),
        };
        out.push(StorySummary {
            id: r.id,
            title: r.title,
            description: r.description,
            created_at: r.created_at,
            updated_at: r.updated_at,
            route_count: r.route_count,
            main_route_id: r.main_route_id,
            last_route_id: r.last_route_id,
            cover_asset_id: r.cover_asset_id,
            writing: r.writing,
            genres: r
                .genres_json
                .and_then(|j| serde_json::from_str(&j).ok())
                .unwrap_or_default(),
            chapter: progress.chapter,
            turns: progress.turns,
            last_reply: progress.last_reply,
        });
    }
    Ok(out)
}

/// How far a route has got, read along its events from `head` back.
#[derive(Debug, Default, PartialEq)]
struct Progress {
    chapter: Option<i32>,
    turns: i32,
    last_reply: Option<String>,
}

async fn route_progress(conn: &mut SqliteConnection, head: &str) -> AppResult<Progress> {
    let (turns, chapter, last_reply): (i64, Option<i64>, Option<String>) = sqlx::query_as(
        "WITH RECURSIVE chain(id, parent, depth) AS ( \
           SELECT id, parent_event_id, 0 FROM events WHERE id = ? \
           UNION ALL \
           SELECT e.id, e.parent_event_id, c.depth + 1 FROM events e JOIN chain c ON e.id = c.parent) \
         SELECT \
           (SELECT COUNT(*) FROM chain c JOIN events e ON e.id = c.id WHERE e.kind = 'player'), \
           (SELECT json_extract(e.payload_json, '$.ordinal') FROM chain c JOIN events e ON e.id = c.id \
              WHERE e.kind = 'chapter_start' ORDER BY c.depth LIMIT 1), \
           (SELECT json_extract(e.payload_json, '$.text') FROM chain c JOIN events e ON e.id = c.id \
              WHERE e.kind = 'assistant' ORDER BY c.depth LIMIT 1)",
    )
    .bind(head)
    .fetch_one(&mut *conn)
    .await?;
    Ok(Progress {
        chapter: chapter.and_then(|n| i32::try_from(n).ok()),
        turns: i32::try_from(turns).unwrap_or(i32::MAX),
        last_reply,
    })
}

/// A story title as it is kept: trimmed, one line, 1 to 200 characters.
pub fn clean_title(title: &str) -> AppResult<String> {
    let title = title.split_whitespace().collect::<Vec<_>>().join(" ");
    if title.is_empty() || title.chars().count() > MAX_TITLE {
        return Err(AppError::invalid_input(format!(
            "story title must be 1 to {MAX_TITLE} characters"
        )));
    }
    Ok(title)
}

/// Gives a story a new title. Its place in the library (last played)
/// stays as it was.
pub async fn rename_story(db: &Database, story_id: &str, title: &str) -> AppResult<String> {
    let title = clean_title(title)?;
    let done = sqlx::query("UPDATE stories SET title = ? WHERE id = ?")
        .bind(&title)
        .bind(story_id)
        .execute(db.writer())
        .await?;
    if done.rows_affected() == 0 {
        return Err(AppError::not_found(format!("story {story_id} not found")));
    }
    Ok(title)
}

pub async fn get_base_state(db: &Database, story_id: &str) -> AppResult<StoryStateV1> {
    let row = sqlx::query("SELECT base_state_json FROM stories WHERE id = ?")
        .bind(story_id)
        .fetch_optional(db.reader())
        .await?
        .ok_or_else(|| AppError::not_found(format!("story {story_id} not found")))?;
    StoryStateV1::from_json(row.get::<&str, _>(0))
}

async fn apply_setup(
    conn: &mut SqliteConnection,
    story_id: &str,
    state: &StoryStateV1,
    setup: &StorySetup,
) -> AppResult<()> {
    for id in &setup.own_images {
        let row = assets::find(&mut *conn, id).await?.ok_or_else(|| {
            AppError::new(
                ErrorCode::AssetMissing,
                "a picture added for this story is no longer in the library",
            )
        })?;
        // A shared image stays shared: other stories may already use it.
        if row.shared == 0 {
            assets::add_to_story(&mut *conn, id, story_id).await?;
        }
    }
    for (slot, asset_id) in &setup.pictures {
        if let VisualSlot::Portrait(cid) = slot {
            if !state.characters.contains_key(cid) {
                return Err(AppError::invalid_input(format!(
                    "a portrait is set for {cid}, who isn't in the story"
                )));
            }
        }
        assets::set_link_tx(&mut *conn, story_id, slot, Some(asset_id)).await?;
    }
    if setup.storyteller.is_some() {
        providers::set_story_choice_tx(&mut *conn, story_id, setup.storyteller.as_ref()).await?;
    }
    Ok(())
}

/// The title, premise and the outline of chapter `chapter_ordinal` (when
/// the story has one) for the storyteller's prompt.
pub async fn story_frame(
    conn: &mut SqliteConnection,
    story_id: &str,
    chapter_ordinal: Option<u32>,
) -> AppResult<StoryFrame> {
    let (title, premise): (String, String) =
        sqlx::query_as("SELECT title, description FROM stories WHERE id = ?")
            .bind(story_id)
            .fetch_optional(&mut *conn)
            .await?
            .ok_or_else(|| AppError::not_found(format!("story {story_id} not found")))?;
    let chapter_outline = match chapter_ordinal {
        Some(n) => sqlx::query_scalar(
            "SELECT outline FROM chapter_outlines WHERE story_id = ? AND ordinal = ?",
        )
        .bind(story_id)
        .bind(i64::from(n))
        .fetch_optional(&mut *conn)
        .await?
        .filter(|o: &String| !o.trim().is_empty()),
        None => None,
    };
    Ok(StoryFrame {
        title,
        premise,
        chapter_outline,
        earlier_chapters: Vec::new(),
    })
}

/// Deletes a whole story and everything it owns. The app-level usage ledger
/// keeps its rows (route references become NULL).
pub async fn delete_story(db: &Database, story_id: &str) -> AppResult<()> {
    let mut tx = db.write_txn().await?;
    // Break the route -> event head pointers first so the cascade order
    // inside SQLite cannot trip the deferred head/fork references.
    sqlx::query("UPDATE routes SET head_event_id = NULL, fork_event_id = NULL WHERE story_id = ?")
        .bind(story_id)
        .execute(&mut *tx)
        .await?;
    let done = sqlx::query("DELETE FROM stories WHERE id = ?")
        .bind(story_id)
        .execute(&mut *tx)
        .await?;
    if done.rows_affected() == 0 {
        return Err(AppError::not_found(format!("story {story_id} not found")));
    }
    tx.commit().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::contract;
    use crate::db::test_support::test_db;
    use crate::domain::story::ChapterOutlineInput;
    use crate::domain::story_state::fixtures::lighthouse;
    use crate::errors::ErrorCode;

    fn input(title: &str) -> CreateStoryInput {
        CreateStoryInput {
            title: title.into(),
            description: "A test".into(),
            base_state: lighthouse(),
            first_chapter_title: "The Lamp".into(),
            chapter_outlines: vec![
                ChapterOutlineInput {
                    title: "The Lamp".into(),
                    outline: "Investigate".into(),
                },
                ChapterOutlineInput {
                    title: "The Ferry".into(),
                    outline: String::new(),
                },
            ],
        }
    }

    #[tokio::test]
    async fn creates_story_with_main_route_and_first_chapter() {
        let t = test_db().await;
        let created = create_story(&t.db, input("Lamp")).await.unwrap();
        let (head, version, is_main): (String, i64, i64) =
            sqlx::query_as("SELECT head_event_id, version, is_main FROM routes WHERE id = ?")
                .bind(&created.main_route_id)
                .fetch_one(t.db.reader())
                .await
                .unwrap();
        assert_eq!(head, created.head_event_id);
        assert_eq!((version, is_main), (1, 1));
        let (kind, payload): (String, String) =
            sqlx::query_as("SELECT kind, payload_json FROM events WHERE id = ?")
                .bind(&head)
                .fetch_one(t.db.reader())
                .await
                .unwrap();
        assert_eq!(kind, "chapter_start");
        let p: ChapterStartPayload = serde_json::from_str(&payload).unwrap();
        assert_eq!((p.ordinal, p.title.as_str()), (1, "The Lamp"));
        assert!(p.source_outline_id.is_some());
        assert_eq!(
            get_base_state(&t.db, &created.story_id).await.unwrap(),
            lighthouse()
        );
    }

    #[tokio::test]
    async fn rejects_invalid_input_without_writing() {
        let t = test_db().await;
        let mut bad = input("  ");
        assert_eq!(
            create_story(&t.db, bad.clone()).await.unwrap_err().code,
            ErrorCode::InvalidInput
        );
        bad.title = "ok".into();
        bad.base_state.player_character_id = "missing".into();
        assert!(create_story(&t.db, bad).await.is_err());
        assert!(list_stories(&t.db).await.unwrap().is_empty());
    }

    /// M1 exit gate: create and reopen 100 stories.
    #[tokio::test]
    async fn hundred_stories_survive_restart() {
        let t = test_db().await;
        for i in 0..100 {
            create_story(&t.db, input(&format!("Story {i}")))
                .await
                .unwrap();
        }
        let path = t.db.path().to_path_buf();
        t.db.close().await;
        let (db, _) = Database::open(&path, &t.dir.path().join("backups"))
            .await
            .unwrap();
        let all = list_stories(&db).await.unwrap();
        assert_eq!(all.len(), 100);
        assert!(all.iter().all(|s| s.route_count == 1));
        assert!(contract::verify(&db).await.unwrap().is_empty());
    }

    /// The library shows how far the last played route got: its chapter,
    /// the actions taken and the newest reply, plus the story's genres.
    #[tokio::test]
    async fn list_shows_progress_of_the_last_played_route() {
        use crate::db::timeline::{append_event, AppendEvent};
        use crate::domain::events::{AssistantPayload, EventBody, PlayerPayload};
        let t = test_db().await;
        let mut made = input("Lamp");
        made.base_state.narration.genres = vec!["Mystery".into(), "Romance".into()];
        let s = create_story(&t.db, made).await.unwrap();
        let fresh = &list_stories(&t.db).await.unwrap()[0];
        assert_eq!(
            (fresh.chapter, fresh.turns, fresh.last_reply.as_deref()),
            (Some(1), 0, None)
        );
        assert_eq!(fresh.genres, vec!["Mystery", "Romance"]);

        let mut head = s.head_event_id.clone();
        for (act, reply) in [
            ("I knock.", "Nobody."),
            ("I wait.", "The lamp <b>hums</b>."),
        ] {
            for body in [
                EventBody::Player(PlayerPayload::new(act)),
                EventBody::Assistant(AssistantPayload {
                    text: reply.into(),
                    finish_reason: None,
                    provider_label: None,
                    model_id: None,
                }),
            ] {
                head = append_event(
                    &t.db,
                    AppendEvent {
                        story_id: s.story_id.clone(),
                        route_id: s.main_route_id.clone(),
                        expected_head_id: head,
                        body,
                        generation_run_id: None,
                    },
                )
                .await
                .unwrap()
                .event_id;
            }
        }
        let played = &list_stories(&t.db).await.unwrap()[0];
        assert_eq!(
            (played.chapter, played.turns, played.last_reply.as_deref()),
            (Some(1), 2, Some("The lamp <b>hums</b>."))
        );
    }

    #[tokio::test]
    async fn rename_keeps_one_line_and_the_library_order() {
        let t = test_db().await;
        let a = create_story(&t.db, input("First")).await.unwrap();
        create_story(&t.db, input("Second")).await.unwrap();
        let order = || async {
            list_stories(&t.db)
                .await
                .unwrap()
                .into_iter()
                .map(|s| s.title)
                .collect::<Vec<_>>()
        };
        let before = order().await;
        assert_eq!(
            rename_story(&t.db, &a.story_id, "  The \n First  Light ")
                .await
                .unwrap(),
            "The First Light"
        );
        let after = order().await;
        assert_eq!(after.len(), 2);
        assert_eq!(
            after.iter().position(|x| x == "The First Light"),
            before.iter().position(|x| x == "First")
        );
        for bad in ["   ", &"x".repeat(201)] {
            assert_eq!(
                rename_story(&t.db, &a.story_id, bad)
                    .await
                    .unwrap_err()
                    .code,
                ErrorCode::InvalidInput
            );
        }
        assert_eq!(
            rename_story(&t.db, "nope", "Title").await.unwrap_err().code,
            ErrorCode::NotFound
        );
    }

    #[tokio::test]
    async fn delete_story_keeps_usage_ledger_rows() {
        let t = test_db().await;
        let keep = create_story(&t.db, input("Keep")).await.unwrap();
        let gone = create_story(&t.db, input("Gone")).await.unwrap();
        let ts = now();
        sqlx::query(
            "INSERT INTO api_requests (id, provider_label, model_id, session_id, route_id, purpose, status, started_at) \
             VALUES ('req1', 'Test', 'm', 's', ?, 'story_reply', 'completed', ?)",
        )
        .bind(&gone.main_route_id)
        .bind(&ts)
        .execute(t.db.writer())
        .await
        .unwrap();

        delete_story(&t.db, &gone.story_id).await.unwrap();
        let ids: Vec<String> = list_stories(&t.db)
            .await
            .unwrap()
            .into_iter()
            .map(|s| s.id)
            .collect();
        assert_eq!(ids, vec![keep.story_id]);
        let (route, label): (Option<String>, String) =
            sqlx::query_as("SELECT route_id, provider_label FROM api_requests WHERE id = 'req1'")
                .fetch_one(t.db.reader())
                .await
                .unwrap();
        assert_eq!((route, label.as_str()), (None, "Test"));
        let orphans: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM events WHERE story_id = ?")
            .bind(&gone.story_id)
            .fetch_one(t.db.reader())
            .await
            .unwrap();
        assert_eq!(orphans, 0);
        assert!(contract::verify(&t.db).await.unwrap().is_empty());
        assert_eq!(
            delete_story(&t.db, &gone.story_id).await.unwrap_err().code,
            ErrorCode::NotFound
        );
    }
}

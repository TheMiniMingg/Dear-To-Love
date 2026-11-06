//! Story rows: create (with main route and first chapter), list, delete.

use sqlx::Row;

use super::{new_id, now, Database};
use crate::domain::events::{ChapterStartPayload, EventKind, EVENT_PAYLOAD_VERSION};
use crate::domain::story::{CreateStoryInput, StoryCreated, StorySummary};
use crate::domain::story_state::{StoryStateV1, STORY_STATE_SCHEMA_VERSION};
use crate::errors::{AppError, AppResult};

const MAX_TITLE: usize = 200;

/// Creates the story, its main route and the first `chapter_start` event in
/// one transaction. The base state is immutable from here on.
pub async fn create_story(db: &Database, input: CreateStoryInput) -> AppResult<StoryCreated> {
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
    tx.commit().await?;

    Ok(StoryCreated {
        story_id,
        main_route_id: route_id,
        head_event_id: event_id,
        route_version: 1,
    })
}

pub async fn list_stories(db: &Database) -> AppResult<Vec<StorySummary>> {
    Ok(sqlx::query_as::<_, StorySummary>(
        "SELECT s.id, s.title, s.description, s.created_at, s.updated_at, \
                (SELECT COUNT(*) FROM routes r WHERE r.story_id = s.id AND r.hidden = 0) AS route_count \
         FROM stories s ORDER BY s.updated_at DESC, s.id DESC",
    )
    .fetch_all(db.reader())
    .await?)
}

pub async fn get_base_state(db: &Database, story_id: &str) -> AppResult<StoryStateV1> {
    let row = sqlx::query("SELECT base_state_json FROM stories WHERE id = ?")
        .bind(story_id)
        .fetch_optional(db.reader())
        .await?
        .ok_or_else(|| AppError::not_found(format!("story {story_id} not found")))?;
    StoryStateV1::from_json(row.get::<&str, _>(0))
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

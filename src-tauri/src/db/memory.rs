//! Derived story memory: rolling summaries of earlier events (roadmap
//! section 07). Rows are replaceable caches, never canonical. A summary is
//! usable on a route only when its ending event is an ancestor of the
//! route's head and its `source_hash` still matches that ancestor chain, so
//! a summary written on one branch can never leak into another.

use sha2::{Digest, Sha256};
use sqlx::{FromRow, SqliteConnection};

use super::timeline::EventRow;
use super::{new_id, now, Database};
use crate::errors::AppResult;

/// Bump when the summary format or prompt changes; older rows are ignored.
pub const MEMORY_SCHEMA_VERSION: i64 = 1;

#[derive(Debug, Clone, PartialEq, Eq, FromRow)]
pub struct MemoryRow {
    pub id: String,
    pub story_id: String,
    pub kind: String,
    pub source_start_event_id: Option<String>,
    pub source_end_event_id: String,
    pub source_hash: String,
    pub schema_version: i64,
    pub summary_text: String,
    pub covered_turns: i64,
    pub generator: String,
    pub api_request_id: Option<String>,
    pub created_at: String,
}

/// SHA-256 over every event of `chain` (root first): id, kind and payload.
pub fn chain_hash(chain: &[EventRow]) -> String {
    let mut h = Sha256::new();
    for e in chain {
        for part in [&e.id, &e.kind, &e.payload_json] {
            h.update(part.as_bytes());
            h.update([0u8]);
        }
        h.update(b"\n");
    }
    hex::encode(h.finalize())
}

/// A summary found for a chain, with the index of its ending event.
#[derive(Debug, Clone)]
pub struct EligibleSummary {
    pub row: MemoryRow,
    pub end_index: usize,
}

/// The newest summary usable at the end of `chain` (root..=head), if any.
pub async fn latest_eligible_summary(
    conn: &mut SqliteConnection,
    story_id: &str,
    chain: &[EventRow],
) -> AppResult<Option<EligibleSummary>> {
    if chain.is_empty() {
        return Ok(None);
    }
    let rows = sqlx::query_as::<_, MemoryRow>(
        "SELECT id, story_id, kind, source_start_event_id, source_end_event_id, source_hash, \
         schema_version, summary_text, covered_turns, generator, api_request_id, created_at \
         FROM memory_caches WHERE story_id = ? AND kind = 'summary' AND schema_version = ?",
    )
    .bind(story_id)
    .bind(MEMORY_SCHEMA_VERSION)
    .fetch_all(&mut *conn)
    .await?;
    let index: std::collections::HashMap<&str, usize> = chain
        .iter()
        .enumerate()
        .map(|(i, e)| (e.id.as_str(), i))
        .collect();
    let mut candidates: Vec<(usize, MemoryRow)> = rows
        .into_iter()
        .filter_map(|r| index.get(r.source_end_event_id.as_str()).map(|&i| (i, r)))
        .collect();
    candidates.sort_by_key(|(i, _)| std::cmp::Reverse(*i));
    for (end_index, row) in candidates {
        if chain_hash(&chain[..=end_index]) == row.source_hash {
            return Ok(Some(EligibleSummary { row, end_index }));
        }
    }
    Ok(None)
}

pub struct NewSummary<'a> {
    pub story_id: &'a str,
    pub source_start_event_id: Option<&'a str>,
    pub source_end_event_id: &'a str,
    pub source_hash: &'a str,
    pub text: &'a str,
    pub covered_turns: u32,
    pub generator: &'a str,
    pub api_request_id: Option<&'a str>,
}

/// Store a summary. Returns false if one already exists for that ending
/// event (two branches sharing history share the summary).
pub async fn insert_summary(db: &Database, s: NewSummary<'_>) -> AppResult<bool> {
    let mut tx = db.write_txn().await?;
    let done = sqlx::query(
        "INSERT OR IGNORE INTO memory_caches (id, story_id, kind, source_start_event_id, \
         source_end_event_id, source_hash, schema_version, summary_text, covered_turns, \
         generator, api_request_id, created_at) \
         VALUES (?, ?, 'summary', ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(new_id())
    .bind(s.story_id)
    .bind(s.source_start_event_id)
    .bind(s.source_end_event_id)
    .bind(s.source_hash)
    .bind(MEMORY_SCHEMA_VERSION)
    .bind(s.text)
    .bind(i64::from(s.covered_turns))
    .bind(s.generator)
    .bind(s.api_request_id)
    .bind(now())
    .execute(&mut *tx)
    .await?
    .rows_affected()
        == 1;
    tx.commit().await?;
    Ok(done)
}

pub async fn summary_exists(db: &Database, end_event_id: &str) -> AppResult<bool> {
    let n: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM memory_caches WHERE source_end_event_id = ? AND kind = 'summary' \
         AND schema_version = ?",
    )
    .bind(end_event_id)
    .bind(MEMORY_SCHEMA_VERSION)
    .fetch_one(db.reader())
    .await?;
    Ok(n > 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::stories::create_story;
    use crate::db::test_support::test_db;
    use crate::db::timeline::{ancestors, append_event, fork_route, AppendEvent};
    use crate::domain::events::{AssistantPayload, EventBody, PlayerPayload};
    use crate::domain::templates::{QuickStartInput, TemplateCatalog};

    async fn story(db: &Database) -> crate::domain::story::StoryCreated {
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
        create_story(db, draft).await.unwrap()
    }

    async fn turn(db: &Database, story_id: &str, route_id: &str, head: &str, n: u32) -> String {
        let p = append_event(
            db,
            AppendEvent {
                story_id: story_id.into(),
                route_id: route_id.into(),
                expected_head_id: head.into(),
                body: EventBody::Player(PlayerPayload::new(format!("action {n}"))),
                generation_run_id: None,
            },
        )
        .await
        .unwrap();
        append_event(
            db,
            AppendEvent {
                story_id: story_id.into(),
                route_id: route_id.into(),
                expected_head_id: p.event_id,
                body: EventBody::Assistant(AssistantPayload {
                    text: format!("reply {n}"),
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

    async fn chain(db: &Database, story_id: &str, head: &str) -> Vec<EventRow> {
        let mut conn = db.reader().acquire().await.unwrap();
        ancestors(&mut conn, story_id, head).await.unwrap()
    }

    async fn eligible(db: &Database, story_id: &str, head: &str) -> Option<EligibleSummary> {
        let c = chain(db, story_id, head).await;
        let mut conn = db.reader().acquire().await.unwrap();
        latest_eligible_summary(&mut conn, story_id, &c)
            .await
            .unwrap()
    }

    /// T19: a summary from one branch is never used on another, and a
    /// summary whose hash no longer matches its chain is ignored.
    #[tokio::test]
    async fn summaries_follow_ancestry_and_hash() {
        let t = test_db().await;
        let s = story(&t.db).await;
        let (sid, main) = (s.story_id.as_str(), s.main_route_id.as_str());
        let fork_point = turn(&t.db, sid, main, &s.head_event_id, 1).await;
        let end = turn(&t.db, sid, main, &fork_point, 2).await;
        let c = chain(&t.db, sid, &end).await;
        assert!(insert_summary(
            &t.db,
            NewSummary {
                story_id: sid,
                source_start_event_id: None,
                source_end_event_id: &end,
                source_hash: &chain_hash(&c),
                text: "Main-route secret.",
                covered_turns: 2,
                generator: "test",
                api_request_id: None,
            },
        )
        .await
        .unwrap());
        // Same end again: ignored, not duplicated.
        assert!(!insert_summary(
            &t.db,
            NewSummary {
                story_id: sid,
                source_start_event_id: None,
                source_end_event_id: &end,
                source_hash: &chain_hash(&c),
                text: "again",
                covered_turns: 2,
                generator: "test",
                api_request_id: None,
            },
        )
        .await
        .unwrap());

        let later = turn(&t.db, sid, main, &end, 3).await;
        let found = eligible(&t.db, sid, &later).await.unwrap();
        assert_eq!(found.row.summary_text, "Main-route secret.");
        assert_eq!(c.len() - 1, found.end_index);

        // A branch from before the summary's end cannot see it.
        let branch = fork_route(&t.db, sid, main, &fork_point, None)
            .await
            .unwrap();
        let other = turn(&t.db, sid, &branch.id, &fork_point, 9).await;
        assert!(eligible(&t.db, sid, &other).await.is_none());

        // A tampered hash makes the summary ineligible everywhere.
        sqlx::query("UPDATE memory_caches SET source_hash = 'x'")
            .execute(t.db.writer())
            .await
            .unwrap();
        assert!(eligible(&t.db, sid, &later).await.is_none());
    }
}

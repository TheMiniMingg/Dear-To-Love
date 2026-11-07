//! Effective story state at an event: base state + replay of ancestors,
//! accelerated by snapshot caches. Snapshots are caches only; a snapshot
//! whose hash does not match its content is ignored.

use std::collections::HashMap;

use serde::Serialize;
use sqlx::SqliteConnection;
use ts_rs::TS;

use super::timeline::{ancestors, get_route, EventRow};
use super::{now, Database};
use crate::domain::events::EventBody;
use crate::domain::replay::EffectiveState;
use crate::domain::story_state::{StoryStateV1, STORY_STATE_SCHEMA_VERSION};
use crate::errors::{AppError, AppResult};

/// Snapshot every N events along a path (by depth from the root).
pub const SNAPSHOT_INTERVAL: usize = 20;

/// The version cached snapshots are stored under: the state schema, and
/// which tags replay reads from replies. Raise it whenever replay starts
/// reading something new from old events, so older snapshots are not used.
/// 2: scene headings move the scene, and `<thread>` tags keep open threads.
pub const SNAPSHOT_VERSION: i64 = STORY_STATE_SCHEMA_VERSION as i64 * 1000 + 2;

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct StateView {
    pub head_event_id: String,
    pub state_hash: String,
    #[serde(flatten)]
    #[ts(flatten)]
    pub effective: EffectiveState,
}

async fn base_state(conn: &mut SqliteConnection, story_id: &str) -> AppResult<StoryStateV1> {
    let json: String = sqlx::query_scalar("SELECT base_state_json FROM stories WHERE id = ?")
        .bind(story_id)
        .fetch_optional(conn)
        .await?
        .ok_or_else(|| AppError::not_found(format!("story {story_id} not found")))?;
    StoryStateV1::from_json(&json)
}

fn parse_bodies(history: &[EventRow]) -> AppResult<Vec<EventBody>> {
    history
        .iter()
        .map(|e| EventBody::from_parts(&e.kind, &e.payload_json))
        .collect()
}

/// Replay without any snapshot (reference implementation).
pub async fn full_replay(
    conn: &mut SqliteConnection,
    story_id: &str,
    head_id: &str,
) -> AppResult<EffectiveState> {
    let base = base_state(conn, story_id).await?;
    let history = ancestors(conn, story_id, head_id).await?;
    let bodies = parse_bodies(&history)?;
    crate::domain::replay::replay(
        EffectiveState::new(base),
        history.iter().map(|e| e.id.as_str()).zip(bodies.iter()),
    )
}

/// State at `head_id` using the deepest valid snapshot on its path. Returns
/// the state plus snapshots worth caching `(event_id, state)`.
pub async fn state_with_snapshots(
    conn: &mut SqliteConnection,
    story_id: &str,
    head_id: &str,
) -> AppResult<(EffectiveState, Vec<(String, EffectiveState)>)> {
    let history = ancestors(conn, story_id, head_id).await?;
    let cached: Vec<(String, String, String)> = sqlx::query_as(
        "SELECT s.event_id, s.state_json, s.state_hash FROM snapshots s \
         JOIN events e ON e.id = s.event_id WHERE e.story_id = ? AND s.schema_version = ?",
    )
    .bind(story_id)
    .bind(SNAPSHOT_VERSION)
    .fetch_all(&mut *conn)
    .await?;
    let cached: HashMap<String, (String, String)> = cached
        .into_iter()
        .map(|(id, json, hash)| (id, (json, hash)))
        .collect();

    let mut start_at = 0usize;
    let mut state = None;
    for (i, e) in history.iter().enumerate().rev() {
        if let Some((json, hash)) = cached.get(&e.id) {
            if let Ok(s) = serde_json::from_str::<EffectiveState>(json) {
                if &s.hash() == hash {
                    state = Some(s);
                    start_at = i + 1;
                    break;
                }
            }
        }
    }
    let mut state = match state {
        Some(s) => s,
        None => EffectiveState::new(base_state(conn, story_id).await?),
    };

    let mut new_snapshots = Vec::new();
    for (i, e) in history.iter().enumerate().skip(start_at) {
        let body = EventBody::from_parts(&e.kind, &e.payload_json)?;
        state.apply(&e.id, &body)?;
        if (i + 1) % SNAPSHOT_INTERVAL == 0 && !cached.contains_key(&e.id) {
            new_snapshots.push((e.id.clone(), state.clone()));
        }
    }
    Ok((state, new_snapshots))
}

/// Store snapshot caches. Best effort: callers ignore failures.
pub async fn store_snapshots(db: &Database, snaps: &[(String, EffectiveState)]) -> AppResult<()> {
    if snaps.is_empty() {
        return Ok(());
    }
    let mut tx = db.write_txn().await?;
    // Snapshots from before replay read something new are never used again.
    sqlx::query("DELETE FROM snapshots WHERE schema_version <> ?")
        .bind(SNAPSHOT_VERSION)
        .execute(&mut *tx)
        .await?;
    for (event_id, s) in snaps {
        sqlx::query(
            "INSERT OR IGNORE INTO snapshots (event_id, schema_version, state_json, state_hash, created_at) \
             VALUES (?, ?, ?, ?, ?)",
        )
        .bind(event_id)
        .bind(SNAPSHOT_VERSION)
        .bind(serde_json::to_string(s).expect("state serializes"))
        .bind(s.hash())
        .bind(now())
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

/// Effective state at an event (read path used by the UI).
pub async fn state_at(db: &Database, story_id: &str, event_id: &str) -> AppResult<StateView> {
    let (effective, snaps) = {
        let mut conn = db.reader().acquire().await?;
        state_with_snapshots(&mut conn, story_id, event_id).await?
    };
    if let Err(e) = store_snapshots(db, &snaps).await {
        eprintln!("snapshot cache write skipped: {}", e.message);
    }
    Ok(StateView {
        head_event_id: event_id.to_string(),
        state_hash: effective.hash(),
        effective,
    })
}

/// Effective state at a route's head.
pub async fn route_state(db: &Database, route_id: &str) -> AppResult<StateView> {
    let route = {
        let mut conn = db.reader().acquire().await?;
        get_route(&mut conn, route_id).await?
    };
    let head = route
        .head_event_id
        .ok_or_else(|| AppError::internal("route has no head event"))?;
    state_at(db, &route.story_id, &head).await
}

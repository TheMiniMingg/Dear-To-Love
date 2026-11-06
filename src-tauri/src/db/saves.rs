//! Saves are pointers to committed events. They never copy or rewrite events.
//! Loading a save that is not its route's head is read-only until the player
//! chooses "Continue as new branch", which forks.

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqliteConnection};
use ts_rs::TS;

use super::state::{state_at, StateView};
use super::timeline::{ancestors, fork_route_tx, get_route, get_story_route, EventDto, RouteDto};
use super::{new_id, now, Database};
use crate::errors::{AppError, AppResult};

/// Rotating automatic save slots per story.
pub const AUTO_SLOTS: i64 = 5;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum SaveType {
    Manual,
    Quick,
    Auto,
}

#[derive(Debug, Clone, Serialize, TS, FromRow, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SaveDto {
    pub id: String,
    pub story_id: String,
    pub route_id: String,
    pub route_label: String,
    pub event_id: String,
    pub label: String,
    /// `manual`, `quick` or `auto`.
    pub save_type: String,
    pub slot: Option<i32>,
    pub created_at: String,
    pub updated_at: String,
    /// True when the save is the route's current head (resume continues the route).
    pub is_route_head: bool,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SaveView {
    pub save: SaveDto,
    pub history: Vec<EventDto>,
    pub state: StateView,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ResumeResult {
    pub route: RouteDto,
    /// True when resuming created a new branch.
    pub forked: bool,
}

const SAVE_SELECT: &str =
    "SELECT s.id, r.story_id, s.route_id, r.label AS route_label, s.event_id, \
            s.label, s.save_type, s.slot, s.created_at, s.updated_at, \
            (r.head_event_id = s.event_id) AS is_route_head \
     FROM saves s JOIN routes r ON r.id = s.route_id";

async fn get_save(conn: &mut SqliteConnection, save_id: &str) -> AppResult<SaveDto> {
    sqlx::query_as::<_, SaveDto>(sqlx::AssertSqlSafe(format!("{SAVE_SELECT} WHERE s.id = ?")))
        .bind(save_id)
        .fetch_optional(conn)
        .await?
        .ok_or_else(|| AppError::not_found(format!("save {save_id} not found")))
}

pub async fn list_saves(db: &Database, story_id: &str) -> AppResult<Vec<SaveDto>> {
    Ok(sqlx::query_as::<_, SaveDto>(sqlx::AssertSqlSafe(format!(
        "{SAVE_SELECT} WHERE r.story_id = ? ORDER BY s.updated_at DESC, s.id DESC"
    )))
    .bind(story_id)
    .fetch_all(db.reader())
    .await?)
}

/// Manual save of the route's last committed event. During a generation
/// this is the player's action (the reply isn't committed yet).
pub async fn create_save(
    db: &Database,
    story_id: &str,
    route_id: &str,
    label: &str,
) -> AppResult<SaveDto> {
    let label = label.trim();
    if label.is_empty() || label.chars().count() > 120 {
        return Err(AppError::invalid_input(
            "save name must be 1 to 120 characters",
        ));
    }
    let mut tx = db.write_txn().await?;
    let route = get_story_route(&mut tx, story_id, route_id).await?;
    let head = route
        .head_event_id
        .ok_or_else(|| AppError::internal("route has no head event"))?;
    let id = new_id();
    let ts = now();
    sqlx::query(
        "INSERT INTO saves (id, route_id, event_id, label, save_type, slot, created_at, updated_at) \
         VALUES (?, ?, ?, ?, 'manual', NULL, ?, ?)",
    )
    .bind(&id)
    .bind(route_id)
    .bind(&head)
    .bind(label)
    .bind(&ts)
    .bind(&ts)
    .execute(&mut *tx)
    .await?;
    let s = get_save(&mut tx, &id).await?;
    tx.commit().await?;
    Ok(s)
}

/// One quick-save slot per route; saving again moves its pointer.
pub async fn quick_save(db: &Database, story_id: &str, route_id: &str) -> AppResult<SaveDto> {
    let mut tx = db.write_txn().await?;
    let route = get_story_route(&mut tx, story_id, route_id).await?;
    let head = route
        .head_event_id
        .ok_or_else(|| AppError::internal("route has no head event"))?;
    let ts = now();
    let existing: Option<String> =
        sqlx::query_scalar("SELECT id FROM saves WHERE route_id = ? AND save_type = 'quick'")
            .bind(route_id)
            .fetch_optional(&mut *tx)
            .await?;
    let id = match existing {
        Some(id) => {
            sqlx::query("UPDATE saves SET event_id = ?, updated_at = ? WHERE id = ?")
                .bind(&head)
                .bind(&ts)
                .bind(&id)
                .execute(&mut *tx)
                .await?;
            id
        }
        None => {
            let id = new_id();
            sqlx::query(
                "INSERT INTO saves (id, route_id, event_id, label, save_type, slot, created_at, updated_at) \
                 VALUES (?, ?, ?, ?, 'quick', 0, ?, ?)",
            )
            .bind(&id)
            .bind(route_id)
            .bind(&head)
            .bind(format!("Quick save ({})", route.label))
            .bind(&ts)
            .bind(&ts)
            .execute(&mut *tx)
            .await?;
            id
        }
    };
    let s = get_save(&mut tx, &id).await?;
    tx.commit().await?;
    Ok(s)
}

/// Rotate through `AUTO_SLOTS` automatic saves per story. Called inside the
/// transaction that commits a reply or a chapter start.
pub async fn autosave_tx(
    conn: &mut SqliteConnection,
    story_id: &str,
    route_id: &str,
    event_id: &str,
    label: &str,
) -> AppResult<()> {
    let ts = now();
    let slots: Vec<(String, i64)> = sqlx::query_as(
        "SELECT s.id, s.slot FROM saves s JOIN routes r ON r.id = s.route_id \
         WHERE r.story_id = ? AND s.save_type = 'auto' ORDER BY s.updated_at ASC, s.id ASC",
    )
    .bind(story_id)
    .fetch_all(&mut *conn)
    .await?;
    if (slots.len() as i64) < AUTO_SLOTS {
        let used: Vec<i64> = slots.iter().map(|(_, s)| *s).collect();
        let slot = (0..AUTO_SLOTS).find(|s| !used.contains(s)).unwrap_or(0);
        sqlx::query(
            "INSERT INTO saves (id, route_id, event_id, label, save_type, slot, created_at, updated_at) \
             VALUES (?, ?, ?, ?, 'auto', ?, ?, ?)",
        )
        .bind(new_id())
        .bind(route_id)
        .bind(event_id)
        .bind(label)
        .bind(slot)
        .bind(&ts)
        .bind(&ts)
        .execute(&mut *conn)
        .await?;
    } else {
        let (oldest, _) = &slots[0];
        sqlx::query(
            "UPDATE saves SET route_id = ?, event_id = ?, label = ?, updated_at = ? WHERE id = ?",
        )
        .bind(route_id)
        .bind(event_id)
        .bind(label)
        .bind(&ts)
        .bind(oldest)
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

pub async fn delete_save(db: &Database, story_id: &str, save_id: &str) -> AppResult<()> {
    let mut tx = db.write_txn().await?;
    let save = get_save(&mut tx, save_id).await?;
    if save.story_id != story_id {
        return Err(AppError::not_found(format!("save {save_id} not found")));
    }
    sqlx::query("DELETE FROM saves WHERE id = ?")
        .bind(save_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(())
}

/// Read-only view of a save: history up to the saved event and its state.
pub async fn view_save(db: &Database, save_id: &str) -> AppResult<SaveView> {
    let (save, history) = {
        let mut conn = db.reader().acquire().await?;
        let save = get_save(&mut conn, save_id).await?;
        let history = ancestors(&mut conn, &save.story_id, &save.event_id)
            .await?
            .iter()
            .map(|e| e.to_dto())
            .collect::<AppResult<Vec<_>>>()?;
        (save, history)
    };
    let state = state_at(db, &save.story_id, &save.event_id).await?;
    Ok(SaveView {
        save,
        history,
        state,
    })
}

/// Continue playing from a save. If the save is its route's head, play
/// continues on that route; otherwise a new branch starts at the save.
pub async fn resume_save(db: &Database, save_id: &str) -> AppResult<ResumeResult> {
    let mut tx = db.write_txn().await?;
    let save = get_save(&mut tx, save_id).await?;
    if save.is_route_head {
        let route = get_route(&mut tx, &save.route_id).await?;
        tx.commit().await?;
        return Ok(ResumeResult {
            route,
            forked: false,
        });
    }
    let label = format!("From save: {}", save.label);
    let label: String = label.chars().take(80).collect();
    let route = fork_route_tx(
        &mut tx,
        &save.story_id,
        &save.route_id,
        &save.event_id,
        Some(label),
    )
    .await?;
    tx.commit().await?;
    Ok(ResumeResult {
        route,
        forked: true,
    })
}

#[cfg(test)]
mod tests;

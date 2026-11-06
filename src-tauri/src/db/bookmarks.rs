//! Bookmarks (T37): a name for one event in one route's history. They point
//! at events and never copy them. Route heads only move forward, so a
//! bookmarked event stays in its route; `db::contract` checks this at
//! startup. A new branch keeps the bookmarks in the history it shares.

use std::collections::{HashMap, HashSet};

use serde::Serialize;
use sqlx::{FromRow, SqliteConnection};
use ts_rs::TS;

use super::timeline::{ancestors, get_route, get_story_route, EventRow};
use super::{new_id, now, Database};
use crate::domain::events::{EventBody, EventKind};
use crate::domain::text::excerpt;
use crate::errors::{AppError, AppResult, ErrorCode};

pub const MAX_LABEL: usize = 120;
/// Length of an automatic bookmark name.
const AUTO_LABEL: usize = 60;
/// Length of the text shown under a bookmark.
const EXCERPT: usize = 160;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BookmarkDto {
    pub id: String,
    pub route_id: String,
    pub event_id: String,
    pub label: String,
    pub kind: EventKind,
    /// The start of the bookmarked text.
    pub excerpt: String,
    /// The chapter the event is in.
    pub chapter_ordinal: Option<u32>,
    pub chapter_title: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, FromRow)]
struct BookmarkRow {
    id: String,
    route_id: String,
    event_id: String,
    label: String,
    created_at: String,
    updated_at: String,
}

/// Bookmarks in story order, described from `history` (root first).
/// Rows whose event isn't in the history are left out.
fn describe(rows: Vec<BookmarkRow>, history: &[EventRow]) -> AppResult<Vec<BookmarkDto>> {
    let mut by_event: HashMap<String, BookmarkRow> =
        rows.into_iter().map(|r| (r.event_id.clone(), r)).collect();
    let mut chapter: Option<(u32, String)> = None;
    let mut out = Vec::new();
    for e in history {
        if by_event.is_empty() {
            break;
        }
        let body = EventBody::from_parts(&e.kind, &e.payload_json)?;
        if let EventBody::ChapterStart(c) = &body {
            chapter = Some((c.ordinal, c.title.clone()));
        }
        if let Some(r) = by_event.remove(&e.id) {
            out.push(BookmarkDto {
                id: r.id,
                route_id: r.route_id,
                event_id: r.event_id,
                label: r.label,
                kind: body.kind(),
                excerpt: excerpt(&body.reader_text(), EXCERPT),
                chapter_ordinal: chapter.as_ref().map(|c| c.0),
                chapter_title: chapter.as_ref().map(|c| c.1.clone()),
                created_at: r.created_at,
                updated_at: r.updated_at,
            });
        }
    }
    Ok(out)
}

async fn route_rows(conn: &mut SqliteConnection, route_id: &str) -> AppResult<Vec<BookmarkRow>> {
    Ok(sqlx::query_as::<_, BookmarkRow>(
        "SELECT id, route_id, event_id, label, created_at, updated_at \
         FROM bookmarks WHERE route_id = ?",
    )
    .bind(route_id)
    .fetch_all(conn)
    .await?)
}

async fn route_events(conn: &mut SqliteConnection, route_id: &str) -> AppResult<Vec<EventRow>> {
    let route = get_route(conn, route_id).await?;
    match route.head_event_id {
        Some(head) => ancestors(conn, &route.story_id, &head).await,
        None => Ok(vec![]),
    }
}

async fn get_bookmark(conn: &mut SqliteConnection, bookmark_id: &str) -> AppResult<BookmarkDto> {
    let row = sqlx::query_as::<_, BookmarkRow>(
        "SELECT id, route_id, event_id, label, created_at, updated_at FROM bookmarks WHERE id = ?",
    )
    .bind(bookmark_id)
    .fetch_optional(&mut *conn)
    .await?
    .ok_or_else(|| AppError::not_found(format!("bookmark {bookmark_id} not found")))?;
    let history = route_events(conn, &row.route_id).await?;
    describe(vec![row], &history)?
        .pop()
        .ok_or_else(|| AppError::internal("bookmark is outside its route's history"))
}

/// The route's bookmarks in story order.
pub async fn list_bookmarks(db: &Database, route_id: &str) -> AppResult<Vec<BookmarkDto>> {
    let mut conn = db.reader().acquire().await?;
    let history = route_events(&mut conn, route_id).await?;
    let rows = route_rows(&mut conn, route_id).await?;
    describe(rows, &history)
}

fn clean_label(label: &str) -> AppResult<String> {
    let label = label.trim();
    if label.is_empty() || label.chars().count() > MAX_LABEL {
        return Err(AppError::invalid_input(format!(
            "bookmark name must be 1 to {MAX_LABEL} characters"
        )));
    }
    Ok(label.to_string())
}

/// Bookmark an event in the route's history. Bookmarking it again renames
/// the bookmark when a name is given. Without a name, the bookmark is named
/// after the start of the text.
pub async fn add_bookmark(
    db: &Database,
    story_id: &str,
    route_id: &str,
    event_id: &str,
    label: Option<&str>,
) -> AppResult<BookmarkDto> {
    let label = label
        .filter(|l| !l.trim().is_empty())
        .map(clean_label)
        .transpose()?;
    let mut tx = db.write_txn().await?;
    let route = get_story_route(&mut tx, story_id, route_id).await?;
    let head = route
        .head_event_id
        .ok_or_else(|| AppError::internal("route has no head event"))?;
    let history = ancestors(&mut tx, story_id, &head).await?;
    let Some(event) = history.iter().find(|e| e.id == event_id) else {
        return Err(AppError::new(
            ErrorCode::InvalidAncestor,
            format!("event {event_id} is not part of this route's history"),
        ));
    };
    let existing: Option<String> =
        sqlx::query_scalar("SELECT id FROM bookmarks WHERE route_id = ? AND event_id = ?")
            .bind(route_id)
            .bind(event_id)
            .fetch_optional(&mut *tx)
            .await?;
    let ts = now();
    let id = match existing {
        Some(id) => {
            if let Some(label) = &label {
                sqlx::query("UPDATE bookmarks SET label = ?, updated_at = ? WHERE id = ?")
                    .bind(label)
                    .bind(&ts)
                    .bind(&id)
                    .execute(&mut *tx)
                    .await?;
            }
            id
        }
        None => {
            let label = match label {
                Some(l) => l,
                None => {
                    let body = EventBody::from_parts(&event.kind, &event.payload_json)?;
                    let auto = excerpt(&body.reader_text(), AUTO_LABEL);
                    if auto.is_empty() {
                        "Bookmark".to_string()
                    } else {
                        auto
                    }
                }
            };
            let id = new_id();
            sqlx::query(
                "INSERT INTO bookmarks (id, route_id, event_id, label, created_at, updated_at) \
                 VALUES (?, ?, ?, ?, ?, ?)",
            )
            .bind(&id)
            .bind(route_id)
            .bind(event_id)
            .bind(&label)
            .bind(&ts)
            .bind(&ts)
            .execute(&mut *tx)
            .await?;
            id
        }
    };
    let b = get_bookmark(&mut tx, &id).await?;
    tx.commit().await?;
    Ok(b)
}

/// Fails unless the bookmark belongs to a route of this story.
async fn owned(conn: &mut SqliteConnection, story_id: &str, bookmark_id: &str) -> AppResult<()> {
    let found: Option<String> = sqlx::query_scalar(
        "SELECT b.id FROM bookmarks b JOIN routes r ON r.id = b.route_id \
         WHERE b.id = ? AND r.story_id = ?",
    )
    .bind(bookmark_id)
    .bind(story_id)
    .fetch_optional(conn)
    .await?;
    found
        .map(|_| ())
        .ok_or_else(|| AppError::not_found(format!("bookmark {bookmark_id} not found")))
}

pub async fn rename_bookmark(
    db: &Database,
    story_id: &str,
    bookmark_id: &str,
    label: &str,
) -> AppResult<BookmarkDto> {
    let label = clean_label(label)?;
    let mut tx = db.write_txn().await?;
    owned(&mut tx, story_id, bookmark_id).await?;
    sqlx::query("UPDATE bookmarks SET label = ?, updated_at = ? WHERE id = ?")
        .bind(&label)
        .bind(now())
        .bind(bookmark_id)
        .execute(&mut *tx)
        .await?;
    let b = get_bookmark(&mut tx, bookmark_id).await?;
    tx.commit().await?;
    Ok(b)
}

pub async fn delete_bookmark(db: &Database, story_id: &str, bookmark_id: &str) -> AppResult<()> {
    let mut tx = db.write_txn().await?;
    owned(&mut tx, story_id, bookmark_id).await?;
    sqlx::query("DELETE FROM bookmarks WHERE id = ?")
        .bind(bookmark_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(())
}

/// A new branch from `at_event_id` keeps the source route's bookmarks on
/// the history the two share.
pub(crate) async fn copy_to_branch_tx(
    conn: &mut SqliteConnection,
    story_id: &str,
    source_route_id: &str,
    branch_route_id: &str,
    at_event_id: &str,
) -> AppResult<()> {
    let rows = route_rows(conn, source_route_id).await?;
    if rows.is_empty() {
        return Ok(());
    }
    let shared: HashSet<String> = ancestors(conn, story_id, at_event_id)
        .await?
        .into_iter()
        .map(|e| e.id)
        .collect();
    for r in rows.into_iter().filter(|r| shared.contains(&r.event_id)) {
        sqlx::query(
            "INSERT INTO bookmarks (id, route_id, event_id, label, created_at, updated_at) \
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(new_id())
        .bind(branch_route_id)
        .bind(&r.event_id)
        .bind(&r.label)
        .bind(&r.created_at)
        .bind(&r.updated_at)
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

#[cfg(test)]
mod tests;

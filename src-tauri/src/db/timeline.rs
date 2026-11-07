//! Timeline service: the immutable event graph and mutable route heads.
//!
//! Events never change. A route moves only by advancing its head with a
//! compare-and-swap on `(head_event_id, version)`, or a new route is created
//! whose head points at an existing ancestor. Route membership is ancestry
//! from the head, never `events.origin_route_id`.

use std::collections::HashSet;

use serde::Serialize;
use sqlx::{FromRow, SqliteConnection};
use ts_rs::TS;

use super::{new_id, now, Database};
use crate::domain::events::{
    ChapterStartPayload, EventBody, EventKind, PlayerPayload, EVENT_PAYLOAD_VERSION,
};
use crate::errors::{AppError, AppResult, ErrorCode};

#[derive(Debug, Clone, Serialize, TS, FromRow, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RouteDto {
    pub id: String,
    pub story_id: String,
    pub label: String,
    pub parent_route_id: Option<String>,
    pub fork_event_id: Option<String>,
    pub head_event_id: Option<String>,
    pub is_main: bool,
    pub hidden: bool,
    pub version: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, FromRow)]
pub struct EventRow {
    pub id: String,
    pub story_id: String,
    pub origin_route_id: String,
    pub parent_event_id: Option<String>,
    pub kind: String,
    pub payload_json: String,
    pub generation_run_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct EventDto {
    pub id: String,
    pub origin_route_id: String,
    pub parent_event_id: Option<String>,
    pub generation_run_id: Option<String>,
    pub created_at: String,
    #[serde(flatten)]
    #[ts(flatten)]
    pub body: EventBody,
}

impl EventRow {
    pub fn kind(&self) -> Option<EventKind> {
        EventKind::parse(&self.kind)
    }

    pub fn to_dto(&self) -> AppResult<EventDto> {
        Ok(EventDto {
            id: self.id.clone(),
            origin_route_id: self.origin_route_id.clone(),
            parent_event_id: self.parent_event_id.clone(),
            generation_run_id: self.generation_run_id.clone(),
            created_at: self.created_at.clone(),
            body: EventBody::from_parts(&self.kind, &self.payload_json)?,
        })
    }
}

#[derive(Debug, Clone, Serialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Appended {
    pub event_id: String,
    pub route_version: i32,
}

#[derive(Debug, Clone, Serialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ChapterDto {
    pub event_id: String,
    pub chapter_instance_id: String,
    pub title: String,
    pub ordinal: u32,
}

#[derive(Debug, Clone)]
pub struct AppendEvent {
    pub story_id: String,
    pub route_id: String,
    /// The head the caller saw. `HEAD_CHANGED` if the route moved since.
    pub expected_head_id: String,
    pub body: EventBody,
    pub generation_run_id: Option<String>,
}

// Column lists as macros so queries stay `&'static str` (sqlx rejects dynamic SQL).
macro_rules! route_columns {
    () => {
        "id, story_id, label, parent_route_id, fork_event_id, head_event_id, \
         is_main, hidden, version, created_at, updated_at"
    };
}
macro_rules! event_columns {
    () => {
        "id, story_id, origin_route_id, parent_event_id, kind, payload_json, generation_run_id, created_at"
    };
}

fn head_changed(route_id: &str) -> AppError {
    AppError::new(
        ErrorCode::HeadChanged,
        format!("route {route_id} changed since you last saw it; reload and try again"),
    )
}

fn invalid_ancestor(event_id: &str) -> AppError {
    AppError::new(
        ErrorCode::InvalidAncestor,
        format!("event {event_id} is not part of this route's history"),
    )
}

// ---------------------------------------------------------------- reads

pub async fn get_route(conn: &mut SqliteConnection, route_id: &str) -> AppResult<RouteDto> {
    sqlx::query_as::<_, RouteDto>(concat!(
        "SELECT ",
        route_columns!(),
        " FROM routes WHERE id = ?"
    ))
    .bind(route_id)
    .fetch_optional(conn)
    .await?
    .ok_or_else(|| AppError::not_found(format!("route {route_id} not found")))
}

/// Loads a route and checks it belongs to `story_id`.
pub async fn get_story_route(
    conn: &mut SqliteConnection,
    story_id: &str,
    route_id: &str,
) -> AppResult<RouteDto> {
    let route = get_route(conn, route_id).await?;
    if route.story_id != story_id {
        return Err(AppError::new(
            ErrorCode::WrongStory,
            format!("route {route_id} belongs to another story"),
        ));
    }
    Ok(route)
}

pub async fn list_routes(db: &Database, story_id: &str) -> AppResult<Vec<RouteDto>> {
    Ok(sqlx::query_as::<_, RouteDto>(concat!(
        "SELECT ",
        route_columns!(),
        " FROM routes WHERE story_id = ? ORDER BY is_main DESC, created_at, id"
    ))
    .bind(story_id)
    .fetch_all(db.reader())
    .await?)
}

pub async fn get_event(conn: &mut SqliteConnection, event_id: &str) -> AppResult<EventRow> {
    sqlx::query_as::<_, EventRow>(concat!(
        "SELECT ",
        event_columns!(),
        " FROM events WHERE id = ?"
    ))
    .bind(event_id)
    .fetch_optional(conn)
    .await?
    .ok_or_else(|| AppError::not_found(format!("event {event_id} not found")))
}

/// Ordered `root..=head`. Fails on cycles, missing parents or events from
/// another story.
pub async fn ancestors(
    conn: &mut SqliteConnection,
    story_id: &str,
    head_id: &str,
) -> AppResult<Vec<EventRow>> {
    let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM events WHERE story_id = ?")
        .bind(story_id)
        .fetch_one(&mut *conn)
        .await?;
    let rows = sqlx::query_as::<_, EventRow>(
        "WITH RECURSIVE chain(id, depth) AS ( \
           SELECT ?1, 0 \
           UNION ALL \
           SELECT e.parent_event_id, c.depth + 1 FROM chain c JOIN events e ON e.id = c.id \
           WHERE e.parent_event_id IS NOT NULL AND c.depth <= ?2 \
         ) \
         SELECT e.id, e.story_id, e.origin_route_id, e.parent_event_id, e.kind, e.payload_json, \
                e.generation_run_id, e.created_at \
         FROM chain c JOIN events e ON e.id = c.id ORDER BY c.depth DESC",
    )
    .bind(head_id)
    .bind(total)
    .fetch_all(&mut *conn)
    .await?;

    if rows.is_empty() {
        return Err(AppError::not_found(format!("event {head_id} not found")));
    }
    let mut seen = HashSet::with_capacity(rows.len());
    for r in &rows {
        if !seen.insert(r.id.as_str()) {
            return Err(AppError::internal(format!("event graph cycle at {}", r.id)));
        }
        if r.story_id != story_id {
            return Err(AppError::new(
                ErrorCode::WrongStory,
                format!("event {} belongs to another story", r.id),
            ));
        }
    }
    if rows[0].parent_event_id.is_some() {
        return Err(AppError::internal(format!(
            "event {} has a missing parent",
            rows[0].id
        )));
    }
    Ok(rows)
}

/// True when `candidate` is `head` or one of its ancestors.
pub async fn is_ancestor(
    conn: &mut SqliteConnection,
    story_id: &str,
    candidate: &str,
    head: &str,
) -> AppResult<bool> {
    Ok(ancestors(conn, story_id, head)
        .await?
        .iter()
        .any(|e| e.id == candidate))
}

pub async fn route_history(db: &Database, route_id: &str) -> AppResult<Vec<EventDto>> {
    let mut conn = db.reader().acquire().await?;
    let route = get_route(&mut conn, route_id).await?;
    let Some(head) = route.head_event_id else {
        return Ok(vec![]);
    };
    ancestors(&mut conn, &route.story_id, &head)
        .await?
        .iter()
        .map(EventRow::to_dto)
        .collect()
}

fn chapters_of(history: &[EventRow]) -> AppResult<Vec<ChapterDto>> {
    history
        .iter()
        .filter(|e| e.kind() == Some(EventKind::ChapterStart))
        .map(|e| {
            let p: ChapterStartPayload = serde_json::from_str(&e.payload_json)
                .map_err(|err| AppError::internal(format!("corrupt chapter payload: {err}")))?;
            Ok(ChapterDto {
                event_id: e.id.clone(),
                chapter_instance_id: p.chapter_instance_id,
                title: p.title,
                ordinal: p.ordinal,
            })
        })
        .collect()
}

/// Chapters reconstructed from the route's ancestors (route history, not outlines).
pub async fn route_chapters(db: &Database, route_id: &str) -> AppResult<Vec<ChapterDto>> {
    let mut conn = db.reader().acquire().await?;
    let route = get_route(&mut conn, route_id).await?;
    let Some(head) = route.head_event_id else {
        return Ok(vec![]);
    };
    chapters_of(&ancestors(&mut conn, &route.story_id, &head).await?)
}

// --------------------------------------------------------------- writes

async fn touch_story(conn: &mut SqliteConnection, story_id: &str, ts: &str) -> AppResult<()> {
    sqlx::query("UPDATE stories SET updated_at = ? WHERE id = ?")
        .bind(ts)
        .bind(story_id)
        .execute(conn)
        .await?;
    Ok(())
}

/// Append inside an existing write transaction.
pub async fn append_event_tx(
    conn: &mut SqliteConnection,
    input: AppendEvent,
) -> AppResult<Appended> {
    input.body.validate()?;
    let route = get_story_route(conn, &input.story_id, &input.route_id).await?;
    let Some(head_id) = route.head_event_id.clone() else {
        return Err(AppError::internal("route has no head event"));
    };
    if head_id != input.expected_head_id {
        return Err(head_changed(&route.id));
    }
    let head = get_event(conn, &head_id).await?;
    let head_kind = head.kind();

    match &input.body {
        EventBody::Assistant(_) if head_kind != Some(EventKind::Player) => {
            return Err(AppError::invalid_input(
                "a story reply must follow a player action",
            ));
        }
        EventBody::Assistant(_) => {}
        _ if head_kind == Some(EventKind::Player) => {
            return Err(AppError::invalid_input(
                "the last action is still waiting for a reply; retry it, edit it or branch",
            ));
        }
        EventBody::ChapterStart(p) => {
            let history = ancestors(conn, &input.story_id, &head_id).await?;
            let current = chapters_of(&history)?
                .last()
                .map(|c| c.ordinal)
                .unwrap_or(0);
            if p.ordinal != current + 1 {
                return Err(AppError::invalid_input(format!(
                    "next chapter must be number {}",
                    current + 1
                )));
            }
        }
        EventBody::Edit(_) | EventBody::FactConfirm(_) => {
            // The edit must leave a valid state at this point of the branch.
            let (mut state, _) =
                super::state::state_with_snapshots(conn, &input.story_id, &head_id).await?;
            state.apply("pending", &input.body)?;
        }
        _ => {}
    }

    let event_id = new_id();
    let ts = now();
    sqlx::query(
        "INSERT INTO events (id, story_id, origin_route_id, parent_event_id, kind, payload_json, \
                             payload_version, generation_run_id, created_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&event_id)
    .bind(&input.story_id)
    .bind(&route.id)
    .bind(&head_id)
    .bind(input.body.kind().as_str())
    .bind(input.body.payload_json())
    .bind(EVENT_PAYLOAD_VERSION as i64)
    .bind(&input.generation_run_id)
    .bind(&ts)
    .execute(&mut *conn)
    .await?;

    let updated = sqlx::query(
        "UPDATE routes SET head_event_id = ?, version = version + 1, updated_at = ? \
         WHERE id = ? AND head_event_id = ? AND version = ?",
    )
    .bind(&event_id)
    .bind(&ts)
    .bind(&route.id)
    .bind(&head_id)
    .bind(route.version)
    .execute(&mut *conn)
    .await?;
    if updated.rows_affected() != 1 {
        return Err(head_changed(&route.id));
    }
    touch_story(conn, &input.story_id, &ts).await?;
    if matches!(
        input.body,
        EventBody::Assistant(_) | EventBody::ChapterStart(_)
    ) {
        super::saves::autosave_tx(
            conn,
            &input.story_id,
            &route.id,
            &event_id,
            &format!("Autosave ({})", route.label),
        )
        .await?;
    }
    Ok(Appended {
        event_id,
        route_version: route.version + 1,
    })
}

pub async fn append_event(db: &Database, input: AppendEvent) -> AppResult<Appended> {
    let mut tx = db.write_txn().await?;
    let out = append_event_tx(&mut tx, input).await?;
    tx.commit().await?;
    Ok(out)
}

/// Create a route whose head is `at_event_id`, which must be in the source
/// route's history. No events are copied; bookmarks on the shared history are.
pub async fn fork_route_tx(
    conn: &mut SqliteConnection,
    story_id: &str,
    source_route_id: &str,
    at_event_id: &str,
    label: Option<String>,
) -> AppResult<RouteDto> {
    let source = get_story_route(conn, story_id, source_route_id).await?;
    let head = source
        .head_event_id
        .as_deref()
        .ok_or_else(|| AppError::internal("route has no head event"))?;
    if !is_ancestor(conn, story_id, at_event_id, head).await? {
        return Err(invalid_ancestor(at_event_id));
    }
    let label = match label.map(|l| l.trim().to_string()) {
        Some(l) if !l.is_empty() => {
            if l.chars().count() > 80 {
                return Err(AppError::invalid_input("route name is too long"));
            }
            l
        }
        _ => {
            let alts: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM routes WHERE story_id = ? AND is_main = 0",
            )
            .bind(story_id)
            .fetch_one(&mut *conn)
            .await?;
            format!("Alt {}", alts + 1)
        }
    };
    let id = new_id();
    let ts = now();
    sqlx::query(
        "INSERT INTO routes (id, story_id, label, parent_route_id, fork_event_id, head_event_id, \
                             is_main, hidden, version, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)",
    )
    .bind(&id)
    .bind(story_id)
    .bind(&label)
    .bind(&source.id)
    .bind(at_event_id)
    .bind(at_event_id)
    .bind(&ts)
    .bind(&ts)
    .execute(&mut *conn)
    .await?;
    super::bookmarks::copy_to_branch_tx(conn, story_id, &source.id, &id, at_event_id).await?;
    touch_story(conn, story_id, &ts).await?;
    get_route(conn, &id).await
}

pub async fn fork_route(
    db: &Database,
    story_id: &str,
    source_route_id: &str,
    at_event_id: &str,
    label: Option<String>,
) -> AppResult<RouteDto> {
    let mut tx = db.write_txn().await?;
    let route = fork_route_tx(&mut tx, story_id, source_route_id, at_event_id, label).await?;
    tx.commit().await?;
    Ok(route)
}

/// Replay a chapter as a new route starting at that chapter's entry.
pub async fn restart_chapter(
    db: &Database,
    story_id: &str,
    route_id: &str,
    chapter_start_event_id: &str,
) -> AppResult<RouteDto> {
    let mut tx = db.write_txn().await?;
    let ev = get_event(&mut tx, chapter_start_event_id).await?;
    if ev.kind() != Some(EventKind::ChapterStart) {
        return Err(AppError::invalid_input("that event is not a chapter start"));
    }
    let route = fork_route_tx(&mut tx, story_id, route_id, chapter_start_event_id, None).await?;
    tx.commit().await?;
    Ok(route)
}

/// Start the next chapter on this route. Uses the authored outline for that
/// number when one exists.
pub async fn next_chapter(
    db: &Database,
    story_id: &str,
    route_id: &str,
    expected_head_id: &str,
    title: Option<String>,
) -> AppResult<Appended> {
    let mut tx = db.write_txn().await?;
    let out = next_chapter_tx(&mut tx, story_id, route_id, expected_head_id, title, None).await?;
    tx.commit().await?;
    Ok(out)
}

/// The next chapter's number and title (the outline's, or "Chapter N").
pub async fn next_chapter_title(
    conn: &mut SqliteConnection,
    story_id: &str,
    history: &[EventRow],
) -> AppResult<(u32, String, Option<String>)> {
    let ordinal = chapters_of(history)?.last().map(|c| c.ordinal).unwrap_or(0) + 1;
    let outline: Option<(String, String)> =
        sqlx::query_as("SELECT id, title FROM chapter_outlines WHERE story_id = ? AND ordinal = ?")
            .bind(story_id)
            .bind(ordinal as i64)
            .fetch_optional(&mut *conn)
            .await?;
    let title = outline
        .as_ref()
        .map(|(_, t)| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| format!("Chapter {ordinal}"));
    Ok((ordinal, title, outline.map(|(id, _)| id)))
}

/// `next_chapter` inside a transaction, optionally carrying the recap of
/// the chapter that just ended.
pub async fn next_chapter_tx(
    tx: &mut SqliteConnection,
    story_id: &str,
    route_id: &str,
    expected_head_id: &str,
    title: Option<String>,
    previous_chapter_recap: Option<String>,
) -> AppResult<Appended> {
    let tx = &mut *tx;
    let route = get_story_route(&mut *tx, story_id, route_id).await?;
    if route.head_event_id.as_deref() != Some(expected_head_id) {
        return Err(head_changed(route_id));
    }
    let history = ancestors(&mut *tx, story_id, expected_head_id).await?;
    let (ordinal, planned, outline_id) = next_chapter_title(&mut *tx, story_id, &history).await?;
    let title: String = title
        .map(|t| t.trim().chars().take(MAX_CHAPTER_TITLE).collect::<String>())
        .filter(|t| !t.trim().is_empty())
        .unwrap_or(planned);
    let previous_chapter_recap = previous_chapter_recap
        .map(|r| r.trim().to_string())
        .filter(|r| !r.is_empty());
    if previous_chapter_recap
        .as_ref()
        .is_some_and(|r| r.chars().count() > MAX_CHAPTER_RECAP)
    {
        return Err(AppError::invalid_input(format!(
            "the recap can be at most {MAX_CHAPTER_RECAP} characters"
        )));
    }
    append_event_tx(
        &mut *tx,
        AppendEvent {
            story_id: story_id.into(),
            route_id: route_id.into(),
            expected_head_id: expected_head_id.into(),
            body: EventBody::ChapterStart(ChapterStartPayload {
                chapter_instance_id: new_id(),
                title,
                ordinal,
                source_outline_id: outline_id,
                previous_chapter_recap,
            }),
            generation_run_id: None,
        },
    )
    .await
}

pub const MAX_CHAPTER_TITLE: usize = 120;
pub const MAX_CHAPTER_RECAP: usize = 6_000;

/// Regenerate a completed reply: fork at the player action it answered.
/// The new route's head is that player event, ready for a new generation.
pub async fn regenerate_fork(
    db: &Database,
    story_id: &str,
    route_id: &str,
    assistant_event_id: &str,
) -> AppResult<RouteDto> {
    let mut tx = db.write_txn().await?;
    let fork = regenerate_fork_tx(&mut tx, story_id, route_id, assistant_event_id).await?;
    tx.commit().await?;
    Ok(fork)
}

pub async fn regenerate_fork_tx(
    tx: &mut SqliteConnection,
    story_id: &str,
    route_id: &str,
    assistant_event_id: &str,
) -> AppResult<RouteDto> {
    let ev = get_event(&mut *tx, assistant_event_id).await?;
    if ev.kind() != Some(EventKind::Assistant) {
        return Err(AppError::invalid_input(
            "only story replies can be regenerated",
        ));
    }
    let parent = ev
        .parent_event_id
        .ok_or_else(|| AppError::internal("reply without a parent action"))?;
    let route = get_story_route(&mut *tx, story_id, route_id).await?;
    let head = route.head_event_id.unwrap_or_default();
    if !is_ancestor(&mut *tx, story_id, assistant_event_id, &head).await? {
        return Err(invalid_ancestor(assistant_event_id));
    }
    fork_route_tx(tx, story_id, route_id, &parent, None).await
}

/// Edit an earlier player action: fork at the event before it and append
/// the edited text there. The original action stays unchanged.
pub async fn edit_prior_player_turn(
    db: &Database,
    story_id: &str,
    route_id: &str,
    player_event_id: &str,
    new_text: String,
) -> AppResult<(RouteDto, Appended)> {
    let mut tx = db.write_txn().await?;
    let out =
        edit_prior_player_turn_tx(&mut tx, story_id, route_id, player_event_id, new_text).await?;
    tx.commit().await?;
    Ok(out)
}

pub async fn edit_prior_player_turn_tx(
    conn: &mut SqliteConnection,
    story_id: &str,
    route_id: &str,
    player_event_id: &str,
    new_text: String,
) -> AppResult<(RouteDto, Appended)> {
    let ev = get_event(conn, player_event_id).await?;
    let EventBody::Player(old) = EventBody::from_parts(&ev.kind, &ev.payload_json)? else {
        return Err(AppError::invalid_input("only player actions can be edited"));
    };
    let parent = ev
        .parent_event_id
        .ok_or_else(|| AppError::internal("action without a parent event"))?;
    let route = get_story_route(conn, story_id, route_id).await?;
    let head = route.head_event_id.unwrap_or_default();
    if !is_ancestor(conn, story_id, player_event_id, &head).await? {
        return Err(invalid_ancestor(player_event_id));
    }
    let fork = fork_route_tx(conn, story_id, route_id, &parent, None).await?;
    let appended = append_event_tx(
        conn,
        AppendEvent {
            story_id: story_id.into(),
            route_id: fork.id.clone(),
            expected_head_id: parent,
            // A roll stays as it was: changing the words never rerolls.
            body: EventBody::Player(PlayerPayload {
                text: new_text,
                roll: old.roll,
            }),
            generation_run_id: None,
        },
    )
    .await?;
    let fork = get_route(conn, &fork.id).await?;
    Ok((fork, appended))
}

pub async fn rename_route(
    db: &Database,
    story_id: &str,
    route_id: &str,
    label: &str,
) -> AppResult<RouteDto> {
    let label = label.trim();
    if label.is_empty() || label.chars().count() > 80 {
        return Err(AppError::invalid_input(
            "route name must be 1 to 80 characters",
        ));
    }
    let mut tx = db.write_txn().await?;
    get_story_route(&mut tx, story_id, route_id).await?;
    sqlx::query("UPDATE routes SET label = ?, updated_at = ? WHERE id = ?")
        .bind(label)
        .bind(now())
        .bind(route_id)
        .execute(&mut *tx)
        .await?;
    let r = get_route(&mut tx, route_id).await?;
    tx.commit().await?;
    Ok(r)
}

/// Hide or show a route. Routes are never deleted because other routes may
/// share their events; the main route cannot be hidden.
pub async fn set_route_hidden(
    db: &Database,
    story_id: &str,
    route_id: &str,
    hidden: bool,
) -> AppResult<RouteDto> {
    let mut tx = db.write_txn().await?;
    let route = get_story_route(&mut tx, story_id, route_id).await?;
    if route.is_main && hidden {
        return Err(AppError::invalid_input("the main route cannot be hidden"));
    }
    sqlx::query("UPDATE routes SET hidden = ?, updated_at = ? WHERE id = ?")
        .bind(hidden)
        .bind(now())
        .bind(route_id)
        .execute(&mut *tx)
        .await?;
    let r = get_route(&mut tx, route_id).await?;
    tx.commit().await?;
    Ok(r)
}

#[cfg(test)]
mod tests;

//! What a route's storyteller remembers beyond the newest turns, for the
//! reader's Story memory panel: the rolling summary of earlier turns and
//! the recaps of finished chapters. (Facts and open threads are part of the
//! route's state, which the reader already has.)
//!
//! All of it is stored in the story, not with any AI service, so switching
//! storytellers keeps it and the next storyteller reads it.

use serde::Serialize;
use sqlx::SqliteConnection;
use ts_rs::TS;

use crate::db::memory::latest_eligible_summary;
use crate::db::timeline::{ancestors, get_route};
use crate::db::Database;
use crate::domain::events::EventKind;
use crate::errors::{AppError, AppResult};
use crate::services::memory::{KEEP_RECENT_TURNS, OFFLINE_GENERATOR, SUMMARY_CHUNK_TURNS};
use crate::services::prompt::{chapter_recaps, MAX_RECAPS_IN_PROMPT};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct StoryMemory {
    pub route_id: String,
    /// Storyteller replies on this route (the turns summaries count).
    pub turns: u32,
    /// The summary each reply reads instead of the turns it covers.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub summary: Option<MemorySummary>,
    /// Recaps of the chapters ended on this route, oldest first.
    pub recaps: Vec<MemoryRecap>,
    /// How many of the newest recaps each reply reads.
    pub recaps_read: u32,
    /// Replies a route needs before its first summary is written.
    pub first_summary_after: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MemorySummary {
    pub text: String,
    /// It covers turns 1 to `covered_turns`; later turns are read word for word.
    pub covered_turns: u32,
    /// The connection that wrote it; absent when the offline storyteller did.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub written_by: Option<SummaryWriter>,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SummaryWriter {
    pub label: String,
    pub model_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MemoryRecap {
    pub ordinal: u32,
    pub title: String,
    pub text: String,
}

/// Who wrote a summary: the ledgered request when it is still there, else
/// the generator, "model:<connection label>/<model id>" (split at the first
/// slash, since model ids often hold one and labels rarely do).
async fn writer(
    conn: &mut SqliteConnection,
    generator: &str,
    api_request_id: Option<&str>,
) -> AppResult<Option<SummaryWriter>> {
    if generator == OFFLINE_GENERATOR || generator.starts_with("offline:") {
        return Ok(None);
    }
    if let Some(id) = api_request_id {
        let row: Option<(String, String)> =
            sqlx::query_as("SELECT provider_label, model_id FROM api_requests WHERE id = ?")
                .bind(id)
                .fetch_optional(&mut *conn)
                .await?;
        if let Some((label, model_id)) = row {
            return Ok(Some(SummaryWriter { label, model_id }));
        }
    }
    let rest = generator.strip_prefix("model:").unwrap_or(generator);
    let (label, model) = rest.split_once('/').unwrap_or((rest, ""));
    Ok(Some(SummaryWriter {
        label: label.to_string(),
        model_id: model.to_string(),
    }))
}

pub async fn story_memory(db: &Database, route_id: &str) -> AppResult<StoryMemory> {
    let mut conn = db.reader().acquire().await?;
    let route = get_route(&mut conn, route_id).await?;
    let head = route
        .head_event_id
        .as_deref()
        .ok_or_else(|| AppError::internal("route has no head event"))?;
    let chain = ancestors(&mut conn, &route.story_id, head).await?;
    let turns = chain
        .iter()
        .filter(|e| e.kind() == Some(EventKind::Assistant))
        .count();
    let summary = match latest_eligible_summary(&mut conn, &route.story_id, &chain).await? {
        Some(s) => Some(MemorySummary {
            written_by: writer(&mut conn, &s.row.generator, s.row.api_request_id.as_deref())
                .await?,
            text: s.row.summary_text,
            covered_turns: u32::try_from(s.row.covered_turns).unwrap_or(0),
            created_at: s.row.created_at,
        }),
        None => None,
    };
    let recaps = chapter_recaps(&chain)?
        .into_iter()
        .map(|r| MemoryRecap {
            ordinal: r.ordinal,
            title: r.title,
            text: r.recap,
        })
        .collect();
    Ok(StoryMemory {
        route_id: route.id,
        turns: u32::try_from(turns).unwrap_or(u32::MAX),
        summary,
        recaps,
        recaps_read: u32::try_from(MAX_RECAPS_IN_PROMPT).unwrap_or(u32::MAX),
        first_summary_after: KEEP_RECENT_TURNS + SUMMARY_CHUNK_TURNS,
    })
}

#[cfg(test)]
mod tests;

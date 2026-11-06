//! Generation runs: `pending -> streaming -> completed | failed | cancelled |
//! interrupted`. Every transition is a compare-and-swap on the current
//! status, so a late callback or a cancel race can never produce two
//! terminal states. At most one pending/streaming run per route (unique
//! partial index).

use serde::Serialize;
use sqlx::{FromRow, SqliteConnection};
use ts_rs::TS;

use super::{new_id, now, Database};
use crate::domain::provider::NormalizedUsage;
use crate::errors::{AppError, AppResult, ErrorCode};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum RunStatus {
    Pending,
    Streaming,
    Completed,
    Failed,
    Cancelled,
    Interrupted,
}

impl RunStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Streaming => "streaming",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
            Self::Interrupted => "interrupted",
        }
    }

    pub fn parse(s: &str) -> AppResult<Self> {
        Ok(match s {
            "pending" => Self::Pending,
            "streaming" => Self::Streaming,
            "completed" => Self::Completed,
            "failed" => Self::Failed,
            "cancelled" => Self::Cancelled,
            "interrupted" => Self::Interrupted,
            other => return Err(AppError::internal(format!("unknown run status {other}"))),
        })
    }

    pub fn is_active(self) -> bool {
        matches!(self, Self::Pending | Self::Streaming)
    }
}

#[derive(Debug, Clone, FromRow)]
struct RunRow {
    id: String,
    route_id: String,
    input_event_id: String,
    provider_profile_id: Option<String>,
    status: String,
    error_code: Option<String>,
    created_at: String,
    finished_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RunDto {
    pub id: String,
    pub route_id: String,
    pub input_event_id: String,
    pub provider_profile_id: Option<String>,
    pub status: RunStatus,
    pub error_code: Option<ErrorCode>,
    pub created_at: String,
    pub finished_at: Option<String>,
}

impl RunRow {
    fn into_dto(self) -> AppResult<RunDto> {
        Ok(RunDto {
            status: RunStatus::parse(&self.status)?,
            error_code: self
                .error_code
                .and_then(|c| serde_json::from_value(serde_json::Value::String(c)).ok()),
            id: self.id,
            route_id: self.route_id,
            input_event_id: self.input_event_id,
            provider_profile_id: self.provider_profile_id,
            created_at: self.created_at,
            finished_at: self.finished_at,
        })
    }
}

macro_rules! run_columns {
    () => {
        "id, route_id, input_event_id, provider_profile_id, status, error_code, created_at, finished_at"
    };
}

pub fn code_str(code: ErrorCode) -> String {
    serde_json::to_value(code)
        .ok()
        .and_then(|v| v.as_str().map(str::to_string))
        .unwrap_or_else(|| "INTERNAL".into())
}

/// Create a pending run inside the caller's write transaction.
pub async fn create_pending_tx(
    conn: &mut SqliteConnection,
    route_id: &str,
    input_event_id: &str,
    provider_profile_id: Option<&str>,
) -> AppResult<String> {
    let id = new_id();
    let res = sqlx::query(
        "INSERT INTO generation_runs (id, route_id, input_event_id, provider_profile_id, status, created_at) \
         VALUES (?, ?, ?, ?, 'pending', ?)",
    )
    .bind(&id)
    .bind(route_id)
    .bind(input_event_id)
    .bind(provider_profile_id)
    .bind(now())
    .execute(&mut *conn)
    .await;
    match res {
        Ok(_) => Ok(id),
        Err(sqlx::Error::Database(e)) if e.is_unique_violation() => Err(AppError::new(
            ErrorCode::RunActive,
            "a reply is already being written on this route; wait for it or cancel it",
        )),
        Err(e) => Err(e.into()),
    }
}

pub async fn get_run(conn: &mut SqliteConnection, id: &str) -> AppResult<RunDto> {
    sqlx::query_as::<_, RunRow>(concat!(
        "SELECT ",
        run_columns!(),
        " FROM generation_runs WHERE id = ?"
    ))
    .bind(id)
    .fetch_optional(&mut *conn)
    .await?
    .ok_or_else(|| AppError::not_found("that reply request no longer exists"))?
    .into_dto()
}

/// CAS `from -> to`. Returns false if the run was not in `from`.
pub async fn transition_tx(
    conn: &mut SqliteConnection,
    id: &str,
    from: RunStatus,
    to: RunStatus,
    error_code: Option<ErrorCode>,
    usage: Option<&NormalizedUsage>,
) -> AppResult<bool> {
    let finished = if to.is_active() { None } else { Some(now()) };
    let usage_json = usage
        .filter(|u| !u.is_empty())
        .and_then(|u| serde_json::to_string(u).ok());
    let res = sqlx::query(
        "UPDATE generation_runs SET status = ?, error_code = ?, finished_at = ?, \
         usage_json = COALESCE(?, usage_json) WHERE id = ? AND status = ?",
    )
    .bind(to.as_str())
    .bind(error_code.map(code_str))
    .bind(finished)
    .bind(usage_json)
    .bind(id)
    .bind(from.as_str())
    .execute(&mut *conn)
    .await?;
    Ok(res.rows_affected() == 1)
}

pub async fn transition(
    db: &Database,
    id: &str,
    from: RunStatus,
    to: RunStatus,
    error_code: Option<ErrorCode>,
) -> AppResult<bool> {
    let mut tx = db.write_txn().await?;
    let ok = transition_tx(&mut tx, id, from, to, error_code, None).await?;
    tx.commit().await?;
    Ok(ok)
}

pub async fn active_run_for_route(db: &Database, route_id: &str) -> AppResult<Option<RunDto>> {
    sqlx::query_as::<_, RunRow>(concat!(
        "SELECT ",
        run_columns!(),
        " FROM generation_runs WHERE route_id = ? AND status IN ('pending', 'streaming')"
    ))
    .bind(route_id)
    .fetch_optional(db.reader())
    .await?
    .map(RunRow::into_dto)
    .transpose()
}

/// Most recent run that tried to answer `input_event_id` on `route_id`.
pub async fn latest_run_for_input(
    db: &Database,
    route_id: &str,
    input_event_id: &str,
) -> AppResult<Option<RunDto>> {
    sqlx::query_as::<_, RunRow>(concat!(
        "SELECT ",
        run_columns!(),
        " FROM generation_runs WHERE route_id = ? AND input_event_id = ? \
          ORDER BY created_at DESC, id DESC LIMIT 1"
    ))
    .bind(route_id)
    .bind(input_event_id)
    .fetch_optional(db.reader())
    .await?
    .map(RunRow::into_dto)
    .transpose()
}

/// App start: nothing can still be running, so any active run was cut off.
pub async fn interrupt_stranded(db: &Database) -> AppResult<u64> {
    let mut tx = db.write_txn().await?;
    let res = sqlx::query(
        "UPDATE generation_runs SET status = 'interrupted', error_code = 'RUN_INTERRUPTED', \
         finished_at = ? WHERE status IN ('pending', 'streaming')",
    )
    .bind(now())
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(res.rows_affected())
}

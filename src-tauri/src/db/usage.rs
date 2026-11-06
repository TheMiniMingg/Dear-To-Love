//! API usage ledger: one row per real outbound provider call, written
//! *before* the call, closed after it. Costs are estimates from a rate
//! snapshot taken at dispatch, stored in integer micro-USD. Unknown stays
//! unknown (NULL), never $0.

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqliteConnection};
use ts_rs::TS;

use super::{new_id, now, Database};
use crate::domain::provider::{Billing, NormalizedUsage};
use crate::errors::{AppError, AppResult, ErrorCode};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum RequestPurpose {
    StoryReply,
    MemorySummary,
    CharacterSuggestion,
    ManualTest,
}

impl RequestPurpose {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::StoryReply => "story_reply",
            Self::MemorySummary => "memory_summary",
            Self::CharacterSuggestion => "character_suggestion",
            Self::ManualTest => "manual_test",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RequestStatus {
    Completed,
    Failed,
    Cancelled,
}

impl RequestStatus {
    fn as_str(self) -> &'static str {
        match self {
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
        }
    }
}

/// Rates are decimal strings in USD per 1M tokens (up to 6 decimals).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS, FromRow)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RateCard {
    pub id: String,
    pub provider_profile_id: String,
    pub model_id: String,
    pub input_usd_per_million: String,
    pub output_usd_per_million: String,
    pub cached_input_usd_per_million: Option<String>,
    pub effective_at: String,
}

/// Frozen copy of the rates used for one call. Later rate edits never
/// change it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RateSnapshot {
    pub rate_card_id: String,
    pub input_usd_per_million: String,
    pub output_usd_per_million: String,
    pub cached_input_usd_per_million: Option<String>,
    /// No cached rate configured: cached tokens are charged at the input
    /// rate (a conservative estimate) and labelled as such.
    pub cached_rate_assumed: bool,
}

/// Parse "2.5" / "0.150000" into millionths. No floats.
pub fn parse_rate(s: &str) -> AppResult<u64> {
    let s = s.trim();
    let bad = || AppError::invalid_input(format!("\"{s}\" is not a price like 2.50"));
    let (whole, frac) = s.split_once('.').unwrap_or((s, ""));
    if whole.is_empty() && frac.is_empty() {
        return Err(bad());
    }
    if !whole.chars().all(|c| c.is_ascii_digit())
        || !frac.chars().all(|c| c.is_ascii_digit())
        || frac.len() > 6
        || whole.len() > 9
    {
        return Err(bad());
    }
    let whole: u64 = if whole.is_empty() {
        0
    } else {
        whole.parse().map_err(|_| bad())?
    };
    let frac_val: u64 = if frac.is_empty() {
        0
    } else {
        format!("{frac:0<6}").parse().map_err(|_| bad())?
    };
    Ok(whole * 1_000_000 + frac_val)
}

/// Estimated cost in micro-USD, or `None` when it cannot be known.
/// `noncached = max(0, input - cached)`; with rates per 1M tokens,
/// micro-USD = tokens x rate.
pub fn estimate_cost(usage: &NormalizedUsage, rate: &RateSnapshot) -> Option<u64> {
    let input = usage.input_tokens?;
    let output = usage.output_tokens?;
    let cached = usage.cached_input_tokens.unwrap_or(0).min(input);
    let noncached = input - cached;
    let in_rate = parse_rate(&rate.input_usd_per_million).ok()? as u128;
    let out_rate = parse_rate(&rate.output_usd_per_million).ok()? as u128;
    let cached_rate = match &rate.cached_input_usd_per_million {
        Some(r) => parse_rate(r).ok()? as u128,
        None => in_rate,
    };
    // tokens x (rate in millionths) = millionths of micro-USD.
    let total =
        noncached as u128 * in_rate + cached as u128 * cached_rate + output as u128 * out_rate;
    u64::try_from((total + 500_000) / 1_000_000).ok()
}

pub async fn current_rate_card(
    conn: &mut SqliteConnection,
    profile_id: &str,
    model_id: &str,
) -> AppResult<Option<RateCard>> {
    Ok(sqlx::query_as::<_, RateCard>(
        "SELECT id, provider_profile_id, model_id, input_usd_per_million, output_usd_per_million, \
                cached_input_usd_per_million, effective_at \
         FROM api_rate_cards WHERE provider_profile_id = ? AND model_id = ? AND effective_at <= ? \
         ORDER BY effective_at DESC, created_at DESC LIMIT 1",
    )
    .bind(profile_id)
    .bind(model_id)
    .bind(now())
    .fetch_optional(&mut *conn)
    .await?)
}

/// Record new rates for future calls (older calls keep their snapshot).
pub async fn set_rate_card(
    db: &Database,
    profile_id: &str,
    model_id: &str,
    input: &str,
    output: &str,
    cached_input: Option<&str>,
) -> AppResult<RateCard> {
    parse_rate(input)?;
    parse_rate(output)?;
    if let Some(c) = cached_input {
        parse_rate(c)?;
    }
    let id = new_id();
    let ts = now();
    let mut tx = db.write_txn().await?;
    sqlx::query(
        "INSERT INTO api_rate_cards (id, provider_profile_id, model_id, input_usd_per_million, \
         output_usd_per_million, cached_input_usd_per_million, effective_at, created_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(profile_id)
    .bind(model_id)
    .bind(input.trim())
    .bind(output.trim())
    .bind(cached_input.map(str::trim))
    .bind(&ts)
    .bind(&ts)
    .execute(&mut *tx)
    .await?;
    let card = current_rate_card(&mut tx, profile_id, model_id)
        .await?
        .ok_or_else(|| AppError::internal("rate card not readable after insert"))?;
    tx.commit().await?;
    Ok(card)
}

pub struct NewRequest<'a> {
    pub generation_run_id: Option<&'a str>,
    pub provider_profile_id: Option<&'a str>,
    pub provider_label: &'a str,
    pub model_id: &'a str,
    pub billing: Billing,
    pub session_id: &'a str,
    pub route_id: Option<&'a str>,
    pub purpose: RequestPurpose,
}

/// Insert the ledger row before dispatch (status `sent`) with the rate
/// snapshot in force right now.
pub async fn open_request(db: &Database, r: NewRequest<'_>) -> AppResult<String> {
    let id = new_id();
    let mut tx = db.write_txn().await?;
    let snapshot = match (r.billing, r.provider_profile_id) {
        (Billing::Paid, Some(pid)) => {
            current_rate_card(&mut tx, pid, r.model_id)
                .await?
                .map(|c| RateSnapshot {
                    rate_card_id: c.id,
                    cached_rate_assumed: c.cached_input_usd_per_million.is_none(),
                    input_usd_per_million: c.input_usd_per_million,
                    output_usd_per_million: c.output_usd_per_million,
                    cached_input_usd_per_million: c.cached_input_usd_per_million,
                })
        }
        _ => None,
    };
    sqlx::query(
        "INSERT INTO api_requests (id, generation_run_id, provider_profile_id, provider_label, model_id, \
         billing, session_id, route_id, purpose, status, rate_snapshot_json, started_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?)",
    )
    .bind(&id)
    .bind(r.generation_run_id)
    .bind(r.provider_profile_id)
    .bind(r.provider_label)
    .bind(r.model_id)
    .bind(r.billing.as_str())
    .bind(r.session_id)
    .bind(r.route_id)
    .bind(r.purpose.as_str())
    .bind(snapshot.and_then(|s| serde_json::to_string(&s).ok()))
    .bind(now())
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(id)
}

pub struct RequestOutcome {
    pub status: RequestStatus,
    pub usage: NormalizedUsage,
    /// False when we know nothing was billed (never sent, or refused).
    pub may_be_charged: bool,
    pub error_code: Option<ErrorCode>,
}

#[derive(FromRow)]
struct OpenRow {
    billing: String,
    rate_snapshot_json: Option<String>,
}

/// Close a ledger row exactly once (`sent` -> final). A second close is a
/// no-op, so duplicate completion signals never double-count.
pub async fn close_request(db: &Database, id: &str, o: RequestOutcome) -> AppResult<bool> {
    let mut tx = db.write_txn().await?;
    let row = sqlx::query_as::<_, OpenRow>(
        "SELECT billing, rate_snapshot_json FROM api_requests WHERE id = ? AND status = 'sent'",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?;
    let Some(row) = row else {
        return Ok(false);
    };
    let usage_source = if o.usage.is_empty() {
        "unknown"
    } else {
        "provider"
    };
    let not_billed = Billing::parse(&row.billing) == Billing::Local
        || (!o.may_be_charged && o.status != RequestStatus::Completed);
    let cost: Option<u64> = if not_billed {
        Some(0)
    } else {
        row.rate_snapshot_json
            .as_deref()
            .and_then(|j| serde_json::from_str::<RateSnapshot>(j).ok())
            .and_then(|snap| estimate_cost(&o.usage, &snap))
    };
    let as_i64 = |v: Option<u64>| v.and_then(|n| i64::try_from(n).ok());
    sqlx::query(
        "UPDATE api_requests SET status = ?, usage_source = ?, input_tokens = ?, \
         cached_input_tokens = ?, output_tokens = ?, cost_micro_usd = ?, error_code = ?, \
         finished_at = ? WHERE id = ? AND status = 'sent'",
    )
    .bind(o.status.as_str())
    .bind(usage_source)
    .bind(as_i64(o.usage.input_tokens))
    .bind(as_i64(o.usage.cached_input_tokens))
    .bind(as_i64(o.usage.output_tokens))
    .bind(as_i64(cost))
    .bind(o.error_code.map(super::runs::code_str))
    .bind(now())
    .bind(id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(true)
}

/// App start: calls that never closed may still have been billed.
pub async fn mark_stranded_unknown(db: &Database) -> AppResult<u64> {
    let mut tx = db.write_txn().await?;
    let res = sqlx::query(
        "UPDATE api_requests SET status = 'unknown', error_code = 'RUN_INTERRUPTED', finished_at = ? \
         WHERE status IN ('reserved', 'sent')",
    )
    .bind(now())
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(res.rows_affected())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snap(input: &str, output: &str, cached: Option<&str>) -> RateSnapshot {
        RateSnapshot {
            rate_card_id: "r".into(),
            input_usd_per_million: input.into(),
            output_usd_per_million: output.into(),
            cached_input_usd_per_million: cached.map(str::to_string),
            cached_rate_assumed: cached.is_none(),
        }
    }

    fn usage(i: u64, c: Option<u64>, o: u64) -> NormalizedUsage {
        NormalizedUsage {
            input_tokens: Some(i),
            cached_input_tokens: c,
            output_tokens: Some(o),
        }
    }

    #[test]
    fn rates_parse_without_floats() {
        assert_eq!(parse_rate("2.5").unwrap(), 2_500_000);
        assert_eq!(parse_rate("0.150000").unwrap(), 150_000);
        assert_eq!(parse_rate("10").unwrap(), 10_000_000);
        assert_eq!(parse_rate(".5").unwrap(), 500_000);
        for bad in ["", ".", "-1", "1.2345678", "abc", "1e3", "1,5"] {
            assert!(parse_rate(bad).is_err(), "{bad}");
        }
    }

    /// T53/T54: 1M input at $2.50 + 1M output at $10 = $12.50.
    #[test]
    fn cost_formula_and_cached_rate() {
        let u = usage(1_000_000, None, 1_000_000);
        assert_eq!(
            estimate_cost(&u, &snap("2.50", "10", None)),
            Some(12_500_000)
        );
        // 1000 input of which 800 cached at $0.25, 200 at $2.50, 100 output at $10:
        // 200*2.5 + 800*0.25 + 100*10 = 500 + 200 + 1000 = 1700 micro-USD.
        let u = usage(1000, Some(800), 100);
        assert_eq!(
            estimate_cost(&u, &snap("2.50", "10", Some("0.25"))),
            Some(1700)
        );
        // No cached rate: cached tokens at the input rate (conservative).
        assert_eq!(estimate_cost(&u, &snap("2.50", "10", None)), Some(3500));
        // Rounds to the nearest micro-USD.
        assert_eq!(
            estimate_cost(&usage(1, None, 0), &snap("0.4", "0", None)),
            Some(0)
        );
        assert_eq!(
            estimate_cost(&usage(2, None, 0), &snap("0.4", "0", None)),
            Some(1)
        );
    }

    /// T55/T56: missing counts are unknown, never $0.
    #[test]
    fn unknown_usage_gives_unknown_cost() {
        let s = snap("1", "1", None);
        assert_eq!(estimate_cost(&NormalizedUsage::default(), &s), None);
        let partial = NormalizedUsage {
            input_tokens: Some(10),
            ..Default::default()
        };
        assert_eq!(estimate_cost(&partial, &s), None);
    }
}

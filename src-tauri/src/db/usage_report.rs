//! Read-only usage reports for Settings -> Usage & budget (section 08A).
//! Totals show the known portion plus counts of unknown and in-flight
//! calls, never an incomplete amount presented as complete.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use ts_rs::TS;

use super::budget::month_start;
use super::providers::list_profiles;
use super::usage::{current_rate_card, RateCard};
use super::Database;
use crate::domain::provider::Billing;
use crate::errors::AppResult;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum UsageScope {
    /// Since this app launch.
    Session,
    /// The current calendar month in UTC.
    MonthUtc,
    AllTime,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, TS, FromRow)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct UsageTotals {
    #[ts(type = "number")]
    pub request_count: i64,
    /// Sums over calls that reported them; `null` when none did.
    #[ts(type = "number | null")]
    pub input_tokens: Option<i64>,
    #[ts(type = "number | null")]
    pub cached_input_tokens: Option<i64>,
    #[ts(type = "number | null")]
    pub output_tokens: Option<i64>,
    /// Known estimates only.
    #[ts(type = "number")]
    pub estimated_cost_micro_usd: i64,
    /// Finished paid calls whose cost is unknown.
    #[ts(type = "number")]
    pub unknown_cost_request_count: i64,
    #[ts(type = "number")]
    pub in_flight_request_count: i64,
    /// Local-model calls ($0 API charge; hardware and power not included).
    #[ts(type = "number")]
    pub local_model_request_count: i64,
    /// Costs that assumed the input rate for cached tokens.
    #[ts(type = "number")]
    pub approximate_cost_request_count: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ModelUsage {
    pub provider_label: String,
    pub model_id: String,
    pub billing: Billing,
    pub totals: UsageTotals,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct UsageSummary {
    pub scope: UsageScope,
    pub provider_profile_id: Option<String>,
    /// Start of the UTC month, for `month_utc`.
    pub since: Option<String>,
    pub totals: UsageTotals,
    pub by_model: Vec<ModelUsage>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS, FromRow)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ApiRequestRow {
    pub id: String,
    pub started_at: String,
    pub provider_label: String,
    pub model_id: String,
    pub billing: String,
    pub purpose: String,
    pub status: String,
    /// `provider`, `estimated` or `unknown`.
    pub usage_source: String,
    #[ts(type = "number | null")]
    pub input_tokens: Option<i64>,
    #[ts(type = "number | null")]
    pub cached_input_tokens: Option<i64>,
    #[ts(type = "number | null")]
    pub output_tokens: Option<i64>,
    #[ts(type = "number | null")]
    pub cost_micro_usd: Option<i64>,
    pub error_code: Option<String>,
    pub cost_approximate: bool,
}

macro_rules! totals_select {
    () => {
        "COUNT(*) AS request_count, \
         SUM(input_tokens) AS input_tokens, \
         SUM(cached_input_tokens) AS cached_input_tokens, \
         SUM(output_tokens) AS output_tokens, \
         COALESCE(SUM(cost_micro_usd), 0) AS estimated_cost_micro_usd, \
         COALESCE(SUM(CASE WHEN billing = 'paid' AND cost_micro_usd IS NULL AND status <> 'sent' \
                      THEN 1 ELSE 0 END), 0) AS unknown_cost_request_count, \
         COALESCE(SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END), 0) AS in_flight_request_count, \
         COALESCE(SUM(CASE WHEN billing = 'local' THEN 1 ELSE 0 END), 0) AS local_model_request_count, \
         COALESCE(SUM(CASE WHEN cost_micro_usd IS NOT NULL AND COALESCE(cached_input_tokens, 0) > 0 \
                      AND json_extract(rate_snapshot_json, '$.cachedRateAssumed') = 1 \
                      THEN 1 ELSE 0 END), 0) AS approximate_cost_request_count"
    };
}

/// Bindings `?1` session, `?2` month start, `?3` profile; NULL disables each.
fn filters(
    scope: UsageScope,
    session_id: &str,
    now: DateTime<Utc>,
) -> (Option<String>, Option<String>) {
    match scope {
        UsageScope::Session => (Some(session_id.to_string()), None),
        UsageScope::MonthUtc => (None, Some(month_start(now))),
        UsageScope::AllTime => (None, None),
    }
}

#[derive(FromRow)]
struct ModelRow {
    provider_label: String,
    model_id: String,
    billing: String,
    #[sqlx(flatten)]
    totals: UsageTotals,
}

pub async fn usage_summary_at(
    db: &Database,
    scope: UsageScope,
    session_id: &str,
    profile_id: Option<&str>,
    now: DateTime<Utc>,
) -> AppResult<UsageSummary> {
    let (session, since) = filters(scope, session_id, now);
    let totals = sqlx::query_as::<_, UsageTotals>(concat!(
        "SELECT ",
        totals_select!(),
        " FROM api_requests WHERE (?1 IS NULL OR session_id = ?1) AND (?2 IS NULL OR started_at >= ?2) \
          AND (?3 IS NULL OR provider_profile_id = ?3)"
    ))
    .bind(&session)
    .bind(&since)
    .bind(profile_id)
    .fetch_one(db.reader())
    .await?;
    let rows = sqlx::query_as::<_, ModelRow>(concat!(
        "SELECT provider_label, model_id, billing, ",
        totals_select!(),
        " FROM api_requests WHERE (?1 IS NULL OR session_id = ?1) AND (?2 IS NULL OR started_at >= ?2) \
          AND (?3 IS NULL OR provider_profile_id = ?3) \
          GROUP BY provider_label, model_id, billing \
          ORDER BY estimated_cost_micro_usd DESC, request_count DESC"
    ))
    .bind(&session)
    .bind(&since)
    .bind(profile_id)
    .fetch_all(db.reader())
    .await?;
    Ok(UsageSummary {
        scope,
        provider_profile_id: profile_id.map(str::to_string),
        since,
        totals,
        by_model: rows
            .into_iter()
            .map(|r| ModelUsage {
                provider_label: r.provider_label,
                model_id: r.model_id,
                billing: Billing::parse(&r.billing),
                totals: r.totals,
            })
            .collect(),
    })
}

pub async fn usage_summary(
    db: &Database,
    scope: UsageScope,
    session_id: &str,
    profile_id: Option<&str>,
) -> AppResult<UsageSummary> {
    usage_summary_at(db, scope, session_id, profile_id, Utc::now()).await
}

/// Newest first, at most `limit` rows.
pub async fn list_requests(
    db: &Database,
    scope: UsageScope,
    session_id: &str,
    profile_id: Option<&str>,
    limit: u32,
) -> AppResult<Vec<ApiRequestRow>> {
    let (session, since) = filters(scope, session_id, Utc::now());
    Ok(sqlx::query_as::<_, ApiRequestRow>(
        "SELECT id, started_at, provider_label, model_id, billing, purpose, status, usage_source, \
         input_tokens, cached_input_tokens, output_tokens, cost_micro_usd, error_code, \
         (cost_micro_usd IS NOT NULL AND COALESCE(cached_input_tokens, 0) > 0 \
          AND COALESCE(json_extract(rate_snapshot_json, '$.cachedRateAssumed'), 0) = 1) \
           AS cost_approximate \
         FROM api_requests WHERE (?1 IS NULL OR session_id = ?1) AND (?2 IS NULL OR started_at >= ?2) \
         AND (?3 IS NULL OR provider_profile_id = ?3) \
         ORDER BY started_at DESC, id DESC LIMIT ?4",
    )
    .bind(&session)
    .bind(&since)
    .bind(profile_id)
    .bind(i64::from(limit.clamp(1, 500)))
    .fetch_all(db.reader())
    .await?)
}

/// A connection's current model and its rates, if any.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RateCardView {
    pub provider_profile_id: String,
    pub provider_label: String,
    pub model_id: String,
    pub billing: Billing,
    pub card: Option<RateCard>,
}

pub async fn list_rates(db: &Database) -> AppResult<Vec<RateCardView>> {
    let profiles = list_profiles(db).await?;
    let mut conn = db.reader().acquire().await?;
    let mut out = Vec::with_capacity(profiles.len());
    for p in profiles {
        let card = current_rate_card(&mut conn, &p.id, &p.model_id).await?;
        out.push(RateCardView {
            provider_profile_id: p.id,
            provider_label: p.label,
            model_id: p.model_id,
            billing: p.billing,
            card,
        });
    }
    Ok(out)
}

#[cfg(test)]
mod tests;

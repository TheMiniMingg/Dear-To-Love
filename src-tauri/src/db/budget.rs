//! Monthly API budget (roadmap section 08A): a per-install policy, the
//! month-to-date estimate in UTC, a dismissible warning, and the optional
//! pause gate that runs inside the same write transaction that inserts a
//! ledger row, so two routes can never both spend the same headroom.
//!
//! These are local, best-effort controls, not a provider's billing cap.

use chrono::{DateTime, Datelike, Utc};
use serde::{Deserialize, Serialize};
use sqlx::SqliteConnection;
use ts_rs::TS;

use super::prefs::{get_pref, set_pref};
use super::usage::parse_rate;
use super::Database;
use crate::errors::{AppError, AppResult, ErrorCode};

const POLICY_KEY: &str = "budget_policy";
const DISMISS_KEY: &str = "budget_warning_dismissed";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum BudgetMode {
    Warn,
    PauseNewRequests,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BudgetPolicy {
    pub enabled: bool,
    pub currency: String,
    /// Decimal string such as "5.00".
    pub monthly_limit_usd: Option<String>,
    pub warning_threshold_percent: u32,
    pub mode: BudgetMode,
}

impl Default for BudgetPolicy {
    fn default() -> Self {
        Self {
            enabled: false,
            currency: "USD".into(),
            monthly_limit_usd: None,
            warning_threshold_percent: 80,
            mode: BudgetMode::Warn,
        }
    }
}

impl BudgetPolicy {
    pub fn validate(&mut self) -> AppResult<()> {
        if self.currency != "USD" {
            return Err(AppError::invalid_input("budgets are in US dollars"));
        }
        if !(1..=100).contains(&self.warning_threshold_percent) {
            return Err(AppError::invalid_input(
                "the warning threshold must be between 1 and 100 percent",
            ));
        }
        self.monthly_limit_usd = self
            .monthly_limit_usd
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        match &self.monthly_limit_usd {
            Some(s) => {
                let v = parse_rate(s).map_err(|_| {
                    AppError::invalid_input(format!("\"{s}\" is not an amount like 5.00"))
                })?;
                if v == 0 {
                    return Err(AppError::invalid_input(
                        "the monthly budget must be more than $0",
                    ));
                }
            }
            None if self.enabled => {
                return Err(AppError::invalid_input(
                    "enter a monthly amount to turn the budget on",
                ))
            }
            None => {}
        }
        Ok(())
    }

    /// The limit in micro-USD when the budget is on.
    pub fn limit_micro_usd(&self) -> Option<u64> {
        if !self.enabled {
            return None;
        }
        self.monthly_limit_usd
            .as_deref()
            .and_then(|s| parse_rate(s).ok())
    }
}

pub async fn policy_tx(conn: &mut SqliteConnection) -> AppResult<BudgetPolicy> {
    Ok(get_pref(conn, POLICY_KEY).await?.unwrap_or_default())
}

pub async fn get_policy(db: &Database) -> AppResult<BudgetPolicy> {
    let mut conn = db.reader().acquire().await?;
    policy_tx(&mut conn).await
}

pub async fn set_policy(db: &Database, mut policy: BudgetPolicy) -> AppResult<BudgetPolicy> {
    policy.validate()?;
    let mut tx = db.write_txn().await?;
    set_pref(&mut tx, POLICY_KEY, &policy).await?;
    tx.commit().await?;
    Ok(policy)
}

/// `2026-11-01T00:00:00.000Z`: the start of `now`'s UTC month, in the same
/// format as `started_at`, so text comparison orders correctly.
pub fn month_start(now: DateTime<Utc>) -> String {
    format!("{:04}-{:02}-01T00:00:00.000Z", now.year(), now.month())
}

pub fn month_key(now: DateTime<Utc>) -> String {
    format!("{:04}-{:02}", now.year(), now.month())
}

/// Paid spending this UTC month.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct MonthSpend {
    /// Sum of known cost estimates.
    pub posted: u64,
    /// Reservations still held: calls in flight, or finished with an
    /// unknown cost (kept as a conservative stand-in).
    pub reserved: u64,
    /// Finished paid calls whose cost is unknown.
    pub unknown: u64,
}

pub async fn month_spend(conn: &mut SqliteConnection, now: DateTime<Utc>) -> AppResult<MonthSpend> {
    let (posted, reserved, unknown): (Option<i64>, Option<i64>, Option<i64>) = sqlx::query_as(
        "SELECT \
           SUM(cost_micro_usd), \
           SUM(CASE WHEN status = 'sent' OR cost_micro_usd IS NULL THEN reserved_micro_usd ELSE 0 END), \
           SUM(CASE WHEN cost_micro_usd IS NULL AND status <> 'sent' THEN 1 ELSE 0 END) \
         FROM api_requests WHERE billing = 'paid' AND started_at >= ?",
    )
    .bind(month_start(now))
    .fetch_one(&mut *conn)
    .await?;
    let u = |v: Option<i64>| u64::try_from(v.unwrap_or(0)).unwrap_or(0);
    Ok(MonthSpend {
        posted: u(posted),
        reserved: u(reserved),
        unknown: u(unknown),
    })
}

/// What a paid request may cost before it is sent.
#[derive(Debug, Clone, Copy)]
pub struct Preflight {
    /// Projected cost from the prompt estimate and the reply limit, or
    /// `None` when there is no rate card for the model.
    pub estimate_micro_usd: Option<u64>,
    /// The user explicitly allowed one request without a price.
    pub allow_unpriced: bool,
}

/// The pause gate. Call inside the write transaction that will insert the
/// ledger row. Returns the amount to reserve.
pub async fn preflight_tx(
    conn: &mut SqliteConnection,
    p: Preflight,
    now: DateTime<Utc>,
) -> AppResult<u64> {
    let policy = policy_tx(conn).await?;
    let reserve = p.estimate_micro_usd.unwrap_or(0);
    let Some(limit) = policy.limit_micro_usd() else {
        return Ok(reserve);
    };
    if policy.mode != BudgetMode::PauseNewRequests {
        return Ok(reserve);
    }
    let Some(estimate) = p.estimate_micro_usd else {
        if p.allow_unpriced {
            return Ok(0);
        }
        return Err(AppError::new(
            ErrorCode::BudgetOverrideRequired,
            "your monthly budget pauses paid requests, but this model has no prices, so the \
             app cannot tell whether the request fits. Add its rates in Usage & budget, or \
             send this one request anyway.",
        ));
    };
    let spend = month_spend(conn, now).await?;
    if spend.posted + spend.reserved + estimate > limit {
        return Err(AppError::new(
            ErrorCode::BudgetPaused,
            format!(
                "paid requests are paused: this month's estimate ({}) plus this request (up to \
                 {}) would pass your {} budget. Raise the budget, switch to Warn only, or use \
                 a local or offline storyteller.",
                usd(spend.posted + spend.reserved),
                usd(estimate),
                usd(limit)
            ),
        ));
    }
    Ok(reserve)
}

/// `$1.2345` style, enough digits for small amounts.
pub fn usd(micro: u64) -> String {
    let dollars = micro / 1_000_000;
    let frac = micro % 1_000_000;
    if dollars >= 100 {
        format!("${dollars}.{:02}", frac / 10_000)
    } else {
        format!("${dollars}.{:04}", frac / 100)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum BudgetLevel {
    None,
    Warning,
    Reached,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Dismissal {
    month: String,
    level: BudgetLevel,
    limit_micro_usd: u64,
    threshold: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BudgetStatus {
    pub policy: BudgetPolicy,
    /// UTC month, `YYYY-MM`.
    pub month: String,
    #[ts(type = "number | null")]
    pub limit_micro_usd: Option<u64>,
    /// Known month-to-date estimate.
    #[ts(type = "number")]
    pub spent_micro_usd: u64,
    /// Held for calls in flight or with unknown cost.
    #[ts(type = "number")]
    pub reserved_micro_usd: u64,
    #[ts(type = "number")]
    pub unknown_cost_requests: u64,
    pub percent: Option<u32>,
    pub level: BudgetLevel,
    /// The user dismissed this warning (same month, level, limit, threshold).
    pub dismissed: bool,
    /// New paid requests are refused while this is true.
    pub paused: bool,
}

fn status_of(
    policy: BudgetPolicy,
    spend: MonthSpend,
    dismissal: Option<Dismissal>,
    now: DateTime<Utc>,
) -> BudgetStatus {
    let month = month_key(now);
    let limit = policy.limit_micro_usd();
    let percent =
        limit.map(|l| u32::try_from(spend.posted.saturating_mul(100) / l).unwrap_or(u32::MAX));
    let level = match (limit, percent) {
        (Some(l), _) if spend.posted >= l => BudgetLevel::Reached,
        (Some(_), Some(p)) if p >= policy.warning_threshold_percent => BudgetLevel::Warning,
        _ => BudgetLevel::None,
    };
    let dismissed = level != BudgetLevel::None
        && dismissal.is_some_and(|d| {
            d.month == month
                && d.level >= level
                && Some(d.limit_micro_usd) == limit
                && d.threshold == policy.warning_threshold_percent
        });
    let paused = level == BudgetLevel::Reached && policy.mode == BudgetMode::PauseNewRequests;
    BudgetStatus {
        policy,
        month,
        limit_micro_usd: limit,
        spent_micro_usd: spend.posted,
        reserved_micro_usd: spend.reserved,
        unknown_cost_requests: spend.unknown,
        percent,
        level,
        dismissed,
        paused,
    }
}

pub async fn status_at(db: &Database, now: DateTime<Utc>) -> AppResult<BudgetStatus> {
    let mut conn = db.reader().acquire().await?;
    let policy = policy_tx(&mut conn).await?;
    let spend = month_spend(&mut conn, now).await?;
    let dismissal = get_pref::<Dismissal>(&mut conn, DISMISS_KEY).await?;
    Ok(status_of(policy, spend, dismissal, now))
}

pub async fn status(db: &Database) -> AppResult<BudgetStatus> {
    status_at(db, Utc::now()).await
}

/// Hide the current warning for this UTC month. A higher level, a new
/// month, or a changed limit or threshold shows it again.
pub async fn dismiss_at(db: &Database, now: DateTime<Utc>) -> AppResult<BudgetStatus> {
    let current = status_at(db, now).await?;
    if let (Some(limit), level) = (current.limit_micro_usd, current.level) {
        if level != BudgetLevel::None {
            let mut tx = db.write_txn().await?;
            set_pref(
                &mut tx,
                DISMISS_KEY,
                &Dismissal {
                    month: current.month.clone(),
                    level,
                    limit_micro_usd: limit,
                    threshold: current.policy.warning_threshold_percent,
                },
            )
            .await?;
            tx.commit().await?;
        }
    }
    status_at(db, now).await
}

pub async fn dismiss(db: &Database) -> AppResult<BudgetStatus> {
    dismiss_at(db, Utc::now()).await
}

#[cfg(test)]
mod tests;

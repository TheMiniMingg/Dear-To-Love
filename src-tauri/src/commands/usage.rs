//! Settings -> Usage & budget.

use tauri::State;

use crate::db::budget::{self, BudgetPolicy, BudgetStatus};
use crate::db::providers;
use crate::db::usage;
use crate::db::usage_report::{self, ApiRequestRow, RateCardView, UsageScope, UsageSummary};
use crate::errors::{AppError, AppResult};
use crate::state::AppState;

#[tauri::command]
pub async fn get_usage_summary(
    state: State<'_, AppState>,
    scope: UsageScope,
    profile_id: Option<String>,
) -> AppResult<UsageSummary> {
    usage_report::usage_summary(state.db()?, scope, &state.session_id, profile_id.as_deref()).await
}

#[tauri::command]
pub async fn list_api_requests(
    state: State<'_, AppState>,
    scope: UsageScope,
    profile_id: Option<String>,
    limit: Option<u32>,
) -> AppResult<Vec<ApiRequestRow>> {
    usage_report::list_requests(
        state.db()?,
        scope,
        &state.session_id,
        profile_id.as_deref(),
        limit.unwrap_or(100),
    )
    .await
}

#[tauri::command]
pub async fn list_rates(state: State<'_, AppState>) -> AppResult<Vec<RateCardView>> {
    usage_report::list_rates(state.db()?).await
}

/// New prices (USD per 1M tokens) for a connection's current model. Only
/// later requests use them; earlier ones keep their snapshot.
#[tauri::command]
pub async fn set_rates(
    state: State<'_, AppState>,
    profile_id: String,
    input_usd_per_million: String,
    output_usd_per_million: String,
    cached_input_usd_per_million: Option<String>,
) -> AppResult<Vec<RateCardView>> {
    let db = state.db()?;
    let row = providers::get_profile_row(db, &profile_id).await?;
    let cached = cached_input_usd_per_million
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    usage::set_rate_card(
        db,
        &row.id,
        &row.model_id,
        &input_usd_per_million,
        &output_usd_per_million,
        cached,
    )
    .await
    .map_err(|e| AppError::invalid_input(e.message))?;
    usage_report::list_rates(db).await
}

#[tauri::command]
pub async fn get_budget_status(state: State<'_, AppState>) -> AppResult<BudgetStatus> {
    budget::status(state.db()?).await
}

#[tauri::command]
pub async fn set_budget_policy(
    state: State<'_, AppState>,
    policy: BudgetPolicy,
) -> AppResult<BudgetStatus> {
    let db = state.db()?;
    budget::set_policy(db, policy).await?;
    budget::status(db).await
}

#[tauri::command]
pub async fn dismiss_budget_warning(state: State<'_, AppState>) -> AppResult<BudgetStatus> {
    budget::dismiss(state.db()?).await
}

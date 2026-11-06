//! Prompt Preview: the exact prompt the next reply on a route would send,
//! assembled locally and never sent. API keys are not part of prompts, so
//! nothing secret can appear here.

use serde::Serialize;
use ts_rs::TS;

use crate::db::memory::latest_eligible_summary;
use crate::db::providers;
use crate::db::state::state_with_snapshots;
use crate::db::timeline::{ancestors, get_route};
use crate::db::usage::{current_rate_card, estimate_cost, RateCard, RateSnapshot};
use crate::db::Database;
use crate::domain::events::EventKind;
use crate::domain::provider::{Billing, GenerationSettings, NormalizedUsage, Role};
use crate::errors::{AppError, AppResult};
use crate::services::mock_storyteller::MOCK_PROVIDER_LABEL;
use crate::services::prompt::{self, Budget, SummaryUse, PROMPT_SCHEMA_VERSION};
use crate::services::tokens::estimate_message;

/// Stands in for the player's next action when the route is not waiting
/// for a reply.
pub const NEXT_ACTION_PLACEHOLDER: &str = "(Your next action goes here.)";

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PreviewMessage {
    pub role: Role,
    pub content: String,
    pub estimated_tokens: u32,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ContextPreview {
    pub route_id: String,
    /// True when previewing the reply to an action already sent; false
    /// when a placeholder stands in for the next action.
    pub for_waiting_action: bool,
    pub storyteller_label: String,
    pub model_id: String,
    /// False for the offline storyteller, which never reads a prompt.
    pub live: bool,
    pub messages: Vec<PreviewMessage>,
    pub estimated_input_tokens: u32,
    pub reserved_output_tokens: u32,
    pub max_context_tokens: u32,
    /// How tokens were counted: always "approximate" for now.
    pub estimate_method: String,
    pub prompt_schema_version: u32,
    pub summary: Option<SummaryUse>,
    pub summary_dropped: bool,
    pub verbatim_messages: u32,
    pub omitted_messages: u32,
    /// Most this reply could cost (prompt estimate plus a full-length
    /// reply) at the current rates: 0 for local or offline, `null` when the
    /// model has no prices.
    #[ts(type = "number | null")]
    pub max_cost_micro_usd: Option<u64>,
}

enum Pricing {
    Free,
    Unknown,
    Rates(RateCard),
}

fn n(v: usize) -> u32 {
    u32::try_from(v).unwrap_or(u32::MAX)
}

pub async fn preview_context(db: &Database, route_id: &str) -> AppResult<ContextPreview> {
    let (label, model_id, live, settings, pricing) = match providers::storyteller(db).await? {
        Some(pid) => {
            let row = providers::get_profile_row(db, &pid).await?;
            let settings = row.settings();
            let pricing = match row.billing() {
                Billing::Local => Pricing::Free,
                Billing::Paid => {
                    let mut conn = db.reader().acquire().await?;
                    match current_rate_card(&mut conn, &row.id, &row.model_id).await? {
                        Some(card) => Pricing::Rates(card),
                        None => Pricing::Unknown,
                    }
                }
            };
            (row.label, row.model_id, true, settings, pricing)
        }
        None => (
            MOCK_PROVIDER_LABEL.to_string(),
            "offline".to_string(),
            false,
            GenerationSettings::default(),
            Pricing::Free,
        ),
    };
    let mut conn = db.reader().acquire().await?;
    let route = get_route(&mut conn, route_id).await?;
    let head = route
        .head_event_id
        .clone()
        .ok_or_else(|| AppError::invalid_input("this route has nothing to preview yet"))?;
    let history = ancestors(&mut conn, &route.story_id, &head).await?;
    let (state, _) = state_with_snapshots(&mut conn, &route.story_id, &head).await?;
    let summary = latest_eligible_summary(&mut conn, &route.story_id, &history).await?;
    drop(conn);

    let waiting = history.last().and_then(|e| e.kind()) == Some(EventKind::Player);
    let budget = Budget {
        max_context_tokens: settings.max_context_tokens,
        max_output_tokens: settings.max_output_tokens,
    };
    let a = prompt::assemble(
        &state,
        &history,
        summary.as_ref(),
        (!waiting).then_some(NEXT_ACTION_PLACEHOLDER),
        budget,
    )?;
    let max_cost_micro_usd = match pricing {
        Pricing::Free => Some(0),
        Pricing::Unknown => None,
        Pricing::Rates(card) => estimate_cost(
            &NormalizedUsage {
                input_tokens: Some(u64::from(a.estimated_input_tokens)),
                cached_input_tokens: None,
                output_tokens: Some(u64::from(budget.max_output_tokens)),
            },
            &RateSnapshot {
                rate_card_id: card.id,
                input_usd_per_million: card.input_usd_per_million,
                output_usd_per_million: card.output_usd_per_million,
                cached_input_usd_per_million: card.cached_input_usd_per_million,
                cached_rate_assumed: false,
            },
        ),
    };
    Ok(ContextPreview {
        max_cost_micro_usd,
        route_id: route.id,
        for_waiting_action: waiting,
        storyteller_label: label,
        model_id,
        live,
        messages: a
            .messages
            .iter()
            .map(|m| PreviewMessage {
                role: m.role,
                content: m.content.clone(),
                estimated_tokens: estimate_message(m),
            })
            .collect(),
        estimated_input_tokens: a.estimated_input_tokens,
        reserved_output_tokens: budget.max_output_tokens,
        max_context_tokens: budget.max_context_tokens,
        estimate_method: "approximate".into(),
        prompt_schema_version: PROMPT_SCHEMA_VERSION,
        summary: a.summary,
        summary_dropped: a.summary_dropped,
        verbatim_messages: n(a.verbatim_messages),
        omitted_messages: n(a.omitted_messages),
    })
}

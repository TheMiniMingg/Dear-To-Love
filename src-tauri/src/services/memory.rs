//! Background rolling summaries (roadmap section 07, memory layers).
//!
//! After a reply commits, `maybe_summarize` checks whether the route has
//! enough unsummarized turns. Summary boundaries sit at fixed turn numbers
//! (every 8th reply) and always leave the newest 8 or more turns verbatim,
//! so a branch that shares history with another also shares its summaries.
//! Each summary rolls up the previous one plus the turns since.
//!
//! The offline storyteller gets an extractive summary. A live storyteller
//! is asked for one, with its own `memory_summary` ledger row. A failure is
//! logged and never blocks play; the same boundary is not retried in this
//! session, so a broken connection cannot bill a summary every turn.

use std::collections::HashSet;
use std::sync::Mutex;

use crate::db::memory::{
    chain_hash, insert_summary, latest_eligible_summary, summary_exists, EligibleSummary,
    NewSummary,
};
use crate::db::providers;
use crate::db::state::state_with_snapshots;
use crate::db::timeline::{ancestors, get_route, EventRow};
use crate::db::usage::RequestPurpose;
use crate::db::Database;
use crate::domain::events::{EventBody, EventKind};
use crate::domain::provider::{GenerateRequest, ModelMessage, Role};
use crate::domain::text::plain_message_tags;
use crate::errors::{AppError, AppResult, ErrorCode};
use crate::services::generation::{call_once, CallPurpose};
use crate::services::secrets::SecretStore;
use crate::services::tokens::estimate_messages;

/// A new summary covers this many more turns than the last.
pub const SUMMARY_CHUNK_TURNS: u32 = 8;
/// Turns always left out of the newest summary (sent verbatim instead).
pub const KEEP_RECENT_TURNS: u32 = 8;
/// Catch up at most this many turns in one summary request.
pub const MAX_CHUNK_TURNS: u32 = 16;
pub const SUMMARY_MAX_OUTPUT_TOKENS: u32 = 500;
pub const OFFLINE_GENERATOR: &str = "offline:extractive-v1";
const EXTRACTIVE_MAX_LINES: usize = 40;
/// Per-event cap used only when a chunk would not fit the connection.
const SHORTENED_EVENT_CHARS: usize = 600;

/// Summary jobs in this process: at most one per boundary, and a boundary
/// that failed is not tried again until the app restarts.
#[derive(Default)]
pub struct MemoryJobs {
    inflight: Mutex<HashSet<String>>,
    failed: Mutex<HashSet<String>>,
}

impl MemoryJobs {
    fn begin(&self, end_event_id: &str) -> bool {
        if self
            .failed
            .lock()
            .expect("memory jobs")
            .contains(end_event_id)
        {
            return false;
        }
        self.inflight
            .lock()
            .expect("memory jobs")
            .insert(end_event_id.to_string())
    }

    fn finish(&self, end_event_id: &str, ok: bool) {
        self.inflight
            .lock()
            .expect("memory jobs")
            .remove(end_event_id);
        if !ok {
            self.failed
                .lock()
                .expect("memory jobs")
                .insert(end_event_id.to_string());
        }
    }
}

/// The next summary due on a chain, as indexes into it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Plan {
    pub prev_end_index: Option<usize>,
    pub end_index: usize,
    pub covered_turns: u32,
}

/// Decide whether `chain` (root..=head) needs a new summary after `prev`.
pub fn plan(chain: &[EventRow], prev: Option<&EligibleSummary>) -> Option<Plan> {
    let ends: Vec<usize> = chain
        .iter()
        .enumerate()
        .filter(|(_, e)| e.kind() == Some(EventKind::Assistant))
        .map(|(i, _)| i)
        .collect();
    let count = u32::try_from(ends.len()).ok()?;
    let prev_turns = prev
        .map(|p| ends.iter().filter(|&&i| i <= p.end_index).count())
        .and_then(|n| u32::try_from(n).ok())
        .unwrap_or(0);
    let due = count.checked_sub(KEEP_RECENT_TURNS)? / SUMMARY_CHUNK_TURNS * SUMMARY_CHUNK_TURNS;
    let target = due.min(prev_turns + MAX_CHUNK_TURNS);
    if target <= prev_turns {
        return None;
    }
    Some(Plan {
        prev_end_index: prev.map(|p| p.end_index),
        end_index: ends[usize::try_from(target).ok()? - 1],
        covered_turns: target,
    })
}

fn clip(text: &str, max_chars: usize) -> String {
    let text = text.trim();
    if text.chars().count() <= max_chars {
        return text.to_string();
    }
    let cut: String = text.chars().take(max_chars).collect();
    format!("{}…", cut.trim_end())
}

/// First sentence, at most `max_chars` characters.
fn first_sentence(text: &str, max_chars: usize) -> String {
    let text = text.trim();
    let mut end = text.len();
    let mut prev_terminal = false;
    for (i, c) in text.char_indices() {
        if prev_terminal && c.is_whitespace() {
            end = i;
            break;
        }
        prev_terminal = matches!(c, '.' | '!' | '?' | '。' | '！' | '？');
    }
    clip(&text[..end], max_chars)
}

/// Offline summary: one line per turn (the action and the reply's first
/// sentence), appended to the previous summary, keeping the newest lines.
pub fn extractive(prev: Option<&str>, chunk: &[EventRow], player_name: &str) -> AppResult<String> {
    let mut lines: Vec<String> = prev
        .map(|p| p.lines().map(str::to_string).collect())
        .unwrap_or_default();
    let mut action: Option<String> = None;
    for e in chunk {
        match EventBody::from_parts(&e.kind, &e.payload_json)? {
            EventBody::Player(p) => {
                action = Some(first_sentence(&plain_message_tags(&p.shown_text()), 120))
            }
            EventBody::Assistant(a) => {
                let reply = first_sentence(&plain_message_tags(&a.text), 160);
                lines.push(match action.take() {
                    Some(act) => format!("- {player_name}: {act} → {reply}"),
                    None => format!("- {reply}"),
                });
            }
            EventBody::ChapterStart(c) => {
                lines.push(format!("- Chapter {} began: {}", c.ordinal, c.title))
            }
            _ => {}
        }
    }
    if lines.len() > EXTRACTIVE_MAX_LINES {
        lines.drain(..lines.len() - EXTRACTIVE_MAX_LINES);
    }
    Ok(lines.join("\n"))
}

/// The turns as "Name: …" and "Narrator: …" lines, each clipped to `max_chars`.
pub fn transcript(chunk: &[EventRow], player_name: &str, max_chars: usize) -> AppResult<String> {
    let mut out = Vec::new();
    for e in chunk {
        match EventBody::from_parts(&e.kind, &e.payload_json)? {
            EventBody::Player(p) => out.push(format!(
                "{player_name}: {}",
                clip(&p.shown_text(), max_chars)
            )),
            EventBody::Assistant(a) => out.push(format!("Narrator: {}", clip(&a.text, max_chars))),
            EventBody::ChapterStart(c) => out.push(format!(
                "[{}]",
                crate::domain::events::chapter_heading(c.ordinal, &c.title)
            )),
            _ => {}
        }
    }
    Ok(out.join("\n\n"))
}

/// " Write it in Japanese." for a story with a set language, else "".
pub fn written_in(language: Option<&str>) -> String {
    match language.map(str::trim).filter(|l| !l.is_empty()) {
        Some(l) => format!(" Write it in {l}."),
        None => String::new(),
    }
}

/// Messages asking a model to roll the previous summary forward.
pub fn summary_messages(
    prev: Option<&str>,
    chunk: &[EventRow],
    player_name: &str,
    language: Option<&str>,
    max_chars: usize,
) -> AppResult<Vec<ModelMessage>> {
    Ok(vec![
        ModelMessage {
            role: Role::System,
            content: format!(
                "You keep the memory of an interactive story so its narrator stays consistent. \
                 Write an updated summary of the whole story so far from the previous summary \
                 and the new events. The player character is {player_name}. Use past tense and \
                 the third person. Keep names, places, decisions, promises, injuries, items, \
                 secrets and unresolved threads; leave out atmosphere and exact wording. At most \
                 250 words.{} Reply with the summary only.",
                written_in(language)
            ),
        },
        ModelMessage {
            role: Role::User,
            content: format!(
                "PREVIOUS SUMMARY\n{}\n\nNEW EVENTS\n{}",
                prev.unwrap_or("(none: this is the beginning of the story)"),
                transcript(chunk, player_name, max_chars)?
            ),
        },
    ])
}

pub struct SummaryEnv<'a> {
    pub db: &'a Database,
    pub secrets: &'a dyn SecretStore,
    pub jobs: &'a MemoryJobs,
    pub session_id: &'a str,
}

/// After a reply on `route_id` by `profile_id` (`None`: offline), write the
/// next summary if one is due. Returns the new summary's ending event.
pub async fn maybe_summarize(
    env: &SummaryEnv<'_>,
    route_id: &str,
    profile_id: Option<&str>,
) -> AppResult<Option<String>> {
    let (story_id, chain, prev, player_name, language) = {
        let mut conn = env.db.reader().acquire().await?;
        let route = get_route(&mut conn, route_id).await?;
        let Some(head) = route.head_event_id else {
            return Ok(None);
        };
        let chain = ancestors(&mut conn, &route.story_id, &head).await?;
        let prev = latest_eligible_summary(&mut conn, &route.story_id, &chain).await?;
        let (state, _) = state_with_snapshots(&mut conn, &route.story_id, &head).await?;
        let s = &state.state;
        let player_name = s
            .characters
            .get(&s.player_character_id)
            .map(|c| c.name.clone())
            .unwrap_or_else(|| "the player".into());
        (
            route.story_id,
            chain,
            prev,
            player_name,
            s.narration.language.clone(),
        )
    };
    let Some(plan) = plan(&chain, prev.as_ref()) else {
        return Ok(None);
    };
    let end_id = chain[plan.end_index].id.clone();
    if summary_exists(env.db, &end_id).await? || !env.jobs.begin(&end_id) {
        return Ok(None);
    }
    let result = write_summary(
        env,
        route_id,
        &story_id,
        &chain,
        prev.as_ref(),
        &plan,
        profile_id,
        &player_name,
        language.as_deref(),
    )
    .await;
    env.jobs.finish(&end_id, result.is_ok());
    result.map(|_| Some(end_id))
}

#[allow(clippy::too_many_arguments)]
async fn write_summary(
    env: &SummaryEnv<'_>,
    route_id: &str,
    story_id: &str,
    chain: &[EventRow],
    prev: Option<&EligibleSummary>,
    plan: &Plan,
    profile_id: Option<&str>,
    player_name: &str,
    language: Option<&str>,
) -> AppResult<()> {
    let chunk = &chain[plan.prev_end_index.map(|i| i + 1).unwrap_or(0)..=plan.end_index];
    let prev_text = prev.map(|p| p.row.summary_text.as_str());
    let (text, generator, api_request_id) = match profile_id {
        None => (
            extractive(prev_text, chunk, player_name)?,
            OFFLINE_GENERATOR.to_string(),
            None,
        ),
        Some(pid) => {
            let row = providers::get_profile_row(env.db, pid).await?;
            let settings = row.settings();
            // Models that think first need room beyond the summary itself.
            let max_output = settings.max_output_tokens.max(SUMMARY_MAX_OUTPUT_TOKENS);
            let fits = |m: &[ModelMessage]| {
                estimate_messages(m).saturating_add(max_output) <= settings.max_context_tokens
            };
            let mut messages =
                summary_messages(prev_text, chunk, player_name, language, usize::MAX)?;
            if !fits(&messages) {
                messages = summary_messages(
                    prev_text,
                    chunk,
                    player_name,
                    language,
                    SHORTENED_EVENT_CHARS,
                )?;
            }
            if !fits(&messages) {
                return Err(AppError::new(
                    ErrorCode::ContextTooLong,
                    "the turns to summarize do not fit this connection's context limit",
                ));
            }
            let req = GenerateRequest {
                model_id: row.model_id.clone(),
                messages,
                max_output_tokens: max_output,
                temperature: settings.temperature.map(|t| t.min(0.5)),
                timeout_ms: settings.timeout_ms,
                context_tokens: Some(settings.max_context_tokens),
            };
            let (c, ledger) = call_once(
                env.db,
                env.secrets,
                env.session_id,
                &row,
                &req,
                CallPurpose {
                    purpose: RequestPurpose::MemorySummary,
                    route_id: Some(route_id),
                    allow_unpriced: false,
                },
            )
            .await?;
            let text = c.text.trim().to_string();
            if text.is_empty() {
                return Err(AppError::new(
                    ErrorCode::ProviderError,
                    "the storyteller returned an empty summary",
                ));
            }
            (
                text,
                format!("model:{}/{}", row.label, row.model_id),
                Some(ledger),
            )
        }
    };
    insert_summary(
        env.db,
        NewSummary {
            story_id,
            source_start_event_id: plan.prev_end_index.map(|i| chain[i].id.as_str()),
            source_end_event_id: &chain[plan.end_index].id,
            source_hash: &chain_hash(&chain[..=plan.end_index]),
            text: &text,
            covered_turns: plan.covered_turns,
            generator: &generator,
            api_request_id: api_request_id.as_deref(),
        },
    )
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests;

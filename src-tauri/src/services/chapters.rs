//! End chapter: recap what happened in the chapter, keep the recap on the
//! route, save, and start the next chapter.
//!
//! The recap is written by the chosen storyteller (one `memory_summary`
//! ledger row) or, offline, from the chapter's own turns. The player can
//! edit it before ending the chapter. It is stored on the next chapter's
//! `chapter_start` event, so it belongs to this route only and every later
//! reply on the route reads it (the prompt's EARLIER CHAPTERS section).

use serde::Serialize;
use ts_rs::TS;

use crate::db::providers;
use crate::db::saves::insert_manual_save_tx;
use crate::db::state::state_with_snapshots;
use crate::db::timeline::{ancestors, get_route, next_chapter_title, next_chapter_tx, EventRow};
use crate::db::usage::RequestPurpose;
use crate::db::Database;
use crate::domain::events::{EventBody, EventKind};
use crate::domain::provider::{GenerateRequest, ModelMessage, Role};
use crate::errors::{AppError, AppResult, ErrorCode};
use crate::services::generation::{call_once, CallPurpose};
use crate::services::memory::{
    extractive, transcript, written_in, SummaryEnv, SUMMARY_MAX_OUTPUT_TOKENS,
};
use crate::services::tokens::estimate_messages;

/// Per-turn cap used when the whole chapter does not fit the connection.
const SHORTENED_TURN_CHARS: usize = 600;
pub const OFFLINE_RECAP_BY: &str = "the offline storyteller";

/// A recap ready for the player to read and edit before ending the chapter.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ChapterRecapDraft {
    pub chapter_ordinal: u32,
    pub chapter_title: String,
    pub recap: String,
    /// The storyteller that wrote it.
    pub written_by: String,
    pub next_ordinal: u32,
    pub next_title: String,
    /// The storyteller suggested `next_title` from how the chapter ended
    /// (not the outline's title or the plain "Chapter N").
    pub next_title_suggested: bool,
    /// The route head the recap was written for.
    pub head_event_id: String,
}

/// The chapter being played: its number, title and events after its start.
fn current_chapter(chain: &[EventRow]) -> AppResult<(u32, String, &[EventRow])> {
    let start = chain
        .iter()
        .rposition(|e| e.kind() == Some(EventKind::ChapterStart));
    let Some(start) = start else {
        return Ok((1, "Chapter 1".into(), chain));
    };
    match EventBody::from_parts(&chain[start].kind, &chain[start].payload_json)? {
        EventBody::ChapterStart(c) => Ok((c.ordinal, c.title, &chain[start + 1..])),
        _ => Err(AppError::internal("chapter start has the wrong payload")),
    }
}

/// Whether the chapter being played at the end of `chain` can end now.
pub fn check_can_end(chain: &[EventRow]) -> AppResult<()> {
    let (_, _, events) = current_chapter(chain)?;
    check_endable(chain, events)
}

fn check_endable(chain: &[EventRow], events: &[EventRow]) -> AppResult<()> {
    if chain.last().and_then(EventRow::kind) == Some(EventKind::Player) {
        return Err(AppError::invalid_input(
            "your last action has no reply yet. Get a reply first, then end the chapter",
        ));
    }
    if !events
        .iter()
        .any(|e| e.kind() == Some(EventKind::Assistant))
    {
        return Err(AppError::invalid_input(
            "nothing has happened in this chapter yet. Play at least one turn before ending it",
        ));
    }
    Ok(())
}

/// How the recap's last line suggests the next chapter's title.
const NEXT_TITLE: &str = "Next chapter:";

/// Messages asking a model for the chapter's recap, and with
/// `suggest_title` a title for the next chapter on a last line.
pub fn recap_messages(
    ordinal: u32,
    title: &str,
    events: &[EventRow],
    player_name: &str,
    language: Option<&str>,
    max_chars: usize,
    suggest_title: bool,
) -> AppResult<Vec<ModelMessage>> {
    let ask = if suggest_title {
        format!(
            " Reply with the recap, then a last line of its own: \"{NEXT_TITLE} \" and a short \
             title for the next chapter, two to six words, that fits where the story is going."
        )
    } else {
        " Reply with the recap only.".to_string()
    };
    Ok(vec![
        ModelMessage {
            role: Role::System,
            content: format!(
                "You write the recap at the end of a chapter of an interactive story, so the \
                 player remembers it and the narrator can continue from it. The player \
                 character is {player_name}. In past tense and the third person, say what \
                 happened, what {player_name} decided and did, what changed between the \
                 characters, and what is still unresolved. Keep names, places, promises, \
                 items and secrets. Plain prose, no headings, at most 200 words.{}{ask}",
                written_in(language)
            ),
        },
        ModelMessage {
            role: Role::User,
            content: format!(
                "CHAPTER {ordinal}: {title}\n\n{}",
                transcript(events, player_name, max_chars)?
            ),
        },
    ])
}

/// The recap and the next chapter's suggested title from a reply that may
/// end with a `Next chapter: …` line.
pub fn split_next_title(reply: &str) -> (String, Option<String>) {
    let reply = reply.trim();
    let (body, last) = match reply.rfind('\n') {
        Some(i) => (&reply[..i], reply[i + 1..].trim()),
        None => ("", reply),
    };
    // `**Next chapter:** …` in markdown too.
    let last = last.trim_start_matches(['*', '_']).replacen(":**", ":", 1);
    let last = last.as_str();
    let label = last
        .get(..NEXT_TITLE.len())
        .filter(|l| l.eq_ignore_ascii_case(NEXT_TITLE))
        .map(|l| l.len())
        .or_else(|| {
            last.find("Next chapter：")
                .map(|i| i + "Next chapter：".len())
        });
    let Some(after) = label else {
        return (reply.to_string(), None);
    };
    let title: String = last[after..]
        .trim()
        .trim_matches(|c: char| matches!(c, '"' | '“' | '”' | '*' | '「' | '」'))
        .trim()
        .chars()
        .take(120)
        .collect();
    (
        body.trim().to_string(),
        (!title.is_empty()).then_some(title),
    )
}

/// Write a recap of the chapter being played on `route_id`. Nothing is
/// stored; `end_chapter` keeps the version the player approves.
pub async fn draft_recap(env: &SummaryEnv<'_>, route_id: &str) -> AppResult<ChapterRecapDraft> {
    let (chain, player_name, language, mut next, head) = {
        let mut conn = env.db.reader().acquire().await?;
        let route = get_route(&mut conn, route_id).await?;
        let head = route
            .head_event_id
            .ok_or_else(|| AppError::invalid_input("this route has nothing to recap yet"))?;
        let chain = ancestors(&mut conn, &route.story_id, &head).await?;
        let (state, _) = state_with_snapshots(&mut conn, &route.story_id, &head).await?;
        let s = &state.state;
        let player_name = s
            .characters
            .get(&s.player_character_id)
            .map(|c| c.name.clone())
            .unwrap_or_else(|| "the player".into());
        let next = next_chapter_title(&mut conn, &route.story_id, &chain).await?;
        let language = s.narration.language.clone();
        (chain, player_name, language, next, head)
    };
    let (ordinal, title, events) = current_chapter(&chain)?;
    check_endable(&chain, events)?;

    let mut suggested = false;
    let (recap, written_by) = match providers::route_storyteller(env.db, route_id).await? {
        None => (
            extractive(None, events, &player_name)?,
            OFFLINE_RECAP_BY.to_string(),
        ),
        Some(pid) => {
            let row = providers::get_profile_row(env.db, &pid).await?;
            let settings = row.settings();
            // Models that think first need room beyond the recap itself.
            let max_output = settings.max_output_tokens.max(SUMMARY_MAX_OUTPUT_TOKENS);
            let fits = |m: &[ModelMessage]| {
                estimate_messages(m).saturating_add(max_output) <= settings.max_context_tokens
            };
            let language = language.as_deref();
            // A title the story's outline already gives is kept as it is.
            let suggest_title = next.2.is_none();
            let mut messages = recap_messages(
                ordinal,
                &title,
                events,
                &player_name,
                language,
                usize::MAX,
                suggest_title,
            )?;
            let mut from = 0;
            while !fits(&messages) {
                // Shorten every turn first, then leave out the oldest turns.
                messages = recap_messages(
                    ordinal,
                    &title,
                    &events[from..],
                    &player_name,
                    language,
                    SHORTENED_TURN_CHARS,
                    suggest_title,
                )?;
                if fits(&messages) {
                    break;
                }
                from += 2;
                if from >= events.len() {
                    return Err(AppError::new(
                        ErrorCode::ContextTooLong,
                        "this chapter does not fit the storyteller's context limit, even \
                         shortened. Write the recap yourself, or raise the context limit",
                    ));
                }
            }
            let req = GenerateRequest {
                model_id: row.model_id.clone(),
                messages,
                max_output_tokens: max_output,
                temperature: settings.temperature.map(|t| t.min(0.5)),
                timeout_ms: settings.timeout_ms,
                context_tokens: Some(settings.max_context_tokens),
            };
            let (c, _ledger) = call_once(
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
            let (recap, title) = split_next_title(&c.text);
            if let (true, Some(title)) = (suggest_title, title) {
                next.1 = title;
                suggested = true;
            }
            (recap, row.label)
        }
    };
    Ok(ChapterRecapDraft {
        chapter_ordinal: ordinal,
        chapter_title: title,
        recap,
        written_by,
        next_ordinal: next.0,
        next_title: next.1,
        next_title_suggested: suggested,
        head_event_id: head,
    })
}

/// End the chapter being played: the next chapter starts carrying `recap`,
/// and a manual save named after the ended chapter points at that start.
/// One transaction; `expected_head_id` guards against a moved route.
pub async fn end_chapter(
    db: &Database,
    story_id: &str,
    route_id: &str,
    expected_head_id: &str,
    recap: &str,
    next_title: Option<String>,
) -> AppResult<()> {
    let mut tx = db.write_txn().await?;
    let chain = ancestors(&mut tx, story_id, expected_head_id).await?;
    let (ordinal, title, events) = current_chapter(&chain)?;
    check_endable(&chain, events)?;
    let started = next_chapter_tx(
        &mut tx,
        story_id,
        route_id,
        expected_head_id,
        next_title,
        Some(recap.to_string()),
    )
    .await?;
    insert_manual_save_tx(
        &mut tx,
        route_id,
        &started.event_id,
        &format!("End of Chapter {ordinal}: {title}"),
    )
    .await?;
    tx.commit().await?;
    Ok(())
}

#[cfg(test)]
mod tests;

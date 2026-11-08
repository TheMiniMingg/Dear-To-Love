//! Tidying the notebook at chapter end: memory notes about the same person
//! or thing are merged, and long ones shortened, so the notebook stays
//! short enough to read before every reply.
//!
//! The chosen storyteller suggests the changes (one `memory_summary`
//! ledger row); offline, only lossless ones are made (a first-name note
//! joined to the whole-name one, a sentence written twice dropped).
//! Nothing is stored here: End chapter lists the changes, the player keeps
//! or undoes each, and the kept ones are saved as one Story memory edit.

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::db::providers;
use crate::db::state::state_with_snapshots;
use crate::db::timeline::{ancestors, get_route};
use crate::db::usage::RequestPurpose;
use crate::domain::notes::{note_key, MemoryNote, NoteKind, MAX_NOTE_NAME, MAX_NOTE_TEXT};
use crate::domain::provider::{GenerateRequest, ModelMessage, Role};
use crate::errors::{AppError, AppResult, ErrorCode};
use crate::services::chapters::{check_can_end, OFFLINE_RECAP_BY};
use crate::services::generation::{call_once, CallPurpose};
use crate::services::memory::{written_in, SummaryEnv};
use crate::services::tokens::estimate_messages;

/// A notebook shorter than this, with no long note, is left as it is.
pub const TIDY_MIN_NOTES: usize = 6;
/// A note longer than this (in characters) is worth shortening.
pub const LONG_NOTE: usize = 400;
/// The most changes suggested at once, so the list stays easy to review.
pub const MAX_TIDY_CHANGES: usize = 12;
const TIDY_MAX_OUTPUT_TOKENS: u32 = 2000;

/// One suggested change: `note` takes the place of `replaces`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TidyChange {
    /// The notes as they are now: one when a note is shortened, two or
    /// more when notes are merged.
    pub replaces: Vec<MemoryNote>,
    pub note: MemoryNote,
}

/// The suggested changes for the player to keep or undo.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct NotebookTidy {
    pub changes: Vec<TidyChange>,
    /// Who suggested them; empty when the notebook did not need it.
    pub written_by: String,
    /// The route head the changes were suggested for.
    pub head_event_id: String,
}

/// Whether the notebook is long enough, or has a long enough note, to tidy.
pub fn worth_tidying(notes: &[MemoryNote]) -> bool {
    notes.len() >= TIDY_MIN_NOTES || notes.iter().any(|n| n.text.chars().count() > LONG_NOTE)
}

/// Messages asking a model which notes to merge or shorten.
pub fn tidy_messages(
    notes: &[MemoryNote],
    player_name: &str,
    language: Option<&str>,
) -> Vec<ModelMessage> {
    let list = notes
        .iter()
        .enumerate()
        .map(|(i, n)| {
            format!(
                "{}. [{}] {}: {}",
                i + 1,
                n.kind.attr(),
                n.name,
                n.text.split_whitespace().collect::<Vec<_>>().join(" ")
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    vec![
        ModelMessage {
            role: Role::System,
            content: format!(
                "You tidy the memory notebook of an interactive story at the end of a chapter. \
                 The narrator reads every note before each reply, so it should be short and \
                 never repeat itself. The player character is {player_name}. Merge notes that \
                 are about the same person, place, item or subject (for example a note on a \
                 first name and one on the whole name), and shorten notes that are long or say \
                 the same thing twice. Keep every name, promise, secret, injury, item and \
                 anything that is still true; never invent anything, and never drop a fact. \
                 Leave notes that are fine as they are out of your reply. Each note stays under \
                 {MAX_NOTE_TEXT} characters.{}\n\nReply with JSON only, in this shape:\n\
                 {{\"changes\": [{{\"replace\": [2, 5], \"kind\": \"person\", \"name\": \
                 \"Mara Quill\", \"text\": \"...\"}}]}}\n\"replace\" lists the numbers of the \
                 notes the new note takes the place of: one number to shorten a note, two or \
                 more to merge them. \"kind\" is person, place, item, event or fact. At most \
                 {MAX_TIDY_CHANGES} changes; {{\"changes\": []}} when the notebook is fine.",
                written_in(language)
            ),
        },
        ModelMessage {
            role: Role::User,
            content: format!("NOTEBOOK\n{list}"),
        },
    ]
}

/// A change before it is checked against the notebook.
struct Proposal {
    /// Positions in the notebook, from 0.
    replace: Vec<usize>,
    kind: Option<NoteKind>,
    name: String,
    text: String,
}

#[derive(Deserialize)]
struct Reply {
    #[serde(default)]
    changes: Vec<ReplyChange>,
}

#[derive(Deserialize)]
struct ReplyChange {
    #[serde(default, alias = "replaces")]
    replace: Vec<serde_json::Value>,
    #[serde(default)]
    kind: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    text: Option<String>,
}

fn kind_named(s: &str) -> Option<NoteKind> {
    let s = s.trim().to_lowercase();
    NoteKind::ALL.into_iter().find(|k| k.attr() == s)
}

/// The changes in a model's reply, checked against `notes`. A reply that
/// is not the JSON asked for is an error; a change that does not fit the
/// notebook is left out.
pub fn read_changes(reply: &str, notes: &[MemoryNote]) -> AppResult<Vec<TidyChange>> {
    let unreadable = || {
        AppError::new(
            ErrorCode::ProviderError,
            "the storyteller's notebook changes could not be read",
        )
    };
    let start = reply.find('{').ok_or_else(unreadable)?;
    let end = reply
        .rfind('}')
        .filter(|&e| e > start)
        .ok_or_else(unreadable)?;
    let parsed: Reply = serde_json::from_str(&reply[start..=end]).map_err(|_| unreadable())?;
    let proposals = parsed
        .changes
        .into_iter()
        .map(|c| Proposal {
            replace: c
                .replace
                .iter()
                .filter_map(|v| match v {
                    serde_json::Value::Number(n) => n.as_u64(),
                    serde_json::Value::String(s) => s.trim().parse().ok(),
                    _ => None,
                })
                .filter_map(|n| usize::try_from(n).ok()?.checked_sub(1))
                .collect(),
            kind: c.kind.as_deref().and_then(kind_named),
            name: c.name.unwrap_or_default(),
            text: c.text.unwrap_or_default(),
        })
        .collect();
    Ok(accept(proposals, notes))
}

fn chars(s: &str) -> usize {
    s.chars().count()
}

/// The proposals that fit `notes`: each note replaced once at most, a
/// merge of two or more, a shortening that is shorter, and no new note
/// that would overwrite one it does not replace.
fn accept(proposals: Vec<Proposal>, notes: &[MemoryNote]) -> Vec<TidyChange> {
    let mut used = BTreeSet::new();
    let mut written: BTreeSet<(NoteKind, String)> = BTreeSet::new();
    let mut out = Vec::new();
    for p in proposals {
        if out.len() >= MAX_TIDY_CHANGES {
            break;
        }
        let replace: Vec<usize> = p
            .replace
            .iter()
            .copied()
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect();
        if replace.is_empty()
            || replace
                .iter()
                .any(|&i| i >= notes.len() || used.contains(&i))
        {
            continue;
        }
        let first = &notes[replace[0]];
        let kind = p.kind.unwrap_or(first.kind);
        let name: String = p
            .name
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .chars()
            .take(MAX_NOTE_NAME)
            .collect();
        let name = if name.is_empty() {
            first.name.clone()
        } else {
            name
        };
        let text = p.text.trim().to_string();
        if text.is_empty() || chars(&text) > MAX_NOTE_TEXT {
            continue;
        }
        if replace.len() == 1 && chars(&text) >= chars(&first.text) {
            continue;
        }
        let key = (kind, note_key(&name));
        let overwrites = notes
            .iter()
            .enumerate()
            .any(|(i, n)| !replace.contains(&i) && n.is(kind, &name));
        if overwrites || written.contains(&key) {
            continue;
        }
        let replaces: Vec<MemoryNote> = replace.iter().map(|&i| notes[i].clone()).collect();
        let chapter = replaces.iter().filter_map(|n| n.chapter).max();
        used.extend(replace);
        written.insert(key);
        out.push(TidyChange {
            replaces,
            note: MemoryNote {
                kind,
                name,
                text,
                chapter,
                source_event_id: None,
            },
        });
    }
    out
}

/// `text` in sentences, each with its own end mark.
fn sentences(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut it = text.chars().peekable();
    while let Some(c) = it.next() {
        cur.push(c);
        let ends = match c {
            '。' | '！' | '？' => true,
            '.' | '!' | '?' => it.peek().is_none_or(|n| n.is_whitespace()),
            _ => false,
        };
        if ends {
            let s = cur.trim();
            if !s.is_empty() {
                out.push(s.to_string());
            }
            cur.clear();
        }
    }
    let s = cur.trim();
    if !s.is_empty() {
        out.push(s.to_string());
    }
    out
}

fn sentence_key(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

/// The sentences of `texts` in order, each said once.
fn without_repeats(texts: &[&str]) -> String {
    let mut seen = BTreeSet::new();
    let mut kept = Vec::new();
    for t in texts {
        for s in sentences(t) {
            let key = sentence_key(&s);
            if key.is_empty() || seen.insert(key) {
                kept.push(s);
            }
        }
    }
    // Japanese and Chinese sentences run on without a space.
    let spaced = !kept
        .first()
        .is_some_and(|s| s.ends_with(['。', '！', '？']));
    kept.join(if spaced { " " } else { "" })
}

/// The changes made without a storyteller, which lose nothing: a person
/// noted by first name joined to the one person with that whole name, and
/// sentences a note says twice said once.
pub fn offline_changes(notes: &[MemoryNote]) -> Vec<TidyChange> {
    let mut proposals = Vec::new();
    let mut merged = BTreeSet::new();
    for (i, n) in notes.iter().enumerate() {
        let key = note_key(&n.name);
        if n.kind != NoteKind::Person || key.contains(' ') || key.is_empty() {
            continue;
        }
        let prefix = format!("{key} ");
        let whole: Vec<usize> = notes
            .iter()
            .enumerate()
            .filter(|(j, m)| {
                *j != i && m.kind == NoteKind::Person && note_key(&m.name).starts_with(&prefix)
            })
            .map(|(j, _)| j)
            .collect();
        let [j] = whole[..] else { continue };
        if merged.contains(&j) {
            continue;
        }
        let (a, b) = (i.min(j), i.max(j));
        merged.extend([i, j]);
        proposals.push(Proposal {
            replace: vec![a, b],
            kind: Some(NoteKind::Person),
            name: notes[j].name.clone(),
            text: without_repeats(&[&notes[a].text, &notes[b].text]),
        });
    }
    for (i, n) in notes.iter().enumerate() {
        if merged.contains(&i) {
            continue;
        }
        let text = without_repeats(&[&n.text]);
        if chars(&text) < chars(n.text.trim()) {
            proposals.push(Proposal {
                replace: vec![i],
                kind: Some(n.kind),
                name: n.name.clone(),
                text,
            });
        }
    }
    accept(proposals, notes)
}

/// Suggest how to tidy the notebook on `route_id`. Nothing is stored.
pub async fn draft_tidy(env: &SummaryEnv<'_>, route_id: &str) -> AppResult<NotebookTidy> {
    let (notes, player_name, language, manual, head) = {
        let mut conn = env.db.reader().acquire().await?;
        let route = get_route(&mut conn, route_id).await?;
        let head = route
            .head_event_id
            .ok_or_else(|| AppError::invalid_input("this route has no notebook yet"))?;
        // Nothing is asked for a chapter that cannot end yet.
        check_can_end(&ancestors(&mut conn, &route.story_id, &head).await?)?;
        let (state, _) = state_with_snapshots(&mut conn, &route.story_id, &head).await?;
        let s = state.state;
        let player_name = s
            .characters
            .get(&s.player_character_id)
            .map(|c| c.name.clone())
            .unwrap_or_else(|| "the player".into());
        let manual = s.narration.manual_memory;
        (s.notes, player_name, s.narration.language, manual, head)
    };
    let nothing = |head: String| NotebookTidy {
        changes: Vec::new(),
        written_by: String::new(),
        head_event_id: head,
    };
    // A player who keeps the notebook themselves tidies it themselves.
    if manual || !worth_tidying(&notes) {
        return Ok(nothing(head));
    }
    let Some(pid) = providers::route_storyteller(env.db, route_id).await? else {
        return Ok(NotebookTidy {
            changes: offline_changes(&notes),
            written_by: OFFLINE_RECAP_BY.to_string(),
            head_event_id: head,
        });
    };
    let row = providers::get_profile_row(env.db, &pid).await?;
    let settings = row.settings();
    let max_output = settings.max_output_tokens.max(TIDY_MAX_OUTPUT_TOKENS);
    let messages = tidy_messages(&notes, &player_name, language.as_deref());
    if estimate_messages(&messages).saturating_add(max_output) > settings.max_context_tokens {
        // Too long to send whole; the lossless changes still help.
        return Ok(NotebookTidy {
            changes: offline_changes(&notes),
            written_by: OFFLINE_RECAP_BY.to_string(),
            head_event_id: head,
        });
    }
    let req = GenerateRequest {
        model_id: row.model_id.clone(),
        messages,
        max_output_tokens: max_output,
        temperature: settings.temperature.map(|t| t.min(0.3)),
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
    Ok(NotebookTidy {
        changes: read_changes(&c.text, &notes)?,
        written_by: row.label,
        head_event_id: head,
    })
}

#[cfg(test)]
mod tests;

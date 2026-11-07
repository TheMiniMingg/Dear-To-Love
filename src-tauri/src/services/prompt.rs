//! Branch-scoped, budgeted prompt assembly (roadmap section 07).
//!
//! Inputs are only the effective state at the player's action, that
//! action's ancestors and a summary whose source ends on one of those
//! ancestors, so nothing from another route can leak in. Order:
//!
//! 1. Narration contract, the story's premise, genre and content settings,
//!    world, characters, relationships, confirmed facts and the current
//!    scene with its chapter goal (always sent).
//! 2. "Story so far": the newest eligible rolling summary.
//! 3. Verbatim player and story turns after the summary, oldest first.
//! 4. The latest player action, exactly once, always last.
//!
//! The reply's token reservation comes off the top. Step 1 and the latest
//! action must fit or the request fails with `CONTEXT_TOO_LONG` before
//! anything is sent. Then the newest few turns, then the summary, then
//! older turns while they fit. Assembly is cheap and deterministic, so it
//! is recomputed for each run rather than cached.

use serde::Serialize;
use ts_rs::TS;

use crate::db::memory::EligibleSummary;
use crate::db::timeline::EventRow;
use crate::domain::events::{EventBody, EventKind};
use crate::domain::provider::{ModelMessage, Role};
use crate::domain::replay::EffectiveState;
use crate::domain::story_state::{
    ContentRating, Control, Detail, NarrationStyle, Pacing, Perspective,
};
use crate::errors::{AppError, AppResult, ErrorCode};
use crate::services::tokens::{estimate_message, estimate_messages, estimate_text};

pub const PROMPT_SCHEMA_VERSION: u32 = 6;
/// Newest messages (excluding the latest action) placed before the summary
/// competes for room.
pub const MIN_RECENT_MESSAGES: usize = 4;
const EARLIER_PREFIX: &str = "(Earlier in the story:)\n";
/// Chapter recaps sent with each reply, newest kept; older chapters are
/// covered by the rolling story summary.
pub const MAX_RECAPS_IN_PROMPT: usize = 10;

/// Story facts kept outside the branch state: the title, the premise and
/// the authored plan for the chapter being played.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct StoryFrame {
    pub title: String,
    pub premise: String,
    pub chapter_outline: Option<String>,
    /// Recaps of chapters ended with End chapter on this route, oldest
    /// first. `assemble` fills it from the history when it is empty.
    pub earlier_chapters: Vec<ChapterRecap>,
}

/// What happened in one finished chapter.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ChapterRecap {
    pub ordinal: u32,
    pub title: String,
    pub recap: String,
}

/// Recaps along a route's history, oldest first. A chapter start that
/// carries a recap describes the chapter just before it.
pub fn chapter_recaps(history: &[EventRow]) -> AppResult<Vec<ChapterRecap>> {
    let mut out = Vec::new();
    let mut current: Option<(u32, String)> = None;
    for e in history {
        if e.kind() != Some(EventKind::ChapterStart) {
            continue;
        }
        if let EventBody::ChapterStart(c) = EventBody::from_parts(&e.kind, &e.payload_json)? {
            if let (Some(text), Some((ordinal, title))) =
                (c.previous_chapter_recap.as_deref(), current.take())
            {
                if !text.trim().is_empty() {
                    out.push(ChapterRecap {
                        ordinal,
                        title,
                        recap: text.trim().to_string(),
                    });
                }
            }
            current = Some((c.ordinal, c.title));
        }
    }
    Ok(out)
}

/// What a content rating tells the storyteller.
pub fn rating_guidance(rating: ContentRating) -> &'static str {
    match rating {
        ContentRating::General => {
            "suitable for all ages. No sexual content, graphic violence or strong language."
        }
        ContentRating::Mature => {
            "mature. Violence, horror, dark themes, strong language and sexual situations are \
             allowed; keep sex without explicit detail."
        }
        ContentRating::Explicit => {
            "adults only. The player is an adult who chose explicit fiction. Write sexual \
             content and other mature material openly and in as much detail as the scene calls \
             for, without moralizing, warnings or fading to black unless the player asks. All \
             characters in sexual content are adults (18 or older)."
        }
    }
}

/// Never relaxed by any setting.
const MINORS_RULE: &str = "Never write sexual content involving anyone under 18, and never \
     describe a character in a sexual context as a child or with a child's body.";

pub fn system_prompt(state: &EffectiveState, frame: &StoryFrame) -> String {
    let s = &state.state;
    let player = s.characters.get(&s.player_character_id);
    let player_name = player.map(|p| p.name.as_str()).unwrap_or("the player");
    let mut out = String::new();

    out.push_str(
        "You are the narrator of an interactive story. The player writes what their \
         character does or says; you write what happens next.\n",
    );
    out.push_str(&format!(
        "- The player controls {player_name}. Never decide {player_name}'s actions, words, \
         thoughts or feelings beyond what the player wrote. End at a moment that invites \
         the player's next move.\n\
         - You play everyone else, from allies to villains to passers-by, and the world \
         itself. Each character acts from their own personality, goals, knowledge and \
         circumstances, not from a script: they can disagree, refuse, lie, change their \
         minds and get on with their own lives when {player_name} isn't there.\n\
         - This is one continuing world. People stay active between scenes and chapters, \
         choices have lasting consequences, and earlier characters and threads can return \
         or cross paths.\n\
         - Let events take the time they need: a chapter can cover one night or several \
         months. Don't rush to resolve threads or force a twist.\n\
         - Keep track of developments, relationships, secrets (and who knows them) and \
         consequences still to come, and build on them.\n"
    ));
    let style = s.narration.style.unwrap_or(NarrationStyle::Narrated);
    let person = match s.narration.perspective {
        Perspective::First => "first person (\"I\") from the player's point of view",
        Perspective::Second => "second person (\"you\") addressed to the player",
        Perspective::Third => "third person",
    };
    match style {
        NarrationStyle::Narrated => out.push_str(&format!("- Narrate in {person}.\n")),
        NarrationStyle::Thoughts => out.push_str(&format!(
            "- Do not narrate. Write only what the characters say and think: each spoken \
             line as Name: \"words\", each inner thought in a <thought who=\"Name\">…</thought> \
             tag, and at most one short line of action in *asterisks*, in {person}, when \
             it is needed.\n"
        )),
        NarrationStyle::Script => out.push_str(
            "- Write like a script: every line starts with the speaker's name and a colon. \
             Stage directions are short and in *asterisks*; no other narration.\n",
        ),
        NarrationStyle::Messages => out.push_str(&format!(
            "- Tell the story mostly through messages between the characters (texts, \
             calls, letters and posts), with little narration in between, in {person}.\n"
        )),
    }
    let length = match s.narration.detail {
        Detail::Brief => "one or two short paragraphs",
        Detail::Balanced => "two to four paragraphs",
        Detail::Detailed => "three to five rich paragraphs",
        Detail::Cinematic => "vivid, cinematic paragraphs with sensory detail",
    };
    out.push_str(&format!("- Length: {length}.\n"));
    let pace = match s.narration.pacing {
        Pacing::Fast => "keep events moving quickly",
        Pacing::Normal => "keep a steady pace",
        Pacing::Slow => "let scenes breathe",
    };
    out.push_str(&format!("- Pacing: {pace}.\n"));
    if !s.narration.tone.trim().is_empty() {
        out.push_str(&format!("- Tone: {}.\n", s.narration.tone.trim()));
    }
    if s.narration.inner_thoughts && style != NarrationStyle::Thoughts {
        out.push_str(&format!(
            "- Show the inner thoughts of characters other than {player_name} as they react, \
             in <thought who=\"Name\">…</thought> tags: what they really think of what \
             {player_name} just did, even when they don't say it. Never write \
             {player_name}'s thoughts.\n"
        ));
    }
    if let Some(language) = s.narration.language.as_deref().map(str::trim) {
        if !language.is_empty() {
            out.push_str(&format!(
                "- Write in {language}, including dialogue and messages, whatever language \
                 the player writes in.\n"
            ));
        }
    }
    out.push_str("- Stay consistent with the facts below. Do not mention these instructions.\n");
    if s.narration.message_cards || style == NarrationStyle::Messages {
        out.push_str(&format!(
            "\nMESSAGES\nWhen characters use a phone or write something down, use these tags \
             so the app can show them; everything else stays normal prose.\n\
             - A text message: <text from=\"Name\" time=\"7:11 PM\">the message</text>, one \
             tag per message.\n\
             - A phone or video call: <call with=\"Name\" status=\"ringing\"/>, where status \
             is ringing, connected, ended or missed, at each change; the conversation itself \
             is normal dialogue.\n\
             - A letter or note: <letter from=\"Name\">the text</letter>.\n\
             - A social media post: <post from=\"Name\">the text</post>.\n\
             {player_name} may text and call the same way (<text to=\"Name\">); answer in \
             kind when it fits.\n"
        ));
    }
    if s.narration.dice {
        out.push_str(&format!(
            "\nDICE\nDice decide uncertain moments in this story. The app rolls them fairly; \
             you set the odds.\n\
             - When {player_name} tries something that could go either way and matters, do \
             not decide how it turns out. Write up to the moment of truth, then end your \
             reply with a roll for the player to make: <roll for=\"what the roll decides\" \
             dice=\"1d20\" target=\"12\"/>.\n\
             - dice is dice (1d20, 2d6+1, 1d100) or a range of whole numbers (40-100). \
             target is the total needed to succeed; leave it out when the number itself is \
             the result, such as a test score. Add stat=\"Name\" to add one of \
             {player_name}'s stats.\n\
             - Set the odds from the story so far: practice, preparation, skill, help and \
             good choices raise the low end or lower the target; injury, haste, fear and \
             poor choices do the opposite. For example, a test scored 0-100 becomes \
             dice=\"40-100\" after {player_name} studied for it twice.\n\
             - Ask for at most one roll per reply, and none for easy or trivial things.\n\
             - An action can start with a roll's result: <roll for=\"…\" dice=\"…\" \
             result=\"17\" outcome=\"success\"/>. Write what happens with exactly that \
             result: never reroll, ignore or soften it. {player_name} may also roll on \
             their own; treat that roll the same way.\n"
        ));
    }

    let n = &s.narration;
    let mut story = String::new();
    for (label, value) in [("Title", &frame.title), ("Premise", &frame.premise)] {
        if !value.trim().is_empty() {
            story.push_str(&format!("{label}: {}\n", value.trim()));
        }
    }
    let list = |items: &[String]| -> String {
        items
            .iter()
            .map(|t| t.trim())
            .filter(|t| !t.is_empty())
            .collect::<Vec<_>>()
            .join("; ")
    };
    let genres = list(&n.genres);
    if !genres.is_empty() {
        story.push_str(&format!("Genre: {genres}\n"));
    }
    if let Some(r) = n.rating {
        story.push_str(&format!("Content: {}\n", rating_guidance(r)));
        if r != ContentRating::General {
            story.push_str(MINORS_RULE);
            story.push('\n');
        }
    }
    let themes = list(&n.themes);
    if !themes.is_empty() {
        story.push_str(&format!(
            "Themes and elements the player wants, woven in when they fit: {themes}\n"
        ));
    }
    let limits = list(&n.limits);
    if !limits.is_empty() {
        story.push_str(&format!(
            "Hard limits, never write these even if the story drifts toward them: {limits}\n"
        ));
    }
    if !story.is_empty() {
        out.push_str("\nSTORY\n");
        out.push_str(&story);
    }

    out.push_str("\nWORLD\n");
    for (label, value) in [
        ("Setting", &s.world.setting),
        ("Era", &s.world.era),
        ("About", &s.world.description),
    ] {
        if !value.trim().is_empty() {
            out.push_str(&format!("{label}: {}\n", value.trim()));
        }
    }
    for rule in &s.world.rules {
        out.push_str(&format!("Rule: {rule}\n"));
    }

    out.push_str("\nCHARACTERS\n");
    for c in s.characters.values() {
        let who = if c.control == Control::Player {
            "player character"
        } else {
            "played by you"
        };
        out.push_str(&format!("- {} ({who})", c.name));
        let mut parts: Vec<String> = Vec::new();
        for (label, v) in [
            ("pronouns", &c.pronouns),
            ("age", &c.age),
            ("species", &c.species),
            ("role", &c.role),
            ("about", &c.description),
            ("looks", &c.appearance),
        ] {
            if let Some(v) = v.as_ref().filter(|v| !v.trim().is_empty()) {
                parts.push(format!("{label}: {}", v.trim()));
            }
        }
        if !c.personality.is_empty() {
            parts.push(format!("personality: {}", c.personality.join(", ")));
        }
        if !c.goals.is_empty() {
            parts.push(format!("goals: {}", c.goals.join("; ")));
        }
        if !c.abilities.is_empty() {
            parts.push(format!("abilities: {}", c.abilities.join(", ")));
        }
        if !c.stats.is_empty() {
            let stats: Vec<String> = c
                .stats
                .iter()
                .map(|st| format!("{} {}", st.name.trim(), st.value))
                .collect();
            parts.push(format!("stats: {}", stats.join(", ")));
        }
        if !parts.is_empty() {
            out.push_str(&format!(": {}", parts.join("; ")));
        }
        out.push('\n');
    }

    let name_of = |id: &str| -> String {
        if id == "@player" {
            return player_name.to_string();
        }
        s.characters
            .get(id)
            .map(|c| c.name.clone())
            .unwrap_or_else(|| id.to_string())
    };
    if !s.relationships.is_empty() {
        out.push_str("\nRELATIONSHIPS\n");
        for r in &s.relationships {
            out.push_str(&format!(
                "- {} → {}: {} ({})\n",
                name_of(&r.from_id),
                name_of(&r.to_id),
                r.label,
                r.status
            ));
        }
    }
    let facts: Vec<_> = s.known_facts.iter().filter(|f| f.confirmed).collect();
    if !facts.is_empty() {
        out.push_str("\nESTABLISHED FACTS\n");
        for f in facts {
            if f.known_by.is_empty() {
                out.push_str(&format!("- {}\n", f.text));
            } else {
                let who: Vec<String> = f.known_by.iter().map(|k| name_of(k)).collect();
                out.push_str(&format!("- {} (known to: {})\n", f.text, who.join(", ")));
            }
        }
    }

    let recaps = &frame.earlier_chapters;
    if !recaps.is_empty() {
        out.push_str("\nEARLIER CHAPTERS\n");
        let skip = recaps.len().saturating_sub(MAX_RECAPS_IN_PROMPT);
        for r in &recaps[skip..] {
            out.push_str(&format!(
                "Chapter {}, {}: {}\n",
                r.ordinal,
                r.title.trim(),
                r.recap.split_whitespace().collect::<Vec<_>>().join(" ")
            ));
        }
    }

    out.push_str("\nNOW\n");
    if let Some(ch) = &state.active_chapter {
        out.push_str(&format!("Chapter {}: {}\n", ch.ordinal, ch.title));
    }
    if let Some(plan) = frame.chapter_outline.as_deref().map(str::trim) {
        if !plan.is_empty() {
            out.push_str(&format!(
                "Chapter plan (a direction to steer toward, not a script): {plan}\n"
            ));
        }
    }
    if !s.scene.location.trim().is_empty() {
        out.push_str(&format!("Location: {}\n", s.scene.location.trim()));
    }
    if !s.scene.summary.trim().is_empty() {
        out.push_str(&format!("Situation: {}\n", s.scene.summary.trim()));
    }
    let present: Vec<String> = s.scene.participant_ids.iter().map(|p| name_of(p)).collect();
    if !present.is_empty() {
        out.push_str(&format!("Present: {}\n", present.join(", ")));
    }
    if !s.open_threads.is_empty() {
        out.push_str(&format!("Open threads: {}\n", s.open_threads.join("; ")));
    }
    out
}

/// How much room one request has.
#[derive(Debug, Clone, Copy)]
pub struct Budget {
    pub max_context_tokens: u32,
    pub max_output_tokens: u32,
}

/// Which summary a prompt used, for Prompt Preview.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SummaryUse {
    pub cache_id: String,
    /// The summary covers turns `1..=covered_turns` of this route.
    pub covered_turns: u32,
    /// Its latest update summarized turns `chunk_from_turn..=covered_turns`
    /// on top of the previous summary.
    pub chunk_from_turn: u32,
    pub source_start_event_id: Option<String>,
    pub source_end_event_id: String,
    pub generator: String,
    pub created_at: String,
    pub estimated_tokens: u32,
}

#[derive(Debug, Clone)]
pub struct Assembled {
    pub messages: Vec<ModelMessage>,
    pub estimated_input_tokens: u32,
    /// Set only when the summary made it into the prompt.
    pub summary: Option<SummaryUse>,
    /// A summary existed but did not fit.
    pub summary_dropped: bool,
    /// Player and story turns sent verbatim, including the latest action.
    pub verbatim_messages: usize,
    /// Turns after the summary (or since the start) left out for room.
    pub omitted_messages: usize,
}

fn turn_message(e: &EventRow) -> AppResult<Option<ModelMessage>> {
    Ok(
        match (e.kind(), EventBody::from_parts(&e.kind, &e.payload_json)?) {
            (Some(EventKind::Player), EventBody::Player(p)) => Some(ModelMessage {
                role: Role::User,
                content: p.story_text().into_owned(),
            }),
            (Some(EventKind::Assistant), EventBody::Assistant(p)) => Some(ModelMessage {
                role: Role::Assistant,
                content: p.text,
            }),
            _ => None,
        },
    )
}

fn assistant_turns(events: &[EventRow]) -> u32 {
    let n = events
        .iter()
        .filter(|e| e.kind() == Some(EventKind::Assistant))
        .count();
    u32::try_from(n).unwrap_or(u32::MAX)
}

fn summary_block(covered_turns: u32, text: &str) -> String {
    format!(
        "\nSTORY SO FAR\nSummary of turns 1-{covered_turns}; later turns follow as messages.\n{}\n",
        text.trim()
    )
}

/// Assemble the prompt for a reply to the last event of `history` (oldest
/// first), which must be the player's action. With `next_action`, the
/// history may end anywhere and that text stands in for the action (Prompt
/// Preview before the player has written it).
pub fn assemble(
    state: &EffectiveState,
    frame: &StoryFrame,
    history: &[EventRow],
    summary: Option<&EligibleSummary>,
    next_action: Option<&str>,
    budget: Budget,
) -> AppResult<Assembled> {
    let start = summary.map(|s| s.end_index + 1).unwrap_or(0);
    let mut turns: Vec<ModelMessage> = Vec::new();
    for e in history.get(start..).unwrap_or_default() {
        if let Some(m) = turn_message(e)? {
            turns.push(m);
        }
    }
    match next_action {
        Some(text) => turns.push(ModelMessage {
            role: Role::User,
            content: text.to_string(),
        }),
        None => {
            if history.last().and_then(|e| e.kind()) != Some(EventKind::Player) {
                return Err(AppError::invalid_input(
                    "a reply needs a player action to answer",
                ));
            }
        }
    }
    let latest = turns
        .pop()
        .ok_or_else(|| AppError::invalid_input("a reply needs a player action to answer"))?;
    let older = turns;

    let recapped;
    let frame = if frame.earlier_chapters.is_empty() {
        recapped = StoryFrame {
            earlier_chapters: chapter_recaps(history)?,
            ..frame.clone()
        };
        &recapped
    } else {
        frame
    };
    let system = system_prompt(state, frame);
    let available = budget
        .max_context_tokens
        .saturating_sub(budget.max_output_tokens);
    let mut prompt = vec![
        ModelMessage {
            role: Role::System,
            content: system.clone(),
        },
        latest.clone(),
    ];
    let required = estimate_messages(&prompt);
    if required > available {
        return Err(AppError::new(
            ErrorCode::ContextTooLong,
            format!(
                "the story setup and your latest action need about {required} tokens, but this \
                 connection allows {available} after reserving {} for the reply. Shorten the \
                 action, lower the reply length, or raise the context limit in Settings.",
                budget.max_output_tokens
            ),
        ));
    }
    let mut used = required;

    // Newest first: a contiguous window that ends at the latest action.
    let mut keep_from = older.len();
    let grow = |limit: usize, used: &mut u32, keep_from: &mut usize| {
        while *keep_from > 0 && older.len() - *keep_from < limit {
            let cost = estimate_message(&older[*keep_from - 1]);
            if *used + cost > available {
                return false;
            }
            *used += cost;
            *keep_from -= 1;
        }
        true
    };
    let room_left = grow(MIN_RECENT_MESSAGES, &mut used, &mut keep_from);

    let block = summary.map(|s| {
        let covered = u32::try_from(s.row.covered_turns).unwrap_or(0);
        (s, covered, summary_block(covered, &s.row.summary_text))
    });
    let mut summary_use = None;
    let mut summary_dropped = false;
    if let Some((s, covered, text)) = &block {
        let cost = estimate_text(text);
        if used + cost <= available {
            used += cost;
            let chunk_start = s
                .row
                .source_start_event_id
                .as_deref()
                .and_then(|id| history.iter().position(|e| e.id == id))
                .map(|i| assistant_turns(&history[..=i]) + 1)
                .unwrap_or(1);
            summary_use = Some(SummaryUse {
                cache_id: s.row.id.clone(),
                covered_turns: *covered,
                chunk_from_turn: chunk_start,
                source_start_event_id: s.row.source_start_event_id.clone(),
                source_end_event_id: s.row.source_end_event_id.clone(),
                generator: s.row.generator.clone(),
                created_at: s.row.created_at.clone(),
                estimated_tokens: cost,
            });
            prompt[0].content.push_str(text);
        } else {
            summary_dropped = true;
        }
    }
    if room_left {
        grow(usize::MAX, &mut used, &mut keep_from);
    }

    // Models expect the first turn after the system message to be the
    // user's; a window that starts with a story reply is labelled instead.
    let mut window: Vec<ModelMessage> = older[keep_from..].to_vec();
    loop {
        if let Some(first) = window.first_mut() {
            if first.role == Role::Assistant {
                first.role = Role::User;
                first.content = format!("{EARLIER_PREFIX}{}", first.content);
            }
        }
        let mut all = vec![prompt[0].clone()];
        all.extend(window.iter().cloned());
        all.push(latest.clone());
        let total = estimate_messages(&all);
        if total <= available || window.is_empty() {
            return Ok(Assembled {
                verbatim_messages: window.len() + 1,
                omitted_messages: older.len() - window.len(),
                messages: all,
                estimated_input_tokens: total,
                summary: summary_use,
                summary_dropped,
            });
        }
        // The label pushed the window over: drop its oldest turn and retry.
        window.remove(0);
    }
}

#[cfg(test)]
mod tests;

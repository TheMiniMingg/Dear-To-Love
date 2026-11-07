//! Branch-scoped, budgeted prompt assembly (roadmap section 07).
//!
//! Inputs are only the effective state at the player's action, that
//! action's ancestors and a summary whose source ends on one of those
//! ancestors, so nothing from another route can leak in. Order:
//!
//! 1. Narration contract, the story's premise, genre and content settings,
//!    world, characters, relationships, confirmed facts, memory notes (all
//!    of them, or as many as fit a fifth of the room with the ones the
//!    scene names first), chapter recaps and the current scene with its
//!    chapter goal (always sent).
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
use crate::domain::notes::{MemoryNote, NoteKind};
use crate::domain::provider::{ModelMessage, Role};
use crate::domain::replay::EffectiveState;
use crate::domain::story_state::{
    ContentRating, Control, Detail, DiceRules, NarrationStyle, Pacing, Perspective, RollFrequency,
    RollOdds, Surprises, Tense,
};
use crate::domain::tracking::Tracking;
use crate::errors::{AppError, AppResult, ErrorCode};
use crate::services::tokens::{estimate_message, estimate_messages, estimate_text};

pub const PROMPT_SCHEMA_VERSION: u32 = 11;
/// What the storyteller reads for **Keep going**, an action with no words.
pub const KEEP_GOING: &str = "(Out of character: I let the story go on without acting. \
     Continue from where it left off, and don't decide anything for my character.)";
/// Newest messages (excluding the latest action) placed before the summary
/// competes for room.
pub const MIN_RECENT_MESSAGES: usize = 4;
const EARLIER_PREFIX: &str = "(Earlier in the story:)\n";
/// Chapter recaps sent in full with each reply, newest kept; older chapters
/// are sent in brief (their first lines).
pub const MAX_RECAPS_IN_PROMPT: usize = 10;
/// Older chapters sent in brief, newest kept; the rolling summary and the
/// memory notes cover any before them.
pub const MAX_BRIEF_RECAPS: usize = 40;
/// The longest brief of an older chapter.
const BRIEF_RECAP_CHARS: usize = 220;
/// Share of a request's room the memory notes may take when there are too
/// many to send them all (1/5).
const NOTES_SHARE: u32 = 5;
/// Names of notes left out that are still listed, so the storyteller knows
/// they exist.
const MAX_UNSHOWN_NAMES: usize = 60;

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

/// The DICE section, from the story's dice rules (unset keeps the usual ones).
fn dice_rules(rules: Option<&DiceRules>, player_name: &str) -> String {
    let rules = rules.cloned().unwrap_or_default();
    let fixed = rules
        .dice
        .as_deref()
        .map(str::trim)
        .filter(|d| !d.is_empty());
    let mut out = String::from(
        "\nDICE\nDice decide uncertain moments in this story. The app rolls them fairly; \
         you set the odds.\n",
    );
    if rules.player_only {
        out.push_str(&format!(
            "- Never ask for a roll yourself: {player_name} rolls when they choose to.\n"
        ));
    } else {
        let example = match fixed {
            Some(d) => format!("dice=\"{d}\" target=\"…\""),
            None => "dice=\"1d20\" target=\"12\"".to_string(),
        };
        out.push_str(&format!(
            "- When {player_name} tries something that could go either way and matters, do \
             not decide how it turns out. Write up to the moment of truth, then end your \
             reply with a roll for the player to make: <roll for=\"what the roll decides\" \
             {example}/>.\n"
        ));
        let stat = if rules.no_stats {
            String::new()
        } else {
            format!(" Add stat=\"Name\" to add one of {player_name}'s stats.")
        };
        match fixed {
            Some(d) => out.push_str(&format!(
                "- Use dice=\"{d}\" for every roll. target is the total needed to succeed; \
                 leave it out when the number itself is the result.{stat}\n"
            )),
            None => out.push_str(&format!(
                "- dice is dice (1d20, 2d6+1, 1d100) or a range of whole numbers (40-100). \
                 target is the total needed to succeed; leave it out when the number itself is \
                 the result, such as a test score.{stat}\n"
            )),
        }
        let lean = match rules.odds {
            Some(RollOdds::Generous) => " Lean generous: success should be more likely than not.",
            Some(RollOdds::Tough) => " Lean tough: failure is common and costly.",
            _ => "",
        };
        let example = if fixed.is_none() {
            format!(
                " For example, a test scored 0-100 becomes dice=\"40-100\" after \
                 {player_name} studied for it twice."
            )
        } else {
            String::new()
        };
        out.push_str(&format!(
            "- Set the odds from the story so far: practice, preparation, skill, help and \
             good choices raise the low end or lower the target; injury, haste, fear and \
             poor choices do the opposite.{example}{lean}\n"
        ));
        out.push_str(match rules.frequency {
            Some(RollFrequency::Rare) => {
                "- Ask for a roll only at big, dramatic turning points, at most one per reply.\n"
            }
            Some(RollFrequency::Often) => {
                "- Ask for a roll whenever the outcome of what the player tries is uncertain, \
                 at most one per reply.\n"
            }
            _ => "- Ask for at most one roll per reply, and none for easy or trivial things.\n",
        });
    }
    if rules.no_stats {
        out.push_str("- Stats are not added to rolls in this story.\n");
    }
    if rules.crits {
        out.push_str(
            "- A roll can say critical=\"success\" or critical=\"failure\" (the die's highest \
             or lowest face): make it a spectacular success or a disaster, whatever the target.\n",
        );
    }
    out.push_str(&format!(
        "- An action can start with a roll's result: <roll for=\"…\" dice=\"…\" \
         result=\"17\" outcome=\"success\"/>. Write what happens with exactly that \
         result: never reroll, ignore or soften it. {player_name} may also roll on \
         their own; treat that roll the same way.\n"
    ));
    out
}

/// Items listed in full in the prompt; any more are only counted.
const PROMPT_ITEMS: usize = 40;
/// Longest item description in the prompt.
const PROMPT_ITEM_CHARS: usize = 120;

/// The TRACKING section: the bars, counters and inventory as they are now,
/// and the tags that change them.
fn tracking_section(t: &Tracking, player_name: &str) -> String {
    let mut out = String::from(
        "\nTRACKING\nThe app keeps these numbers for the story and shows them on screen. \
         Right now:\n",
    );
    for m in &t.meters {
        let whose = m.who.as_deref().unwrap_or(player_name);
        let value = match m.max {
            Some(max) => format!("{}/{max}", m.value),
            None => m.value.to_string(),
        };
        out.push_str(&format!("- {whose}'s {}: {value}\n", m.name));
    }
    if t.inventory {
        if t.items.is_empty() {
            out.push_str(&format!("- {player_name}'s inventory: empty\n"));
        } else {
            out.push_str(&format!("- {player_name}'s inventory:\n"));
            for it in t.items.iter().take(PROMPT_ITEMS) {
                let qty = if it.qty > 1 {
                    format!(" x{}", it.qty)
                } else {
                    String::new()
                };
                let mut about: String = it.description.chars().take(PROMPT_ITEM_CHARS).collect();
                if about.len() < it.description.len() {
                    about.push('…');
                }
                if about.is_empty() {
                    out.push_str(&format!("  - {}{qty}\n", it.name));
                } else {
                    out.push_str(&format!("  - {}{qty}: {about}\n", it.name));
                }
            }
            if t.items.len() > PROMPT_ITEMS {
                out.push_str(&format!(
                    "  - and {} more kinds of item\n",
                    t.items.len() - PROMPT_ITEMS
                ));
            }
        }
    }
    out.push_str(
        "When something in the story changes them, write a tag right where it happens; the app \
         updates the numbers and shows the change:\n\
         - <meter name=\"Health\" change=\"-12\"/> for damage, healing, spending or earning, or \
         set=\"40\" to set a value. Add who=\"Name\" for someone else's. A new name starts a \
         new one (add max=\"100\" for a bar).\n",
    );
    if t.inventory {
        out.push_str(&format!(
            "- <item gain=\"Name\" qty=\"1\">what it is, in one line</item> when {player_name} \
             gets something, and <item lose=\"Name\"/> when it is used up, given away or lost.\n"
        ));
    }
    out.push_str(
        "Change them only when the story gives a reason, by amounts that fit what happened. When \
         a bar runs out, the story feels it (defeat, capture, exhaustion or worse) instead of \
         shrugging it off. Don't recite the numbers in the story itself.\n",
    );
    out
}

/// What the storyteller is told about memory notes when it keeps them.
fn notes_contract(language: Option<&str>) -> String {
    let mut out = String::from(
        "\nMEMORY NOTES\nThe app keeps notes so a long story never forgets what matters. When \
         something lasting happens or comes to light, end your reply with a note; the reader \
         sees that the story's memory was updated, not the note itself:\n\
         <remember person=\"Name\">where things stand with them now: relationship, feelings, \
         promises, secrets they know, what they have or wear</remember>\n\
         Use person= for someone, place= for a place and what it is like (a home, an office, a \
         hideout), item= for something that matters (a gift, a weapon, a key), event= for \
         something that happened (a short title as the name) and fact= for anything else that \
         must stay true.\n\
         - A note with the same kind and name replaces the old one, so write everything about \
         it that is still true.\n\
         - <forget person=\"Name\"/> removes a note that no longer applies.\n\
         - Note only lasting changes and new details worth keeping, not passing moments: at \
         most a few notes in a reply, often none, each one to three short sentences.\n\
         - Notes the player wrote are as true as yours; keep to them.\n",
    );
    if let Some(language) = language.map(str::trim).filter(|l| !l.is_empty()) {
        out.push_str(&format!("- Write notes in {language}.\n"));
    }
    out
}

/// Open threads and new characters, when the storyteller keeps the notes.
fn threads_contract(language: Option<&str>) -> String {
    let mut out = String::from(
        "\nOPEN THREADS\nThe app keeps a short log of open threads: promises, mysteries, goals \
         and plans the story has not settled. When one begins, add it at the end of your reply: \
         <thread>Find out who sent the letter</thread>. When it is settled, write it again with \
         the same words: <thread done>Find out who sent the letter</thread>. Only threads that \
         matter for what comes next: at most one or two in a reply, often none.\n\
         \nNEW CHARACTERS\nWhen someone new with a name joins the story and is not among the \
         CHARACTERS above, end that reply with a card for them, once: <character \
         name=\"Rowan Ellis\" role=\"barista\" pronouns=\"he/him\" age=\"30s\">How they look \
         and come across, in one or two sentences.</character> The player chooses whether to \
         add them to the cast.\n",
    );
    if let Some(language) = language.map(str::trim).filter(|l| !l.is_empty()) {
        out.push_str(&format!("Write threads and cards in {language}.\n"));
    }
    out
}

/// Ideas for the player's next move, unless the story turned them off.
fn next_moves_contract(player_name: &str, language: Option<&str>) -> String {
    let mut out = format!(
        "\nNEXT MOVES\nEnd every reply with two or three short ideas for what {player_name} \
         could do next, each in its own tag: <next>Ask Mina about the sketches</next>. Write \
         them as {player_name}'s actions, under ten words each, different from each other and \
         true to the moment. The app shows them as buttons; they are not part of the story.\n"
    );
    if let Some(language) = language.map(str::trim).filter(|l| !l.is_empty()) {
        out.push_str(&format!("Write them in {language}.\n"));
    }
    out
}

fn kind_heading(kind: NoteKind) -> &'static str {
    match kind {
        NoteKind::Person => "People",
        NoteKind::Place => "Places",
        NoteKind::Item => "Things",
        NoteKind::Event => "Timeline",
        NoteKind::Fact => "Other facts",
    }
}

fn note_line(n: &MemoryNote) -> String {
    let text = n.text.split_whitespace().collect::<Vec<_>>().join(" ");
    match (n.kind, n.chapter) {
        (NoteKind::Event, Some(ch)) => format!("- Chapter {ch}, {}: {text}\n", n.name.trim()),
        _ => format!("- {}: {text}\n", n.name.trim()),
    }
}

/// Whether `focus` (lower case) mentions the note's name, or a word of it
/// with four or more letters ("house" for "Z's house").
fn named_in(n: &MemoryNote, focus: &str) -> bool {
    let name = n.name.trim().to_lowercase();
    if name.is_empty() {
        return false;
    }
    if focus.contains(&name) {
        return true;
    }
    name.split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.chars().count() >= 4)
        .any(|w| focus.contains(w))
}

/// Which notes a request has room for. All of them when they fit in
/// `budget` tokens; otherwise the ones the scene names first, then the
/// newest people, places, things and facts, then the newest events. The
/// rest are only listed by name.
pub struct NotesPick<'a> {
    pub shown: Vec<&'a MemoryNote>,
    pub unshown: Vec<&'a MemoryNote>,
}

pub fn pick_notes<'a>(notes: &'a [MemoryNote], focus: &str, budget: Option<u32>) -> NotesPick<'a> {
    let total: u32 = notes.iter().map(|n| estimate_text(&note_line(n))).sum();
    let Some(budget) = budget.filter(|b| total > *b) else {
        return NotesPick {
            shown: notes.iter().collect(),
            unshown: Vec::new(),
        };
    };
    let focus = focus.to_lowercase();
    let mut order: Vec<usize> = (0..notes.len()).rev().collect();
    // Stable: newest first within each group.
    order.sort_by_key(|&i| {
        let n = &notes[i];
        if named_in(n, &focus) {
            0
        } else if n.kind != NoteKind::Event {
            1
        } else {
            2
        }
    });
    let mut keep = vec![false; notes.len()];
    let mut used = 0u32;
    for i in order {
        let cost = estimate_text(&note_line(&notes[i]));
        if used + cost <= budget {
            used += cost;
            keep[i] = true;
        }
    }
    let (shown, unshown): (Vec<_>, Vec<_>) = notes.iter().zip(keep).partition(|(_, k)| *k);
    NotesPick {
        shown: shown.into_iter().map(|(n, _)| n).collect(),
        unshown: unshown.into_iter().map(|(n, _)| n).collect(),
    }
}

/// The MEMORY section: the notes grouped by kind, oldest first in each.
fn notes_section(pick: &NotesPick<'_>) -> String {
    if pick.shown.is_empty() && pick.unshown.is_empty() {
        return String::new();
    }
    let mut out = String::from(
        "\nMEMORY\nNotes kept so far. They stay true unless the story changes them.\n",
    );
    for kind in NoteKind::ALL {
        let of_kind: Vec<_> = pick.shown.iter().filter(|n| n.kind == kind).collect();
        if of_kind.is_empty() {
            continue;
        }
        out.push_str(&format!("{}:\n", kind_heading(kind)));
        for n in of_kind {
            out.push_str(&note_line(n));
        }
    }
    if !pick.unshown.is_empty() {
        let names: Vec<String> = pick
            .unshown
            .iter()
            .rev()
            .take(MAX_UNSHOWN_NAMES)
            .map(|n| format!("{} ({})", n.name.trim(), n.kind.attr()))
            .collect();
        let more = pick.unshown.len().saturating_sub(MAX_UNSHOWN_NAMES);
        out.push_str(&format!(
            "Also kept but not shown here for room: {}{}. If one of them changes, write \
             everything you know that is still true about it.\n",
            names.join(", "),
            if more > 0 {
                format!(" and {more} more")
            } else {
                String::new()
            }
        ));
    }
    out
}

/// The first sentence or two of a recap, cut to `BRIEF_RECAP_CHARS`.
fn brief(recap: &str) -> String {
    let one_line = recap.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut out = String::new();
    for sentence in one_line.split_inclusive(['.', '!', '?', '。', '！', '？']) {
        if !out.is_empty() && out.chars().count() + sentence.chars().count() > BRIEF_RECAP_CHARS {
            break;
        }
        out.push_str(sentence);
    }
    if out.chars().count() > BRIEF_RECAP_CHARS {
        out = out.chars().take(BRIEF_RECAP_CHARS - 1).collect::<String>();
        out = out.trim_end().to_string();
        out.push('…');
    }
    out.trim().to_string()
}

pub fn system_prompt(state: &EffectiveState, frame: &StoryFrame) -> String {
    system_prompt_with(state, frame, &pick_notes(&state.state.notes, "", None))
}

fn system_prompt_with(state: &EffectiveState, frame: &StoryFrame, notes: &NotesPick<'_>) -> String {
    let s = &state.state;
    let player = s.characters.get(&s.player_character_id);
    let player_name = player.map(|p| p.name.as_str()).unwrap_or("the player");
    let mut out = String::new();

    out.push_str(
        "You are the narrator of an interactive story. The player writes what their \
         character does or says; you write what happens next.\n",
    );
    let control = if s.narration.autopilot {
        format!(
            "- The player controls {player_name}. You may describe {player_name}'s small, \
             natural reactions (a nod, a laugh, a glance), but never decide their choices, \
             words, thoughts or feelings beyond what the player wrote."
        )
    } else {
        format!(
            "- The player controls {player_name}. Never decide {player_name}'s actions, words, \
             thoughts or feelings beyond what the player wrote."
        )
    };
    let twists = match s.narration.surprises {
        Some(Surprises::Off) => {
            "Don't rush to resolve threads, and don't add surprises of your own: what \
             happens follows from the player's actions and what the characters would \
             plausibly do."
        }
        Some(Surprises::Often) => {
            "Don't rush to resolve threads, but bring in twists, complications and \
             surprises often."
        }
        _ => "Don't rush to resolve threads or force a twist.",
    };
    out.push_str(&format!(
        "{control} End at a moment that invites the player's next move.\n\
         - You play everyone else, from allies to villains to passers-by, and the world \
         itself. Each character acts from their own personality, goals, knowledge and \
         circumstances, not from a script: they can disagree, refuse, lie, change their \
         minds and get on with their own lives when {player_name} isn't there.\n\
         - This is one continuing world. People stay active between scenes and chapters, \
         choices have lasting consequences, and earlier characters and threads can return \
         or cross paths.\n\
         - Let events take the time they need: a chapter can cover one night or several \
         months. {twists}\n\
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
            "- Write like a script: each spoken line as Name: \"words\", and short stage \
             directions on their own lines in *asterisks*; no other narration.\n",
        ),
        NarrationStyle::Messages => out.push_str(&format!(
            "- Tell the story mostly through messages between the characters (texts, \
             calls, letters and posts), with little narration in between, in {person}.\n"
        )),
        NarrationStyle::Roleplay => out.push_str(&format!(
            "- Write like a roleplay chat, in {person}: actions and descriptions in \
             *asterisks*, dialogue in quotes, and short replies that keep the back-and-forth \
             going.\n"
        )),
        NarrationStyle::Adventure => out.push_str(&format!(
            "- Write like a classic text adventure, in {person}: say briefly where \
             {player_name} is and what can be seen and done there, name the way out and the \
             things worth a closer look, and answer what {player_name} tries plainly and \
             with dry wit.\n"
        )),
        NarrationStyle::Mixed => out.push_str(&format!(
            "- Tell each moment the way that suits it, in {person}: narration for places and \
             action, dialogue for talk, {}messages when people text or call. Mix them \
             freely.\n",
            // Thoughts only when the player wants to see them.
            if s.narration.inner_thoughts {
                "other characters' inner thoughts when they matter, and "
            } else {
                "and "
            }
        )),
    }
    if style != NarrationStyle::Mixed {
        out.push_str(
            "- That is the story's usual way of telling, not a rule: when a moment calls for \
             something else (a text exchange, a letter, a private thought, quick dialogue), \
             shift for it, then come back.\n",
        );
    }
    if let Some(notes) = s
        .narration
        .style_notes
        .as_deref()
        .map(str::trim)
        .filter(|n| !n.is_empty())
    {
        out.push_str(&format!("- How the player would like it told: {notes}\n"));
    }
    match s.narration.tense {
        Some(Tense::Present) => out.push_str("- Write in the present tense.\n"),
        Some(Tense::Past) => out.push_str("- Write in the past tense.\n"),
        None => {}
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
             kind when it fits.\n\
             - Write texts the way that person really texts: short and casual, in their own \
             voice, often several messages in a row rather than one long one. Use emoji, \
             slang, abbreviations, lowercase or typos only when they suit that person. When \
             time passes between messages, let the times move on.\n\
             - Calls sound like real speech: short lines, pauses, interruptions, people \
             talking over each other, background noise when it fits.\n\
             {}\n",
            if s.narration.quiet_phones {
                format!("- Only {player_name} starts texts and calls; others answer.")
            } else {
                format!(
                    "- Characters may text or call {player_name} first when they have their \
                     own reason to."
                )
            }
        ));
    }
    if s.narration.scene_headings {
        out.push_str(
            "\nSCENE HEADINGS\nWhen the story moves to a new place or a new time, start that part \
             with a heading the app shows above it: <scene place=\"Countryside\" time=\"7:11 PM\"/>. \
             Leave out whichever of the two stays the same, and use the story's own places. \
             No heading while the scene goes on.\n",
        );
    } else {
        out.push_str(
            "\nWHERE AND WHEN\nWhen the story moves to a new place or a new time, mark it where \
             that part starts: <scene place=\"Countryside\" time=\"7:11 PM\"/>. The app keeps \
             track of it and does not show it. Leave out whichever of the two stays the same, and \
             use the story's own places. No mark while the scene goes on.\n",
        );
    }
    if s.narration.dice {
        out.push_str(&dice_rules(s.narration.dice_rules.as_ref(), player_name));
    }
    if let Some(t) = &s.tracking {
        out.push_str(&tracking_section(t, player_name));
    }
    if !s.narration.manual_memory {
        out.push_str(&notes_contract(s.narration.language.as_deref()));
        out.push_str(&threads_contract(s.narration.language.as_deref()));
    }
    if !s.narration.no_suggestions {
        out.push_str(&next_moves_contract(
            player_name,
            s.narration.language.as_deref(),
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
    let mut world_given = !s.world.rules.is_empty();
    for (label, value) in [
        ("Setting", &s.world.setting),
        ("Era", &s.world.era),
        ("About", &s.world.description),
    ] {
        if !value.trim().is_empty() {
            world_given = true;
            out.push_str(&format!("{label}: {}\n", value.trim()));
        }
    }
    if !world_given {
        out.push_str(
            "Left open by the player: let it take shape from the opening and from what they do.\n",
        );
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
    out.push_str(
        "Anything not given here (looks, age, species and so on) is left open: don't bring it \
         up unless the story needs it or the player does, and once it is said, keep to it.\n",
    );

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
            let status = r.status.trim();
            out.push_str(&format!(
                "- {} → {}: {}{}\n",
                name_of(&r.from_id),
                name_of(&r.to_id),
                r.label,
                if status.is_empty() {
                    String::new()
                } else {
                    format!(" ({status})")
                }
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

    out.push_str(&notes_section(notes));

    let recaps = &frame.earlier_chapters;
    if !recaps.is_empty() {
        out.push_str("\nEARLIER CHAPTERS\n");
        let full_from = recaps.len().saturating_sub(MAX_RECAPS_IN_PROMPT);
        let brief_from = full_from.saturating_sub(MAX_BRIEF_RECAPS);
        if brief_from > 0 {
            out.push_str(&format!(
                "(Chapters 1 to {} are covered by the story summary and the notes.)\n",
                recaps[brief_from - 1].ordinal
            ));
        }
        if full_from > brief_from {
            out.push_str("In brief:\n");
            for r in &recaps[brief_from..full_from] {
                out.push_str(&format!(
                    "Chapter {}, {}: {}\n",
                    r.ordinal,
                    r.title.trim(),
                    brief(&r.recap)
                ));
            }
            out.push_str("In full:\n");
        }
        for r in &recaps[full_from..] {
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
        out.push_str(&crate::domain::events::chapter_heading(
            ch.ordinal, &ch.title,
        ));
        out.push('\n');
    }
    if let Some(plan) = frame.chapter_outline.as_deref().map(str::trim) {
        if !plan.is_empty() {
            out.push_str(&format!(
                "Chapter plan (only a guide: if the story has gone another way, follow the \
                 story and drop or rework the plan): {plan}\n"
            ));
        }
    }
    if !s.scene.location.trim().is_empty() {
        out.push_str(&format!("Location: {}\n", s.scene.location.trim()));
    }
    if !s.scene.time.trim().is_empty() {
        out.push_str(&format!("Time: {}\n", s.scene.time.trim()));
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
    if let Some(note) = s
        .narration
        .storyteller_note
        .as_deref()
        .map(str::trim)
        .filter(|n| !n.is_empty())
    {
        out.push_str(
            "\nTHE PLAYER'S NOTE TO YOU\n\
             Follow it in your replies from now on, until the player changes it. It is \
             about the story, not part of it: never quote it or mention it.\n",
        );
        out.push_str(note);
        out.push('\n');
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
                content: match p.story_text() {
                    t if t.trim().is_empty() => KEEP_GOING.to_string(),
                    t => t.into_owned(),
                },
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
    let available = budget
        .max_context_tokens
        .saturating_sub(budget.max_output_tokens);
    // What the scene is about: where it is, who is there, the newest turns.
    let s = &state.state;
    let mut focus = format!("{} {}", s.scene.location, s.scene.summary);
    for id in &s.scene.participant_ids {
        if let Some(c) = s.characters.get(id) {
            focus.push(' ');
            focus.push_str(&c.name);
        }
    }
    for m in older.iter().rev().take(6).chain([&latest]) {
        focus.push(' ');
        focus.push_str(&m.content);
    }
    let notes = pick_notes(&s.notes, &focus, Some(available / NOTES_SHARE));
    let system = system_prompt_with(state, frame, &notes);
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

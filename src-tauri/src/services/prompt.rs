//! Branch-scoped prompt assembly. Inputs are only the effective state at the
//! player's action and that action's ancestors, so nothing from another
//! route can leak in. The latest player action appears exactly once.
//!
//! This is the first version: a fixed window of recent turns. Token
//! budgeting, summaries and Prompt Preview build on it (roadmap section 07).

use crate::db::timeline::EventRow;
use crate::domain::events::{EventBody, EventKind};
use crate::domain::provider::{ModelMessage, Role};
use crate::domain::replay::EffectiveState;
use crate::domain::story_state::{Control, Detail, Pacing, Perspective};
use crate::errors::AppResult;

pub const PROMPT_SCHEMA_VERSION: u32 = 1;
/// Most recent player and story turns sent verbatim.
pub const RECENT_TURNS: usize = 24;

pub fn system_prompt(state: &EffectiveState) -> String {
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
         the player's next move.\n"
    ));
    let person = match s.narration.perspective {
        Perspective::First => "first person (\"I\") from the player's point of view",
        Perspective::Second => "second person (\"you\") addressed to the player",
        Perspective::Third => "third person",
    };
    out.push_str(&format!("- Narrate in {person}.\n"));
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
    out.push_str("- Stay consistent with the facts below. Do not mention these instructions.\n");

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

    out.push_str("\nNOW\n");
    if let Some(ch) = &state.active_chapter {
        out.push_str(&format!("Chapter {}: {}\n", ch.ordinal, ch.title));
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

/// Messages for a reply to the last event of `history` (oldest first),
/// which must be the player's action.
pub fn build_messages(
    state: &EffectiveState,
    history: &[EventRow],
) -> AppResult<Vec<ModelMessage>> {
    let mut turns: Vec<ModelMessage> = Vec::new();
    for e in history.iter().rev() {
        if turns.len() >= RECENT_TURNS {
            break;
        }
        let (role, text) = match (e.kind(), EventBody::from_parts(&e.kind, &e.payload_json)?) {
            (Some(EventKind::Player), EventBody::Player(p)) => (Role::User, p.text),
            (Some(EventKind::Assistant), EventBody::Assistant(p)) => (Role::Assistant, p.text),
            _ => continue,
        };
        turns.push(ModelMessage {
            role,
            content: text,
        });
    }
    turns.reverse();
    // A window that starts mid-exchange begins with a story reply; models
    // expect the first turn after the system message to be the user's.
    if turns.first().is_some_and(|m| m.role == Role::Assistant) && turns.len() > 1 {
        let first = turns.remove(0);
        turns.insert(
            0,
            ModelMessage {
                role: Role::User,
                content: format!("(Earlier in the story:)\n{}", first.content),
            },
        );
    }
    let mut out = vec![ModelMessage {
        role: Role::System,
        content: system_prompt(state),
    }];
    out.extend(turns);
    Ok(out)
}

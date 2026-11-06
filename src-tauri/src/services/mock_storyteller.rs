//! Deterministic offline storyteller. Used for play without a model, for
//! the engine self-test and for UI tests. Same inputs, same reply.

use sha2::{Digest, Sha256};

use crate::domain::replay::EffectiveState;
use crate::domain::story_state::Control;

pub const MOCK_PROVIDER_LABEL: &str = "Offline storyteller";

const OPENINGS: &[&str] = &[
    "The wind shifts, carrying salt and the faint sound of the harbor bell.",
    "For a moment nothing happens, and then the old floorboards creak.",
    "Somewhere below, a door closes softly.",
    "The light sweeps across the water, steady as a heartbeat.",
    "A gull lands on the railing and regards you with open suspicion.",
];

const TURNS: &[&str] = &[
    "{npc} would have something to say about this, you suspect.",
    "It feels like a small step closer to an answer.",
    "You make a mental note to ask around in the morning.",
    "The question of the letter tugs at you again.",
    "You are not sure yet whether this was a good idea.",
];

fn pick<'a>(items: &'a [&'a str], seed: &[u8], salt: u8) -> &'a str {
    let mut h = Sha256::new();
    h.update(seed);
    h.update([salt]);
    let d = h.finalize();
    items[d[0] as usize % items.len()]
}

/// A short reply that reflects the action, the scene and a known NPC.
pub fn reply(state: &EffectiveState, action: &str, turn: usize) -> String {
    let seed = format!("{turn}:{action}");
    let seed = seed.as_bytes();
    let npc = state
        .state
        .characters
        .values()
        .find(|c| c.control == Control::Npc)
        .map(|c| c.name.as_str())
        .unwrap_or("Someone");
    let action = action.trim();
    let quoted: String = action.chars().take(160).collect();
    let ellipsis = if action.chars().count() > 160 {
        "…"
    } else {
        ""
    };
    format!(
        "You decide: \"{quoted}{ellipsis}\"\n\n{} In {}, {}\n\n{}",
        pick(OPENINGS, seed, 1),
        lowercase_article(&state.state.scene.location),
        lowercase_first(&state.state.scene.summary),
        pick(TURNS, seed, 2).replace("{npc}", npc),
    )
}

/// "The lamp room" reads as "the lamp room" mid-sentence; proper names keep their case.
fn lowercase_article(s: &str) -> String {
    for article in ["The ", "A ", "An "] {
        if let Some(rest) = s.strip_prefix(article) {
            return format!("{}{rest}", article.to_lowercase());
        }
    }
    s.to_string()
}

fn lowercase_first(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        Some(f) => f.to_lowercase().collect::<String>() + c.as_str(),
        None => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::story_state::sample_lighthouse;

    #[test]
    fn deterministic_and_mentions_action() {
        let s = EffectiveState::new(sample_lighthouse());
        let a = reply(&s, "Open the letter", 3);
        assert_eq!(a, reply(&s, "Open the letter", 3));
        assert!(a.contains("Open the letter"));
        assert_ne!(a, reply(&s, "Close the door", 3));
    }

    #[test]
    fn articles_read_naturally_mid_sentence() {
        assert_eq!(lowercase_article("The lamp room"), "the lamp room");
        assert_eq!(lowercase_article("An old pier"), "an old pier");
        assert_eq!(lowercase_article("Wrenmouth harbor"), "Wrenmouth harbor");
        assert_eq!(lowercase_article("Theater row"), "Theater row");
    }
}

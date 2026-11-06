//! Deterministic offline storyteller. Used for play without a model, for
//! the engine self-test and for UI tests. Same inputs, same reply.
//!
//! It knows nothing about a particular world: it reacts to what kind of
//! action the player wrote, names a character who is present, and sets the
//! scene only on the first reply of a chapter, so it never repeats the
//! scene description turn after turn.

use sha2::{Digest, Sha256};

use crate::domain::replay::EffectiveState;
use crate::domain::story_state::{Character, Control};

pub const MOCK_PROVIDER_LABEL: &str = "Offline storyteller";

const BEATS: &[&str] = &[
    "For a moment nothing happens.",
    "Somewhere nearby, a door closes softly.",
    "The air shifts, and the mood of the place shifts with it.",
    "A small sound makes you pause: footsteps, then silence.",
    "The light changes as you move, and new shadows settle into the corners.",
    "Time seems to slow while you take it all in.",
];

const LOOK: &[&str] = &[
    "You take your time. Details you missed before come into focus, and one of them does not quite fit.",
    "Looking closer pays off: something here has been moved recently, and not carefully.",
    "You study it until the shape of a question forms, sharper than the one you started with.",
];

const TALK: &[&str] = &[
    "{npc} listens without interrupting, then answers slowly, as if deciding how much to share.",
    "{npc} raises an eyebrow. \"That,\" {npc_short} says, \"depends on who's asking.\"",
    "{npc} laughs, but it fades quickly. \"You really want to know?\"",
];

const TALK_ALONE: &[&str] = &[
    "Your words hang in the air. No one answers, but you have the feeling someone heard.",
    "You say it out loud, mostly to yourself. It sounds braver than it felt.",
];

const MOVE: &[&str] = &[
    "You set off. The place changes around you, and so does the feeling in your chest.",
    "A few steps are enough to see things from a different angle.",
    "You move on, and the way ahead turns out to be less simple than it looked.",
];

const HANDLE: &[&str] = &[
    "It takes a moment, but it gives. What you find is not what you expected.",
    "Your hands are steadier than you feel. It works, and now you have to decide what to do with it.",
    "It resists at first, then yields all at once.",
];

const OTHER: &[&str] = &[
    "It is not a big moment, but it changes something.",
    "You commit to it. Whatever happens next, there is no taking it back.",
    "It goes better than you feared and not quite as well as you hoped.",
];

const CLOSERS_NPC: &[&str] = &[
    "{npc} is watching to see what you do next.",
    "{npc} seems to be waiting for you to make the next move.",
];

const CLOSERS: &[&str] = &[
    "The next move is yours.",
    "Something here still does not add up.",
    "It feels like a small step closer to an answer.",
];

const LOOK_WORDS: &[&str] = &[
    "look",
    "examine",
    "search",
    "inspect",
    "read",
    "check",
    "study",
    "watch",
    "listen",
    "observe",
    "investigate",
    "peek",
    "glance",
    "stare",
    "notice",
];
const TALK_WORDS: &[&str] = &[
    "ask",
    "say",
    "says",
    "tell",
    "talk",
    "call",
    "greet",
    "answer",
    "reply",
    "whisper",
    "shout",
    "speak",
    "explain",
    "admit",
    "promise",
    "thank",
    "apologize",
    "introduce",
];
const MOVE_WORDS: &[&str] = &[
    "go", "walk", "run", "leave", "enter", "climb", "head", "follow", "return", "move", "step",
    "wander", "cross", "approach", "hurry", "sneak", "descend", "travel", "drive", "ride",
];
const HANDLE_WORDS: &[&str] = &[
    "take", "pick", "open", "grab", "give", "use", "pull", "push", "touch", "hold", "close",
    "unlock", "lift", "drop", "write", "fix", "repair", "light", "hide", "put",
];

fn pick<'a>(items: &'a [&'a str], seed: &[u8], salt: u8) -> &'a str {
    let mut h = Sha256::new();
    h.update(seed);
    h.update([salt]);
    let d = h.finalize();
    items[d[0] as usize % items.len()]
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ActionKind {
    Look,
    Talk,
    Move,
    Handle,
    Other,
}

fn classify(action: &str) -> ActionKind {
    let lower = action.to_lowercase();
    let words: Vec<&str> = lower
        .split(|c: char| !c.is_alphabetic())
        .filter(|w| !w.is_empty())
        .collect();
    // The first verb-like word decides; quoted speech counts as talking.
    if action.contains('"') || action.contains('“') {
        return ActionKind::Talk;
    }
    for w in &words {
        let stem = w.strip_suffix('s').unwrap_or(w);
        let is = |list: &[&str]| list.contains(w) || list.contains(&stem);
        if is(LOOK_WORDS) {
            return ActionKind::Look;
        }
        if is(TALK_WORDS) {
            return ActionKind::Talk;
        }
        if is(MOVE_WORDS) {
            return ActionKind::Move;
        }
        if is(HANDLE_WORDS) {
            return ActionKind::Handle;
        }
    }
    ActionKind::Other
}

/// An NPC who is in the scene, else any NPC.
fn present_npc(state: &EffectiveState) -> Option<&Character> {
    let s = &state.state;
    s.scene
        .participant_ids
        .iter()
        .filter_map(|id| s.characters.get(id))
        .find(|c| c.control == Control::Npc)
        .or_else(|| s.characters.values().find(|c| c.control == Control::Npc))
}

/// A short reply to `action`. `turn` is the number of the player's action
/// on the route; `opens_chapter` is true for the first reply after a
/// chapter starts, which also sets the scene.
pub fn reply(state: &EffectiveState, action: &str, turn: usize, opens_chapter: bool) -> String {
    let seed = format!("{turn}:{action}");
    let seed = seed.as_bytes();
    let npc = present_npc(state);
    let fill = |line: &str| match npc {
        Some(c) => line
            .replace("{npc_short}", short_pronoun(c))
            .replace("{npc}", c.name.trim()),
        None => line.to_string(),
    };

    let mut parts: Vec<String> = Vec::new();
    let scene = &state.state.scene;
    if opens_chapter && !scene.location.trim().is_empty() {
        let mut opening = format!("{}.", scene.location.trim().trim_end_matches('.'));
        if !scene.summary.trim().is_empty() {
            opening.push(' ');
            opening.push_str(scene.summary.trim());
        }
        parts.push(opening);
    }

    let response = match classify(action) {
        ActionKind::Look => pick(LOOK, seed, 2),
        ActionKind::Talk if npc.is_some() => pick(TALK, seed, 2),
        ActionKind::Talk => pick(TALK_ALONE, seed, 2),
        ActionKind::Move => pick(MOVE, seed, 2),
        ActionKind::Handle => pick(HANDLE, seed, 2),
        ActionKind::Other => pick(OTHER, seed, 2),
    };
    parts.push(format!("{} {}", pick(BEATS, seed, 1), fill(response)));

    let closer = if npc.is_some() && pick(&["npc", "plain"], seed, 4) == "npc" {
        fill(pick(CLOSERS_NPC, seed, 3))
    } else {
        pick(CLOSERS, seed, 3).to_string()
    };
    parts.push(closer);
    parts.join("\n\n")
}

/// "she", "he" or "they" from the character's pronouns.
fn short_pronoun(c: &Character) -> &'static str {
    match c.pronouns.as_deref().map(str::trim).map(str::to_lowercase) {
        Some(p) if p.starts_with("she") => "she",
        Some(p) if p.starts_with("he") => "he",
        _ => "they",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::story_state::sample_lighthouse;

    #[test]
    fn deterministic_and_reacts_to_the_action() {
        let s = EffectiveState::new(sample_lighthouse());
        let a = reply(&s, "Open the letter", 3, false);
        assert_eq!(a, reply(&s, "Open the letter", 3, false));
        assert_ne!(a, reply(&s, "Close the door", 4, false));
        assert!(
            !a.contains("Open the letter"),
            "the action is shown already"
        );
    }

    #[test]
    fn sets_the_scene_only_when_a_chapter_opens() {
        let s = EffectiveState::new(sample_lighthouse());
        let location = s.state.scene.location.clone();
        assert!(reply(&s, "Look around", 1, true).starts_with(location.trim_end_matches('.')));
        assert!(!reply(&s, "Look around", 2, false).contains(&location));
    }

    #[test]
    fn never_mentions_a_particular_world() {
        let s = EffectiveState::new(sample_lighthouse());
        for (i, action) in [
            "Look around",
            "Ask about the ship",
            "Go outside",
            "Take the key",
            "Wait",
        ]
        .iter()
        .enumerate()
        {
            let r = reply(&s, action, i, false).to_lowercase();
            for word in ["harbor", "gull", "letter", "salt", "lighthouse"] {
                assert!(!r.contains(word), "{action}: {r}");
            }
        }
    }

    #[test]
    fn talks_through_a_character_who_is_present() {
        let s = EffectiveState::new(sample_lighthouse());
        let npc = present_npc(&s).unwrap().name.clone();
        let r = reply(&s, "\"Who wrote this?\" I ask.", 5, false);
        assert!(r.contains(&npc), "{r}");
        assert_eq!(classify("Ask Mara about the storm"), ActionKind::Talk);
        assert_eq!(classify("I look out of the window"), ActionKind::Look);
        assert_eq!(classify("Walk to the door"), ActionKind::Move);
        assert_eq!(classify("Picks up the lamp"), ActionKind::Handle);
        assert_eq!(classify("Sigh"), ActionKind::Other);
    }
}

//! How the people in a story feel about the player: a line in their
//! relationship ("Warmer since you fixed the lamp") and, when the
//! storyteller keeps one, a heart (affection) or trust bar from 0 to 100.
//!
//! The storyteller writes them as tags at the end of a reply, and the reader
//! shows them on the "Memory updated" line under it:
//!
//! - `<bond name="Mara" heart="+10">Warmer since you fixed the lamp</bond>`
//!   moves Mara's heart bar up by 10 and sets the line;
//! - `trust="-15"` moves a trust bar instead, and `heart="70"` sets it;
//! - `<bond name="Mara">Wary of your questions</bond>` changes only the line.
//!
//! Replay applies the tags of each reply in order, like memory notes, so
//! every route keeps its own feelings. The player can drag a bar or change
//! the line in Story details, and undo what one reply wrote.

use super::story_state::{Bond, BondKind, Relationship, StoryStateV1, MAX_BOND, START_BOND};
use super::text::scan_tags;

/// The longest feeling line kept.
pub const MAX_LINE: usize = 160;
/// The most a bar moves in one tag; a bigger step is taken as this.
pub const MAX_STEP: i32 = 30;

/// How a tag moves a bar.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Move {
    /// Up or down by this much (`"+10"`, `"-5"`).
    By(i32),
    /// To this value (`"70"`).
    To(u8),
}

/// One `<bond>` tag in a reply.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BondTag {
    pub name: String,
    /// The bar it moves, when it moves one.
    pub bar: Option<(BondKind, Move)>,
    /// The new feeling line; empty leaves the line as it was.
    pub line: String,
}

fn one_line(s: &str, max: usize) -> String {
    s.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(max)
        .collect()
}

/// `"+10"`, `"-5"`, `"10"` (a value) or `"+"`/`"-"` (a small step).
fn parse_move(v: &str) -> Option<Move> {
    let v = v.trim().trim_end_matches('%');
    match v {
        "+" | "up" => return Some(Move::By(5)),
        "-" | "down" => return Some(Move::By(-5)),
        _ => {}
    }
    if let Some(n) = v.strip_prefix('+') {
        let n: i32 = n.trim().parse().ok()?;
        return Some(Move::By(n.clamp(0, MAX_STEP)));
    }
    if let Some(n) = v.strip_prefix(['-', '−']) {
        let n: i32 = n.trim().parse().ok()?;
        return Some(Move::By(-n.clamp(0, MAX_STEP)));
    }
    let n: i32 = v.parse().ok()?;
    Some(Move::To(n.clamp(0, i32::from(MAX_BOND)) as u8))
}

/// The `<bond>` tags in `text`, in order. A tag without a name, or one
/// still being written, is left out.
pub fn scan(text: &str) -> Vec<BondTag> {
    scan_tags(text, &["bond"])
        .iter()
        .filter_map(|t| {
            let name = one_line(t.attr("name").or_else(|| t.attr("who"))?, 80);
            if name.is_empty() {
                return None;
            }
            let bar = [("heart", BondKind::Heart), ("trust", BondKind::Trust)]
                .into_iter()
                .find_map(|(key, kind)| Some((kind, parse_move(t.attr(key)?)?)));
            let line = one_line(t.body, MAX_LINE);
            if bar.is_none() && line.is_empty() {
                return None;
            }
            Some(BondTag { name, bar, line })
        })
        .collect()
}

/// The id of the character `name` refers to: a whole name, or a first
/// name when only one person has it. Never the player.
pub fn character_id(state: &StoryStateV1, name: &str) -> Option<String> {
    let key = |s: &str| {
        s.split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .to_lowercase()
    };
    let wanted = key(name);
    let others = || {
        state
            .characters
            .values()
            .filter(|c| c.id != state.player_character_id)
    };
    if let Some(c) = others().find(|c| key(&c.name) == wanted) {
        return Some(c.id.clone());
    }
    let first = |s: &str| key(s).split(' ').next().unwrap_or_default().to_string();
    let mut by_first = others().filter(|c| first(&c.name) == wanted);
    match (by_first.next(), by_first.next()) {
        (Some(c), None) => Some(c.id.clone()),
        _ => None,
    }
}

/// Where the relationship from `id` to the player is kept.
pub fn towards_player(state: &StoryStateV1, id: &str) -> Option<usize> {
    state
        .relationships
        .iter()
        .position(|r| r.from_id == id && r.to_id == state.player_character_id)
}

/// The bar after `step`: a bar of another kind starts over from the middle.
pub fn moved(bond: Option<Bond>, kind: BondKind, step: Move) -> Bond {
    let from = match bond {
        Some(b) if b.kind == kind => i32::from(b.value),
        _ => i32::from(START_BOND),
    };
    let value = match step {
        Move::By(n) => (from + n).clamp(0, i32::from(MAX_BOND)) as u8,
        Move::To(v) => v,
    };
    Bond { kind, value }
}

/// Apply one tag; false when it names nobody in the story.
pub fn apply(state: &mut StoryStateV1, tag: &BondTag, event_id: &str) -> bool {
    let Some(id) = character_id(state, &tag.name) else {
        return false;
    };
    let i = match towards_player(state, &id) {
        Some(i) => i,
        None => {
            state.relationships.push(Relationship {
                from_id: id,
                to_id: state.player_character_id.clone(),
                label: String::new(),
                status: String::new(),
                source_event_id: Some(event_id.to_string()),
                bond: None,
            });
            state.relationships.len() - 1
        }
    };
    let r = &mut state.relationships[i];
    if let Some((kind, step)) = tag.bar {
        r.bond = Some(moved(r.bond, kind, step));
    }
    if !tag.line.is_empty() {
        r.status = tag.line.clone();
    }
    true
}

/// Apply the bond tags in one of the storyteller's replies.
pub fn apply_reply(state: &mut StoryStateV1, text: &str, event_id: &str) {
    for tag in scan(text) {
        apply(state, &tag, event_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::story_state::fixtures::lighthouse;

    #[test]
    fn reads_bond_tags() {
        let tags = scan(
            "She laughs.\n<bond name=\"Mara\" heart=\"+10\">Warmer since the lamp</bond>\n\
             <bond who=\"Mara\" trust=\"-50\"/><bond name=\"Mara\" heart=\"70\"></bond>\
             <bond name=\"\">nobody</bond><bond name=\"Mara\"></bond><bond name=\"Mara\" heart=\"lots\"/>",
        );
        assert_eq!(
            tags,
            vec![
                BondTag {
                    name: "Mara".into(),
                    bar: Some((BondKind::Heart, Move::By(10))),
                    line: "Warmer since the lamp".into(),
                },
                BondTag {
                    name: "Mara".into(),
                    bar: Some((BondKind::Trust, Move::By(-MAX_STEP))),
                    line: String::new(),
                },
                BondTag {
                    name: "Mara".into(),
                    bar: Some((BondKind::Heart, Move::To(70))),
                    line: String::new(),
                },
            ]
        );
        // One still being written is not read yet.
        assert!(scan("<bond name=\"Mara\" heart=\"+5\">Warm").is_empty());
    }

    #[test]
    fn moves_the_bar_and_the_line_towards_the_player() {
        let mut s = lighthouse();
        let before = s.relationships.clone();
        apply_reply(
            &mut s,
            "<bond name=\"mara\" heart=\"+10\">Warmer since you fixed the lamp</bond>",
            "e1",
        );
        // Wren's own feelings for Mara stay; Mara's for Wren are new.
        assert_eq!(s.relationships[0], before[0]);
        let r = &s.relationships[1];
        assert_eq!((r.from_id.as_str(), r.to_id.as_str()), ("npc-mara", "pc"));
        assert_eq!(r.status, "Warmer since you fixed the lamp");
        assert_eq!(r.source_event_id.as_deref(), Some("e1"));
        assert_eq!(
            r.bond,
            Some(Bond {
                kind: BondKind::Heart,
                value: 60
            })
        );
        apply_reply(
            &mut s,
            "<bond name=\"Mara\" heart=\"+30\"/><bond name=\"Mara\" heart=\"+30\"/>",
            "e2",
        );
        assert_eq!(s.relationships[1].bond.map(|b| b.value), Some(MAX_BOND));
        assert_eq!(s.relationships[1].status, "Warmer since you fixed the lamp");
        // A trust bar starts over from the middle.
        apply_reply(
            &mut s,
            "<bond name=\"Mara\" trust=\"-20\">Wary</bond>",
            "e3",
        );
        assert_eq!(
            s.relationships[1].bond,
            Some(Bond {
                kind: BondKind::Trust,
                value: 30
            })
        );
        assert_eq!(s.relationships.len(), 2);
        s.validate().unwrap();
        // Someone not in the story, or the player, is left alone.
        let was = s.clone();
        apply_reply(
            &mut s,
            "<bond name=\"Rowan\" heart=\"+5\"/><bond name=\"Wren\" heart=\"+5\"/>",
            "e4",
        );
        assert_eq!(s, was);
    }

    #[test]
    fn finds_people_by_first_name_only_when_it_is_theirs_alone() {
        let mut s = lighthouse();
        s.characters.get_mut("npc-mara").unwrap().name = "Mara Quill".into();
        assert_eq!(character_id(&s, "Mara").as_deref(), Some("npc-mara"));
        assert_eq!(character_id(&s, "mara  quill").as_deref(), Some("npc-mara"));
        let mut other = s.characters["npc-mara"].clone();
        other.id = "npc-2".into();
        other.name = "Mara Lin".into();
        s.characters.insert("npc-2".into(), other);
        assert_eq!(character_id(&s, "Mara"), None);
        assert_eq!(character_id(&s, "Wren"), None);
    }
}

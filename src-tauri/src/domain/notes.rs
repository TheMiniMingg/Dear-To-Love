//! Memory notes: the lasting things a long story must not forget, kept as
//! a small notebook in the story's state (people, places, items, events
//! and other facts), so every reply reads them however long the story gets.
//!
//! The storyteller writes them as tags at the end of a reply, and the
//! reader shows them as a "Memory updated" line under it:
//!
//! - `<remember person="Erika">Z's girlfriend since chapter 4. Wears the
//!   silver ring he gave her.</remember>` (or `place=`, `item=`, `event=`,
//!   `fact=`); writing a note with the same kind and name again replaces it;
//! - `<forget person="Erika"/>` when a note no longer applies.
//!
//! Replay applies the tags of each reply in order, like bars and items, so
//! every route, branch and retry keeps its own notebook. The player can
//! write, change and remove notes too (Story memory), and undo what one
//! reply wrote.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::text::tag_attrs;
use crate::errors::{AppError, AppResult};

/// Notes a story keeps; past this, new ones are not added (changes to
/// existing ones still are).
pub const MAX_NOTES: usize = 400;
pub const MAX_NOTE_NAME: usize = 80;
pub const MAX_NOTE_TEXT: usize = 800;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum NoteKind {
    /// Someone in the story: where things stand with them now.
    Person,
    /// A place and what it is like: a home, an office, a hideout.
    Place,
    /// Something that matters: a gift, a weapon, a key.
    Item,
    /// Something that happened, for the timeline.
    Event,
    /// Anything else that must stay true.
    Fact,
}

impl NoteKind {
    pub const ALL: [NoteKind; 5] = [
        NoteKind::Person,
        NoteKind::Place,
        NoteKind::Item,
        NoteKind::Event,
        NoteKind::Fact,
    ];

    /// The tag attribute: `person`, `place`, `item`, `event` or `fact`.
    pub fn attr(self) -> &'static str {
        match self {
            NoteKind::Person => "person",
            NoteKind::Place => "place",
            NoteKind::Item => "item",
            NoteKind::Event => "event",
            NoteKind::Fact => "fact",
        }
    }

    fn from_attr(key: &str) -> Option<NoteKind> {
        match key {
            "person" | "who" | "character" => Some(NoteKind::Person),
            "place" | "location" => Some(NoteKind::Place),
            "item" | "thing" | "object" => Some(NoteKind::Item),
            "event" => Some(NoteKind::Event),
            "fact" | "about" => Some(NoteKind::Fact),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct MemoryNote {
    pub kind: NoteKind,
    /// What the note is about: "Erika", "Z's house", "the silver ring". The
    /// same kind and name (ignoring case and spacing) is the same note.
    pub name: String,
    pub text: String,
    /// The chapter it was last written in.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub chapter: Option<u32>,
    /// The reply or edit that last wrote it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub source_event_id: Option<String>,
}

/// The key a note is found by: the name in lower case with single spaces.
pub fn note_key(name: &str) -> String {
    name.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

impl MemoryNote {
    pub fn is(&self, kind: NoteKind, name: &str) -> bool {
        self.kind == kind && note_key(&self.name) == note_key(name)
    }
}

/// One `<remember>` or `<forget>` tag from a reply.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NoteTag {
    Remember {
        kind: NoteKind,
        name: String,
        text: String,
    },
    Forget {
        kind: NoteKind,
        name: String,
    },
}

/// Whitespace runs become one space, cut to `max` characters.
fn clip(s: &str, max: usize) -> String {
    let one_line = s.split_whitespace().collect::<Vec<_>>().join(" ");
    one_line.chars().take(max).collect()
}

/// The kind and name a tag's attributes give: the first `person="…"`,
/// `place="…"` and so on, or `kind="place" name="…"`.
fn kind_and_name(attrs: &[(String, String)]) -> Option<(NoteKind, String)> {
    let named = attrs
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case("name"))
        .map(|(_, v)| v.trim());
    if let Some((_, kind)) = attrs.iter().find(|(k, _)| k.eq_ignore_ascii_case("kind")) {
        let kind = NoteKind::from_attr(&kind.trim().to_lowercase())?;
        let name = clip(named.unwrap_or_default(), MAX_NOTE_NAME);
        return (!name.is_empty()).then_some((kind, name));
    }
    attrs.iter().find_map(|(k, v)| {
        let kind = NoteKind::from_attr(&k.to_lowercase())?;
        let name = clip(v, MAX_NOTE_NAME);
        (!name.is_empty()).then_some((kind, name))
    })
}

/// The `<remember>` and `<forget>` tags in `text`, in order. A remember tag
/// without words, or one still being written, is left out.
pub fn scan(text: &str) -> Vec<NoteTag> {
    let mut out = Vec::new();
    let mut rest = text;
    while let Some(i) = rest.find('<') {
        let after = &rest[i + 1..];
        let tag = ["remember", "forget"].into_iter().find(|t| {
            after.starts_with(t) && after[t.len()..].starts_with([' ', '/', '>', '\n', '\t'])
        });
        let (Some(tag), Some(end)) = (tag, after.find('>')) else {
            rest = after;
            continue;
        };
        let head = &after[tag.len()..end];
        let tail = &after[end + 1..];
        let attrs = tag_attrs(head);
        let self_closing = head.trim_end().ends_with('/');
        let (body, next) = if self_closing {
            ("", tail)
        } else {
            let close = format!("</{tag}>");
            match tail.find(&close) {
                Some(j) => (&tail[..j], &tail[j + close.len()..]),
                None => {
                    // Unfinished: nothing after it is a note.
                    rest = "";
                    continue;
                }
            }
        };
        if let Some((kind, name)) = kind_and_name(&attrs) {
            if tag == "forget" {
                out.push(NoteTag::Forget { kind, name });
            } else {
                let text = clip(body, MAX_NOTE_TEXT);
                if !text.is_empty() {
                    out.push(NoteTag::Remember { kind, name, text });
                }
            }
        }
        rest = next;
    }
    out
}

/// Write `note` into `notes`: an existing note of the same kind and name is
/// replaced and moves to the end (newest last); a new one is added while
/// there is room.
pub fn upsert(notes: &mut Vec<MemoryNote>, note: MemoryNote) {
    if let Some(i) = notes.iter().position(|n| n.is(note.kind, &note.name)) {
        notes.remove(i);
    } else if notes.len() >= MAX_NOTES {
        return;
    }
    notes.push(note);
}

/// Remove the note of that kind and name, if there is one.
pub fn remove(notes: &mut Vec<MemoryNote>, kind: NoteKind, name: &str) -> bool {
    let before = notes.len();
    notes.retain(|n| !n.is(kind, name));
    notes.len() != before
}

/// Apply the note tags in one of the storyteller's replies.
pub fn apply_reply(notes: &mut Vec<MemoryNote>, text: &str, chapter: Option<u32>, event_id: &str) {
    for tag in scan(text) {
        match tag {
            NoteTag::Remember { kind, name, text } => upsert(
                notes,
                MemoryNote {
                    kind,
                    name,
                    text,
                    chapter,
                    source_event_id: Some(event_id.to_string()),
                },
            ),
            NoteTag::Forget { kind, name } => {
                remove(notes, kind, &name);
            }
        }
    }
}

/// Checks notes from storage or the frontend.
pub fn validate(notes: &[MemoryNote]) -> AppResult<()> {
    let bad = |msg: String| Err(AppError::invalid_input(msg));
    if notes.len() > MAX_NOTES {
        return bad(format!("a story keeps at most {MAX_NOTES} memory notes"));
    }
    let mut seen = std::collections::BTreeSet::new();
    for n in notes {
        let name = n.name.trim();
        if name.is_empty() || name.chars().count() > MAX_NOTE_NAME {
            return bad(format!(
                "every memory note needs a name of 1 to {MAX_NOTE_NAME} characters"
            ));
        }
        if n.text.trim().is_empty() || n.text.chars().count() > MAX_NOTE_TEXT {
            return bad(format!(
                "the note about {name} needs 1 to {MAX_NOTE_TEXT} characters"
            ));
        }
        if !seen.insert((n.kind, note_key(name))) {
            return bad(format!(
                "there are two {} notes about {name}",
                n.kind.attr()
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn note(kind: NoteKind, name: &str, text: &str) -> MemoryNote {
        MemoryNote {
            kind,
            name: name.into(),
            text: text.into(),
            chapter: None,
            source_event_id: None,
        }
    }

    #[test]
    fn reads_remember_and_forget_tags() {
        let tags = scan(
            "She slides it on. <remember person=\"Erika\">Z's girlfriend since chapter 4.\n\
             Wears his  silver ring.</remember>\n<remember place=\"Z's house\">Two floors, \
             suburbs.</remember><forget item=\"Old key\"/><remember kind=\"event\" \
             name=\"Ring given\">Z gave Erika a ring.</remember><remember person=\"\">x</remember>\
             <remember fact=\"Empty\"></remember><rememberance>no</rememberance>",
        );
        assert_eq!(
            tags,
            vec![
                NoteTag::Remember {
                    kind: NoteKind::Person,
                    name: "Erika".into(),
                    text: "Z's girlfriend since chapter 4. Wears his silver ring.".into(),
                },
                NoteTag::Remember {
                    kind: NoteKind::Place,
                    name: "Z's house".into(),
                    text: "Two floors, suburbs.".into(),
                },
                NoteTag::Forget {
                    kind: NoteKind::Item,
                    name: "Old key".into(),
                },
                NoteTag::Remember {
                    kind: NoteKind::Event,
                    name: "Ring given".into(),
                    text: "Z gave Erika a ring.".into(),
                },
            ]
        );
    }

    #[test]
    fn a_tag_still_being_written_is_not_a_note() {
        assert!(scan("Hi <remember person=\"Erika\">She is").is_empty());
        assert!(scan("Hi <remember person=\"Eri").is_empty());
    }

    #[test]
    fn the_same_name_replaces_and_forget_removes() {
        let mut notes = Vec::new();
        apply_reply(
            &mut notes,
            "<remember person=\"Erika\">Wary of Z.</remember>\
             <remember place=\"Office\">Top floor.</remember>",
            Some(1),
            "e1",
        );
        apply_reply(
            &mut notes,
            "<remember person=\"  erika \">Dating Z; wears his ring.</remember>",
            Some(4),
            "e2",
        );
        assert_eq!(notes.len(), 2);
        // The newest note is last.
        assert_eq!(notes[1].name, "  erika ".trim());
        assert_eq!(notes[1].text, "Dating Z; wears his ring.");
        assert_eq!(notes[1].chapter, Some(4));
        assert_eq!(notes[1].source_event_id.as_deref(), Some("e2"));
        // A person and a place may share a name.
        apply_reply(
            &mut notes,
            "<remember place=\"Erika\">A ship.</remember><forget place=\"office\"/>",
            None,
            "e3",
        );
        assert_eq!(
            notes.iter().map(|n| n.name.as_str()).collect::<Vec<_>>(),
            ["erika", "Erika"]
        );
    }

    #[test]
    fn a_full_notebook_still_takes_changes() {
        let mut notes: Vec<_> = (0..MAX_NOTES)
            .map(|i| note(NoteKind::Fact, &format!("n{i}"), "x"))
            .collect();
        upsert(&mut notes, note(NoteKind::Fact, "new", "y"));
        assert_eq!(notes.len(), MAX_NOTES);
        assert!(!notes.iter().any(|n| n.name == "new"));
        upsert(&mut notes, note(NoteKind::Fact, "N0", "changed"));
        assert_eq!(notes.len(), MAX_NOTES);
        assert_eq!(notes.last().unwrap().text, "changed");
    }

    #[test]
    fn long_names_and_text_are_cut() {
        let long = "a".repeat(MAX_NOTE_TEXT + 50);
        let name = "b".repeat(MAX_NOTE_NAME + 5);
        let tags = scan(&format!("<remember fact=\"{name}\">{long}</remember>"));
        let NoteTag::Remember { name, text, .. } = &tags[0] else {
            panic!("expected a note")
        };
        assert_eq!(name.chars().count(), MAX_NOTE_NAME);
        assert_eq!(text.chars().count(), MAX_NOTE_TEXT);
    }

    #[test]
    fn validation_refuses_duplicates_and_empty_notes() {
        assert!(validate(&[note(NoteKind::Person, "Erika", "x")]).is_ok());
        assert!(validate(&[
            note(NoteKind::Person, "Erika", "x"),
            note(NoteKind::Person, "ERIKA", "y")
        ])
        .is_err());
        assert!(validate(&[note(NoteKind::Person, " ", "x")]).is_err());
        assert!(validate(&[note(NoteKind::Person, "Erika", "  ")]).is_err());
    }
}

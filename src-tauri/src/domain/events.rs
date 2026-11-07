//! Event kinds and payloads. Committed events never mutate.

use std::borrow::Cow;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::dice::DiceRoll;
use super::notes::{MemoryNote, NoteKind};
use super::story_state::{Character, KnownFact, Narration, Relationship, Scene, World};
use super::text::plain_message_tags;
use super::tracking::Tracking;
use crate::errors::{AppError, AppResult};

/// Current payload version written to `events.payload_version`.
pub const EVENT_PAYLOAD_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum EventKind {
    ChapterStart,
    Player,
    Assistant,
    Edit,
    Checkpoint,
    FactConfirm,
}

impl EventKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ChapterStart => "chapter_start",
            Self::Player => "player",
            Self::Assistant => "assistant",
            Self::Edit => "edit",
            Self::Checkpoint => "checkpoint",
            Self::FactConfirm => "fact_confirm",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        Some(match s {
            "chapter_start" => Self::ChapterStart,
            "player" => Self::Player,
            "assistant" => Self::Assistant,
            "edit" => Self::Edit,
            "checkpoint" => Self::Checkpoint,
            "fact_confirm" => Self::FactConfirm,
            _ => return None,
        })
    }
}

/// Payload of a `chapter_start` event. Chapters belong to route history,
/// not to the (optional) authored outline.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct ChapterStartPayload {
    pub chapter_instance_id: String,
    pub title: String,
    pub ordinal: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub source_outline_id: Option<String>,
    /// What happened in the chapter before this one, written when the
    /// player ended it with **End chapter**. Later chapters read it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub previous_chapter_recap: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct PlayerPayload {
    /// What the player wrote. May be empty when the action is a roll.
    pub text: String,
    /// A roll the app made for this action.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub roll: Option<DiceRoll>,
}

impl PlayerPayload {
    pub fn new(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            roll: None,
        }
    }

    /// The action as the storyteller reads it: the roll as a tag, then
    /// the player's words.
    /// Roll, meter and item tags typed into the words are dropped: only the
    /// app's roll and the storyteller's changes count.
    pub fn story_text(&self) -> Cow<'_, str> {
        let words = if super::text::has_app_tags(&self.text) {
            Cow::Owned(super::text::strip_app_tags(&self.text))
        } else {
            Cow::Borrowed(self.text.as_str())
        };
        match &self.roll {
            None => words,
            Some(r) if words.trim().is_empty() => Cow::Owned(r.tag()),
            Some(r) => Cow::Owned(format!("{}\n\n{}", r.tag(), words)),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct AssistantPayload {
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub finish_reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub provider_label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub model_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct CheckpointPayload {
    pub label: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct FactConfirmPayload {
    pub fact: KnownFact,
}

/// One explicit change to structured story state, effective from the
/// `edit` event forward on that branch only.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "op", rename_all = "camelCase", rename_all_fields = "camelCase")]
#[ts(export)]
pub enum StateEdit {
    SetWorld {
        world: World,
    },
    SetNarration {
        narration: Narration,
    },
    UpsertCharacter {
        character: Character,
    },
    /// Removes an NPC and every relationship, fact and scene reference to it.
    RemoveCharacter {
        character_id: String,
    },
    SetRelationships {
        relationships: Vec<Relationship>,
    },
    UpsertFact {
        fact: KnownFact,
    },
    RemoveFact {
        fact_id: String,
    },
    SetScene {
        scene: Scene,
    },
    SetOpenThreads {
        open_threads: Vec<String>,
    },
    SetVisualRef {
        slot: String,
        asset_id: Option<String>,
    },
    /// Bars, counters and the inventory as they are from here on; `None`
    /// stops keeping them.
    SetTracking {
        #[ts(optional)]
        tracking: Option<Tracking>,
    },
    /// Write a memory note, replacing the one of the same kind and name.
    UpsertNote {
        note: MemoryNote,
    },
    RemoveNote {
        kind: NoteKind,
        name: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct EditPayload {
    pub changes: Vec<StateEdit>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub note: Option<String>,
}

/// An event's kind together with its typed payload.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", content = "payload", rename_all = "snake_case")]
#[ts(export)]
pub enum EventBody {
    ChapterStart(ChapterStartPayload),
    Player(PlayerPayload),
    Assistant(AssistantPayload),
    Edit(EditPayload),
    Checkpoint(CheckpointPayload),
    FactConfirm(FactConfirmPayload),
}

const MAX_PLAYER_TEXT: usize = 20_000;
const MAX_ASSISTANT_TEXT: usize = 200_000;
const MAX_LABEL: usize = 200;

/// "Chapter 2: The Lamp Room", or only "Chapter 2" when that is all the
/// title says (a chapter the player left unnamed is called "Chapter 2").
pub fn chapter_heading(ordinal: u32, title: &str) -> String {
    let title = title.trim();
    if title.is_empty() || title == format!("Chapter {ordinal}") {
        format!("Chapter {ordinal}")
    } else {
        format!("Chapter {ordinal}: {title}")
    }
}

impl EventBody {
    pub fn kind(&self) -> EventKind {
        match self {
            Self::ChapterStart(_) => EventKind::ChapterStart,
            Self::Player(_) => EventKind::Player,
            Self::Assistant(_) => EventKind::Assistant,
            Self::Edit(_) => EventKind::Edit,
            Self::Checkpoint(_) => EventKind::Checkpoint,
            Self::FactConfirm(_) => EventKind::FactConfirm,
        }
    }

    /// JSON stored in `events.payload_json` (payload only, no kind tag).
    pub fn payload_json(&self) -> String {
        let r = match self {
            Self::ChapterStart(p) => serde_json::to_string(p),
            Self::Player(p) => serde_json::to_string(p),
            Self::Assistant(p) => serde_json::to_string(p),
            Self::Edit(p) => serde_json::to_string(p),
            Self::Checkpoint(p) => serde_json::to_string(p),
            Self::FactConfirm(p) => serde_json::to_string(p),
        };
        r.expect("event payloads always serialize")
    }

    pub fn from_parts(kind: &str, payload_json: &str) -> AppResult<Self> {
        let kind = EventKind::parse(kind)
            .ok_or_else(|| AppError::internal(format!("unknown event kind {kind}")))?;
        let bad =
            |e: serde_json::Error| AppError::internal(format!("corrupt {kind:?} payload: {e}"));
        Ok(match kind {
            EventKind::ChapterStart => {
                Self::ChapterStart(serde_json::from_str(payload_json).map_err(bad)?)
            }
            EventKind::Player => Self::Player(serde_json::from_str(payload_json).map_err(bad)?),
            EventKind::Assistant => {
                Self::Assistant(serde_json::from_str(payload_json).map_err(bad)?)
            }
            EventKind::Edit => Self::Edit(serde_json::from_str(payload_json).map_err(bad)?),
            EventKind::Checkpoint => {
                Self::Checkpoint(serde_json::from_str(payload_json).map_err(bad)?)
            }
            EventKind::FactConfirm => {
                Self::FactConfirm(serde_json::from_str(payload_json).map_err(bad)?)
            }
        })
    }

    /// The words a reader sees for this event, for search and bookmark
    /// excerpts, with texts, calls and rolls written out as words. An edit
    /// shows only its note.
    pub fn reader_text(&self) -> Cow<'_, str> {
        match self {
            Self::ChapterStart(p) => Cow::Owned(chapter_heading(p.ordinal, &p.title)),
            Self::Player(p) => Cow::Owned(plain_message_tags(&p.story_text())),
            Self::Assistant(p) => Cow::Owned(plain_message_tags(&p.text)),
            Self::Edit(p) => Cow::Borrowed(p.note.as_deref().unwrap_or_default()),
            Self::Checkpoint(p) => Cow::Borrowed(&p.label),
            Self::FactConfirm(p) => Cow::Borrowed(&p.fact.text),
        }
    }

    /// Structural validation before an event is committed.
    pub fn validate(&self) -> AppResult<()> {
        let bad = |m: &str| Err(AppError::invalid_input(m.to_string()));
        let len = |s: &str| s.chars().count();
        match self {
            Self::ChapterStart(p) => {
                if p.title.trim().is_empty() || len(&p.title) > MAX_LABEL {
                    return bad("chapter title must be 1 to 200 characters");
                }
                if p.ordinal == 0 {
                    return bad("chapter ordinal starts at 1");
                }
            }
            Self::Player(p) => {
                if let Some(roll) = &p.roll {
                    roll.validate()?;
                } else if p.text.trim().is_empty() {
                    return bad("action text must not be empty");
                }
                if len(&p.text) > MAX_PLAYER_TEXT {
                    return bad("action text is too long");
                }
            }
            Self::Assistant(p) => {
                if p.text.trim().is_empty() {
                    return bad("story reply must not be empty");
                }
                if len(&p.text) > MAX_ASSISTANT_TEXT {
                    return bad("story reply is too long");
                }
            }
            Self::Edit(p) => {
                if p.changes.is_empty() {
                    return bad("an edit needs at least one change");
                }
            }
            Self::Checkpoint(p) => {
                if p.label.trim().is_empty() || len(&p.label) > MAX_LABEL {
                    return bad("checkpoint label must be 1 to 200 characters");
                }
            }
            Self::FactConfirm(p) => {
                if p.fact.id.trim().is_empty() || p.fact.text.trim().is_empty() {
                    return bad("a confirmed fact needs an id and text");
                }
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn body_round_trips_through_storage_parts() {
        let bodies = [
            EventBody::Player(PlayerPayload::new("Hi")),
            EventBody::Edit(EditPayload {
                changes: vec![StateEdit::SetOpenThreads {
                    open_threads: vec!["x".into()],
                }],
                note: None,
            }),
        ];
        for b in bodies {
            let back = EventBody::from_parts(b.kind().as_str(), &b.payload_json()).unwrap();
            assert_eq!(back, b);
        }
    }

    #[test]
    fn tagged_json_shape_for_frontend() {
        let b = EventBody::Edit(EditPayload {
            changes: vec![StateEdit::RemoveCharacter {
                character_id: "npc".into(),
            }],
            note: None,
        });
        let v = serde_json::to_value(&b).unwrap();
        assert_eq!(v["kind"], "edit");
        assert_eq!(v["payload"]["changes"][0]["op"], "removeCharacter");
        assert_eq!(v["payload"]["changes"][0]["characterId"], "npc");
    }

    #[test]
    fn rejects_empty_text() {
        assert!(EventBody::Player(PlayerPayload::new("  "))
            .validate()
            .is_err());
    }
}

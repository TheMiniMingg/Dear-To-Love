//! Event kinds and payloads. Committed events never mutate.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

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
}

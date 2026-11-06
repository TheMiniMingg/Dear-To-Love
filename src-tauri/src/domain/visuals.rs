//! Picture slots: where an image from the library shows in a story.
//!
//! The same slot names are used by story defaults (`asset_links` rows) and
//! by route-specific `setVisualRef` edits. On a route, its own choice wins
//! over the story default from the edit forward.

use crate::errors::{AppError, AppResult};

pub const COVER: &str = "cover";
pub const BACKGROUND: &str = "background";
pub const PORTRAIT_PREFIX: &str = "portrait:";

const MAX_CHARACTER_ID: usize = 128;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum VisualSlot {
    /// Shown in the Library. Story-wide only.
    Cover,
    /// The scene picture above the story.
    Background,
    /// A character's portrait, by character id.
    Portrait(String),
}

impl VisualSlot {
    pub fn parse(slot: &str) -> AppResult<Self> {
        match slot {
            COVER => Ok(Self::Cover),
            BACKGROUND => Ok(Self::Background),
            s => match s.strip_prefix(PORTRAIT_PREFIX) {
                Some(id)
                    if !id.is_empty()
                        && id.chars().count() <= MAX_CHARACTER_ID
                        && !id.chars().any(|c| c.is_control() || c.is_whitespace()) =>
                {
                    Ok(Self::Portrait(id.to_string()))
                }
                _ => Err(AppError::invalid_input(format!(
                    "unknown picture slot {slot:?} (expected cover, background or portrait:<character id>)"
                ))),
            },
        }
    }

    pub fn key(&self) -> String {
        match self {
            Self::Cover => COVER.into(),
            Self::Background => BACKGROUND.into(),
            Self::Portrait(id) => format!("{PORTRAIT_PREFIX}{id}"),
        }
    }

    /// `(owner_type, owner_id, variant)` of the story-default row.
    pub fn link_owner<'a>(&'a self, story_id: &'a str) -> (&'static str, &'a str, &'static str) {
        match self {
            Self::Cover => ("story", story_id, COVER),
            Self::Background => ("story", story_id, BACKGROUND),
            Self::Portrait(id) => ("character", id, "portrait"),
        }
    }

    pub fn from_link(owner_type: &str, owner_id: &str, variant: &str) -> Option<Self> {
        match (owner_type, variant) {
            ("story", COVER) => Some(Self::Cover),
            ("story", BACKGROUND) => Some(Self::Background),
            ("character", "portrait") => Some(Self::Portrait(owner_id.to_string())),
            _ => None,
        }
    }

    /// Covers belong to the whole story (the Library), never to one route.
    pub fn route_scoped(&self) -> bool {
        !matches!(self, Self::Cover)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slots_round_trip_through_keys_and_links() {
        for key in [
            "cover",
            "background",
            "portrait:mara",
            "portrait:custom:npc-1",
        ] {
            let slot = VisualSlot::parse(key).unwrap();
            assert_eq!(slot.key(), key);
            let (t, o, v) = slot.link_owner("story-1");
            assert_eq!(VisualSlot::from_link(t, o, v), Some(slot));
        }
        assert!(!VisualSlot::Cover.route_scoped());
        assert!(VisualSlot::Background.route_scoped());
    }

    #[test]
    fn rejects_unknown_or_malformed_slots() {
        for bad in ["", "Cover", "portrait:", "portrait:a b", "outfit:mara"] {
            assert!(VisualSlot::parse(bad).is_err(), "{bad:?}");
        }
    }
}

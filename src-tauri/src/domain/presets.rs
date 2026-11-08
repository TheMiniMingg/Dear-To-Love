//! A player's own presets: the world, cast, rules and style of a story they
//! made, kept without its turns so they can start fresh from it or share it
//! as a file. A preset is the creation wizard's draft, so starting from one
//! is exactly like finishing the wizard.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::domain::draft::CreateStoryDraft;
use crate::domain::story_state::{Character, Control, StoryStateV1};
use crate::domain::templates::SceneTemplate;

/// What a shared preset file says it is.
pub const PRESET_FORMAT: &str = "dear-to-love-preset";
/// Bumped when the file's shape changes in a way old versions cannot read.
pub const PRESET_FORMAT_VERSION: u32 = 1;
/// The extension of a shared preset file.
pub const PRESET_EXTENSION: &str = "dtlpreset";
/// A preset name as kept: 1 to 80 characters, one line.
pub const MAX_PRESET_NAME: usize = 80;

/// A saved preset, as the Preset Story screen lists it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct UserPreset {
    pub id: String,
    pub name: String,
    /// The story it was saved from, for the card; empty for an imported one.
    pub from_story_title: String,
    pub created_at: String,
    pub draft: CreateStoryDraft,
}

/// A preset as a file another copy of the app can import (`.dtlpreset`).
/// It holds the draft only: no keys, connections, pictures or settings.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PresetFile {
    pub format: String,
    pub format_version: u32,
    pub name: String,
    pub draft: CreateStoryDraft,
}

impl PresetFile {
    pub fn new(name: &str, draft: CreateStoryDraft) -> Self {
        Self {
            format: PRESET_FORMAT.into(),
            format_version: PRESET_FORMAT_VERSION,
            name: name.into(),
            draft,
        }
    }
}

/// A preset name as it is kept: trimmed, one line, 1 to 80 characters.
pub fn clean_preset_name(name: &str) -> Option<String> {
    let name = name.split_whitespace().collect::<Vec<_>>().join(" ");
    (!name.is_empty() && name.chars().count() <= MAX_PRESET_NAME).then_some(name)
}

/// The wizard draft that would make a story like this one as it stands
/// now: its world, narration (without the note to the storyteller), cast,
/// relationships, scene, open threads and tracking. Turns, memory notes,
/// established facts and pictures stay with the story. Meters with a
/// maximum start full again; counters and items are kept as they are.
pub fn draft_from_state(
    title: &str,
    description: &str,
    first_chapter_title: &str,
    state: &StoryStateV1,
) -> CreateStoryDraft {
    let base = CreateStoryDraft::default();
    let mut player = state
        .characters
        .get(&state.player_character_id)
        .cloned()
        .unwrap_or_else(|| base.player.clone());
    player.control = Control::Player;
    let npcs: Vec<Character> = state
        .characters
        .values()
        .filter(|c| c.id != state.player_character_id)
        .cloned()
        .map(|mut c| {
            c.control = Control::Npc;
            c
        })
        .collect();
    let mut narration = state.narration.clone();
    narration.storyteller_note = None;
    let tracking = state.tracking.clone().map(|mut tr| {
        for m in &mut tr.meters {
            if let Some(max) = m.max {
                m.value = max;
            }
        }
        tr
    });
    CreateStoryDraft {
        title: title.trim().to_string(),
        description: description.trim().to_string(),
        world: state.world.clone(),
        narration,
        player,
        npcs,
        relationships: state.relationships.clone(),
        scene: SceneTemplate {
            location: state.scene.location.clone(),
            summary: state.scene.summary.clone(),
        },
        open_threads: state.open_threads.clone(),
        first_chapter_title: first_chapter_title.trim().to_string(),
        tracking,
        ..base
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::story_state::sample_lighthouse;
    use crate::domain::tracking::{Meter, Tracking};

    #[test]
    fn a_preset_keeps_the_setup_and_leaves_the_play_behind() {
        let mut state = sample_lighthouse();
        state.narration.storyteller_note = Some("slow down".into());
        state.open_threads = vec!["Who sent the letter?".into()];
        state.tracking = Some(Tracking {
            meters: vec![
                Meter {
                    name: "Health".into(),
                    value: 40,
                    max: Some(100),
                    who: None,
                },
                Meter {
                    name: "Gold".into(),
                    value: 35,
                    max: None,
                    who: None,
                },
            ],
            inventory: false,
            items: vec![],
        });
        let player_name = state.characters[&state.player_character_id].name.clone();
        let others = state.characters.len() - 1;
        let d = draft_from_state("Harbor Town", "A letter arrives.", "Chapter 1", &state);
        assert_eq!(d.title, "Harbor Town");
        assert_eq!(d.description, "A letter arrives.");
        assert_eq!(d.player.name, player_name);
        assert_eq!(d.player.control, Control::Player);
        assert_eq!(d.npcs.len(), others);
        assert!(d.npcs.iter().all(|c| c.control == Control::Npc));
        assert_eq!(d.scene.location, state.scene.location);
        assert_eq!(d.open_threads, vec!["Who sent the letter?".to_string()]);
        assert_eq!(d.narration.storyteller_note, None);
        let meters = &d.tracking.as_ref().unwrap().meters;
        assert_eq!(meters[0].value, 100, "a bar starts full again");
        assert_eq!(meters[1].value, 35, "a counter keeps its value");
        assert_eq!(d.first_chapter_title, "Chapter 1");
        assert!(d.chapter_outlines.is_empty());
        assert!(d.pictures.is_empty());
    }

    #[test]
    fn preset_names_are_one_tidy_line() {
        assert_eq!(
            clean_preset_name("  My   world \n"),
            Some("My world".into())
        );
        assert_eq!(clean_preset_name("   "), None);
        assert_eq!(clean_preset_name(&"x".repeat(81)), None);
    }
}

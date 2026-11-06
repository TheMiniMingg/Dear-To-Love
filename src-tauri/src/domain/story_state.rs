//! `StoryStateV1`: the canonical structured state of a story at an event.
//!
//! `stories.base_state_json` holds the original configuration. Events from
//! the route history (`chapter_start`, `edit`, `fact_confirm`) modify the
//! effective state from that event forward. Narrative prose never silently
//! changes these fields.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use ts_rs::TS;

use crate::errors::{AppError, AppResult};

pub const STORY_STATE_SCHEMA_VERSION: u32 = 1;
const MAX_TEXT: usize = 20_000;
const MAX_LIST: usize = 200;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct StoryStateV1 {
    pub schema_version: u32,
    pub player_character_id: String,
    pub world: World,
    pub narration: Narration,
    /// Keyed by character id. BTreeMap keeps serialization canonical.
    pub characters: BTreeMap<String, Character>,
    pub relationships: Vec<Relationship>,
    pub known_facts: Vec<KnownFact>,
    pub scene: Scene,
    pub open_threads: Vec<String>,
    /// Optional asset ids by slot (e.g. `"cover"`, `"background"`).
    pub visual_refs: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct World {
    pub era: String,
    pub setting: String,
    pub description: String,
    pub rules: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Perspective {
    First,
    Second,
    Third,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Detail {
    Brief,
    Balanced,
    Detailed,
    Cinematic,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Pacing {
    Fast,
    Normal,
    Slow,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct Narration {
    pub perspective: Perspective,
    pub detail: Detail,
    pub tone: String,
    pub pacing: Pacing,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Control {
    Player,
    Npc,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct Character {
    pub id: String,
    pub name: String,
    pub control: Control,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub gender: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub pronouns: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub age: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub role: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub appearance: Option<String>,
    #[serde(default)]
    pub personality: Vec<String>,
    #[serde(default)]
    pub goals: Vec<String>,
    #[serde(default)]
    pub abilities: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct Relationship {
    pub from_id: String,
    pub to_id: String,
    pub label: String,
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub source_event_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct KnownFact {
    pub id: String,
    pub text: String,
    pub known_by: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub source_event_id: Option<String>,
    pub confirmed: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct Scene {
    pub location: String,
    pub summary: String,
    pub participant_ids: Vec<String>,
}

impl StoryStateV1 {
    /// Parse and validate JSON from storage or the frontend.
    pub fn from_json(json: &str) -> AppResult<Self> {
        let state: Self = serde_json::from_str(json)
            .map_err(|e| AppError::invalid_input(format!("invalid story state: {e}")))?;
        state.validate()?;
        Ok(state)
    }

    /// Canonical serialization: fixed struct field order and sorted maps.
    pub fn to_canonical_json(&self) -> String {
        serde_json::to_string(self).expect("StoryStateV1 always serializes")
    }

    /// SHA-256 of the canonical serialization, hex encoded.
    pub fn state_hash(&self) -> String {
        hex::encode(Sha256::digest(self.to_canonical_json().as_bytes()))
    }

    pub fn validate(&self) -> AppResult<()> {
        let bad = |msg: String| Err(AppError::invalid_input(msg));
        if self.schema_version != STORY_STATE_SCHEMA_VERSION {
            return bad(format!(
                "unsupported story state schema version {}",
                self.schema_version
            ));
        }
        for (key, c) in &self.characters {
            if key != &c.id {
                return bad(format!("character key {key} does not match id {}", c.id));
            }
            if c.id.trim().is_empty() || c.name.trim().is_empty() {
                return bad("every character needs an id and a name".into());
            }
            check_list("personality", &c.personality)?;
            check_list("goals", &c.goals)?;
            check_list("abilities", &c.abilities)?;
            for text in [
                &c.gender,
                &c.pronouns,
                &c.age,
                &c.role,
                &c.description,
                &c.appearance,
            ]
            .into_iter()
            .flatten()
            {
                check_text("character field", text)?;
            }
        }
        match self.characters.get(&self.player_character_id) {
            Some(c) if c.control == Control::Player => {}
            Some(_) => return bad("the player character must have control \"player\"".into()),
            None => return bad("player character is missing from the roster".into()),
        }
        let ids: BTreeSet<&str> = self.characters.keys().map(String::as_str).collect();
        let known = |id: &str| ids.contains(id);
        for r in &self.relationships {
            if !known(&r.from_id) || !known(&r.to_id) {
                return bad(format!(
                    "relationship {} -> {} references an unknown character",
                    r.from_id, r.to_id
                ));
            }
        }
        let mut fact_ids = BTreeSet::new();
        for f in &self.known_facts {
            if !fact_ids.insert(f.id.as_str()) {
                return bad(format!("duplicate fact id {}", f.id));
            }
            check_text("fact", &f.text)?;
            if let Some(unknown) = f.known_by.iter().find(|id| !known(id)) {
                return bad(format!(
                    "fact {} is known by unknown character {unknown}",
                    f.id
                ));
            }
        }
        if let Some(unknown) = self.scene.participant_ids.iter().find(|id| !known(id)) {
            return bad(format!("scene participant {unknown} is not in the roster"));
        }
        for text in [
            &self.world.era,
            &self.world.setting,
            &self.world.description,
            &self.narration.tone,
            &self.scene.location,
            &self.scene.summary,
        ] {
            check_text("text field", text)?;
        }
        check_list("world rules", &self.world.rules)?;
        check_list("open threads", &self.open_threads)?;
        Ok(())
    }
}

fn check_text(what: &str, text: &str) -> AppResult<()> {
    if text.chars().count() > MAX_TEXT {
        return Err(AppError::invalid_input(format!(
            "{what} is longer than {MAX_TEXT} characters"
        )));
    }
    Ok(())
}

fn check_list(what: &str, items: &[String]) -> AppResult<()> {
    if items.len() > MAX_LIST {
        return Err(AppError::invalid_input(format!(
            "{what} has more than {MAX_LIST} entries"
        )));
    }
    items.iter().try_for_each(|t| check_text(what, t))
}

#[cfg(test)]
pub mod fixtures {
    use super::*;

    /// A small, fictional, original story state used across tests.
    pub fn lighthouse() -> StoryStateV1 {
        let mut characters = BTreeMap::new();
        characters.insert(
            "pc".to_string(),
            Character {
                id: "pc".into(),
                name: "Wren".into(),
                control: Control::Player,
                gender: None,
                pronouns: Some("they/them".into()),
                age: None,
                role: Some("Lighthouse keeper".into()),
                description: None,
                appearance: None,
                personality: vec!["curious".into()],
                goals: vec!["Find out who keeps lighting the lamp".into()],
                abilities: vec![],
            },
        );
        characters.insert(
            "npc-mara".to_string(),
            Character {
                id: "npc-mara".into(),
                name: "Mara".into(),
                control: Control::Npc,
                gender: None,
                pronouns: Some("she/her".into()),
                age: None,
                role: Some("Ferry captain".into()),
                description: None,
                appearance: None,
                personality: vec!["wry".into()],
                goals: vec![],
                abilities: vec![],
            },
        );
        StoryStateV1 {
            schema_version: 1,
            player_character_id: "pc".into(),
            world: World {
                era: "Modern".into(),
                setting: "A foggy island".into(),
                description: "A small island with one lighthouse.".into(),
                rules: vec!["No magic".into()],
            },
            narration: Narration {
                perspective: Perspective::Second,
                detail: Detail::Balanced,
                tone: "Warm, mysterious".into(),
                pacing: Pacing::Normal,
            },
            characters,
            relationships: vec![Relationship {
                from_id: "pc".into(),
                to_id: "npc-mara".into(),
                label: "old friends".into(),
                status: "friendly".into(),
                source_event_id: None,
            }],
            known_facts: vec![],
            scene: Scene {
                location: "The lighthouse stairs".into(),
                summary: "Night. The lamp is lit, but nobody climbed the stairs.".into(),
                participant_ids: vec!["pc".into()],
            },
            open_threads: vec!["Who lit the lamp?".into()],
            visual_refs: BTreeMap::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::fixtures::lighthouse;
    use super::*;

    #[test]
    fn fixture_is_valid_and_round_trips() {
        let state = lighthouse();
        state.validate().unwrap();
        let back = StoryStateV1::from_json(&state.to_canonical_json()).unwrap();
        assert_eq!(back, state);
        assert_eq!(back.state_hash(), state.state_hash());
    }

    #[test]
    fn hash_ignores_map_insertion_order() {
        let a = lighthouse();
        let mut b = lighthouse();
        let chars: Vec<_> = b.characters.clone().into_iter().rev().collect();
        b.characters = chars.into_iter().collect();
        assert_eq!(a.state_hash(), b.state_hash());
    }

    #[test]
    fn rejects_missing_or_npc_player() {
        let mut s = lighthouse();
        s.player_character_id = "nobody".into();
        assert!(s.validate().is_err());
        let mut s = lighthouse();
        s.player_character_id = "npc-mara".into();
        assert!(s.validate().is_err());
    }

    #[test]
    fn rejects_dangling_references() {
        let mut s = lighthouse();
        s.scene.participant_ids.push("ghost".into());
        assert!(s.validate().is_err());
        let mut s = lighthouse();
        s.relationships[0].to_id = "ghost".into();
        assert!(s.validate().is_err());
    }

    #[test]
    fn rejects_unknown_fields_and_versions() {
        let mut v = serde_json::to_value(lighthouse()).unwrap();
        v["surprise"] = serde_json::json!(true);
        assert!(StoryStateV1::from_json(&v.to_string()).is_err());
        let mut s = lighthouse();
        s.schema_version = 2;
        assert!(s.validate().is_err());
    }
}

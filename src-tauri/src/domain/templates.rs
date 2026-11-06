//! Bundled offline templates (world, scenario, character) and Quick Start
//! resolution. Merge order: app defaults < world < scenario < characters <
//! the user's choices. Conflicting character IDs are an error, never merged.

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::draft::{CreateStoryDraft, DRAFT_SCHEMA_VERSION};
use super::story::{ChapterOutlineInput, CreateStoryInput};
use super::story_state::{Character, Control, Detail, Narration, Perspective, Relationship, World};
use crate::errors::{AppError, AppResult};

pub const TEMPLATE_SCHEMA_VERSION: u32 = 1;
/// Placeholder in scenario relationships for the chosen player character.
pub const PLAYER_PLACEHOLDER: &str = "@player";

macro_rules! bundled {
    ($($file:literal),* $(,)?) => {
        &[$(include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../templates/v1/", $file))),*]
    };
}

/// Four worlds, four scenarios and six characters, in picker order.
const BUNDLED: &[&str] = bundled![
    "world.harbor-town.json",
    "world.glass-orchard.json",
    "world.meridian-station.json",
    "world.ashcombe-1923.json",
    "scenario.unsigned-letter.json",
    "scenario.memory-harvest.json",
    "scenario.night-shift.json",
    "scenario.summer-guest.json",
    "character.new-keeper.json",
    "character.curious-detective.json",
    "character.wandering-musician.json",
    "character.botanist.json",
    "character.runaway-heir.json",
    "character.ship-engineer.json",
];

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WorldTemplate {
    pub template_schema_version: u32,
    pub id: String,
    pub label: String,
    pub summary: String,
    pub world: World,
    pub narration: Narration,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export)]
pub struct SceneTemplate {
    pub location: String,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ScenarioTemplate {
    pub template_schema_version: u32,
    pub id: String,
    pub label: String,
    pub summary: String,
    /// Worlds this scenario was written for; empty means any world.
    #[serde(default)]
    pub worlds: Vec<String>,
    pub title: String,
    pub description: String,
    pub first_chapter_title: String,
    #[serde(default)]
    pub chapter_outlines: Vec<ChapterOutlineInput>,
    pub scene: SceneTemplate,
    #[serde(default)]
    pub open_threads: Vec<String>,
    #[serde(default)]
    pub npcs: Vec<Character>,
    #[serde(default)]
    pub relationships: Vec<Relationship>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CharacterTemplate {
    pub template_schema_version: u32,
    pub id: String,
    pub label: String,
    pub summary: String,
    pub character: Character,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum AnyTemplate {
    World(WorldTemplate),
    Scenario(ScenarioTemplate),
    Character(CharacterTemplate),
}

#[derive(Debug, Clone, Default, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TemplateCatalog {
    pub worlds: Vec<WorldTemplate>,
    pub scenarios: Vec<ScenarioTemplate>,
    pub characters: Vec<CharacterTemplate>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct QuickStartInput {
    pub world_id: String,
    pub scenario_id: String,
    pub character_id: String,
    #[serde(default)]
    #[ts(optional)]
    pub perspective: Option<Perspective>,
    #[serde(default)]
    #[ts(optional)]
    pub detail: Option<Detail>,
}

pub(crate) fn check_id(id: &str) -> AppResult<()> {
    let ok = id.split_once(':').is_some_and(|(ns, name)| {
        !ns.is_empty()
            && !name.is_empty()
            && id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, ':' | '-' | '_' | '.'))
    });
    if ok {
        Ok(())
    } else {
        Err(AppError::invalid_input(format!(
            "template id {id:?} must look like namespace:name"
        )))
    }
}

fn check_version(v: u32, id: &str) -> AppResult<()> {
    if v == TEMPLATE_SCHEMA_VERSION {
        Ok(())
    } else {
        Err(AppError::invalid_input(format!(
            "template {id} has unsupported schema version {v}"
        )))
    }
}

impl TemplateCatalog {
    pub fn parse(sources: &[&str]) -> AppResult<Self> {
        let mut cat = Self::default();
        let mut seen = BTreeSet::new();
        for src in sources {
            let t: AnyTemplate = serde_json::from_str(src)
                .map_err(|e| AppError::invalid_input(format!("invalid template: {e}")))?;
            let id = match &t {
                AnyTemplate::World(w) => &w.id,
                AnyTemplate::Scenario(s) => &s.id,
                AnyTemplate::Character(c) => &c.id,
            };
            if !seen.insert(id.clone()) {
                return Err(AppError::invalid_input(format!(
                    "template id {id} is used twice"
                )));
            }
            match t {
                AnyTemplate::World(w) => {
                    check_id(&w.id)?;
                    check_version(w.template_schema_version, &w.id)?;
                    cat.worlds.push(w);
                }
                AnyTemplate::Scenario(s) => {
                    check_id(&s.id)?;
                    check_version(s.template_schema_version, &s.id)?;
                    for npc in &s.npcs {
                        check_id(&npc.id)?;
                        if npc.control != Control::Npc {
                            return Err(AppError::invalid_input(format!(
                                "scenario {} lists {} as an NPC but it is player-controlled",
                                s.id, npc.id
                            )));
                        }
                    }
                    cat.scenarios.push(s);
                }
                AnyTemplate::Character(c) => {
                    check_id(&c.id)?;
                    check_id(&c.character.id)?;
                    check_version(c.template_schema_version, &c.id)?;
                    cat.characters.push(c);
                }
            }
        }
        for s in &cat.scenarios {
            if let Some(w) = s
                .worlds
                .iter()
                .find(|w| !cat.worlds.iter().any(|x| &x.id == *w))
            {
                return Err(AppError::invalid_input(format!(
                    "scenario {} names unknown world {w}",
                    s.id
                )));
            }
        }
        Ok(cat)
    }

    pub fn bundled() -> Self {
        Self::parse(BUNDLED).expect("bundled templates are valid")
    }

    /// Merge a world, scenario and character into an editable draft.
    /// Order: world < scenario < character < the choices in `input`.
    pub fn compose_draft(&self, input: &QuickStartInput) -> AppResult<CreateStoryDraft> {
        let world = self
            .worlds
            .iter()
            .find(|w| w.id == input.world_id)
            .ok_or_else(|| AppError::not_found(format!("world {} not found", input.world_id)))?;
        let scenario = self
            .scenarios
            .iter()
            .find(|s| s.id == input.scenario_id)
            .ok_or_else(|| {
                AppError::not_found(format!("scenario {} not found", input.scenario_id))
            })?;
        if !scenario.fits(&world.id) {
            return Err(AppError::invalid_input(format!(
                "{} is written for a different world than {}",
                scenario.label, world.label
            )));
        }
        let player = self
            .characters
            .iter()
            .find(|c| c.id == input.character_id)
            .ok_or_else(|| {
                AppError::not_found(format!("character {} not found", input.character_id))
            })?;

        let mut narration = world.narration.clone();
        if let Some(p) = input.perspective {
            narration.perspective = p;
        }
        if let Some(d) = input.detail {
            narration.detail = d;
        }
        Ok(CreateStoryDraft {
            draft_schema_version: DRAFT_SCHEMA_VERSION,
            world_template_id: Some(world.id.clone()),
            scenario_template_id: Some(scenario.id.clone()),
            character_template_id: Some(player.id.clone()),
            title: scenario.title.clone(),
            description: scenario.description.clone(),
            world: world.world.clone(),
            narration,
            player: Character {
                control: Control::Player,
                ..player.character.clone()
            },
            npcs: scenario.npcs.clone(),
            relationships: scenario.relationships.clone(),
            scene: scenario.scene.clone(),
            open_threads: scenario.open_threads.clone(),
            first_chapter_title: scenario.first_chapter_title.clone(),
            chapter_outlines: scenario.chapter_outlines.clone(),
        })
    }

    /// Resolve a Quick Start choice into a validated story. Conflicting
    /// character ids are refused, never merged.
    pub fn resolve_quick_start(&self, input: &QuickStartInput) -> AppResult<CreateStoryInput> {
        self.compose_draft(input)?.into_story_input()
    }
}

impl ScenarioTemplate {
    /// Whether this scenario was written for `world_id` (or for any world).
    pub fn fits(&self, world_id: &str) -> bool {
        self.worlds.is_empty() || self.worlds.iter().any(|w| w == world_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn starter() -> QuickStartInput {
        QuickStartInput {
            world_id: "starter:harbor-town".into(),
            scenario_id: "starter:unsigned-letter".into(),
            character_id: "starter:new-keeper".into(),
            perspective: None,
            detail: None,
        }
    }

    /// T01 (resolution half): Quick Start without free text gives a valid story.
    #[test]
    fn bundled_quick_start_resolves_to_valid_state() {
        let cat = TemplateCatalog::bundled();
        assert_eq!(
            (cat.worlds.len(), cat.scenarios.len(), cat.characters.len()),
            (4, 4, 6)
        );
        let draft = cat.resolve_quick_start(&starter()).unwrap();
        draft.base_state.validate().unwrap();
        assert_eq!(draft.base_state.player_character_id, "starter:new-keeper");
        assert_eq!(
            draft.base_state.relationships[0].to_id, "starter:new-keeper",
            "placeholder replaced"
        );
        assert_eq!(draft.chapter_outlines.len(), 3);
    }

    #[test]
    fn user_choices_override_world_defaults() {
        let cat = TemplateCatalog::bundled();
        let mut input = starter();
        input.perspective = Some(Perspective::Third);
        input.detail = Some(Detail::Cinematic);
        let d = cat.resolve_quick_start(&input).unwrap();
        assert_eq!(d.base_state.narration.perspective, Perspective::Third);
        assert_eq!(d.base_state.narration.detail, Detail::Cinematic);
    }

    #[test]
    fn conflicting_character_ids_are_refused() {
        let mut cat = TemplateCatalog::bundled();
        let mut npc_as_player = cat.scenarios[0].npcs[0].clone();
        npc_as_player.control = Control::Player;
        cat.characters.push(CharacterTemplate {
            template_schema_version: 1,
            id: "test:clash".into(),
            label: "Clash".into(),
            summary: String::new(),
            character: npc_as_player,
        });
        let mut input = starter();
        input.character_id = "test:clash".into();
        let err = cat.resolve_quick_start(&input).unwrap_err();
        assert!(
            err.message.contains("also your character"),
            "{}",
            err.message
        );
    }

    /// Every bundled world has a scenario, and every compatible combination
    /// with every character resolves to a valid story.
    #[test]
    fn every_bundled_combination_resolves() {
        let cat = TemplateCatalog::bundled();
        for w in &cat.worlds {
            let scenarios: Vec<_> = cat.scenarios.iter().filter(|s| s.fits(&w.id)).collect();
            assert!(!scenarios.is_empty(), "{} has no scenario", w.id);
            for s in scenarios {
                for c in &cat.characters {
                    let input = QuickStartInput {
                        world_id: w.id.clone(),
                        scenario_id: s.id.clone(),
                        character_id: c.id.clone(),
                        perspective: None,
                        detail: None,
                    };
                    let story = cat.resolve_quick_start(&input).unwrap_or_else(|e| {
                        panic!("{} + {} + {}: {}", w.id, s.id, c.id, e.message)
                    });
                    assert_eq!(story.base_state.player_character_id, c.character.id);
                }
            }
        }
    }

    #[test]
    fn scenarios_stay_in_their_world() {
        let cat = TemplateCatalog::bundled();
        let input = QuickStartInput {
            world_id: "starter:meridian-station".into(),
            ..starter()
        };
        assert_eq!(
            cat.resolve_quick_start(&input).unwrap_err().code,
            crate::errors::ErrorCode::InvalidInput
        );
        let dup = r#"{"templateSchemaVersion":1,"type":"world","id":"a:b","label":"x","summary":"","world":{"era":"","setting":"s","description":"","rules":[]},"narration":{"perspective":"second","detail":"brief","tone":"","pacing":"fast"}}"#;
        assert!(TemplateCatalog::parse(&[dup, dup]).is_err());
    }

    #[test]
    fn rejects_bad_ids_and_versions() {
        let bad = r#"{"templateSchemaVersion":1,"type":"character","id":"noprefix","label":"x","summary":"","character":{"id":"a:b","name":"x","control":"player"}}"#;
        assert!(TemplateCatalog::parse(&[bad]).is_err());
        let v2 = r#"{"templateSchemaVersion":2,"type":"character","id":"a:b","label":"x","summary":"","character":{"id":"a:b","name":"x","control":"player"}}"#;
        assert!(TemplateCatalog::parse(&[v2]).is_err());
    }
}

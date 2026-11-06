//! Bundled offline templates (world, scenario, character) and Quick Start
//! resolution. Merge order: app defaults < world < scenario < characters <
//! the user's choices. Conflicting character IDs are an error, never merged.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::story::{ChapterOutlineInput, CreateStoryInput};
use super::story_state::{
    Character, Control, Detail, Narration, Perspective, Relationship, Scene, StoryStateV1, World,
    STORY_STATE_SCHEMA_VERSION,
};
use crate::errors::{AppError, AppResult};

pub const TEMPLATE_SCHEMA_VERSION: u32 = 1;
/// Placeholder in scenario relationships for the chosen player character.
pub const PLAYER_PLACEHOLDER: &str = "@player";

const BUNDLED: &[&str] = &[
    include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../templates/v1/world.harbor-town.json"
    )),
    include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../templates/v1/scenario.unsigned-letter.json"
    )),
    include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../templates/v1/character.new-keeper.json"
    )),
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
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

fn check_id(id: &str) -> AppResult<()> {
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
        for src in sources {
            let t: AnyTemplate = serde_json::from_str(src)
                .map_err(|e| AppError::invalid_input(format!("invalid template: {e}")))?;
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
        Ok(cat)
    }

    pub fn bundled() -> Self {
        Self::parse(BUNDLED).expect("bundled templates are valid")
    }

    /// Resolve a Quick Start choice into a validated story draft.
    pub fn resolve_quick_start(&self, input: &QuickStartInput) -> AppResult<CreateStoryInput> {
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
        let player = self
            .characters
            .iter()
            .find(|c| c.id == input.character_id)
            .ok_or_else(|| {
                AppError::not_found(format!("character {} not found", input.character_id))
            })?;

        let mut player_char = player.character.clone();
        player_char.control = Control::Player;
        let player_id = player_char.id.clone();

        let mut characters = BTreeMap::new();
        characters.insert(player_id.clone(), player_char);
        for npc in &scenario.npcs {
            if characters.contains_key(&npc.id) {
                return Err(AppError::invalid_input(format!(
                    "character id {} is used by both the player and the scenario",
                    npc.id
                )));
            }
            characters.insert(npc.id.clone(), npc.clone());
        }
        let relationships = scenario
            .relationships
            .iter()
            .cloned()
            .map(|mut r| {
                if r.from_id == PLAYER_PLACEHOLDER {
                    r.from_id = player_id.clone();
                }
                if r.to_id == PLAYER_PLACEHOLDER {
                    r.to_id = player_id.clone();
                }
                r
            })
            .collect();

        let mut narration = world.narration.clone();
        if let Some(p) = input.perspective {
            narration.perspective = p;
        }
        if let Some(d) = input.detail {
            narration.detail = d;
        }

        let base_state = StoryStateV1 {
            schema_version: STORY_STATE_SCHEMA_VERSION,
            player_character_id: player_id.clone(),
            world: world.world.clone(),
            narration,
            characters,
            relationships,
            known_facts: vec![],
            scene: Scene {
                location: scenario.scene.location.clone(),
                summary: scenario.scene.summary.clone(),
                participant_ids: vec![player_id],
            },
            open_threads: scenario.open_threads.clone(),
            visual_refs: BTreeMap::new(),
        };
        base_state.validate()?;
        Ok(CreateStoryInput {
            title: scenario.title.clone(),
            description: scenario.description.clone(),
            base_state,
            first_chapter_title: scenario.first_chapter_title.clone(),
            chapter_outlines: scenario.chapter_outlines.clone(),
        })
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
            (1, 1, 1)
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
        assert!(cat.resolve_quick_start(&input).is_err());
    }

    #[test]
    fn rejects_bad_ids_and_versions() {
        let bad = r#"{"templateSchemaVersion":1,"type":"character","id":"noprefix","label":"x","summary":"","character":{"id":"a:b","name":"x","control":"player"}}"#;
        assert!(TemplateCatalog::parse(&[bad]).is_err());
        let v2 = r#"{"templateSchemaVersion":2,"type":"character","id":"a:b","label":"x","summary":"","character":{"id":"a:b","name":"x","control":"player"}}"#;
        assert!(TemplateCatalog::parse(&[v2]).is_err());
    }
}

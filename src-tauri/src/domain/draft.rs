//! `CreateStoryDraft`: the one editable shape that every way of creating a
//! story (Quick Start, Guided, Custom) resolves to. A draft may be
//! incomplete while it is being edited; [`CreateStoryDraft::check`] lists
//! what is missing, and [`CreateStoryDraft::into_story_input`] validates and
//! builds the story.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::story::{ChapterOutlineInput, CreateStoryInput};
use super::story_state::{
    names_a_minor, Character, ContentRating, Control, Narration, Relationship, Scene, StoryStateV1,
    World, STORY_STATE_SCHEMA_VERSION,
};
use super::templates::{check_id, SceneTemplate, PLAYER_PLACEHOLDER};
use crate::errors::{AppError, AppResult};

pub const DRAFT_SCHEMA_VERSION: u32 = 1;
/// Id given to a player character that did not come from a template.
pub const CUSTOM_PLAYER_ID: &str = "custom:player";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export)]
pub struct CreateStoryDraft {
    pub draft_schema_version: u32,
    /// Templates each section came from (for the pickers); informational.
    pub world_template_id: Option<String>,
    pub scenario_template_id: Option<String>,
    pub character_template_id: Option<String>,
    pub title: String,
    pub description: String,
    pub world: World,
    pub narration: Narration,
    pub player: Character,
    pub npcs: Vec<Character>,
    /// `@player` stands for the player character.
    pub relationships: Vec<Relationship>,
    pub scene: SceneTemplate,
    pub open_threads: Vec<String>,
    pub first_chapter_title: String,
    pub chapter_outlines: Vec<ChapterOutlineInput>,
    /// The type of story picked first ("Romance"); it leads the genres.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub story_type: Option<String>,
}

impl Default for CreateStoryDraft {
    fn default() -> Self {
        Self {
            draft_schema_version: DRAFT_SCHEMA_VERSION,
            world_template_id: None,
            scenario_template_id: None,
            character_template_id: None,
            title: String::new(),
            description: String::new(),
            world: World::default(),
            narration: Narration::default(),
            player: Character {
                id: CUSTOM_PLAYER_ID.into(),
                control: Control::Player,
                ..Character::default()
            },
            npcs: vec![],
            relationships: vec![],
            scene: SceneTemplate::default(),
            open_threads: vec![],
            first_chapter_title: String::new(),
            chapter_outlines: vec![],
            story_type: None,
        }
    }
}

/// Where in the creation wizard a field lives.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum DraftStep {
    World,
    Character,
    Story,
    Narration,
    Review,
}

/// Something that must be fixed before the story can be created.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct DraftProblem {
    pub step: DraftStep,
    pub message: String,
}

fn blank(s: &str) -> bool {
    s.trim().is_empty()
}

fn clean_text(s: &str) -> String {
    s.trim().to_string()
}

fn clean_opt(s: &Option<String>) -> Option<String> {
    s.as_deref()
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .map(String::from)
}

fn clean_list(items: &[String]) -> Vec<String> {
    items
        .iter()
        .map(|t| t.trim())
        .filter(|t| !t.is_empty())
        .map(String::from)
        .collect()
}

fn clean_character(c: &Character, control: Control) -> Character {
    Character {
        id: c.id.trim().to_string(),
        name: clean_text(&c.name),
        control,
        gender: clean_opt(&c.gender),
        pronouns: clean_opt(&c.pronouns),
        age: clean_opt(&c.age),
        role: clean_opt(&c.role),
        description: clean_opt(&c.description),
        appearance: clean_opt(&c.appearance),
        personality: clean_list(&c.personality),
        goals: clean_list(&c.goals),
        abilities: clean_list(&c.abilities),
    }
}

impl CreateStoryDraft {
    fn player_id(&self) -> String {
        if blank(&self.player.id) {
            CUSTOM_PLAYER_ID.into()
        } else {
            self.player.id.trim().into()
        }
    }

    /// Everything that stops this draft from becoming a story, in wizard
    /// order. Empty means `into_story_input` will succeed.
    pub fn check(&self) -> Vec<DraftProblem> {
        let mut out = Vec::new();
        let add = |out: &mut Vec<DraftProblem>, step, message: String| {
            out.push(DraftProblem { step, message })
        };
        if self.draft_schema_version != DRAFT_SCHEMA_VERSION {
            add(
                &mut out,
                DraftStep::Review,
                "this draft was made by a different version of the app; start over".into(),
            );
            return out;
        }
        if blank(&self.world.setting) {
            add(
                &mut out,
                DraftStep::World,
                "Describe where the story takes place (Setting).".into(),
            );
        }
        if blank(&self.player.name) {
            add(
                &mut out,
                DraftStep::Character,
                "Give your character a name.".into(),
            );
        }
        let player_id = self.player_id();
        if check_id(&player_id).is_err() {
            add(
                &mut out,
                DraftStep::Character,
                format!("Your character's id {player_id:?} must look like namespace:name."),
            );
        }
        if blank(&self.title) {
            add(&mut out, DraftStep::Story, "Give the story a title.".into());
        }
        if blank(&self.scene.location) {
            add(
                &mut out,
                DraftStep::Story,
                "Say where the story opens.".into(),
            );
        }
        if blank(&self.first_chapter_title) {
            add(&mut out, DraftStep::Story, "Name the first chapter.".into());
        }

        let mut ids = BTreeSet::from([player_id.clone()]);
        for npc in &self.npcs {
            let name = npc.name.trim();
            if name.is_empty() {
                add(
                    &mut out,
                    DraftStep::Story,
                    "Every other character needs a name.".into(),
                );
            }
            let id = npc.id.trim();
            if check_id(id).is_err() {
                add(
                    &mut out,
                    DraftStep::Story,
                    format!("{name}'s id {id:?} must look like namespace:name."),
                );
            } else if id == player_id {
                add(
                    &mut out,
                    DraftStep::Story,
                    format!(
                        "{name} is also your character. Remove them from the story or choose a \
                         different character to play."
                    ),
                );
            } else if !ids.insert(id.to_string()) {
                add(
                    &mut out,
                    DraftStep::Story,
                    format!("{name} is in the story twice. Remove one."),
                );
            }
        }
        let resolve = |id: &str| -> String {
            if id == PLAYER_PLACEHOLDER {
                player_id.clone()
            } else {
                id.trim().to_string()
            }
        };
        for r in &self.relationships {
            if !ids.contains(&resolve(&r.from_id)) || !ids.contains(&resolve(&r.to_id)) {
                add(
                    &mut out,
                    DraftStep::Story,
                    format!(
                        "The relationship \"{}\" refers to a character who is no longer in \
                         the story.",
                        r.label.trim()
                    ),
                );
            }
        }
        if self.narration.rating == Some(ContentRating::Explicit) {
            let minor = |c: &Character| c.age.as_deref().is_some_and(names_a_minor);
            if minor(&self.player) {
                add(
                    &mut out,
                    DraftStep::Character,
                    "Your character must be 18 or older in an adults-only story.".into(),
                );
            }
            for npc in self.npcs.iter().filter(|c| minor(c)) {
                add(
                    &mut out,
                    DraftStep::Story,
                    format!(
                        "{} must be 18 or older in an adults-only story. Change their age or \
                         remove them.",
                        npc.name.trim()
                    ),
                );
            }
        }
        if out.is_empty() {
            if let Err(e) = self.build().and_then(|i| i.base_state.validate()) {
                add(&mut out, DraftStep::Review, sentence(&e.message));
            }
        }
        out
    }

    /// Validate and turn the draft into the input for `create_story`.
    pub fn into_story_input(self) -> AppResult<CreateStoryInput> {
        if let Some(p) = self.check().into_iter().next() {
            return Err(AppError::invalid_input(p.message));
        }
        self.build()
    }

    /// Normalize (trim, drop blank list entries) and assemble the state.
    fn build(&self) -> AppResult<CreateStoryInput> {
        let player_id = self.player_id();
        let mut player = clean_character(&self.player, Control::Player);
        player.id = player_id.clone();
        let mut characters = BTreeMap::new();
        characters.insert(player_id.clone(), player);
        for npc in &self.npcs {
            let c = clean_character(npc, Control::Npc);
            characters.insert(c.id.clone(), c);
        }
        let swap = |id: &str| {
            if id == PLAYER_PLACEHOLDER {
                player_id.clone()
            } else {
                id.trim().to_string()
            }
        };
        let relationships = self
            .relationships
            .iter()
            .map(|r| Relationship {
                from_id: swap(&r.from_id),
                to_id: swap(&r.to_id),
                label: clean_text(&r.label),
                status: clean_text(&r.status),
                source_event_id: None,
            })
            .collect();
        let base_state = StoryStateV1 {
            schema_version: STORY_STATE_SCHEMA_VERSION,
            player_character_id: player_id.clone(),
            world: World {
                era: clean_text(&self.world.era),
                setting: clean_text(&self.world.setting),
                description: clean_text(&self.world.description),
                rules: clean_list(&self.world.rules),
            },
            narration: Narration {
                tone: clean_text(&self.narration.tone),
                genres: {
                    let mut genres = clean_list(&self.narration.genres);
                    if let Some(t) = self.story_type.as_deref().map(clean_text) {
                        if !t.is_empty() {
                            genres.retain(|g| !g.eq_ignore_ascii_case(&t));
                            genres.insert(0, t);
                        }
                    }
                    genres
                },
                themes: clean_list(&self.narration.themes),
                limits: clean_list(&self.narration.limits),
                language: self
                    .narration
                    .language
                    .as_deref()
                    .map(clean_text)
                    .filter(|l| !l.is_empty()),
                ..self.narration.clone()
            },
            characters,
            relationships,
            known_facts: vec![],
            scene: Scene {
                location: clean_text(&self.scene.location),
                summary: clean_text(&self.scene.summary),
                participant_ids: vec![player_id],
            },
            open_threads: clean_list(&self.open_threads),
            visual_refs: BTreeMap::new(),
        };
        base_state.validate()?;
        let chapter_outlines = self
            .chapter_outlines
            .iter()
            .filter(|c| !blank(&c.title))
            .map(|c| ChapterOutlineInput {
                title: clean_text(&c.title),
                outline: clean_text(&c.outline),
            })
            .collect();
        Ok(CreateStoryInput {
            title: clean_text(&self.title),
            description: clean_text(&self.description),
            base_state,
            first_chapter_title: clean_text(&self.first_chapter_title),
            chapter_outlines,
        })
    }
}

fn sentence(s: &str) -> String {
    let t = s.trim();
    let mut c = t.chars();
    let first = c.next().map(|f| f.to_uppercase().collect::<String>());
    let body = format!("{}{}", first.unwrap_or_default(), c.as_str());
    if body.ends_with(['.', '!', '?']) {
        body
    } else {
        format!("{body}.")
    }
}

/// Which creation screen a saved wizard draft belongs to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum WizardMode {
    Guided,
    Custom,
}

/// An unfinished story in the creation wizard, kept until it is created or
/// discarded so closing the app halfway loses nothing.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WizardDraft {
    pub mode: WizardMode,
    pub step: DraftStep,
    pub draft: CreateStoryDraft,
    /// Set when saved.
    #[serde(default)]
    pub saved_at: String,
}

#[cfg(test)]
mod tests;

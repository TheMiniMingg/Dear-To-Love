//! `CreateStoryDraft`: the one editable shape that every way of creating a
//! story (Quick Start, Guided, Custom) resolves to. A draft may be
//! incomplete while it is being edited; [`CreateStoryDraft::check`] lists
//! what is missing, and [`CreateStoryDraft::into_story_input`] validates and
//! builds the story.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::provider::StorytellerChoice;
use super::story::{ChapterOutlineInput, CreateStoryInput, StorySetup};
use super::story_state::{
    names_a_minor, Character, ContentRating, Control, Narration, Relationship, Scene, Stat,
    StoryStateV1, World, STORY_STATE_SCHEMA_VERSION,
};
use super::templates::{check_id, SceneTemplate, PLAYER_PLACEHOLDER};
use super::tracking::{Item, Meter, Tracking};
use super::visuals::{VisualSlot, PORTRAIT_PREFIX};
use crate::errors::{AppError, AppResult};

pub const DRAFT_SCHEMA_VERSION: u32 = 1;
/// Id given to a player character that did not come from a template.
pub const CUSTOM_PLAYER_ID: &str = "custom:player";
/// Most pictures and story-only images one draft may name.
pub const MAX_DRAFT_PICTURES: usize = 64;
pub const MAX_DRAFT_IMAGES: usize = 200;
/// The title of a story created without one (the app shows it translated).
pub const UNTITLED: &str = "Untitled story";

/// A picture picked while creating: a slot (`cover`, `background`,
/// `portrait:<character id>`, with `portrait:@player` for the player) and
/// a library image.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct DraftPicture {
    pub slot: String,
    pub asset_id: String,
}

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
    /// Pictures picked while creating.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    #[ts(as = "Option<Vec<DraftPicture>>", optional)]
    pub pictures: Vec<DraftPicture>,
    /// Images added while creating that belong to this story only.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    #[ts(as = "Option<Vec<String>>", optional)]
    pub story_images: Vec<String>,
    /// Who writes the replies; absent: the app's storyteller.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub storyteller: Option<StorytellerChoice>,
    /// Bars, counters and an inventory, RPG style.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub tracking: Option<Tracking>,
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
            pictures: vec![],
            story_images: vec![],
            storyteller: None,
            tracking: None,
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
    Pictures,
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

/// Blank rows dropped, names trimmed and bars started within their range.
fn clean_tracking(t: &Tracking) -> Tracking {
    Tracking {
        meters: t
            .meters
            .iter()
            .filter(|m| !blank(&m.name))
            .map(|m| Meter {
                name: clean_text(&m.name),
                value: match m.max {
                    Some(max) => m.value.clamp(0, max.max(0)),
                    None => m.value,
                },
                max: m.max,
                who: clean_opt(&m.who),
            })
            .collect(),
        inventory: t.inventory,
        items: if t.inventory {
            t.items
                .iter()
                .filter(|i| !blank(&i.name))
                .map(|i| Item {
                    name: clean_text(&i.name),
                    qty: i.qty,
                    description: clean_text(&i.description),
                })
                .collect()
        } else {
            vec![]
        },
    }
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
        species: clean_opt(&c.species),
        description: clean_opt(&c.description),
        appearance: clean_opt(&c.appearance),
        personality: clean_list(&c.personality),
        goals: clean_list(&c.goals),
        abilities: clean_list(&c.abilities),
        stats: c
            .stats
            .iter()
            .map(|s| Stat {
                name: clean_text(&s.name),
                value: s.value,
            })
            .filter(|s| !s.name.is_empty())
            .collect(),
        color: c
            .color
            .as_deref()
            .map(str::trim)
            .filter(|x| super::story_state::is_hex_color(x))
            .map(str::to_ascii_lowercase),
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
    /// The pictures, story-only images and storyteller picked while
    /// creating. Portraits of characters no longer in the draft are left
    /// out.
    pub fn setup(&self) -> AppResult<StorySetup> {
        if self.pictures.len() > MAX_DRAFT_PICTURES || self.story_images.len() > MAX_DRAFT_IMAGES {
            return Err(AppError::invalid_input("this story has too many pictures"));
        }
        let player_id = self.player_id();
        let npc_ids: BTreeSet<String> = self.npcs.iter().map(|n| n.id.trim().to_string()).collect();
        let mut pictures: Vec<(VisualSlot, String)> = Vec::new();
        for p in &self.pictures {
            let key = match p.slot.strip_prefix(PORTRAIT_PREFIX) {
                Some(PLAYER_PLACEHOLDER) => format!("{PORTRAIT_PREFIX}{player_id}"),
                _ => p.slot.clone(),
            };
            let slot = VisualSlot::parse(&key)?;
            if let VisualSlot::Portrait(cid) = &slot {
                if cid != &player_id && !npc_ids.contains(cid) {
                    continue;
                }
            }
            let asset = p.asset_id.trim();
            if asset.is_empty() {
                continue;
            }
            pictures.retain(|(s, _)| s != &slot);
            pictures.push((slot, asset.to_string()));
        }
        let mut seen = BTreeSet::new();
        let own_images = self
            .story_images
            .iter()
            .map(|i| i.trim().to_string())
            .filter(|i| !i.is_empty() && seen.insert(i.clone()))
            .collect();
        Ok(StorySetup {
            pictures,
            own_images,
            storyteller: self.storyteller.clone(),
        })
    }

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
                style_notes: self
                    .narration
                    .style_notes
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
                time: String::new(),
            },
            open_threads: clean_list(&self.open_threads),
            done_threads: Vec::new(),
            visual_refs: BTreeMap::new(),
            tracking: self.tracking.as_ref().map(clean_tracking),
            notes: Vec::new(),
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
        // Only a name is needed to begin; the rest can be left open.
        let or = |text: &str, fallback: &str| {
            let text = clean_text(text);
            if text.is_empty() {
                fallback.to_string()
            } else {
                text
            }
        };
        Ok(CreateStoryInput {
            title: or(&self.title, UNTITLED),
            description: clean_text(&self.description),
            base_state,
            first_chapter_title: or(&self.first_chapter_title, "Chapter 1"),
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

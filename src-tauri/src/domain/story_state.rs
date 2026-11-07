//! `StoryStateV1`: the canonical structured state of a story at an event.
//!
//! `stories.base_state_json` holds the original configuration. Events from
//! the route history (`chapter_start`, `edit`, `fact_confirm`) modify the
//! effective state from that event forward. Narrative prose never silently
//! changes these fields: only the storyteller's tags do (bars, items, memory
//! notes, open threads and scene headings), and the reader shows each of
//! those where it happens.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use ts_rs::TS;

use super::notes::MemoryNote;
use super::tracking::Tracking;
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
    /// Threads settled along the way, newest last: the quest log's done list.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[ts(as = "Option<Vec<String>>", optional)]
    pub done_threads: Vec<String>,
    /// Optional asset ids by slot (e.g. `"cover"`, `"background"`).
    pub visual_refs: BTreeMap<String, String>,
    /// Bars, counters and an inventory, when the story keeps them.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub tracking: Option<Tracking>,
    /// Memory notes: people, places, items, events and facts the story must
    /// not forget, oldest first.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[ts(as = "Option<Vec<MemoryNote>>", optional)]
    pub notes: Vec<MemoryNote>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
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

/// How the storyteller tells the story. Unset means `Narrated`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum NarrationStyle {
    /// A narrator describes what happens, with dialogue.
    Narrated,
    /// No narrator: only what characters say and their inner thoughts, with
    /// at most a brief line of action.
    Thoughts,
    /// Like a play: speaker names, dialogue and short stage directions.
    Script,
    /// Told mostly through texts, calls, letters and posts.
    Messages,
    /// Like a roleplay chat: actions in asterisks, dialogue in quotes,
    /// short back-and-forth replies.
    Roleplay,
    /// Like a classic text adventure: where you are, what you can see and
    /// do, and what happened when you tried.
    Adventure,
}

/// Present or past tense. Unset leaves it to the model.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Tense {
    Present,
    Past,
}

/// How much the storyteller surprises the player. Unset is `Sometimes`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Surprises {
    /// Only what follows from the player's actions and the characters.
    Off,
    Sometimes,
    Often,
}

/// How often the storyteller asks for a roll. Unset is `Normal`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum RollFrequency {
    /// Only at big, dramatic turning points.
    Rare,
    Normal,
    /// Whenever something uncertain is tried.
    Often,
}

/// How the storyteller sets the odds. Unset is `Fair`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum RollOdds {
    Generous,
    Fair,
    Tough,
}

/// How dice work in a story that rolls them. Every field left out keeps the
/// usual behavior.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct DiceRules {
    /// Dice for every roll, such as `1d20` or `2d6`. Unset lets the
    /// storyteller choose, including ranges such as `40-100`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub dice: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub frequency: Option<RollFrequency>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub odds: Option<RollOdds>,
    /// The player's stats are not added to rolls.
    #[serde(default, skip_serializing_if = "is_false")]
    #[ts(as = "Option<bool>", optional)]
    pub no_stats: bool,
    /// A single die's highest face is a critical success and its lowest a
    /// critical failure, whatever the target.
    #[serde(default, skip_serializing_if = "is_false")]
    #[ts(as = "Option<bool>", optional)]
    pub crits: bool,
    /// The number needed is not shown until the dice are rolled.
    #[serde(default, skip_serializing_if = "is_false")]
    #[ts(as = "Option<bool>", optional)]
    pub hide_target: bool,
    /// The storyteller never asks for rolls; the player rolls when they
    /// choose.
    #[serde(default, skip_serializing_if = "is_false")]
    #[ts(as = "Option<bool>", optional)]
    pub player_only: bool,
}

/// How much the storyteller may show. Unset leaves it to the model.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum ContentRating {
    /// Suitable for everyone: no sexual content, graphic violence or strong
    /// language.
    General,
    /// Violence, horror, strong language and sexual situations without
    /// explicit detail.
    Mature,
    /// Adults only: explicit sexual content between adults is allowed.
    Explicit,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct Narration {
    pub perspective: Perspective,
    pub detail: Detail,
    pub tone: String,
    pub pacing: Pacing,
    /// What kind of story this is, e.g. "Romance" or "Horror".
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[ts(as = "Option<Vec<String>>", optional)]
    pub genres: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub rating: Option<ContentRating>,
    /// Themes and elements the player wants when they fit the story.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[ts(as = "Option<Vec<String>>", optional)]
    pub themes: Vec<String>,
    /// Hard limits: things the storyteller must never write.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[ts(as = "Option<Vec<String>>", optional)]
    pub limits: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub style: Option<NarrationStyle>,
    /// Show the inner thoughts of characters other than the player's.
    #[serde(default, skip_serializing_if = "is_false")]
    #[ts(as = "Option<bool>", optional)]
    pub inner_thoughts: bool,
    /// Texts, calls and letters are written as tags the reader shows as
    /// phone and paper cards.
    #[serde(default, skip_serializing_if = "is_false")]
    #[ts(as = "Option<bool>", optional)]
    pub message_cards: bool,
    /// The language the story is written in, e.g. "Japanese". Unset leaves
    /// it to the model, which usually follows the player.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub language: Option<String>,
    /// Uncertain moments are decided by dice: the storyteller asks for a
    /// roll and sets the odds, the app rolls.
    #[serde(default, skip_serializing_if = "is_false")]
    #[ts(as = "Option<bool>", optional)]
    pub dice: bool,
    /// A heading with the place and time where the scene moves, written as
    /// `<scene place="…" time="…"/>`.
    #[serde(default, skip_serializing_if = "is_false")]
    #[ts(as = "Option<bool>", optional)]
    pub scene_headings: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub tense: Option<Tense>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub surprises: Option<Surprises>,
    /// The storyteller may describe the player character's small reactions
    /// (a nod, a laugh), never their choices or words.
    #[serde(default, skip_serializing_if = "is_false")]
    #[ts(as = "Option<bool>", optional)]
    pub autopilot: bool,
    /// Characters never text or call the player first.
    #[serde(default, skip_serializing_if = "is_false")]
    #[ts(as = "Option<bool>", optional)]
    pub quiet_phones: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub dice_rules: Option<DiceRules>,
    /// The storyteller does not keep memory notes or open threads; only the
    /// player writes them.
    #[serde(default, skip_serializing_if = "is_false")]
    #[ts(as = "Option<bool>", optional)]
    pub manual_memory: bool,
    /// No ideas for the player's next move under the storyteller's replies.
    #[serde(default, skip_serializing_if = "is_false")]
    #[ts(as = "Option<bool>", optional)]
    pub no_suggestions: bool,
}

fn is_false(b: &bool) -> bool {
    !*b
}

impl Default for Narration {
    fn default() -> Self {
        Self {
            perspective: Perspective::Second,
            detail: Detail::Balanced,
            tone: String::new(),
            pacing: Pacing::Normal,
            genres: Vec::new(),
            rating: None,
            themes: Vec::new(),
            limits: Vec::new(),
            style: None,
            inner_thoughts: false,
            message_cards: false,
            language: None,
            dice: false,
            scene_headings: false,
            tense: None,
            surprises: None,
            autopilot: false,
            quiet_phones: false,
            dice_rules: None,
            manual_memory: false,
            no_suggestions: false,
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Control {
    Player,
    #[default]
    Npc,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
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
    /// Race or species, e.g. "Orc" or "Lizardfolk". Unset means whatever
    /// fits the world, usually human.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub species: Option<String>,
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
    /// Numbers added to the dice rolls that use them, e.g. Smarts 2.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[ts(as = "Option<Vec<Stat>>", optional)]
    pub stats: Vec<Stat>,
    /// The colour of their name in the reader, as `#rrggbb`. Unset picks
    /// one from the name. Only for display: never sent to the model.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub color: Option<String>,
}

/// True for a colour written as `#rrggbb`.
pub fn is_hex_color(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 7 && b[0] == b'#' && b[1..].iter().all(u8::is_ascii_hexdigit)
}

/// A named number on a character that dice rolls can add.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct Stat {
    pub name: String,
    pub value: i32,
}

const MAX_STATS: usize = 30;
const MAX_STAT_VALUE: i32 = 1000;

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
    /// Where the story is; follows the storyteller's scene headings.
    pub location: String,
    pub summary: String,
    pub participant_ids: Vec<String>,
    /// When it is ("Monday, 7:40 AM"); follows the scene headings too.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    #[ts(as = "Option<String>", optional)]
    pub time: String,
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
            check_stats(c)?;
            if let Some(color) = &c.color {
                if !is_hex_color(color) {
                    return bad(format!(
                        "the name colour of {} must look like #a1b2c3",
                        c.name
                    ));
                }
            }
            for text in [
                &c.gender,
                &c.pronouns,
                &c.age,
                &c.role,
                &c.species,
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
            &self.scene.time,
        ] {
            check_text("text field", text)?;
        }
        check_list("world rules", &self.world.rules)?;
        check_list("open threads", &self.open_threads)?;
        check_list("settled threads", &self.done_threads)?;
        check_list("genres", &self.narration.genres)?;
        check_list("themes", &self.narration.themes)?;
        check_list("limits", &self.narration.limits)?;
        if let Some(dice) = self
            .narration
            .dice_rules
            .as_ref()
            .and_then(|r| r.dice.as_deref())
        {
            crate::domain::dice::DiceSpec::parse(dice)?;
        }
        if let Some(tracking) = &self.tracking {
            tracking.validate()?;
        }
        super::notes::validate(&self.notes)?;
        if let Some(language) = &self.narration.language {
            if language.chars().count() > 60 {
                return bad("the story language is longer than 60 characters".into());
            }
        }
        if self.narration.rating == Some(ContentRating::Explicit) {
            if let Some(c) = self
                .characters
                .values()
                .find(|c| c.age.as_deref().is_some_and(names_a_minor))
            {
                return bad(format!(
                    "{} is under 18. Every character in an adults-only story must be an adult; \
                     change their age or choose a different content rating",
                    c.name.trim()
                ));
            }
        }
        Ok(())
    }
}

fn check_stats(c: &Character) -> AppResult<()> {
    let bad = |msg: String| Err(AppError::invalid_input(msg));
    if c.stats.len() > MAX_STATS {
        return bad(format!("{} has more than {MAX_STATS} stats", c.name.trim()));
    }
    let mut seen = BTreeSet::new();
    for stat in &c.stats {
        let name = stat.name.trim();
        if name.is_empty() || name.chars().count() > 60 {
            return bad(format!(
                "every stat of {} needs a name of 1 to 60 characters",
                c.name.trim()
            ));
        }
        if !seen.insert(name.to_lowercase()) {
            return bad(format!("{} has two stats named {name}", c.name.trim()));
        }
        if stat.value.abs() > MAX_STAT_VALUE {
            return bad(format!(
                "{name} must be between -{MAX_STAT_VALUE} and {MAX_STAT_VALUE}"
            ));
        }
    }
    Ok(())
}

/// Whether a character's age text says they are under 18: a first number
/// below 18 ("16", "17 years old", "sixteen") or a word for a child or
/// teenager ("teen", "child", "minor"). Strict on purpose: an adults-only
/// story refuses anything that reads as a minor.
pub fn names_a_minor(age: &str) -> bool {
    const MINOR_WORDS: &[&str] = &[
        "child",
        "children",
        "kid",
        "kids",
        "minor",
        "underage",
        "teen",
        "teens",
        "teenage",
        "teenager",
        "preteen",
        "tween",
        "adolescent",
        "toddler",
        "infant",
        "schoolgirl",
        "schoolboy",
        "schoolchild",
        "juvenile",
        "youngster",
        "loli",
        "shota",
    ];
    const SMALL_NUMBERS: &[&str] = &[
        "one",
        "two",
        "three",
        "four",
        "five",
        "six",
        "seven",
        "eight",
        "nine",
        "ten",
        "eleven",
        "twelve",
        "thirteen",
        "fourteen",
        "fifteen",
        "sixteen",
        "seventeen",
    ];
    const LARGE_NUMBERS: &[&str] = &[
        "eighteen", "nineteen", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty",
        "ninety", "hundred", "thousand", "million",
    ];
    let lower = age.to_lowercase().replace(',', "");
    let first_number: String = lower
        .chars()
        .skip_while(|c| !c.is_ascii_digit())
        .take_while(|c| c.is_ascii_digit())
        .collect();
    if first_number.parse::<u64>().is_ok_and(|n| n < 18) {
        return true;
    }
    let words: Vec<&str> = lower
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .collect();
    if words.iter().any(|w| MINOR_WORDS.contains(w)) {
        return true;
    }
    first_number.is_empty()
        && !words.iter().any(|w| LARGE_NUMBERS.contains(w))
        && words.iter().any(|w| SMALL_NUMBERS.contains(w))
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

/// A small, fictional, original story state used by tests, the engine
/// self-test and Diagnostics. Never ship real user stories as fixtures.
pub fn sample_lighthouse() -> StoryStateV1 {
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
            species: None,
            description: None,
            appearance: None,
            personality: vec!["curious".into()],
            goals: vec!["Find out who keeps lighting the lamp".into()],
            abilities: vec![],
            stats: vec![],
            color: None,
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
            species: None,
            description: None,
            appearance: None,
            personality: vec!["wry".into()],
            goals: vec![],
            abilities: vec![],
            stats: vec![],
            color: None,
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
            ..Narration::default()
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
            time: String::new(),
        },
        open_threads: vec!["Who lit the lamp?".into()],
        done_threads: Vec::new(),
        visual_refs: BTreeMap::new(),
        tracking: None,
        notes: Vec::new(),
    }
}

#[cfg(test)]
pub mod fixtures {
    pub use super::sample_lighthouse as lighthouse;
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
    fn name_colours_must_be_hex() {
        let mut s = lighthouse();
        for ok in ["#c2185b", "#00897B"] {
            s.characters.get_mut("pc").unwrap().color = Some(ok.into());
            s.validate().unwrap();
        }
        for bad in ["red", "#fff", "#12345g", "c2185b", "#c2185b00"] {
            s.characters.get_mut("pc").unwrap().color = Some(bad.into());
            assert!(s.validate().is_err(), "{bad}");
        }
        assert!(is_hex_color("#a1B2c3"));
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

    #[test]
    fn content_settings_are_optional_and_keep_old_hashes() {
        let s = lighthouse();
        let json = s.to_canonical_json();
        assert!(!json.contains("genres") && !json.contains("rating"));
        // A state saved before content settings existed reads back the same.
        let back = StoryStateV1::from_json(&json).unwrap();
        assert_eq!(back.state_hash(), s.state_hash());
        let mut s = lighthouse();
        s.narration.genres = vec!["Romance".into()];
        s.narration.rating = Some(ContentRating::Explicit);
        s.narration.themes = vec!["slow burn".into()];
        s.narration.limits = vec!["gore".into()];
        let json = s.to_canonical_json();
        assert!(json.contains(r#""rating":"explicit""#), "{json}");
        assert_eq!(StoryStateV1::from_json(&json).unwrap(), s);
    }

    #[test]
    fn adults_only_stories_refuse_minors() {
        let mut s = lighthouse();
        s.narration.rating = Some(ContentRating::Explicit);
        s.validate().unwrap();
        for age in [
            "16",
            "17 years old",
            "sixteen",
            "a teenager",
            "Teen",
            "child",
            "minor",
        ] {
            let mut t = s.clone();
            t.characters.get_mut("pc").unwrap().age = Some(age.into());
            let err = t.validate().unwrap_err();
            assert!(err.message.contains("under 18"), "{age}: {}", err.message);
        }
        for age in [
            "18",
            "25",
            "twenty-five",
            "late thirties",
            "1,000 (a vampire)",
            "Adult",
        ] {
            let mut t = s.clone();
            t.characters.get_mut("pc").unwrap().age = Some(age.into());
            t.validate()
                .unwrap_or_else(|e| panic!("{age}: {}", e.message));
        }
        // Other ratings leave ages alone.
        let mut t = lighthouse();
        t.narration.rating = Some(ContentRating::Mature);
        t.characters.get_mut("pc").unwrap().age = Some("16".into());
        t.validate().unwrap();
    }

    #[test]
    fn minor_ages_are_recognized() {
        assert!(names_a_minor("12"));
        assert!(names_a_minor("seventeen"));
        assert!(names_a_minor("looks like a kid"));
        assert!(!names_a_minor("nineteen"));
        assert!(!names_a_minor("thirty-one"));
        assert!(!names_a_minor("40s"));
        assert!(!names_a_minor(""));
    }
}

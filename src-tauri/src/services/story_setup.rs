//! "Fill in the rest" while creating a story: the storyteller drafts the
//! fields the player left empty (a step's, or every step's) so they fit
//! with what the player already wrote. Nothing the player wrote is changed
//! and nothing is saved; the wizard shows the result, which stays editable.
//!
//! A connection gets one request (purpose `character_suggestion`, shown as
//! "Story ideas and pictures" in Usage) asking for a JSON object. Offline,
//! the fields come from the preset world, scenario and character that fit
//! the draft best; when the player described a world none of them fits,
//! offline fills in nothing rather than mixing two worlds.

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

use crate::db::providers;
use crate::db::usage::RequestPurpose;
use crate::domain::draft::{CreateStoryDraft, DraftStep};
use crate::domain::provider::{GenerateRequest, ModelMessage, Role, StorytellerChoice};
use crate::domain::story_state::{names_a_minor, Character, Control, Relationship};
use crate::domain::templates::{QuickStartInput, TemplateCatalog, PLAYER_PLACEHOLDER};
use crate::errors::{AppError, AppResult, ErrorCode};
use crate::services::generation::{call_once, CallPurpose};
use crate::services::memory::{written_in, SummaryEnv};
use crate::services::tokens::estimate_messages;

/// Who filled the fields in when no connection was used.
pub const OFFLINE_FILL_BY: &str = "the offline storyteller";
/// Room for a whole story's worth of fields, and for models that think first.
const FILL_MAX_OUTPUT_TOKENS: u32 = 1_500;
/// New characters asked for when the cast is empty.
const NEW_CAST: usize = 3;
const SHORT_CHARS: usize = 160;
const LONG_CHARS: usize = 1_200;
const LIST_ITEMS: usize = 5;

/// A field "Fill in the rest" can write. The app shows each by its label.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum FillField {
    Setting,
    Era,
    WorldDescription,
    WorldRules,
    Name,
    Pronouns,
    Age,
    Role,
    Appearance,
    Personality,
    Goals,
    About,
    Title,
    StartingLocation,
    OpeningScene,
    Premise,
    FirstChapterTitle,
    Threads,
    /// New characters when there were none, or the empty details of the
    /// ones the player added.
    Cast,
    Tone,
}

use FillField as F;

const WORLD_FIELDS: &[FillField] = &[F::Setting, F::Era, F::WorldDescription, F::WorldRules];
const PLAYER_FIELDS: &[FillField] = &[
    F::Name,
    F::Pronouns,
    F::Age,
    F::Role,
    F::Appearance,
    F::Personality,
    F::Goals,
    F::About,
];
const STORY_FIELDS: &[FillField] = &[
    F::Title,
    F::StartingLocation,
    F::OpeningScene,
    F::Cast,
    F::Premise,
    F::FirstChapterTitle,
    F::Threads,
];
const NARRATION_FIELDS: &[FillField] = &[F::Tone];

/// The draft with the empty fields filled in, and which ones were.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct FilledDraft {
    pub draft: CreateStoryDraft,
    /// In the order the wizard shows them; empty when nothing could be filled.
    pub filled: Vec<FillField>,
    /// The connection's name, or [`OFFLINE_FILL_BY`].
    pub written_by: String,
}

impl FillField {
    /// The key the model answers with.
    fn key(self) -> &'static str {
        match self {
            F::Setting => "setting",
            F::Era => "era",
            F::WorldDescription => "worldDescription",
            F::WorldRules => "worldRules",
            F::Name => "name",
            F::Pronouns => "pronouns",
            F::Age => "age",
            F::Role => "role",
            F::Appearance => "appearance",
            F::Personality => "personality",
            F::Goals => "goals",
            F::About => "about",
            F::Title => "title",
            F::StartingLocation => "startingLocation",
            F::OpeningScene => "openingScene",
            F::Premise => "premise",
            F::FirstChapterTitle => "firstChapterTitle",
            F::Threads => "threads",
            F::Cast => "cast",
            F::Tone => "tone",
        }
    }

    /// What the model is asked to write for the field.
    fn ask(self) -> &'static str {
        match self {
            F::Setting => "string: where the story takes place, a few words (\"a fishing town on a cold northern coast\")",
            F::Era => "string: when it takes place, a few words (\"present day\", \"1920s\", \"an age of airships\")",
            F::WorldDescription => "string: two to four sentences about the world: its history, mood, and how it works",
            F::WorldRules => "array of up to 4 short strings: things that are always true in this world",
            F::Name => "string: the player character's full name",
            F::Pronouns => "string: the player character's pronouns (\"she/her\")",
            F::Age => "string: the player character's age, an adult (18 or older)",
            F::Role => "string: the player character's role or job, a few words",
            F::Appearance => "string: one or two sentences on how the player character looks",
            F::Personality => "array of 3 or 4 short strings: the player character's traits",
            F::Goals => "array of 1 to 3 short strings: what the player character wants",
            F::About => "string: one or two sentences on who the player character is and where they come from",
            F::Title => "string: a title for the story, two to six words",
            F::StartingLocation => "string: where the player character is when the story begins, a few words",
            F::OpeningScene => "string: two or three sentences on what is happening as the story begins, ending on a moment that invites the player to act",
            F::Premise => "string: one or two sentences on what the story is about, for the library",
            F::FirstChapterTitle => "string: the first chapter's title, two to five words",
            F::Threads => "array of 2 or 3 short strings: mysteries, promises or goals the story can follow",
            F::Cast => "", // Depends on the cast; see `cast_ask`.
            F::Tone => "string: the story's tone in a few words (\"warm and slow-burning, with dry humour\")",
        }
    }
}

/// The fields `step` covers (every step's for `None` or Review).
fn fields_of(step: Option<DraftStep>) -> Vec<FillField> {
    match step {
        Some(DraftStep::World) => WORLD_FIELDS.to_vec(),
        Some(DraftStep::Character) => PLAYER_FIELDS.to_vec(),
        Some(DraftStep::Story) => STORY_FIELDS.to_vec(),
        Some(DraftStep::Narration) => NARRATION_FIELDS.to_vec(),
        Some(DraftStep::Pictures) => vec![],
        None | Some(DraftStep::Review) => {
            [WORLD_FIELDS, PLAYER_FIELDS, STORY_FIELDS, NARRATION_FIELDS].concat()
        }
    }
}

fn blank(s: &str) -> bool {
    s.trim().is_empty()
}

fn blank_opt(s: &Option<String>) -> bool {
    s.as_deref().is_none_or(blank)
}

/// The cast members with a detail left empty.
fn cast_gaps(draft: &CreateStoryDraft) -> Vec<&Character> {
    draft
        .npcs
        .iter()
        .filter(|c| {
            blank_opt(&c.role)
                || blank_opt(&c.appearance)
                || blank_opt(&c.description)
                || c.personality.is_empty()
        })
        .collect()
}

fn is_empty(draft: &CreateStoryDraft, field: FillField) -> bool {
    let p = &draft.player;
    match field {
        F::Setting => blank(&draft.world.setting),
        F::Era => blank(&draft.world.era),
        F::WorldDescription => blank(&draft.world.description),
        F::WorldRules => draft.world.rules.is_empty(),
        F::Name => blank(&p.name),
        F::Pronouns => blank_opt(&p.pronouns),
        F::Age => blank_opt(&p.age),
        F::Role => blank_opt(&p.role),
        F::Appearance => blank_opt(&p.appearance),
        F::Personality => p.personality.is_empty(),
        F::Goals => p.goals.is_empty(),
        F::About => blank_opt(&p.description),
        F::Title => blank(&draft.title),
        F::StartingLocation => blank(&draft.scene.location),
        F::OpeningScene => blank(&draft.scene.summary),
        F::Premise => blank(&draft.description),
        F::FirstChapterTitle => blank(&draft.first_chapter_title),
        F::Threads => draft.open_threads.is_empty(),
        F::Cast => draft.npcs.is_empty() || !cast_gaps(draft).is_empty(),
        F::Tone => blank(&draft.narration.tone),
    }
}

/// The fields of `step` that are empty in `draft`.
pub fn empty_fields(draft: &CreateStoryDraft, step: Option<DraftStep>) -> Vec<FillField> {
    fields_of(step)
        .into_iter()
        .filter(|f| is_empty(draft, *f))
        .collect()
}

fn cast_ask(draft: &CreateStoryDraft) -> String {
    let person = "{\"name\", \"role\", \"howTheyKnowYou\", \"pronouns\", \"age\" (an adult, \
                  18 or older), \"appearance\", \"personality\" (array of 2 or 3 short strings), \
                  \"about\" (one or two sentences)}";
    if draft.npcs.is_empty() {
        format!(
            "array of 2 or {NEW_CAST} people the player character will meet, each an object \
             {person}"
        )
    } else {
        let names: Vec<&str> = cast_gaps(draft)
            .iter()
            .map(|c| c.name.trim())
            .filter(|n| !n.is_empty())
            .collect();
        format!(
            "array with one object for each of these people, by the same name, filling in \
             only what is missing about them: {}. Each object is {person}",
            names.join(", ")
        )
    }
}

/// What the player wrote, for the model to build on: only fields with text.
fn written(draft: &CreateStoryDraft) -> Value {
    fn put(map: &mut serde_json::Map<String, Value>, key: &str, v: Value) {
        let empty = match &v {
            Value::String(s) => s.trim().is_empty(),
            Value::Array(a) => a.is_empty(),
            Value::Object(o) => o.is_empty(),
            Value::Null => true,
            _ => false,
        };
        if !empty {
            map.insert(key.into(), v);
        }
    }
    fn person(c: &Character, relationships: &[Relationship]) -> Value {
        let mut m = serde_json::Map::new();
        put(&mut m, "name", c.name.clone().into());
        for (k, v) in [
            ("role", &c.role),
            ("pronouns", &c.pronouns),
            ("age", &c.age),
            ("species", &c.species),
            ("appearance", &c.appearance),
            ("about", &c.description),
        ] {
            put(&mut m, k, v.clone().unwrap_or_default().into());
        }
        put(&mut m, "personality", c.personality.clone().into());
        put(&mut m, "goals", c.goals.clone().into());
        put(&mut m, "abilities", c.abilities.clone().into());
        if let Some(r) = relationships.iter().find(|r| {
            (r.from_id == c.id && r.to_id == PLAYER_PLACEHOLDER)
                || (r.to_id == c.id && r.from_id == PLAYER_PLACEHOLDER)
        }) {
            put(&mut m, "howTheyKnowYou", r.label.clone().into());
        }
        Value::Object(m)
    }
    let mut m = serde_json::Map::new();
    put(
        &mut m,
        "typeOfStory",
        draft.story_type.clone().unwrap_or_default().into(),
    );
    put(&mut m, "genres", draft.narration.genres.clone().into());
    put(&mut m, "title", draft.title.clone().into());
    put(&mut m, "setting", draft.world.setting.clone().into());
    put(&mut m, "era", draft.world.era.clone().into());
    put(
        &mut m,
        "worldDescription",
        draft.world.description.clone().into(),
    );
    put(&mut m, "worldRules", draft.world.rules.clone().into());
    put(
        &mut m,
        "playerCharacter",
        person(&draft.player, &draft.relationships),
    );
    let cast: Vec<Value> = draft
        .npcs
        .iter()
        .map(|c| person(c, &draft.relationships))
        .collect();
    put(&mut m, "cast", cast.into());
    put(
        &mut m,
        "startingLocation",
        draft.scene.location.clone().into(),
    );
    put(&mut m, "openingScene", draft.scene.summary.clone().into());
    put(&mut m, "premise", draft.description.clone().into());
    put(
        &mut m,
        "firstChapterTitle",
        draft.first_chapter_title.clone().into(),
    );
    put(&mut m, "threads", draft.open_threads.clone().into());
    put(&mut m, "tone", draft.narration.tone.clone().into());
    put(&mut m, "themes", draft.narration.themes.clone().into());
    put(&mut m, "avoid", draft.narration.limits.clone().into());
    Value::Object(m)
}

/// The request for the fields in `empty`.
pub fn fill_messages(draft: &CreateStoryDraft, empty: &[FillField]) -> Vec<ModelMessage> {
    let keys: Vec<String> = empty
        .iter()
        .map(|f| {
            let ask = if *f == F::Cast {
                cast_ask(draft)
            } else {
                f.ask().to_string()
            };
            format!("\"{}\": {ask}", f.key())
        })
        .collect();
    let so_far = written(draft);
    let start = if so_far.as_object().is_some_and(|m| m.is_empty()) {
        "The player has not written anything yet. Invent a fresh, original story.".to_string()
    } else {
        format!(
            "WHAT THE PLAYER WROTE (keep to it):\n{}",
            serde_json::to_string_pretty(&so_far).unwrap_or_default()
        )
    };
    vec![
        ModelMessage {
            role: Role::System,
            content: format!(
                "You help a player set up an interactive story before it begins. Fill in the \
                 empty fields listed below so they fit what the player already wrote, and each \
                 other. Never contradict or repeat what the player wrote, and invent your own \
                 names and places rather than borrowing from well-known books, films or \
                 games. Every character is an adult, 18 or older. Describe how people look \
                 without explicit or sexual detail.{}\n\nReply with one JSON object and \
                 nothing else, with exactly these keys:\n{}",
                written_in(draft.narration.language.as_deref()),
                keys.join("\n")
            ),
        },
        ModelMessage {
            role: Role::User,
            content: start,
        },
    ]
}

/// One line of text, cut to `max` characters.
fn short(v: &Value, max: usize) -> Option<String> {
    let s = v.as_str()?.split_whitespace().collect::<Vec<_>>().join(" ");
    let s: String = s.chars().take(max).collect();
    (!s.trim().is_empty()).then(|| s.trim().to_string())
}

/// Text that may have paragraphs, cut to `max` characters.
fn long(v: &Value, max: usize) -> Option<String> {
    let s: String = v.as_str()?.trim().chars().take(max).collect();
    (!s.trim().is_empty()).then(|| s.trim().to_string())
}

/// A list from an array, or from a string of lines or commas.
fn list(v: &Value) -> Vec<String> {
    let items: Vec<String> = match v {
        Value::Array(a) => a.iter().filter_map(|x| short(x, SHORT_CHARS)).collect(),
        Value::String(s) => s
            .split(['\n', ',', ';'])
            .map(|x| x.trim().trim_start_matches(['-', '*', '•']).trim())
            .filter(|x| !x.is_empty())
            .map(|x| x.chars().take(SHORT_CHARS).collect())
            .collect(),
        _ => vec![],
    };
    let mut seen = BTreeSet::new();
    items
        .into_iter()
        .filter(|x| seen.insert(x.to_lowercase()))
        .take(LIST_ITEMS)
        .collect()
}

/// The JSON object in a reply that may wrap it in prose or a code fence.
fn json_object(reply: &str) -> Option<serde_json::Map<String, Value>> {
    let start = reply.find('{')?;
    let end = reply.rfind('}')?;
    if end <= start {
        return None;
    }
    match serde_json::from_str::<Value>(&reply[start..=end]) {
        Ok(Value::Object(m)) => Some(m),
        _ => None,
    }
}

fn set_opt(slot: &mut Option<String>, v: Option<String>) -> bool {
    match v {
        Some(v) if blank_opt(slot) => {
            *slot = Some(v);
            true
        }
        _ => false,
    }
}

fn set_vec(slot: &mut Vec<String>, v: Vec<String>) -> bool {
    if slot.is_empty() && !v.is_empty() {
        *slot = v;
        true
    } else {
        false
    }
}

fn set_text(slot: &mut String, v: Option<String>) -> bool {
    match v {
        Some(v) if blank(slot) => {
            *slot = v;
            true
        }
        _ => false,
    }
}

/// An adult's age, or nothing: an age that reads as a minor is dropped.
fn adult_age(v: Option<&Value>) -> Option<String> {
    let age = match v? {
        Value::Number(n) => n.to_string(),
        other => short(other, 40)?,
    };
    (!names_a_minor(&age)).then_some(age)
}

/// Fill the gaps of one person from the model's object for them.
fn fill_person(c: &mut Character, o: &serde_json::Map<String, Value>) -> bool {
    let get = |k: &str| o.get(k);
    let mut changed = false;
    changed |= set_opt(&mut c.role, get("role").and_then(|v| short(v, SHORT_CHARS)));
    changed |= set_opt(&mut c.pronouns, get("pronouns").and_then(|v| short(v, 40)));
    changed |= set_opt(
        &mut c.appearance,
        get("appearance").and_then(|v| long(v, LONG_CHARS)),
    );
    changed |= set_opt(
        &mut c.description,
        get("about").and_then(|v| long(v, LONG_CHARS)),
    );
    changed |= set_vec(
        &mut c.personality,
        get("personality").map(list).unwrap_or_default(),
    );
    if let Some(age) = adult_age(get("age")) {
        changed |= set_opt(&mut c.age, Some(age));
    }
    changed
}

fn next_npc_id(npcs: &[Character]) -> String {
    (1..)
        .map(|n| format!("custom:npc-{n}"))
        .find(|id| !npcs.iter().any(|c| &c.id == id))
        .expect("an unused id")
}

/// New characters, or the missing details of the ones already there.
fn merge_cast(draft: &mut CreateStoryDraft, v: &Value) -> bool {
    let Some(people) = v.as_array() else {
        return false;
    };
    let people = people.iter().filter_map(Value::as_object);
    if draft.npcs.is_empty() {
        let player = draft.player.name.trim().to_lowercase();
        let mut added = false;
        for o in people.take(NEW_CAST) {
            let Some(name) = o.get("name").and_then(|v| short(v, 80)) else {
                continue;
            };
            if name.to_lowercase() == player
                || draft
                    .npcs
                    .iter()
                    .any(|c| c.name.eq_ignore_ascii_case(&name))
            {
                continue;
            }
            // Anyone who reads as a minor is left out altogether.
            if o.get("age")
                .and_then(|v| v.as_str().map(str::to_string).or(Some(v.to_string())))
                .is_some_and(|a| names_a_minor(&a))
            {
                continue;
            }
            let mut c = Character {
                id: next_npc_id(&draft.npcs),
                name,
                control: Control::Npc,
                ..Character::default()
            };
            fill_person(&mut c, o);
            if let Some(label) = o.get("howTheyKnowYou").and_then(|v| short(v, SHORT_CHARS)) {
                draft.relationships.push(Relationship {
                    from_id: c.id.clone(),
                    to_id: PLAYER_PLACEHOLDER.into(),
                    label,
                    status: String::new(),
                    source_event_id: None,
                    bond: None,
                });
            }
            draft.npcs.push(c);
            added = true;
        }
        added
    } else {
        let mut changed = false;
        for o in people {
            let Some(name) = o.get("name").and_then(|v| short(v, 80)) else {
                continue;
            };
            if let Some(c) = draft
                .npcs
                .iter_mut()
                .find(|c| c.name.trim().eq_ignore_ascii_case(&name))
            {
                changed |= fill_person(c, o);
            }
        }
        changed
    }
}

/// Put the model's answer into the fields in `empty` that are still empty.
/// Returns the fields that got something; an unreadable answer is an error.
pub fn merge_reply(
    draft: &mut CreateStoryDraft,
    reply: &str,
    empty: &[FillField],
) -> AppResult<Vec<FillField>> {
    let Some(m) = json_object(reply) else {
        return Err(AppError::new(
            ErrorCode::ProviderError,
            "the storyteller's answer could not be read. Try again, or fill in with the \
             offline storyteller",
        ));
    };
    let mut filled = vec![];
    for &f in empty {
        let Some(v) = m.get(f.key()) else { continue };
        let p = &mut draft.player;
        let done = match f {
            F::Setting => set_text(&mut draft.world.setting, short(v, SHORT_CHARS)),
            F::Era => set_text(&mut draft.world.era, short(v, SHORT_CHARS)),
            F::WorldDescription => set_text(&mut draft.world.description, long(v, LONG_CHARS)),
            F::WorldRules => set_vec(&mut draft.world.rules, list(v)),
            F::Name => set_text(&mut p.name, short(v, 80)),
            F::Pronouns => set_opt(&mut p.pronouns, short(v, 40)),
            F::Age => set_opt(&mut p.age, adult_age(Some(v))),
            F::Role => set_opt(&mut p.role, short(v, SHORT_CHARS)),
            F::Appearance => set_opt(&mut p.appearance, long(v, LONG_CHARS)),
            F::Personality => set_vec(&mut p.personality, list(v)),
            F::Goals => set_vec(&mut p.goals, list(v)),
            F::About => set_opt(&mut p.description, long(v, LONG_CHARS)),
            F::Title => set_text(&mut draft.title, short(v, SHORT_CHARS)),
            F::StartingLocation => set_text(&mut draft.scene.location, short(v, SHORT_CHARS)),
            F::OpeningScene => set_text(&mut draft.scene.summary, long(v, LONG_CHARS)),
            F::Premise => set_text(&mut draft.description, long(v, LONG_CHARS)),
            F::FirstChapterTitle => set_text(&mut draft.first_chapter_title, short(v, 80)),
            F::Threads => set_vec(&mut draft.open_threads, list(v)),
            F::Cast => merge_cast(draft, v),
            F::Tone => set_text(&mut draft.narration.tone, short(v, SHORT_CHARS)),
        };
        if done {
            filled.push(f);
        }
    }
    Ok(filled)
}

/// Words too common to tell one preset from another.
const COMMON: &[&str] = &[
    "the", "and", "with", "for", "from", "that", "this", "are", "was", "where", "when", "its",
    "into", "over", "under", "who", "has", "have", "very", "but", "not", "all", "one", "out",
    "you", "your", "their", "they", "there", "about", "after", "before", "some", "full", "small",
    "big", "old", "new", "town", "city",
];

/// Lower-case words of three letters or more, for matching presets.
fn words(text: &str) -> BTreeSet<String> {
    text.split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.chars().count() >= 3)
        .map(str::to_lowercase)
        .filter(|w| !COMMON.contains(&w.as_str()))
        .collect()
}

fn overlap(a: &BTreeSet<String>, b: &BTreeSet<String>) -> usize {
    a.intersection(b).count()
}

fn genre_fits(genres: &[String], story_type: Option<&str>) -> bool {
    match story_type.map(str::trim).filter(|t| !t.is_empty()) {
        None => true,
        Some(t) => genres.iter().any(|g| g.trim().eq_ignore_ascii_case(t)),
    }
}

/// The best scored item; `seed` picks among equally good ones, so pressing
/// again offers another preset.
fn pick_best<T>(items: impl Iterator<Item = (usize, T)>, seed: u64) -> Option<(usize, T)> {
    let mut items: Vec<(usize, T)> = items.collect();
    let best = items.iter().map(|(s, _)| *s).max()?;
    items.retain(|(s, _)| *s == best);
    let i = (seed % items.len() as u64) as usize;
    Some(items.swap_remove(i))
}

/// The preset world, scenario and character that fit the draft best, or
/// `None` when the player described a world that no preset matches.
fn best_presets(
    catalog: &TemplateCatalog,
    draft: &CreateStoryDraft,
    seed: u64,
) -> Option<(String, String, String)> {
    let world_text = format!(
        "{} {} {} {}",
        draft.world.setting,
        draft.world.era,
        draft.world.description,
        draft.world.rules.join(" ")
    );
    let typed = words(&world_text);
    let story_type = draft.story_type.as_deref();
    let world = match draft
        .world_template_id
        .as_ref()
        .and_then(|id| catalog.worlds.iter().find(|w| &w.id == id))
    {
        Some(w) => w,
        None => {
            let fitting: Vec<_> = catalog
                .worlds
                .iter()
                .filter(|w| genre_fits(&w.narration.genres, story_type))
                .collect();
            let pool = if fitting.is_empty() {
                catalog.worlds.iter().collect()
            } else {
                fitting
            };
            let scored = pool.into_iter().map(|w| {
                let about = words(&format!(
                    "{} {} {} {} {} {}",
                    w.label,
                    w.summary,
                    w.world.setting,
                    w.world.era,
                    w.world.description,
                    w.narration.genres.join(" ")
                ));
                (overlap(&typed, &about), w)
            });
            let (score, w) = pick_best(scored, seed)?;
            if score == 0 && !typed.is_empty() {
                return None;
            }
            w
        }
    };
    let story_text = words(&format!(
        "{} {} {} {}",
        draft.title, draft.description, draft.scene.location, draft.scene.summary
    ));
    let scenario = draft
        .scenario_template_id
        .as_ref()
        .and_then(|id| catalog.scenarios.iter().find(|s| &s.id == id))
        .filter(|s| s.fits(&world.id))
        .or_else(|| {
            let fitting = catalog
                .scenarios
                .iter()
                .filter(|s| s.fits(&world.id))
                .map(|s| {
                    let about = words(&format!("{} {} {}", s.label, s.summary, s.description));
                    (overlap(&story_text, &about), s)
                });
            pick_best(fitting, seed).map(|(_, s)| s)
        })?;
    let player = &draft.player;
    let player_text = words(&format!(
        "{} {} {} {}",
        player.role.as_deref().unwrap_or_default(),
        player.species.as_deref().unwrap_or_default(),
        player.description.as_deref().unwrap_or_default(),
        player.personality.join(" ")
    ));
    let character = draft
        .character_template_id
        .as_ref()
        .and_then(|id| catalog.characters.iter().find(|c| &c.id == id))
        .or_else(|| {
            let suiting = catalog
                .characters
                .iter()
                .filter(|c| c.suits.is_empty() || c.suits.contains(&world.id))
                .map(|c| {
                    let about = words(&format!(
                        "{} {} {}",
                        c.label,
                        c.summary,
                        c.character.role.as_deref().unwrap_or_default()
                    ));
                    (overlap(&player_text, &about), c)
                });
            pick_best(suiting, seed).map(|(_, c)| c)
        })?;
    Some((world.id.clone(), scenario.id.clone(), character.id.clone()))
}

/// Fill the fields in `empty` from the presets that fit the draft best;
/// `seed` chooses among presets that fit equally well.
pub fn fill_offline(
    catalog: &TemplateCatalog,
    draft: &mut CreateStoryDraft,
    empty: &[FillField],
    seed: u64,
) -> AppResult<Vec<FillField>> {
    let Some((world_id, scenario_id, character_id)) = best_presets(catalog, draft, seed) else {
        return Ok(vec![]);
    };
    let preset = catalog.compose_draft(&QuickStartInput {
        world_id,
        scenario_id,
        character_id,
        perspective: None,
        detail: None,
        story_type: draft.story_type.clone(),
        language: draft.narration.language.clone(),
    })?;
    let from = &preset.player;
    let mut filled = vec![];
    for &f in empty {
        let p = &mut draft.player;
        let some = |s: &str| (!blank(s)).then(|| s.to_string());
        let done = match f {
            F::Setting => set_text(&mut draft.world.setting, some(&preset.world.setting)),
            F::Era => set_text(&mut draft.world.era, some(&preset.world.era)),
            F::WorldDescription => set_text(
                &mut draft.world.description,
                some(&preset.world.description),
            ),
            F::WorldRules => set_vec(&mut draft.world.rules, preset.world.rules.clone()),
            F::Name => set_text(&mut p.name, some(&from.name)),
            F::Pronouns => set_opt(&mut p.pronouns, from.pronouns.clone()),
            F::Age => set_opt(&mut p.age, from.age.clone()),
            F::Role => set_opt(&mut p.role, from.role.clone()),
            F::Appearance => set_opt(&mut p.appearance, from.appearance.clone()),
            F::Personality => set_vec(&mut p.personality, from.personality.clone()),
            F::Goals => set_vec(&mut p.goals, from.goals.clone()),
            F::About => set_opt(&mut p.description, from.description.clone()),
            F::Title => set_text(&mut draft.title, some(&preset.title)),
            F::StartingLocation => {
                set_text(&mut draft.scene.location, some(&preset.scene.location))
            }
            F::OpeningScene => set_text(&mut draft.scene.summary, some(&preset.scene.summary)),
            F::Premise => set_text(&mut draft.description, some(&preset.description)),
            F::FirstChapterTitle => set_text(
                &mut draft.first_chapter_title,
                some(&preset.first_chapter_title),
            ),
            F::Threads => set_vec(&mut draft.open_threads, preset.open_threads.clone()),
            // Offline only brings a whole preset cast; it can't describe
            // people the player made up.
            F::Cast if draft.npcs.is_empty() && !preset.npcs.is_empty() => {
                draft.npcs = preset.npcs.clone();
                draft
                    .relationships
                    .extend(preset.relationships.iter().cloned());
                true
            }
            F::Cast => false,
            F::Tone => set_text(&mut draft.narration.tone, some(&preset.narration.tone)),
        };
        if done {
            filled.push(f);
        }
    }
    Ok(filled)
}

/// Fill in the empty fields of `step` (every step for `None`) with the
/// draft's storyteller, the app's, or offline when `offline` is set.
pub async fn fill_draft(
    env: &SummaryEnv<'_>,
    mut draft: CreateStoryDraft,
    step: Option<DraftStep>,
    offline: bool,
) -> AppResult<FilledDraft> {
    let empty = empty_fields(&draft, step);
    if empty.is_empty() {
        return Ok(FilledDraft {
            draft,
            filled: vec![],
            written_by: String::new(),
        });
    }
    let connection = if offline {
        None
    } else {
        match &draft.storyteller {
            Some(StorytellerChoice::Offline) => None,
            Some(StorytellerChoice::Connection { id }) => Some(id.clone()),
            None => providers::storyteller(env.db).await?,
        }
    };
    let Some(pid) = connection else {
        let seed = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.subsec_nanos() as u64 ^ d.as_secs())
            .unwrap_or(0);
        let filled = fill_offline(&TemplateCatalog::bundled(), &mut draft, &empty, seed)?;
        return Ok(FilledDraft {
            draft,
            filled,
            written_by: OFFLINE_FILL_BY.into(),
        });
    };
    let row = providers::get_profile_row(env.db, &pid).await?;
    if !row.adapter()?.writes_stories() {
        return Err(AppError::invalid_input(
            "that connection makes pictures or reads aloud, not stories; choose a storyteller \
             that writes",
        ));
    }
    let settings = row.settings();
    let max_output = settings.max_output_tokens.max(FILL_MAX_OUTPUT_TOKENS);
    let messages = fill_messages(&draft, &empty);
    if estimate_messages(&messages).saturating_add(max_output) > settings.max_context_tokens {
        return Err(AppError::new(
            ErrorCode::ContextTooLong,
            "what you wrote is longer than the storyteller's context limit. Shorten it, or \
             raise the limit",
        ));
    }
    let req = GenerateRequest {
        model_id: row.model_id.clone(),
        messages,
        max_output_tokens: max_output,
        temperature: settings.temperature,
        timeout_ms: settings.timeout_ms,
        context_tokens: Some(settings.max_context_tokens),
    };
    let (c, _ledger) = call_once(
        env.db,
        env.secrets,
        env.session_id,
        &row,
        &req,
        CallPurpose {
            purpose: RequestPurpose::CharacterSuggestion,
            route_id: None,
            allow_unpriced: false,
        },
    )
    .await?;
    let filled = merge_reply(&mut draft, &c.text, &empty)?;
    Ok(FilledDraft {
        draft,
        filled,
        written_by: row.label,
    })
}

#[cfg(test)]
mod tests;

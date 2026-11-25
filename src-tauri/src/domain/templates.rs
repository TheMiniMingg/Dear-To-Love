//! Bundled offline templates (world, scenario, character) and Quick Start
//! resolution. Merge order: app defaults < world < scenario < characters <
//! the user's choices. Conflicting character IDs are an error, never merged.

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::draft::{CreateStoryDraft, DRAFT_SCHEMA_VERSION};
use super::story::{ChapterOutlineInput, CreateStoryInput};
use super::story_state::{Character, Control, Detail, Narration, Perspective, Relationship, World};
use super::tracking::Tracking;
use crate::errors::{AppError, AppResult};

pub const TEMPLATE_SCHEMA_VERSION: u32 = 1;
/// Placeholder in scenario relationships for the chosen player character.
pub const PLAYER_PLACEHOLDER: &str = "@player";

/// The bundled templates in English, and the same templates' words in each
/// language they are translated into (`templates/v1/<language>/`).
macro_rules! bundled {
    ($($file:literal),* $(,)?) => {
        const BUNDLED: &[&str] =
            &[$(include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../templates/v1/", $file))),*];
        const BUNDLED_ZH_HANS: &[&str] = &[$(include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../templates/v1/zh-Hans/",
            $file
        ))),*];
    };
}

// 33 worlds, 47 scenarios and 27 characters, in picker order.
bundled! {
    "world.harbor-town.json",
    "world.glass-orchard.json",
    "world.meridian-station.json",
    "world.ashcombe-1923.json",
    "world.hollow-pines.json",
    "world.ember-road.json",
    "world.larkport.json",
    "world.vesper-city.json",
    "world.northgate.json",
    "world.underhalls.json",
    "world.neon-harbor.json",
    "world.dry-country.json",
    "world.lumen-city.json",
    "world.dust-creek.json",
    "world.lantern-palace.json",
    "world.maple-fern.json",
    "world.greywatch.json",
    "world.arclight.json",
    "world.saltmarsh-lyceum.json",
    "world.brackwater.json",
    "world.juniper-heights.json",
    "world.tallow-drift.json",
    "world.star-lane.json",
    "world.tumbledown-isles.json",
    "world.velvet-court.json",
    "world.aurelia-1934.json",
    "world.shattered-main.json",
    "world.nine-rivers.json",
    "world.rosaline-court.json",
    "world.calder-falls.json",
    "world.isla-monarch.json",
    "world.doomspire.json",
    "world.ashen-throne.json",
    "scenario.unsigned-letter.json",
    "scenario.memory-harvest.json",
    "scenario.night-shift.json",
    "scenario.summer-guest.json",
    "scenario.dead-air.json",
    "scenario.last-caravan.json",
    "scenario.wrong-reservation.json",
    "scenario.ghost-ledger.json",
    "scenario.midterm-week.json",
    "scenario.lantern-job.json",
    "scenario.clean-slate.json",
    "scenario.water-run.json",
    "scenario.blackout.json",
    "scenario.redwater-stage.json",
    "scenario.empress-tea.json",
    "scenario.cafe-first-week.json",
    "scenario.first-raid.json",
    "scenario.lost-party.json",
    "scenario.going-dark.json",
    "scenario.last-free-radio.json",
    "scenario.storm-familiar.json",
    "scenario.thirteenth-bell.json",
    "scenario.supply-run.json",
    "scenario.ghost-liner.json",
    "scenario.ninety-days.json",
    "scenario.potion-shop.json",
    "scenario.treaty-night.json",
    "scenario.empty-cabin.json",
    "scenario.captain-by-morning.json",
    "scenario.stolen-manual.json",
    "scenario.villainess-wakes.json",
    "scenario.tuesday-again.json",
    "scenario.monarch-heist.json",
    "scenario.henchmen-union.json",
    "scenario.regent.json",
    "scenario.storm-season.json",
    "scenario.quiet-signal.json",
    "scenario.the-lodge.json",
    "scenario.silver-claim.json",
    "scenario.glowing-ruins.json",
    "scenario.mountain-tournament.json",
    "scenario.rival-clubs.json",
    "scenario.lantern-festival.json",
    "scenario.book-club.json",
    "scenario.rain-witness.json",
    "scenario.wedding-speech.json",
    "scenario.drowned-queen-map.json",
    "character.new-keeper.json",
    "character.curious-detective.json",
    "character.wandering-musician.json",
    "character.botanist.json",
    "character.runaway-heir.json",
    "character.ship-engineer.json",
    "character.night-host.json",
    "character.sellsword.json",
    "character.transfer-student.json",
    "character.delver.json",
    "character.goblin-tinkerer.json",
    "character.lizardfolk-scout.json",
    "character.rookie-hero.json",
    "character.drifter.json",
    "character.court-physician.json",
    "character.hedge-mage.json",
    "character.disgraced-knight.json",
    "character.netrunner.json",
    "character.field-medic.json",
    "character.salvage-pilot.json",
    "character.trainee.json",
    "character.dukes-daughter.json",
    "character.disciple.json",
    "character.quartermaster.json",
    "character.henchperson.json",
    "character.skeptic.json",
    "character.cat-burglar.json",
}

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
    /// What the story starts tracking (bars, counters, items), for
    /// scenarios written as adventures. Unset: nothing is tracked unless
    /// the player turns it on.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub tracking: Option<Tracking>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CharacterTemplate {
    pub template_schema_version: u32,
    pub id: String,
    pub label: String,
    pub summary: String,
    /// Worlds this character suits best; empty means any world. Only a
    /// suggestion for the pickers: any character can be played anywhere.
    #[serde(default)]
    pub suits: Vec<String>,
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
    /// The type of story chosen first, e.g. "Romance"; it leads the genres.
    #[serde(default)]
    #[ts(optional)]
    pub story_type: Option<String>,
    /// The language to write the story in, e.g. "Japanese". The app sends
    /// its own language; unset keeps the world's (usually none).
    #[serde(default)]
    #[ts(optional)]
    pub language: Option<String>,
    /// What the storyteller offers for the next move; unset keeps the ideas.
    #[serde(default)]
    #[ts(optional)]
    pub next_move: Option<NextMove>,
}

/// What the storyteller offers for the player's next move after each reply.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum NextMove {
    /// Two or three ideas to put in the box.
    Ideas,
    /// Four choices (A to D) that take the story different ways.
    Choices,
    /// Nothing: the player writes every move.
    Off,
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

/// Story types that roll dice for uncertain moments unless the player
/// turns it off. Matches `DICE_STORY_TYPES` in the wizard.
pub const DICE_STORY_TYPES: [&str; 7] = [
    "Adventure",
    "Fantasy",
    "School life",
    "Action",
    "Superhero",
    "Western",
    "Post-apocalyptic",
];

pub fn rolls_dice(story_type: &str) -> bool {
    DICE_STORY_TYPES
        .iter()
        .any(|t| t.eq_ignore_ascii_case(story_type.trim()))
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
                    if let Some(t) = &s.tracking {
                        t.validate().map_err(|e| {
                            AppError::invalid_input(format!("scenario {}: {}", s.id, e.message))
                        })?;
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
        for c in &cat.characters {
            if let Some(w) = c
                .suits
                .iter()
                .find(|w| !cat.worlds.iter().any(|x| &x.id == *w))
            {
                return Err(AppError::invalid_input(format!(
                    "character {} names unknown world {w}",
                    c.id
                )));
            }
        }
        Ok(cat)
    }

    pub fn bundled() -> Self {
        Self::parse(BUNDLED).expect("bundled templates are valid")
    }

    /// The bundled templates with their words in `language` when they are
    /// translated into it ("zh-Hans", "Simplified Chinese"), else English.
    /// Ids, links between templates and choices from lists stay the same.
    pub fn bundled_in(language: Option<&str>) -> Self {
        match template_language(language) {
            Some(words) => {
                let merged: Vec<String> = BUNDLED
                    .iter()
                    .zip(words)
                    .map(|(base, words)| translated(base, words))
                    .collect();
                let refs: Vec<&str> = merged.iter().map(String::as_str).collect();
                Self::parse(&refs).expect("translated templates are valid")
            }
            None => Self::bundled(),
        }
    }

    /// The templates a story starts from: in the story's language when the
    /// templates are translated into it.
    pub fn for_story(input: &QuickStartInput) -> Self {
        Self::bundled_in(input.language.as_deref())
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
        // New stories show texts, calls and letters as cards, with a heading
        // where the place or time changes.
        narration.message_cards = true;
        narration.scene_headings = true;
        if input.story_type.as_deref().is_some_and(rolls_dice) {
            narration.dice = true;
        }
        if let Some(p) = input.perspective {
            narration.perspective = p;
        }
        if let Some(d) = input.detail {
            narration.detail = d;
        }
        match input.next_move {
            Some(NextMove::Choices) => narration.choices = true,
            Some(NextMove::Off) => narration.no_suggestions = true,
            Some(NextMove::Ideas) | None => {}
        }
        if let Some(l) = input.language.as_deref().map(str::trim) {
            if !l.is_empty() {
                narration.language = Some(l.to_string());
            }
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
            story_type: input.story_type.clone(),
            tracking: scenario.tracking.clone(),
            ..CreateStoryDraft::default()
        })
    }

    /// Resolve a Quick Start choice into a validated story. Conflicting
    /// character ids are refused, never merged.
    pub fn resolve_quick_start(&self, input: &QuickStartInput) -> AppResult<CreateStoryInput> {
        self.compose_draft(input)?.into_story_input()
    }
}

/// The translated words for an app language tag or a story language name.
fn template_language(language: Option<&str>) -> Option<&'static [&'static str]> {
    let l = language?.trim().to_lowercase();
    match l.as_str() {
        "zh-hans"
        | "zh-cn"
        | "zh-sg"
        | "zh"
        | "simplified chinese"
        | "chinese (simplified)"
        | "chinese"
        | "简体中文"
        | "中文"
        | "中文（简体）" => Some(BUNDLED_ZH_HANS),
        _ => None,
    }
}

/// Fields a translation never changes: ids, links, and values picked from
/// a list (which the app translates itself when it shows them).
const KEPT_AS_IS: [&str; 14] = [
    "templateSchemaVersion",
    "type",
    "id",
    "fromId",
    "toId",
    "worlds",
    "suits",
    "control",
    "pronouns",
    "age",
    "genres",
    "perspective",
    "detail",
    "pacing",
];

/// `base` with its words replaced by those in `words`, a copy of the same
/// template holding only the translated text. Text replaces text; lists
/// match item by item; anything else in `words` is ignored.
fn translated(base: &str, words: &str) -> String {
    let mut base: serde_json::Value = serde_json::from_str(base).expect("template is JSON");
    let words: serde_json::Value = serde_json::from_str(words).expect("translation is JSON");
    overlay(&mut base, &words);
    base.to_string()
}

fn overlay(base: &mut serde_json::Value, words: &serde_json::Value) {
    use serde_json::Value;
    match (base, words) {
        (Value::Object(b), Value::Object(w)) => {
            for (k, v) in w {
                if KEPT_AS_IS.contains(&k.as_str()) {
                    continue;
                }
                if let Some(slot) = b.get_mut(k) {
                    overlay(slot, v);
                }
            }
        }
        (Value::Array(b), Value::Array(w)) => {
            for (slot, v) in b.iter_mut().zip(w) {
                overlay(slot, v);
            }
        }
        (b @ Value::String(_), Value::String(w)) if !w.trim().is_empty() => {
            *b = Value::String(w.clone());
        }
        _ => {}
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
            story_type: None,
            language: None,
            next_move: None,
        }
    }

    /// T01 (resolution half): Quick Start without free text gives a valid story.
    /// Every text of a template, in order, for comparing translations.
    fn texts(v: &serde_json::Value, out: &mut Vec<String>) {
        match v {
            serde_json::Value::String(s) => out.push(s.clone()),
            serde_json::Value::Array(a) => a.iter().for_each(|x| texts(x, out)),
            serde_json::Value::Object(o) => o
                .iter()
                .filter(|(k, _)| !KEPT_AS_IS.contains(&k.as_str()))
                .for_each(|(_, x)| texts(x, out)),
            _ => {}
        }
    }

    #[test]
    fn simplified_chinese_templates_translate_every_word_and_keep_the_rest() {
        assert_eq!(BUNDLED.len(), BUNDLED_ZH_HANS.len());
        for (base, words) in BUNDLED.iter().zip(BUNDLED_ZH_HANS) {
            let en: serde_json::Value = serde_json::from_str(base).unwrap();
            let zh: serde_json::Value = serde_json::from_str(&translated(base, words)).unwrap();
            let id = en["id"].as_str().unwrap();
            // The same shape, ids, links and picked values.
            let strip = |v: &serde_json::Value| {
                let mut v = v.clone();
                fn blank(v: &mut serde_json::Value, key: Option<&str>) {
                    match v {
                        serde_json::Value::String(s)
                            if !key.is_some_and(|k| KEPT_AS_IS.contains(&k)) =>
                        {
                            s.clear()
                        }
                        serde_json::Value::Array(a) => a.iter_mut().for_each(|x| blank(x, key)),
                        serde_json::Value::Object(o) => {
                            o.iter_mut().for_each(|(k, x)| blank(x, Some(k.as_str())))
                        }
                        _ => {}
                    }
                }
                blank(&mut v, None);
                v
            };
            assert_eq!(strip(&en), strip(&zh), "{id}: only words change");
            // Every word is translated: no English left in a text.
            let mut out = Vec::new();
            texts(&zh, &mut out);
            for t in out {
                let latin = t.chars().filter(|c| c.is_ascii_alphabetic()).count();
                assert!(
                    latin * 3 < t.chars().count() || t.chars().count() < 8,
                    "{id}: untranslated {t:?}"
                );
            }
        }
    }

    #[test]
    fn a_chinese_story_starts_from_chinese_templates() {
        let zh = TemplateCatalog::bundled_in(Some("zh-Hans"));
        let en = TemplateCatalog::bundled();
        assert_eq!(zh.worlds[0].id, en.worlds[0].id);
        assert_ne!(zh.worlds[0].label, en.worlds[0].label);
        for tag in ["Simplified Chinese", " zh-Hans ", "简体中文"] {
            assert_eq!(
                TemplateCatalog::bundled_in(Some(tag)).worlds[0].label,
                zh.worlds[0].label
            );
        }
        for tag in [
            None,
            Some("Japanese"),
            Some("Traditional Chinese"),
            Some("en"),
        ] {
            assert_eq!(
                TemplateCatalog::bundled_in(tag).worlds[0].label,
                en.worlds[0].label
            );
        }
        // Every scenario starts a valid story in Chinese, with a character
        // it suits, and tracked bars still name the right people.
        for s in &zh.scenarios {
            let world = zh
                .worlds
                .iter()
                .find(|w| s.fits(&w.id))
                .expect("a world for each scenario");
            let mut input = starter();
            input.world_id = world.id.clone();
            input.scenario_id = s.id.clone();
            input.language = Some("Simplified Chinese".into());
            let cat = TemplateCatalog::for_story(&input);
            let story = cat.resolve_quick_start(&input).unwrap();
            story.base_state.validate().unwrap();
            assert_eq!(
                story.base_state.narration.language.as_deref(),
                Some("Simplified Chinese")
            );
            let names: Vec<&str> = s.npcs.iter().map(|c| c.name.as_str()).collect();
            let en_s = en.scenarios.iter().find(|e| e.id == s.id).unwrap();
            let en_names: Vec<&str> = en_s.npcs.iter().map(|c| c.name.as_str()).collect();
            let meters = s.tracking.iter().flat_map(|t| &t.meters);
            let en_meters = en_s.tracking.iter().flat_map(|t| &t.meters);
            for (m, e) in meters.zip(en_meters) {
                if let (Some(who), Some(en_who)) = (m.who.as_deref(), e.who.as_deref()) {
                    assert_eq!(
                        names.contains(&who),
                        en_names.contains(&en_who),
                        "{}: bar for {who}",
                        s.id
                    );
                }
            }
        }
    }

    #[test]
    fn bundled_quick_start_resolves_to_valid_state() {
        let cat = TemplateCatalog::bundled();
        assert_eq!(
            (cat.worlds.len(), cat.scenarios.len(), cat.characters.len()),
            (33, 47, 27)
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
    fn the_story_type_leads_the_genres_and_new_stories_show_message_cards() {
        let cat = TemplateCatalog::bundled();
        let mut input = starter();
        let plain = cat
            .resolve_quick_start(&input)
            .unwrap()
            .base_state
            .narration;
        assert!(plain.message_cards);
        assert!(
            plain.scene_headings,
            "new stories head new places and times"
        );
        assert_eq!(plain.genres, ["Mystery", "Romance", "Slice of life"]);
        input.story_type = Some("Romance".into());
        let n = cat
            .resolve_quick_start(&input)
            .unwrap()
            .base_state
            .narration;
        assert_eq!(n.genres, ["Romance", "Mystery", "Slice of life"]);
        input.story_type = Some(" School life ".into());
        let n = cat
            .resolve_quick_start(&input)
            .unwrap()
            .base_state
            .narration;
        assert_eq!(n.genres[0], "School life");
        assert!(n.dice, "a school story rolls for its tests");
        assert!(!plain.dice);
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
        assert!(!d.base_state.narration.choices);
        input.next_move = Some(NextMove::Choices);
        let d = cat.resolve_quick_start(&input).unwrap();
        assert!(d.base_state.narration.choices, "choices A to D when picked");
        input.next_move = Some(NextMove::Off);
        let d = cat.resolve_quick_start(&input).unwrap();
        assert!(d.base_state.narration.no_suggestions && !d.base_state.narration.choices);
    }

    #[test]
    fn a_chosen_language_is_written_into_the_story() {
        let cat = TemplateCatalog::bundled();
        let mut input = starter();
        assert_eq!(
            cat.resolve_quick_start(&input)
                .unwrap()
                .base_state
                .narration
                .language,
            None
        );
        input.language = Some(" Japanese ".into());
        let d = cat.resolve_quick_start(&input).unwrap();
        assert_eq!(d.base_state.narration.language.as_deref(), Some("Japanese"));
        input.language = Some("   ".into());
        let d = cat.resolve_quick_start(&input).unwrap();
        assert_eq!(d.base_state.narration.language, None);
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
            suits: Vec::new(),
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
                        story_type: None,
                        language: None,
                        next_move: None,
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
    fn the_underhalls_has_orcs_goblins_and_lizardfolk() {
        let cat = TemplateCatalog::bundled();
        let job = cat
            .scenarios
            .iter()
            .find(|s| s.id == "starter:lantern-job")
            .unwrap();
        let races: Vec<_> = job
            .npcs
            .iter()
            .filter_map(|c| c.species.as_deref())
            .collect();
        assert_eq!(races, ["Orc", "Goblin", "Lizardfolk"]);
        let input = QuickStartInput {
            world_id: "starter:underhalls".into(),
            scenario_id: job.id.clone(),
            character_id: "starter:delver".into(),
            ..starter()
        };
        let state = cat.resolve_quick_start(&input).unwrap().base_state;
        assert!(state.narration.dice, "a dungeon delve rolls dice");
        let player = &state.characters[&state.player_character_id];
        assert_eq!(player.species.as_deref(), Some("Orc"));
        assert_eq!(player.stats.len(), 3);
    }

    /// A party raid starts with the player's and the party's bars and a
    /// few supplies; a quiet story starts with nothing tracked.
    #[test]
    fn an_adventure_scenario_brings_its_bars_and_items() {
        let cat = TemplateCatalog::bundled();
        let raid = cat
            .scenarios
            .iter()
            .find(|s| s.id == "starter:first-raid")
            .unwrap();
        let input = QuickStartInput {
            world_id: "starter:greywatch".into(),
            scenario_id: raid.id.clone(),
            character_id: "starter:hedge-mage".into(),
            ..starter()
        };
        let state = cat.resolve_quick_start(&input).unwrap().base_state;
        let tr = state.tracking.expect("the raid is tracked");
        let names: Vec<_> = tr
            .meters
            .iter()
            .filter(|m| m.who.is_none())
            .map(|m| m.name.as_str())
            .collect();
        assert_eq!(names, ["Health", "Mana", "Gold"]);
        assert!(tr.inventory && tr.items.iter().any(|i| i.name == "Healing draught"));
        let quiet = cat.resolve_quick_start(&starter()).unwrap().base_state;
        assert!(quiet.tracking.is_none());
    }

    /// Party bars name someone in the scenario (or a ship or house that
    /// is part of it), so the reader can group them under that name.
    #[test]
    fn party_bars_belong_to_someone_in_the_scenario() {
        let cat = TemplateCatalog::bundled();
        let not_people = ["Second Chance", "House Sorel", "House Varn"];
        let mut tracked = 0;
        for s in &cat.scenarios {
            let Some(tr) = &s.tracking else { continue };
            tracked += 1;
            for who in tr.meters.iter().filter_map(|m| m.who.as_deref()) {
                assert!(
                    s.npcs.iter().any(|n| n.name == who) || not_people.contains(&who),
                    "{}: {who} is not in the scenario",
                    s.id
                );
            }
        }
        assert!(tracked >= 15, "most of the new scenarios are tracked");
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

    /// Which worlds a character suits is only a suggestion for the pickers,
    /// but the worlds it names must exist.
    #[test]
    fn characters_suit_worlds_but_can_go_anywhere() {
        let cat = TemplateCatalog::bundled();
        let scout = cat
            .characters
            .iter()
            .find(|c| c.id == "starter:lizardfolk-scout")
            .unwrap();
        assert!(scout.suits.iter().any(|w| w == "starter:underhalls"));
        assert!(!scout.suits.iter().any(|w| w == "starter:northgate"));
        let input = QuickStartInput {
            world_id: "starter:northgate".into(),
            scenario_id: "starter:midterm-week".into(),
            character_id: scout.id.clone(),
            ..starter()
        };
        assert!(cat.resolve_quick_start(&input).is_ok());
        let nowhere = r#"{"templateSchemaVersion":1,"type":"character","id":"a:c","label":"x","summary":"","suits":["a:nowhere"],"character":{"id":"a:c","name":"x","control":"player"}}"#;
        assert!(TemplateCatalog::parse(&[nowhere]).is_err());
    }

    #[test]
    fn rejects_bad_ids_and_versions() {
        let bad = r#"{"templateSchemaVersion":1,"type":"character","id":"noprefix","label":"x","summary":"","character":{"id":"a:b","name":"x","control":"player"}}"#;
        assert!(TemplateCatalog::parse(&[bad]).is_err());
        let v2 = r#"{"templateSchemaVersion":2,"type":"character","id":"a:b","label":"x","summary":"","character":{"id":"a:b","name":"x","control":"player"}}"#;
        assert!(TemplateCatalog::parse(&[v2]).is_err());
    }
}

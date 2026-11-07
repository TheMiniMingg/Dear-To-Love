//! Deterministic offline storyteller. Used for play without a model, for
//! the engine self-test and for UI tests. Same inputs, same reply.
//!
//! It never names a particular world, but it writes for the kind of story
//! (fantasy, the future, dark, heartfelt, the wild), lets each character
//! talk in a voice that fits their personality, answers texts and calls the
//! way people do, and follows the story's settings: the style, the point
//! of view, headings, thoughts, how often things go wrong, the dice rules
//! and the bars and items it keeps track of. It sets the scene only on the
//! first reply of a chapter, so it never repeats the scene turn after turn.

mod banks;
#[cfg(test)]
mod tests;

use sha2::{Digest, Sha256};

use self::banks::{bank, voices, Bank, Flavor, Voice, Voices};
use crate::domain::dice::DiceSpec;
use crate::domain::replay::EffectiveState;
use crate::domain::story_state::{
    Character, Control, Detail, Narration, NarrationStyle, Perspective, RollFrequency, RollOdds,
    Surprises,
};
use crate::domain::tracking::{item_key, Item, Meter};

pub const MOCK_PROVIDER_LABEL: &str = "Offline storyteller";

/// Picks lines from a hash of the turn and the action.
struct Seed(Vec<u8>);

impl Seed {
    fn byte(&self, salt: u8) -> u8 {
        let mut h = Sha256::new();
        h.update(&self.0);
        h.update([salt]);
        h.finalize()[0]
    }

    fn pick<'a, T>(&self, items: &'a [T], salt: u8) -> &'a T {
        &items[self.byte(salt) as usize % items.len()]
    }

    /// True about one time in `n`.
    fn one_in(&self, n: u8, salt: u8) -> bool {
        self.byte(salt).is_multiple_of(n.max(1))
    }

    /// A number from `low` to `high`, both included.
    fn between(&self, low: i32, high: i32, salt: u8) -> i32 {
        if high <= low {
            return low;
        }
        low + (self.byte(salt) as i32 % (high - low + 1))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Pronoun {
    She,
    He,
    They,
}

/// Who "you" is in the story's point of view.
struct Person {
    view: Perspective,
    name: String,
    pronoun: Pronoun,
}

impl Person {
    /// Fills the tokens of a line (see `banks`).
    fn say(&self, line: &str) -> String {
        let third = |she: &'static str, he: &'static str, they: &'static str| match self.pronoun {
            Pronoun::She => she,
            Pronoun::He => he,
            Pronoun::They => they,
        };
        let owner = format!("{}'s", self.name);
        let forms: [(&str, &str); 14] = match self.view {
            Perspective::First => [
                ("{You}", "I"),
                ("{you}", "I"),
                ("{you!}", "me"),
                ("{you*}", "me"),
                ("{your*}", "my"),
                ("{Your}", "My"),
                ("{your}", "my"),
                ("{yourself}", "myself"),
                ("{s}", ""),
                ("{es}", ""),
                ("{are}", "am"),
                ("{were}", "was"),
                ("{have}", "have"),
                ("{do}", "do"),
            ],
            Perspective::Second => [
                ("{You}", "You"),
                ("{you}", "you"),
                ("{you!}", "you"),
                ("{you*}", "you"),
                ("{your*}", "your"),
                ("{Your}", "Your"),
                ("{your}", "your"),
                ("{yourself}", "yourself"),
                ("{s}", ""),
                ("{es}", ""),
                ("{are}", "are"),
                ("{were}", "were"),
                ("{have}", "have"),
                ("{do}", "do"),
            ],
            Perspective::Third => [
                ("{You}", &self.name),
                ("{you}", &self.name),
                ("{you!}", third("her", "him", "them")),
                ("{you*}", &self.name),
                ("{your*}", &owner),
                ("{Your}", &owner),
                ("{your}", third("her", "his", "their")),
                ("{yourself}", third("herself", "himself", "themself")),
                ("{s}", "s"),
                ("{es}", "es"),
                ("{are}", "is"),
                ("{were}", "was"),
                ("{have}", "has"),
                ("{do}", "does"),
            ],
        };
        let mut out = line.to_string();
        for (token, word) in forms {
            out = out.replace(token, word);
        }
        out
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ActionKind {
    Look,
    Talk,
    Move,
    Handle,
    Other,
}

/// The player's words, lower case, with simple word endings taken off too.
struct Words(Vec<String>);

impl Words {
    fn of(action: &str) -> Self {
        Words(
            action
                .to_lowercase()
                .split(|c: char| !c.is_alphabetic())
                .filter(|w| !w.is_empty())
                .map(str::to_string)
                .collect(),
        )
    }

    fn stems(w: &str) -> impl Iterator<Item = &str> {
        let cut = |suffix: &str| w.strip_suffix(suffix).filter(|s| s.len() >= 2);
        [
            Some(w),
            cut("s"),
            cut("es"),
            cut("ing"),
            cut("ed"),
            cut("d"),
        ]
        .into_iter()
        .flatten()
    }

    fn is(w: &str, list: &[&str]) -> bool {
        Self::stems(w).any(|s| list.contains(&s))
    }

    fn any(&self, list: &[&str]) -> bool {
        self.0.iter().any(|w| Self::is(w, list))
    }
}

fn classify(action: &str) -> ActionKind {
    // Quoted speech counts as talking; otherwise the first verb-like word decides.
    if action.contains('"') || action.contains('“') {
        return ActionKind::Talk;
    }
    for w in &Words::of(action).0 {
        if Words::is(w, banks::LOOK_WORDS) {
            return ActionKind::Look;
        }
        if Words::is(w, banks::TALK_WORDS) {
            return ActionKind::Talk;
        }
        if Words::is(w, banks::MOVE_WORDS) {
            return ActionKind::Move;
        }
        if Words::is(w, banks::HANDLE_WORDS) {
            return ActionKind::Handle;
        }
    }
    ActionKind::Other
}

/// The kind of story: the genres that set the world first, then the mood,
/// then the era when no genre says.
fn flavor(state: &EffectiveState) -> Flavor {
    let s = &state.state;
    let genres: Vec<String> = s
        .narration
        .genres
        .iter()
        .map(|g| g.trim().to_lowercase())
        .collect();
    let has = |list: &[&str]| genres.iter().any(|g| list.contains(&g.as_str()));
    if has(&["fantasy", "fairy tale", "myth", "sword and sorcery"]) {
        return Flavor::Fantasy;
    }
    if has(&[
        "science fiction",
        "sci-fi",
        "cyberpunk",
        "post-apocalyptic",
        "space opera",
        "superhero",
    ]) {
        return Flavor::Future;
    }
    if has(&[
        "horror",
        "mystery",
        "thriller",
        "noir",
        "dark romance",
        "supernatural",
        "crime",
    ]) {
        return Flavor::Dark;
    }
    if has(&[
        "romance",
        "dating sim",
        "slice of life",
        "school life",
        "comedy",
        "drama",
        "erotica",
    ]) {
        return Flavor::Heart;
    }
    if has(&["adventure", "action", "western", "historical", "survival"]) {
        return Flavor::Wild;
    }
    let world = format!("{} {}", s.world.era, s.world.setting).to_lowercase();
    let mentions = |list: &[&str]| list.iter().any(|w| world.contains(w));
    if mentions(&[
        "medieval", "fantasy", "kingdom", "magic", "dragon", "elven", "dungeon", "sword",
    ]) {
        Flavor::Fantasy
    } else if mentions(&[
        "future", "space", "cyber", "neon", "android", "starship", "orbital", "mars",
    ]) {
        Flavor::Future
    } else {
        Flavor::Plain
    }
}

/// How a character talks, from the words in their personality.
fn voice_of(c: &Character) -> Voice {
    let words = Words(
        c.personality
            .iter()
            .flat_map(|p| Words::of(p).0)
            .collect::<Vec<_>>(),
    );
    banks::VOICE_WORDS
        .iter()
        .find(|(_, list)| words.any(list))
        .map(|(v, _)| *v)
        .unwrap_or(Voice::Plain)
}

fn pronoun_of(c: Option<&Character>) -> Pronoun {
    match c
        .and_then(|c| c.pronouns.as_deref())
        .map(|p| p.trim().to_lowercase())
    {
        Some(p) if p.starts_with("she") => Pronoun::She,
        Some(p) if p.starts_with("he") => Pronoun::He,
        _ => Pronoun::They,
    }
}

/// The value of `attr` on the first `<tag …>` in `text`, if any.
fn first_tag_attr(text: &str, tag: &str, attr: &str) -> Option<String> {
    let start = text.find(&format!("<{tag} "))?;
    let rest = &text[start..];
    let head = &rest[..rest.find('>')?];
    let key = format!("{attr}=\"");
    let value = &head[head.find(&key)? + key.len()..];
    let value = value[..value.find('"')?].trim();
    (!value.is_empty()).then(|| value.to_string())
}

/// A name safe to put inside an attribute.
fn attr(name: &str) -> String {
    name.trim().replace(['"', '<', '>'], "'")
}

/// A short "for" label for a roll from the player's words.
fn roll_label(action: &str) -> String {
    let first = action
        .split(['.', '!', '?', '\n'])
        .map(str::trim)
        .find(|s| !s.is_empty())
        .unwrap_or("Try your luck");
    let mut label: String = first.chars().take(60).collect();
    if let Some(c) = label.chars().next() {
        label.replace_range(..c.len_utf8(), &c.to_uppercase().to_string());
    }
    attr(&label)
}

/// What the player's roll came to, read from the action's roll tag.
struct Rolled {
    result: String,
    outcome: Option<String>,
    critical: Option<String>,
}

impl Rolled {
    fn of(action: &str) -> Option<Self> {
        Some(Rolled {
            result: first_tag_attr(action, "roll", "result")?,
            outcome: first_tag_attr(action, "roll", "outcome"),
            critical: first_tag_attr(action, "roll", "critical"),
        })
    }

    fn failed(&self) -> bool {
        self.outcome.as_deref() == Some("failure")
    }

    fn won(&self) -> bool {
        self.outcome.as_deref() == Some("success")
    }
}

struct Ctx<'a> {
    state: &'a EffectiveState,
    n: &'a Narration,
    action: &'a str,
    seed: Seed,
    turn: usize,
    flavor: Flavor,
    bank: &'static Bank,
    style: NarrationStyle,
    person: Person,
    npc: Option<&'a Character>,
    words: Words,
    kind: ActionKind,
    rolled: Option<Rolled>,
}

/// A short reply to `action`. `turn` is the number of the player's action
/// on the route; `opens_chapter` is true for the first reply after a
/// chapter starts, which also sets the scene.
pub fn reply(state: &EffectiveState, action: &str, turn: usize, opens_chapter: bool) -> String {
    let n = &state.state.narration;
    let seed = Seed(format!("{turn}:{action}").into_bytes());
    // Mixed reads like a narrated story with its cards, offline.
    let style = match n.style.unwrap_or(NarrationStyle::Narrated) {
        NarrationStyle::Mixed => NarrationStyle::Narrated,
        s => s,
    };
    let player = state.state.characters.get(&state.state.player_character_id);
    let person = Person {
        // A script's stage directions are always in the third person.
        view: if style == NarrationStyle::Script {
            Perspective::Third
        } else {
            n.perspective
        },
        name: player
            .and_then(|p| p.name.split_whitespace().next())
            .unwrap_or("You")
            .to_string(),
        pronoun: pronoun_of(player),
    };
    let flavor = flavor(state);
    let npc = present_npc(state, &seed);
    let ctx = Ctx {
        state,
        n,
        action,
        turn,
        flavor,
        bank: bank(flavor),
        style,
        person,
        npc,
        words: Words::of(action),
        kind: classify(action),
        rolled: Rolled::of(action),
        seed,
    };
    // A text or call from the player is answered in kind.
    if let Some(to) = first_tag_attr(action, "text", "to") {
        return ctx.answer_text(&to);
    }
    if let Some(with) = first_tag_attr(action, "call", "with") {
        return ctx.answer_call(&with);
    }
    ctx.scene_text(opens_chapter)
}

/// One of the characters in the scene, else any character the storyteller
/// plays.
fn present_npc<'a>(state: &'a EffectiveState, seed: &Seed) -> Option<&'a Character> {
    let s = &state.state;
    let here: Vec<&Character> = s
        .scene
        .participant_ids
        .iter()
        .filter_map(|id| s.characters.get(id))
        .filter(|c| c.control == Control::Npc && !c.name.trim().is_empty())
        .collect();
    if !here.is_empty() {
        return Some(*seed.pick(&here, 9));
    }
    s.characters
        .values()
        .find(|c| c.control == Control::Npc && !c.name.trim().is_empty())
}

impl Ctx<'_> {
    fn say(&self, line: &str) -> String {
        self.person.say(line)
    }

    fn line(&self, items: &[&str], salt: u8) -> String {
        self.say(self.seed.pick(items, salt))
    }

    /// Narration in the style: in *asterisks* where only speech is plain.
    fn direction(&self, text: &str) -> String {
        match self.style {
            NarrationStyle::Script | NarrationStyle::Roleplay | NarrationStyle::Thoughts => {
                format!("*{}*", text.trim())
            }
            _ => text.to_string(),
        }
    }

    fn voice(&self, c: &Character) -> &'static Voices {
        voices(voice_of(c))
    }

    fn npc_name(&self) -> Option<String> {
        self.npc.map(|c| c.name.trim().to_string())
    }

    fn character_named(&self, name: &str) -> Option<&Character> {
        // "Mara" finds Mara Quill, and "Mara Quill" finds a Mara.
        let want = name.trim().to_lowercase();
        let first = |s: &str| s.split_whitespace().next().map(str::to_string);
        self.state.state.characters.values().find(|c| {
            let n = c.name.trim().to_lowercase();
            n == want || (first(&n).is_some() && first(&n) == first(&want))
        })
    }

    fn texts_on(&self) -> bool {
        self.n.message_cards || self.style == NarrationStyle::Messages
    }

    fn answer_text(&self, to: &str) -> String {
        let to = attr(to);
        let voice = match self.character_named(&to) {
            Some(c) => self.voice(c),
            None => voices(Voice::Plain),
        };
        let texts: Vec<String> = self
            .seed
            .pick(voice.texts, 5)
            .iter()
            .map(|m| format!("<text from=\"{to}\">{m}</text>"))
            .collect();
        let mut parts = vec![texts.join("\n")];
        if self.seed.one_in(2, 6) {
            parts.push(self.line(banks::AFTER_TEXT, 7));
        }
        parts.join("\n\n")
    }

    fn answer_call(&self, with: &str) -> String {
        let with = attr(with);
        let voice = match self.character_named(&with) {
            Some(c) => self.voice(c),
            None => voices(Voice::Plain),
        };
        let lines = self.seed.pick(voice.call, 5);
        let mut parts = vec![format!("<call with=\"{with}\" status=\"connected\"/>")];
        for (i, line) in lines.iter().enumerate() {
            if i > 0 && self.seed.one_in(2, 6) {
                parts.push(self.seed.pick(banks::CALL_PAUSES, 7).to_string());
            }
            parts.push(format!("{with}: \"{line}\""));
        }
        parts.join("\n\n")
    }

    /// The scene's place, when a chapter opens.
    fn opening(&self, parts: &mut Vec<String>) {
        let scene = &self.state.state.scene;
        let place = scene.location.trim().trim_end_matches('.');
        let summary = scene.summary.trim();
        if place.is_empty() {
            return;
        }
        if self.n.scene_headings {
            parts.push(format!("<scene place=\"{}\"/>", attr(place)));
            if !summary.is_empty() {
                parts.push(self.direction(summary));
            }
        } else if self.style == NarrationStyle::Adventure {
            parts.push(format!("**{place}**"));
            if !summary.is_empty() {
                parts.push(summary.to_string());
            }
        } else {
            let mut opening = format!("{place}.");
            if !summary.is_empty() {
                opening.push(' ');
                opening.push_str(summary);
            }
            parts.push(self.direction(&opening));
        }
    }

    /// The inventory item the player uses, when they name one.
    fn used_item(&self) -> Option<&Item> {
        let t = self.state.state.tracking.as_ref()?;
        if !t.inventory || !self.words.any(banks::USE_WORDS) {
            return None;
        }
        let lower = self.action.to_lowercase();
        t.items.iter().find(|i| {
            let key = item_key(&i.name);
            !key.is_empty() && lower.contains(&key)
        })
    }

    fn is_fight(&self) -> bool {
        self.words.any(banks::FIGHT_WORDS)
    }

    /// What the action leads to, in a line about the player and the world.
    fn response(&self) -> String {
        if let Some(r) = &self.rolled {
            let lines = match (r.critical.as_deref(), r.outcome.as_deref()) {
                (Some("success"), _) => banks::CRIT_SUCCESS,
                (Some("failure"), _) => banks::CRIT_FAILURE,
                (_, Some("success")) => banks::ROLL_SUCCESS,
                (_, Some("failure")) => banks::ROLL_FAILURE,
                _ => banks::ROLL_SCORE,
            };
            return self.line(lines, 2).replace("{result}", &r.result);
        }
        if let Some(item) = self.used_item() {
            let what = item.name.trim().to_lowercase();
            return if Words::of(&item.name).any(banks::HEALING) {
                self.say(&format!(
                    "Warmth spreads through {{you*}} as the {what} takes effect."
                ))
            } else {
                self.say(&format!("{{You}} use{{s}} the {what}."))
            };
        }
        if self.is_fight() {
            return self.line(self.bank.fight, 2);
        }
        if self.words.any(banks::MAGIC_WORDS) {
            return self.line(banks::MAGIC, 2);
        }
        if self.words.any(banks::REST_WORDS) && self.kind != ActionKind::Talk {
            return self.line(banks::REST, 2);
        }
        match self.kind {
            ActionKind::Look => self.line(self.bank.look, 2),
            ActionKind::Talk => self.line(banks::TALK_ALONE, 2),
            ActionKind::Move => self.line(self.bank.moves, 2),
            ActionKind::Handle => self.line(self.bank.handle, 2),
            ActionKind::Other if self.style == NarrationStyle::Adventure => {
                self.line(banks::WIT, 2)
            }
            ActionKind::Other => self.line(banks::OTHER, 2),
        }
    }

    /// The character answering the player, in the style.
    fn talk(&self, c: &Character) -> Vec<String> {
        let name = c.name.trim();
        let (doing, speech) = self.seed.pick(self.voice(c).talk, 2);
        let doing = self.say(doing);
        match self.style {
            NarrationStyle::Script => vec![
                format!("*{name} {doing}.*"),
                format!("{name}: \"{speech}\""),
            ],
            NarrationStyle::Roleplay => vec![format!("*{name} {doing}.* \"{speech}\"")],
            NarrationStyle::Thoughts => vec![format!("{name}: \"{speech}\"")],
            NarrationStyle::Messages if self.flavor.modern() => vec![self
                .seed
                .pick(self.voice(c).texts, 4)
                .iter()
                .map(|m| format!("<text from=\"{}\">{m}</text>", attr(name)))
                .collect::<Vec<_>>()
                .join("\n")],
            NarrationStyle::Messages => {
                vec![format!("<letter from=\"{}\">{speech}</letter>", attr(name))]
            }
            _ => vec![format!("{name} {doing}. \"{speech}\"")],
        }
    }

    /// A character who is there reacts to what the player did.
    fn react(&self, c: &Character) -> Option<String> {
        let always = matches!(
            self.style,
            NarrationStyle::Script | NarrationStyle::Roleplay | NarrationStyle::Thoughts
        );
        if !always && !self.seed.one_in(2, 10) {
            return None;
        }
        let name = c.name.trim();
        let said = self.seed.pick(self.voice(c).react, 11);
        Some(match self.style {
            NarrationStyle::Script | NarrationStyle::Thoughts => format!("{name}: \"{said}\""),
            NarrationStyle::Roleplay => format!(
                "*{name} {}.* \"{said}\"",
                self.seed.pick(
                    &["looks over", "glances up", "watches closely", "pauses"],
                    12
                )
            ),
            NarrationStyle::Messages if self.flavor.modern() => {
                format!("<text from=\"{}\">{said}</text>", attr(name))
            }
            _ => {
                // "Well," Mara says. A question or a cry keeps its mark.
                let said = match said.strip_suffix('.') {
                    Some(cut) if !cut.ends_with('.') => format!("{cut},"),
                    _ => said.to_string(),
                };
                format!("\"{said}\" {name} says.")
            }
        })
    }

    /// Whether this action stops at the moment of truth for a roll.
    fn wants_roll(&self) -> bool {
        if !self.n.dice || self.rolled.is_some() {
            return false;
        }
        let rules = self.n.dice_rules.as_ref();
        if rules.is_some_and(|r| r.player_only) {
            return false;
        }
        let risky = self.words.any(banks::TRY_WORDS);
        match rules.and_then(|r| r.frequency) {
            Some(RollFrequency::Rare) => self.words.any(banks::BIG_WORDS),
            Some(RollFrequency::Often) => {
                risky
                    || (matches!(self.kind, ActionKind::Move | ActionKind::Handle)
                        && self.seed.one_in(2, 12))
            }
            _ => risky,
        }
    }

    /// `<roll for dice target/>` with the story's own dice and odds.
    fn roll_request(&self) -> String {
        let rules = self.n.dice_rules.as_ref();
        let spec = rules
            .and_then(|r| r.dice.as_deref())
            .and_then(|d| DiceSpec::parse(d).ok())
            .unwrap_or(DiceSpec::Dice {
                count: 1,
                sides: 20,
                modifier: 0,
            });
        let (low, high) = spec.total_bounds();
        let base = match rules.and_then(|r| r.odds) {
            Some(RollOdds::Generous) => 40,
            Some(RollOdds::Tough) => 70,
            _ => 55,
        };
        let percent = (base + self.seed.between(-10, 10, 8)).clamp(5, 95);
        let target = (low + (high - low) * percent / 100).clamp(low + 1, high);
        format!(
            "<roll for=\"{}\" dice=\"{spec}\" target=\"{target}\"/>",
            roll_label(self.action)
        )
    }

    /// Something the player didn't cause, as often as the story asks.
    fn twist(&self) -> Option<String> {
        let odds = match self.n.surprises {
            Some(Surprises::Off) => return None,
            Some(Surprises::Often) => 2,
            _ => 5,
        };
        self.seed
            .one_in(odds, 13)
            .then(|| self.direction(&self.line(self.bank.twists, 14)))
    }

    /// Now and then, someone texts the player first.
    fn incoming(&self) -> Vec<String> {
        if !self.texts_on()
            || self.n.quiet_phones
            || !self.flavor.modern()
            || self.turn < 2
            || self.kind == ActionKind::Talk
            || !self.seed.one_in(4, 15)
        {
            return Vec::new();
        }
        let others: Vec<&Character> = self
            .state
            .state
            .characters
            .values()
            .filter(|c| c.control == Control::Npc && !c.name.trim().is_empty())
            .collect();
        let Some(from) = others.get(self.seed.byte(16) as usize % others.len().max(1)) else {
            return Vec::new();
        };
        let texts = self
            .seed
            .pick(self.voice(from).incoming, 17)
            .iter()
            .map(|m| format!("<text from=\"{}\">{m}</text>", attr(&from.name)))
            .collect::<Vec<_>>();
        vec![
            self.direction(&self.line(banks::BUZZ, 18)),
            texts.join("\n"),
        ]
    }

    /// Lines and `<meter>`/`<item>` tags for what the action changed, in a
    /// story that keeps track: damage in a fight, coins for winning, mana
    /// for a spell, rest, buying, finding and using things, and how a
    /// character feels about the player.
    fn changes(&self) -> (Vec<String>, Vec<String>) {
        let mut lines = Vec::new();
        let mut tags = Vec::new();
        let Some(t) = self.state.state.tracking.as_ref() else {
            return (lines, tags);
        };
        let mine = |list: &[&str], bar: Option<bool>| -> Option<&Meter> {
            t.meters.iter().find(|m| {
                m.who.is_none()
                    && bar.is_none_or(|b| m.max.is_some() == b)
                    && list.contains(&m.name.trim().to_lowercase().as_str())
            })
        };
        let vital = mine(banks::VITAL, None);
        let mana = mine(banks::MANA, None);
        let money = mine(banks::MONEY, None);
        let xp = mine(banks::XP, None);
        let social = mine(banks::SOCIAL, None).or_else(|| {
            let npc = self.npc?.name.trim().to_lowercase();
            t.meters.iter().find(|m| {
                m.who.as_deref().map(|w| w.trim().to_lowercase()) == Some(npc.clone())
                    && banks::SOCIAL.contains(&m.name.trim().to_lowercase().as_str())
            })
        });
        let step = |m: &Meter, low: i32, high: i32, salt: u8| -> i32 {
            match m.max {
                Some(max) => (max * self.seed.between(low, high, salt) / 100).max(1),
                None => self.seed.between(low / 2 + 1, high / 2 + 2, salt),
            }
        };
        let meter = |m: &Meter, change: i32| -> String {
            let who = m
                .who
                .as_deref()
                .map(|w| format!(" who=\"{}\"", attr(w)))
                .unwrap_or_default();
            format!(
                "<meter name=\"{}\"{who} change=\"{change:+}\"/>",
                attr(&m.name)
            )
        };
        let rolled_failed = self.rolled.as_ref().is_some_and(Rolled::failed);
        let rolled_won = self.rolled.as_ref().is_some_and(Rolled::won);
        let critical = self
            .rolled
            .as_ref()
            .and_then(|r| r.critical.as_deref())
            .is_some();

        // Using something from the inventory.
        if let Some(item) = self.used_item() {
            tags.push(format!("<item lose=\"{}\"/>", attr(&item.name)));
            if let (true, Some(v)) = (Words::of(&item.name).any(banks::HEALING), vital) {
                if v.max.is_none_or(|max| v.value < max) {
                    tags.push(meter(v, step(v, 20, 35, 30)));
                }
            }
        }
        // A fight: it hurts to lose, and winning pays.
        if self.is_fight() || (self.rolled.is_some() && self.kind != ActionKind::Talk) {
            let hurt = rolled_failed
                || (self.rolled.is_none() && self.is_fight() && self.seed.one_in(2, 31));
            if hurt {
                if let Some(v) = vital {
                    let mut damage = step(v, 8, 20, 32);
                    if critical {
                        damage *= 2;
                    }
                    lines.push(self.line(banks::HURT, 33));
                    tags.push(meter(v, -damage));
                }
            } else if self.is_fight() || rolled_won {
                if self.is_fight() {
                    lines.push(self.line(banks::WIN, 34));
                }
                if let Some(m) = money.filter(|_| self.is_fight() || self.seed.one_in(3, 35)) {
                    tags.push(meter(m, step(m, 5, 25, 36)));
                }
                if let Some(x) = xp {
                    tags.push(meter(x, step(x, 5, 15, 37)));
                }
            }
        }
        // A spell costs mana.
        if let Some(m) = mana.filter(|m| m.value > 0 && self.words.any(banks::MAGIC_WORDS)) {
            tags.push(meter(m, -step(m, 10, 25, 38).min(m.value)));
        }
        // Rest brings some back.
        if self.words.any(banks::REST_WORDS) && !self.is_fight() {
            for m in [vital, mana].into_iter().flatten() {
                if m.max.is_some_and(|max| m.value < max) {
                    tags.push(meter(m, step(m, 10, 20, 39)));
                }
            }
        }
        // Buying costs money.
        if let Some(m) = money.filter(|m| m.value > 0 && self.words.any(banks::BUY_WORDS)) {
            tags.push(meter(m, -step(m, 5, 30, 40).min(m.value)));
        }
        // Searching turns things up.
        let searching = matches!(self.kind, ActionKind::Look | ActionKind::Handle)
            && (self.words.any(banks::SEARCH_WORDS) || self.kind == ActionKind::Look);
        if t.inventory
            && searching
            && (rolled_won || (self.rolled.is_none() && self.seed.one_in(3, 41)))
        {
            let held: Vec<String> = t.items.iter().map(|i| item_key(&i.name)).collect();
            let fresh: Vec<&(&str, &str)> = self
                .bank
                .items
                .iter()
                .filter(|(name, _)| !held.contains(&item_key(name)))
                .collect();
            if !fresh.is_empty() {
                let (name, about) = self.seed.pick(&fresh, 42);
                lines.push(self.line(banks::FOUND, 43));
                tags.push(format!("<item gain=\"{name}\">{about}</item>"));
            }
        }
        // Talking warms someone up, or doesn't.
        if let Some(m) = social.filter(|_| self.kind == ActionKind::Talk && self.npc.is_some()) {
            if rolled_failed {
                tags.push(meter(m, -step(m, 2, 6, 44)));
            } else if rolled_won || self.seed.one_in(2, 45) {
                tags.push(meter(m, step(m, 2, 6, 46)));
            }
        }
        tags.truncate(4);
        (lines, tags)
    }

    fn scene_text(&self, opens_chapter: bool) -> String {
        let mut parts: Vec<String> = Vec::new();
        if opens_chapter {
            self.opening(&mut parts);
        } else if self.n.scene_headings && self.words.any(banks::TRAVEL_WORDS) {
            parts.push("<scene time=\"Later\"/>".into());
        }
        let brief = self.n.detail == Detail::Brief && !opens_chapter;
        let talking = self.kind == ActionKind::Talk && self.rolled.is_none() && !self.is_fight();
        let npc_talks = talking.then_some(self.npc).flatten();

        // What happens, with a line of atmosphere first.
        let beat = (!brief && self.style != NarrationStyle::Thoughts)
            .then(|| self.line(self.bank.beats, 1));
        match npc_talks {
            Some(c) => {
                if let Some(b) = beat {
                    parts.push(self.direction(&b));
                }
                parts.extend(self.talk(c));
            }
            None => {
                let response = self.response();
                let text = match (beat, self.style) {
                    (Some(b), NarrationStyle::Narrated | NarrationStyle::Messages) => {
                        format!("{b} {response}")
                    }
                    (Some(b), NarrationStyle::Adventure) => format!("{b} {response}"),
                    (Some(b), _) if opens_chapter => format!("{b} {response}"),
                    _ => response,
                };
                parts.push(self.direction(&text));
            }
        }
        if matches!(self.n.detail, Detail::Detailed | Detail::Cinematic) {
            parts.push(self.direction(&self.line(self.bank.details, 19)));
        }

        // With dice on, a risky action stops at the moment of truth.
        if self.wants_roll() {
            parts.push(self.direction(&self.line(banks::STAKES, 20)));
            parts.push(self.roll_request());
            return parts.join("\n\n");
        }

        let (lines, tags) = self.changes();
        parts.extend(lines.iter().map(|l| self.direction(l)));
        if let Some(t) = self.twist() {
            parts.push(t);
        }
        if let Some(c) = self.npc {
            if npc_talks.is_none() {
                parts.extend(self.react(c));
            }
            let thoughts = self.n.inner_thoughts || self.style == NarrationStyle::Thoughts;
            if thoughts {
                parts.push(format!(
                    "<thought who=\"{}\">{}</thought>",
                    attr(&c.name),
                    self.seed.pick(self.voice(c).thoughts, 21)
                ));
            }
        }
        if !tags.is_empty() {
            parts.push(tags.join(" "));
        }
        parts.extend(self.incoming());
        match self.style {
            NarrationStyle::Adventure => parts.push(self.line(self.bank.ways, 3)),
            NarrationStyle::Narrated | NarrationStyle::Messages => {
                let closer = match self.npc_name() {
                    Some(name) if self.seed.one_in(2, 4) => format!(
                        "{name} {}",
                        self.say(self.seed.pick(
                            &[
                                "is watching to see what {you} {do} next.",
                                "seems to be waiting for {you*} to make the next move.",
                            ],
                            3,
                        ))
                    ),
                    _ => self.line(banks::CLOSERS, 3),
                };
                parts.push(closer);
            }
            _ => {}
        }
        parts.join("\n\n")
    }
}

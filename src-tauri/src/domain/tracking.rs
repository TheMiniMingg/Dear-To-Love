//! RPG-style tracking: bars and counters (Health 80/100, Gold 35) and an
//! inventory, turned on per story.
//!
//! The storyteller changes them with tags in its replies, which the reader
//! also shows where they happen:
//!
//! - `<meter name="Health" change="-12"/>` (or `set="40"`, `max="120"`, and
//!   `who="Kira"` for someone else's);
//! - `<item gain="Rusty Key" qty="1">An iron key, warm to the touch.</item>`
//!   and `<item lose="Healing Potion"/>`; a new item can say how rare it is
//!   and what it does to dice (`rarity="epic" dice="odd" keep="yes"`);
//! - `<item use="Rusty Key" result="used"/>` when the player's Use worked
//!   (one is taken unless it lasts), or `result="not-now"` with the reason
//!   when it can't be used yet: then nothing is taken.
//!
//! An item used on a roll is taken when the roll is made (see
//! [`Tracking::apply_roll_item`]).
//!
//! Replay applies the tags of each reply in order, so every route, branch
//! and retry keeps its own values. Story details can also set them.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::loot::{self, DiceEffect, LootOdds, Rarity};
use super::text::tag_attrs;
use crate::errors::{AppError, AppResult};

pub const MAX_METERS: usize = 24;
pub const MAX_ITEMS: usize = 200;
const MAX_NAME: usize = 60;
const MAX_DESCRIPTION: usize = 600;
const MAX_QTY: u32 = 9_999;
/// No bar or counter goes beyond a million either way.
const LIMIT: i32 = 1_000_000;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct Tracking {
    /// Bars (with a maximum) and counters (without).
    #[serde(default)]
    pub meters: Vec<Meter>,
    /// The player's inventory is kept.
    #[serde(default, skip_serializing_if = "is_false")]
    #[ts(as = "Option<bool>", optional)]
    pub inventory: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[ts(as = "Option<Vec<Item>>", optional)]
    pub items: Vec<Item>,
    /// How likely each rarity is when something new turns up (Common to
    /// Mythical). Unset: the usual odds.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub loot_odds: Option<LootOdds>,
}

/// A bar such as Health 80/100, or a counter such as Gold 35.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct Meter {
    pub name: String,
    pub value: i32,
    /// A bar's maximum; a counter has none.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub max: Option<i32>,
    /// Whose it is, by name: a party member's or a rival's. Unset: the
    /// player's own.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub who: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct Item {
    pub name: String,
    #[serde(default = "one")]
    pub qty: u32,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    #[ts(as = "Option<String>", optional)]
    pub description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub rarity: Option<Rarity>,
    /// What it does to a roll it is used on: `+2`, `odd`, `even`, `best`
    /// or faces such as `1-2`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub dice: Option<String>,
    /// Using it doesn't use it up (a lucky charm, a key).
    #[serde(default, skip_serializing_if = "is_false")]
    #[ts(as = "Option<bool>", optional)]
    pub keep: bool,
}

impl Item {
    pub fn new(name: impl Into<String>, qty: u32, description: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            qty,
            description: description.into(),
            rarity: None,
            dice: None,
            keep: false,
        }
    }

    /// Its dice effect, if it has a valid one.
    pub fn dice_effect(&self) -> Option<DiceEffect> {
        DiceEffect::parse(self.dice.as_deref()?).ok()
    }

    /// The rarity it shows: its own, raised to what its dice effect needs.
    pub fn shown_rarity(&self) -> Option<Rarity> {
        let least = self.dice_effect().map(DiceEffect::least_rarity);
        match (self.rarity, least) {
            (Some(r), Some(l)) => Some(r.max(l)),
            (r, l) => r.or(l),
        }
    }
}

fn is_false(b: &bool) -> bool {
    !*b
}

fn one() -> u32 {
    1
}

/// The key an item is found by (and its picture slot uses): the name in
/// lower case with single spaces.
pub fn item_key(name: &str) -> String {
    name.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

fn same(a: &str, b: &str) -> bool {
    item_key(a) == item_key(b)
}

/// A key with its last word in the singular: "healing potions" and
/// "torches" are "healing potion" and "torch".
fn singular(key: &str) -> String {
    let (head, last) = key.rsplit_once(' ').unwrap_or(("", key));
    let one = if let Some(stem) = last.strip_suffix("ies").filter(|s| s.len() > 1) {
        format!("{stem}y")
    } else if ["ches", "shes", "sses", "xes", "zes"]
        .iter()
        .any(|end| last.ends_with(end))
    {
        last[..last.len() - 2].to_string()
    } else if last.len() > 3 && last.ends_with('s') && !last.ends_with("ss") {
        last[..last.len() - 1].to_string()
    } else {
        last.to_string()
    };
    if head.is_empty() {
        one
    } else {
        format!("{head} {one}")
    }
}

/// Whether `outer` holds `inner` as whole words.
fn holds_words(outer: &str, inner: &str) -> bool {
    format!(" {outer} ").contains(&format!(" {inner} "))
}

/// The held item a reply's name means: the same name, else the same in
/// the singular ("Torches" for a Torch). With `loose`, else the one item
/// whose name holds the words or is held in them ("potion" for a Healing
/// Potion), when only one does: storytellers shorten names as they write.
fn find_item(items: &[Item], name: &str, loose: bool) -> Option<usize> {
    let key = item_key(name);
    if key.is_empty() {
        return None;
    }
    if let Some(i) = items.iter().position(|it| item_key(&it.name) == key) {
        return Some(i);
    }
    let one = singular(&key);
    let keys: Vec<String> = items
        .iter()
        .map(|it| singular(&item_key(&it.name)))
        .collect();
    if let Some(i) = keys.iter().position(|k| *k == one) {
        return Some(i);
    }
    if !loose {
        return None;
    }
    let mut close = keys
        .iter()
        .enumerate()
        .filter(|(_, k)| holds_words(k, &one) || holds_words(&one, k));
    match (close.next(), close.next()) {
        (Some((i, _)), None) => Some(i),
        _ => None,
    }
}

/// Whitespace runs become one space, cut to `max` characters.
fn clip(s: &str, max: usize) -> String {
    let one_line = s.split_whitespace().collect::<Vec<_>>().join(" ");
    one_line.chars().take(max).collect()
}

/// A whole number such as `-12`, `+30` or `−5`, kept within the limit.
fn number(s: &str) -> Option<i32> {
    let s = s.trim().replace('−', "-");
    let s = s.strip_prefix('+').unwrap_or(&s);
    let n: i64 = s.parse().ok()?;
    Some(n.clamp(-i64::from(LIMIT), i64::from(LIMIT)) as i32)
}

struct Tag {
    name: &'static str,
    attrs: Vec<(String, String)>,
    body: String,
}

/// The `<meter>` and `<item>` tags in `text`, in order.
fn scan(text: &str) -> Vec<Tag> {
    let mut out = Vec::new();
    let mut rest = text;
    while let Some(i) = rest.find('<') {
        let after = &rest[i + 1..];
        let name = ["meter", "item"].into_iter().find(|t| {
            after.starts_with(t) && after[t.len()..].starts_with([' ', '/', '>', '\n', '\t'])
        });
        let (Some(name), Some(end)) = (name, after.find('>')) else {
            rest = after;
            continue;
        };
        let head = &after[name.len()..end];
        let tail = &after[end + 1..];
        let close = format!("</{name}>");
        let (body, next) = if head.trim_end().ends_with('/') {
            ("", tail)
        } else {
            match tail.find(&close) {
                Some(j) => (&tail[..j], &tail[j + close.len()..]),
                None => ("", tail),
            }
        };
        out.push(Tag {
            name,
            attrs: tag_attrs(head),
            body: body.trim().to_string(),
        });
        rest = next;
    }
    out
}

impl Tracking {
    /// Applies the tags in one of the storyteller's replies. `player` is
    /// the player character's name: a meter "who" names them is theirs.
    pub fn apply_reply(&mut self, text: &str, player: &str) {
        // Items a `use` took in this reply.
        let mut used_up: Vec<String> = Vec::new();
        for tag in scan(text) {
            let get = |k: &str| {
                tag.attrs
                    .iter()
                    .find(|(key, _)| key == k)
                    .map(|(_, v)| v.trim())
                    .filter(|v| !v.is_empty())
            };
            match tag.name {
                "meter" => {
                    let Some(name) = get("name") else { continue };
                    let who = get("who")
                        .map(|w| clip(w, MAX_NAME))
                        .filter(|w| !same(w, player) && !same(w, "you"));
                    self.change_meter(
                        &clip(name, MAX_NAME),
                        who,
                        get("max").and_then(number),
                        get("set").and_then(number),
                        get("change").and_then(number),
                    );
                }
                _ if !self.inventory => {}
                _ => {
                    let qty = get("qty")
                        .and_then(|q| q.parse::<u32>().ok())
                        .unwrap_or(1)
                        .clamp(1, MAX_QTY);
                    if let Some(name) = get("gain") {
                        let mut item =
                            Item::new(clip(name, MAX_NAME), qty, clip(&tag.body, MAX_DESCRIPTION));
                        item.rarity = get("rarity").and_then(Rarity::parse);
                        item.dice = get("dice")
                            .and_then(|d| DiceEffect::parse(d).ok())
                            .map(|d| d.to_string());
                        item.rarity = item.shown_rarity();
                        item.keep = get("keep").is_some_and(|k| {
                            matches!(k.to_lowercase().as_str(), "yes" | "true" | "1")
                        });
                        self.gain(item);
                    } else if let Some(name) = get("use") {
                        let used = get("result").is_some_and(|r| r.eq_ignore_ascii_case("used"));
                        if used && self.take_one(name) {
                            used_up.push(singular(&item_key(name)));
                        }
                    } else if let Some(name) = get("lose") {
                        let all = get("qty").is_some_and(|q| q.eq_ignore_ascii_case("all"));
                        // A use already took this one: "lose" after it says the same.
                        if let Some(i) =
                            used_up.iter().position(|k| *k == singular(&item_key(name)))
                        {
                            used_up.remove(i);
                            if !all && qty == 1 {
                                continue;
                            }
                        }
                        self.lose(name, if all { MAX_QTY } else { qty });
                    }
                }
            }
        }
    }

    fn change_meter(
        &mut self,
        name: &str,
        who: Option<String>,
        max: Option<i32>,
        set: Option<i32>,
        change: Option<i32>,
    ) {
        if name.is_empty() || (max.is_none() && set.is_none() && change.is_none()) {
            return;
        }
        let found = self.meters.iter().position(|m| {
            same(&m.name, name)
                && match (&m.who, &who) {
                    (None, None) => true,
                    (Some(a), Some(b)) => same(a, b),
                    _ => false,
                }
        });
        let i = match found {
            Some(i) => i,
            None if self.meters.len() < MAX_METERS => {
                // A new bar starts full; a new counter at nothing.
                self.meters.push(Meter {
                    name: name.to_string(),
                    value: max.unwrap_or(0).max(0),
                    max: None,
                    who,
                });
                self.meters.len() - 1
            }
            None => return,
        };
        let m = &mut self.meters[i];
        if let Some(max) = max {
            m.max = Some(max.max(1));
        }
        if let Some(set) = set {
            m.value = set;
        }
        if let Some(change) = change {
            m.value = m.value.saturating_add(change);
        }
        m.value = match m.max {
            Some(max) => m.value.clamp(0, max),
            None => m.value.clamp(-LIMIT, LIMIT),
        };
    }

    fn gain(&mut self, item: Item) {
        if item.name.is_empty() {
            return;
        }
        let full = self.items.len() >= MAX_ITEMS;
        match find_item(&self.items, &item.name, false).map(|i| &mut self.items[i]) {
            Some(it) => {
                it.qty = it.qty.saturating_add(item.qty).min(MAX_QTY);
                if it.description.is_empty() {
                    it.description = item.description;
                }
                it.rarity = it.rarity.or(item.rarity);
                if it.dice.is_none() {
                    it.dice = item.dice;
                }
            }
            None if !full => self.items.push(item),
            None => {}
        }
    }

    /// The item of that name the player carries.
    pub fn item(&self, name: &str) -> Option<&Item> {
        if !self.inventory {
            return None;
        }
        find_item(&self.items, name, true).map(|i| &self.items[i])
    }

    /// Takes one of the item unless it lasts. Returns whether one was taken.
    fn take_one(&mut self, name: &str) -> bool {
        match self.item(name) {
            Some(it) if !it.keep => {
                self.lose(name, 1);
                true
            }
            _ => false,
        }
    }

    /// The player used `name` on a roll: one is taken unless it lasts.
    pub fn apply_roll_item(&mut self, name: &str) {
        self.take_one(name);
    }

    /// The loot odds in use.
    pub fn odds(&self) -> LootOdds {
        self.loot_odds.unwrap_or(loot::DEFAULT_LOOT_ODDS)
    }

    fn lose(&mut self, name: &str, qty: u32) {
        if let Some(i) = find_item(&self.items, name, true) {
            let it = &mut self.items[i];
            if it.qty > qty {
                it.qty -= qty;
            } else {
                self.items.remove(i);
            }
        }
    }

    pub fn validate(&self) -> AppResult<()> {
        let bad = |msg: String| Err(AppError::invalid_input(msg));
        if self.meters.len() > MAX_METERS {
            return bad(format!(
                "a story tracks at most {MAX_METERS} bars and counters"
            ));
        }
        for (i, m) in self.meters.iter().enumerate() {
            let name = m.name.trim();
            if name.is_empty() || name.chars().count() > MAX_NAME {
                return bad(format!(
                    "every bar or counter needs a name of up to {MAX_NAME} characters"
                ));
            }
            if m.who.as_deref().is_some_and(|w| w.trim().is_empty()) {
                return bad(format!(
                    "{name}: say whose it is, or leave it to the player"
                ));
            }
            if m.value.abs() > LIMIT {
                return bad(format!("{name} is too large"));
            }
            if let Some(max) = m.max {
                if !(1..=LIMIT).contains(&max) {
                    return bad(format!("{name} needs a maximum of at least 1"));
                }
                if !(0..=max).contains(&m.value) {
                    return bad(format!("{name} must be between 0 and {max}"));
                }
            }
            if self.meters[..i].iter().any(|o| {
                same(&o.name, &m.name)
                    && o.who.as_deref().map(item_key) == m.who.as_deref().map(item_key)
            }) {
                return bad(format!("{name} is listed twice"));
            }
        }
        if self.items.len() > MAX_ITEMS {
            return bad(format!(
                "an inventory holds at most {MAX_ITEMS} kinds of item"
            ));
        }
        for (i, it) in self.items.iter().enumerate() {
            let name = it.name.trim();
            if name.is_empty() || name.chars().count() > MAX_NAME {
                return bad(format!(
                    "every item needs a name of up to {MAX_NAME} characters"
                ));
            }
            if !(1..=MAX_QTY).contains(&it.qty) {
                return bad(format!(
                    "{name}: the number must be between 1 and {MAX_QTY}"
                ));
            }
            if it.description.chars().count() > MAX_DESCRIPTION {
                return bad(format!(
                    "{name}: keep the description under {MAX_DESCRIPTION} characters"
                ));
            }
            if self.items[..i].iter().any(|o| same(&o.name, &it.name)) {
                return bad(format!("{name} is listed twice"));
            }
            if let Some(d) = &it.dice {
                DiceEffect::parse(d)?;
            }
        }
        if let Some(odds) = &self.loot_odds {
            loot::validate_odds(odds)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rpg() -> Tracking {
        Tracking {
            meters: vec![
                Meter {
                    name: "Health".into(),
                    value: 80,
                    max: Some(100),
                    who: None,
                },
                Meter {
                    name: "Gold".into(),
                    value: 10,
                    max: None,
                    who: None,
                },
            ],
            inventory: true,
            items: vec![Item::new("Healing Potion", 2, "Red and fizzy.")],
            loot_odds: None,
        }
    }

    #[test]
    fn replies_change_bars_counters_and_items() {
        let mut t = rpg();
        t.apply_reply(
            "The goblin's club catches your ribs. <meter name=\"health\" change=\"-30\"/>\n\
             You drink a potion. <item lose=\"healing potion\"/> <meter name=\"Health\" \
             change=\"+45\"/> In the chest: <item gain=\"Rusty Key\">An iron key, warm to the \
             touch.</item> <meter name=\"Gold\" change=\"+35\"/> \
             <meter name=\"Health\" who=\"Kira\" max=\"60\" change=\"-10\"/> \
             <meter name=\"Mana\" who=\"Sam\" set=\"5\" max=\"20\"/>",
            "Sam",
        );
        assert_eq!(
            t.meters
                .iter()
                .map(|m| (m.name.as_str(), m.value, m.max, m.who.as_deref()))
                .collect::<Vec<_>>(),
            [
                ("Health", 95, Some(100), None),
                ("Gold", 45, None, None),
                ("Health", 50, Some(60), Some("Kira")),
                ("Mana", 5, Some(20), None),
            ]
        );
        assert_eq!(
            t.items
                .iter()
                .map(|i| (i.name.as_str(), i.qty, i.description.as_str()))
                .collect::<Vec<_>>(),
            [
                ("Healing Potion", 1, "Red and fizzy."),
                ("Rusty Key", 1, "An iron key, warm to the touch."),
            ]
        );
        t.validate().unwrap();
    }

    #[test]
    fn bars_stay_in_range_and_items_run_out() {
        let mut t = rpg();
        t.apply_reply(
            "<meter name=\"Health\" change=\"-500\"/><item lose=\"Healing Potion\" qty=\"all\"/>\
             <item lose=\"Nothing\"/><meter name=\"Health\"/><meter change=\"5\"/>",
            "Sam",
        );
        assert_eq!(t.meters[0].value, 0);
        assert!(t.items.is_empty());
        assert_eq!(
            t.meters.len(),
            2,
            "tags without a name or a change add nothing"
        );
        t.apply_reply("<meter name=\"Health\" set=\"999\"/>", "Sam");
        assert_eq!(t.meters[0].value, 100);
        t.validate().unwrap();
    }

    #[test]
    fn items_need_the_inventory_and_unknown_text_is_left_alone() {
        let mut t = rpg();
        t.inventory = false;
        t.items.clear();
        t.apply_reply(
            "<item gain=\"Sword\">Sharp.</item> <itemize> <meters>",
            "Sam",
        );
        assert!(t.items.is_empty());
        assert_eq!(
            t,
            Tracking {
                inventory: false,
                items: vec![],
                ..rpg()
            }
        );
    }

    #[test]
    fn items_are_found_by_a_plural_or_a_shorter_name() {
        let mut t = rpg();
        t.items.push(Item::new("Torch", 3, ""));
        t.apply_reply(
            "<item lose=\"Healing Potions\"/> <item gain=\"Torches\" qty=\"2\"/> \
             <item lose=\"potion\"/> <item lose=\"torch\" qty=\"4\"/>",
            "Sam",
        );
        assert_eq!(
            t.items
                .iter()
                .map(|i| (i.name.as_str(), i.qty))
                .collect::<Vec<_>>(),
            [("Torch", 1)],
            "both potions are gone and the torches stacked before four burned out"
        );
        // A short name that could mean two things changes neither.
        let mut t = rpg();
        t.items.push(Item::new("Mana Potion", 1, ""));
        t.apply_reply("<item lose=\"potion\"/>", "Sam");
        assert_eq!(t.items.iter().map(|i| i.qty).collect::<Vec<_>>(), [2, 1]);
        // Gaining never merges by a shorter name: a key is not the Rusty Key.
        let mut t = rpg();
        t.apply_reply("<item gain=\"Potion\"/>", "Sam");
        assert_eq!(t.items.len(), 2);
        assert_eq!(singular("berries"), "berry");
        assert_eq!(singular("glass"), "glass");
        assert_eq!(singular("boxes"), "box");
        assert_eq!(singular("gas"), "gas");
    }

    #[test]
    fn validation_catches_bad_values() {
        let mut t = rpg();
        t.meters[0].value = 120;
        assert!(t.validate().is_err());
        let mut t = rpg();
        t.meters.push(t.meters[0].clone());
        assert!(t.validate().is_err());
        let mut t = rpg();
        t.items[0].qty = 0;
        assert!(t.validate().is_err());
        let mut t = rpg();
        t.items[0].name = " ".into();
        assert!(t.validate().is_err());
    }

    #[test]
    fn items_keep_rarity_and_dice_and_uses_take_one() {
        let mut t = rpg();
        t.apply_reply(
            "In the chest: <item gain=\"Moon Die\" rarity=\"rare\" dice=\"1-2\">Pale \
             bone.</item> <item gain=\"Lucky Coin\" dice=\"+1\" keep=\"yes\"/> \
             <item gain=\"Odd Shard\" dice=\"sideways\"/>",
            "Sam",
        );
        let die = t.item("moon die").unwrap();
        assert_eq!(
            die.rarity,
            Some(Rarity::Legendary),
            "raised to what its effect needs"
        );
        assert_eq!(die.dice.as_deref(), Some("1-2"));
        let coin = t.item("Lucky Coin").unwrap();
        assert_eq!((coin.rarity, coin.keep), (Some(Rarity::Common), true));
        assert_eq!(t.item("Odd Shard").unwrap().dice, None);
        t.validate().unwrap();

        // Not now: nothing is taken. Used: one is, and a lose after it is the same one.
        t.apply_reply(
            "<item use=\"Healing Potion\" result=\"not-now\">You're not hurt.</item>",
            "Sam",
        );
        assert_eq!(t.item("Healing Potion").unwrap().qty, 2);
        t.apply_reply(
            "<item use=\"Healing Potion\" result=\"used\"/> <item lose=\"Healing Potion\"/>",
            "Sam",
        );
        assert_eq!(t.item("Healing Potion").unwrap().qty, 1);
        // Something that lasts stays; a roll spends a die.
        t.apply_reply("<item use=\"Lucky Coin\" result=\"used\"/>", "Sam");
        assert!(t.item("Lucky Coin").is_some());
        t.apply_roll_item("Moon Die");
        assert!(t.item("Moon Die").is_none());

        let mut odds = t.clone();
        odds.loot_odds = Some([0; 6]);
        assert!(odds.validate().is_err());
        let mut bad = t.clone();
        bad.items[0].dice = Some("lucky".into());
        assert!(bad.validate().is_err());
    }
}

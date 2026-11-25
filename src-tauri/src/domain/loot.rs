//! RPG items beyond a name and a count: how rare they are, and items that
//! change the dice.
//!
//! - **Rarity**: Common, Uncommon, Rare, Epic, Legendary, Mythical. The
//!   rarer an item, the stronger what it may do; an item whose dice effect
//!   is too strong for its rarity is raised to the rarity that fits.
//! - **Dice effects**: an item used on a roll can add to it (`+2`), keep
//!   only odd or even faces (`odd`, `even`), keep only some faces (`1-2`)
//!   or roll each die twice and keep the higher (`best`). The app applies
//!   them fairly when it rolls.
//! - **Loot odds**: how likely each rarity is when the player finds or is
//!   given something. The app draws a rarity with every action and the
//!   storyteller uses it for anything new that turns up in its reply.

use std::fmt;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::dice::DiceSpec;
use crate::errors::{AppError, AppResult};

/// How rare an item is, from Common to Mythical.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Rarity {
    Common,
    Uncommon,
    Rare,
    Epic,
    Legendary,
    Mythical,
}

impl Rarity {
    pub const ALL: [Rarity; 6] = [
        Rarity::Common,
        Rarity::Uncommon,
        Rarity::Rare,
        Rarity::Epic,
        Rarity::Legendary,
        Rarity::Mythical,
    ];

    /// The rarity a word names, in any case (`"EPIC"`, `"Legendary"`).
    pub fn parse(word: &str) -> Option<Self> {
        let w = word.trim().to_lowercase();
        Self::ALL.into_iter().find(|r| r.word() == w)
    }

    /// The lower-case word (`"epic"`).
    pub fn word(self) -> &'static str {
        match self {
            Self::Common => "common",
            Self::Uncommon => "uncommon",
            Self::Rare => "rare",
            Self::Epic => "epic",
            Self::Legendary => "legendary",
            Self::Mythical => "mythical",
        }
    }

    /// The word with a capital (`"Epic"`), as the storyteller reads it.
    pub fn title(self) -> &'static str {
        match self {
            Self::Common => "Common",
            Self::Uncommon => "Uncommon",
            Self::Rare => "Rare",
            Self::Epic => "Epic",
            Self::Legendary => "Legendary",
            Self::Mythical => "Mythical",
        }
    }

    /// What an item of this rarity is like, for the storyteller.
    pub fn power(self) -> &'static str {
        match self {
            Self::Common => "everyday gear; a small, ordinary use",
            Self::Uncommon => "well made or lightly magical; a modest edge",
            Self::Rare => "remarkable; a clear advantage in the right moment",
            Self::Epic => "powerful; can turn a fight or open a hard way forward",
            Self::Legendary => "famous and story-changing; few have ever held one",
            Self::Mythical => "one of a kind; it bends the rules of the world",
        }
    }
}

impl fmt::Display for Rarity {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.title())
    }
}

/// The largest bonus an item can add to a roll.
pub const MAX_ITEM_BONUS: i32 = 10;
/// The die that "only these faces" effects are rated against.
const REFERENCE_SIDES: i32 = 20;

/// What an item does to a roll it is used on.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiceEffect {
    /// Adds to the total, `+1` to `+10`.
    Bonus(i32),
    /// Every die shows an odd face.
    Odd,
    /// Every die shows an even face.
    Even,
    /// Every die shows a face from `low` to `high`, such as `1-2`.
    Faces { low: i32, high: i32 },
    /// Every die is rolled twice and the higher face kept.
    Best,
}

fn bad_effect(text: &str) -> AppError {
    AppError::invalid_input(format!(
        "\"{}\" is not a dice effect the app understands; use +2, odd, even, best, or faces \
         such as 1-2",
        text.trim()
    ))
}

impl DiceEffect {
    /// Parse `+2`, `odd`, `even`, `best` or `1-2` (also `1–2`, `1 to 2`).
    pub fn parse(text: &str) -> AppResult<Self> {
        let s = text.trim().to_lowercase().replace(['–', '—'], "-");
        match s.as_str() {
            "odd" => return Ok(Self::Odd),
            "even" => return Ok(Self::Even),
            "best" | "best-of-2" | "advantage" => return Ok(Self::Best),
            _ => {}
        }
        if let Some(n) = s.strip_prefix('+') {
            let n: i32 = n.trim().parse().map_err(|_| bad_effect(text))?;
            if !(1..=MAX_ITEM_BONUS).contains(&n) {
                return Err(AppError::invalid_input(format!(
                    "an item adds +1 to +{MAX_ITEM_BONUS} to a roll"
                )));
            }
            return Ok(Self::Bonus(n));
        }
        let (low, high) = s
            .split_once(" to ")
            .or_else(|| s.split_once('-'))
            .ok_or_else(|| bad_effect(text))?;
        let low: i32 = low.trim().parse().map_err(|_| bad_effect(text))?;
        let high: i32 = high.trim().parse().map_err(|_| bad_effect(text))?;
        if low < 1 || high < low || high > 1000 {
            return Err(AppError::invalid_input(
                "an item's faces run from a low face of at least 1 up to a high face",
            ));
        }
        Ok(Self::Faces { low, high })
    }

    /// The least rarity an item with this effect can have.
    pub fn least_rarity(self) -> Rarity {
        match self {
            Self::Bonus(n) => match n {
                ..=1 => Rarity::Common,
                2 => Rarity::Uncommon,
                3 => Rarity::Rare,
                4..=5 => Rarity::Epic,
                6..=7 => Rarity::Legendary,
                _ => Rarity::Mythical,
            },
            Self::Best => Rarity::Uncommon,
            Self::Odd | Self::Even => Rarity::Rare,
            // Rated by how many faces of a d20 it leaves.
            Self::Faces { low, high } => {
                let kept = high.min(REFERENCE_SIDES) - low.max(1) + 1;
                match kept {
                    15.. => Rarity::Uncommon,
                    10..=14 => Rarity::Rare,
                    5..=9 => Rarity::Epic,
                    2..=4 => Rarity::Legendary,
                    _ => Rarity::Mythical,
                }
            }
        }
    }

    /// Whether the effect changes which faces can come up (so a die's
    /// highest or lowest face is no longer a critical).
    pub fn shapes_faces(self) -> bool {
        matches!(self, Self::Odd | Self::Even | Self::Faces { .. })
    }

    pub fn bonus(self) -> i32 {
        match self {
            Self::Bonus(n) => n,
            _ => 0,
        }
    }

    /// The faces a die from `lo` to `hi` can show under this effect, or
    /// `None` when it leaves none (an item for `18-20` on a d6).
    pub fn allowed(self, lo: i32, hi: i32) -> Option<Vec<i32>> {
        let faces: Vec<i32> = match self {
            Self::Bonus(_) | Self::Best => return Some((lo..=hi).collect()),
            Self::Odd => (lo..=hi).filter(|f| f.rem_euclid(2) == 1).collect(),
            Self::Even => (lo..=hi).filter(|f| f.rem_euclid(2) == 0).collect(),
            Self::Faces { low, high } => (lo.max(low)..=hi.min(high)).collect(),
        };
        (!faces.is_empty()).then_some(faces)
    }

    /// Whether `spec` can be rolled with this effect. Effects that pick
    /// faces need a die or range small enough to list.
    pub fn fits(self, spec: DiceSpec) -> bool {
        let (lo, hi) = spec_face_bounds(spec);
        if self.shapes_faces() && hi - lo > 10_000 {
            return false;
        }
        self.allowed(lo, hi).is_some()
    }

    /// What it does, in words for the storyteller ("odd faces only").
    pub fn words(self) -> String {
        match self {
            Self::Bonus(n) => format!("+{n} to the roll"),
            Self::Odd => "odd faces only".into(),
            Self::Even => "even faces only".into(),
            Self::Faces { low, high } if low == high => format!("always shows {low}"),
            Self::Faces { low, high } => format!("only faces {low} to {high}"),
            Self::Best => "roll twice, keep the higher".into(),
        }
    }
}

/// The lowest and highest face one die (or a range) of `spec` can show.
pub fn spec_face_bounds(spec: DiceSpec) -> (i32, i32) {
    match spec {
        DiceSpec::Dice { sides, .. } => (1, sides as i32),
        DiceSpec::Range { low, high } => (low, high),
    }
}

impl fmt::Display for DiceEffect {
    /// The app's spelling: `+2`, `odd`, `even`, `best`, `1-2`.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::Bonus(n) => write!(f, "+{n}"),
            Self::Odd => f.write_str("odd"),
            Self::Even => f.write_str("even"),
            Self::Faces { low, high } => write!(f, "{low}-{high}"),
            Self::Best => f.write_str("best"),
        }
    }
}

/// How likely each rarity is when something new turns up, as weights in
/// the order Common, Uncommon, Rare, Epic, Legendary, Mythical.
pub type LootOdds = [u32; 6];

/// The usual odds: mostly common, mythical one time in a hundred.
pub const DEFAULT_LOOT_ODDS: LootOdds = [50, 25, 13, 7, 4, 1];
const MAX_WEIGHT: u32 = 1000;

pub fn validate_odds(odds: &LootOdds) -> AppResult<()> {
    if odds.iter().any(|w| *w > MAX_WEIGHT) {
        return Err(AppError::invalid_input(format!(
            "each rarity's odds are 0 to {MAX_WEIGHT}"
        )));
    }
    if odds.iter().all(|w| *w == 0) {
        return Err(AppError::invalid_input(
            "at least one rarity needs odds above 0",
        ));
    }
    Ok(())
}

/// Draw a rarity with `odds`. `uniform(n)` returns a whole number from 0
/// to n - 1.
pub fn draw_rarity(
    odds: &LootOdds,
    uniform: &mut dyn FnMut(u32) -> AppResult<u32>,
) -> AppResult<Rarity> {
    let total: u32 = odds.iter().sum();
    if total == 0 {
        return Ok(Rarity::Common);
    }
    let mut x = uniform(total)?;
    for (r, w) in Rarity::ALL.into_iter().zip(odds) {
        if x < *w {
            return Ok(r);
        }
        x -= w;
    }
    Ok(Rarity::Common)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn effects_parse_and_print() {
        for (text, effect, shown) in [
            ("+2", DiceEffect::Bonus(2), "+2"),
            (" ODD ", DiceEffect::Odd, "odd"),
            ("even", DiceEffect::Even, "even"),
            ("best", DiceEffect::Best, "best"),
            ("advantage", DiceEffect::Best, "best"),
            ("1-2", DiceEffect::Faces { low: 1, high: 2 }, "1-2"),
            ("18–20", DiceEffect::Faces { low: 18, high: 20 }, "18-20"),
            ("1 to 1", DiceEffect::Faces { low: 1, high: 1 }, "1-1"),
        ] {
            let parsed = DiceEffect::parse(text).unwrap();
            assert_eq!(parsed, effect, "{text}");
            assert_eq!(parsed.to_string(), shown);
        }
        for bad in ["", "+0", "+11", "lucky", "0-2", "5-3", "-2"] {
            assert!(DiceEffect::parse(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn stronger_effects_need_rarer_items() {
        let least = |s: &str| DiceEffect::parse(s).unwrap().least_rarity();
        assert_eq!(least("+1"), Rarity::Common);
        assert_eq!(least("+2"), Rarity::Uncommon);
        assert_eq!(least("best"), Rarity::Uncommon);
        assert_eq!(least("odd"), Rarity::Rare);
        assert_eq!(least("1-10"), Rarity::Rare);
        assert_eq!(least("11-20"), Rarity::Rare);
        assert_eq!(least("16-20"), Rarity::Epic);
        assert_eq!(least("1-2"), Rarity::Legendary);
        assert_eq!(least("20-20"), Rarity::Mythical);
        assert_eq!(least("+10"), Rarity::Mythical);
    }

    #[test]
    fn effects_say_which_faces_remain() {
        let d6 = DiceSpec::parse("1d6").unwrap();
        assert_eq!(DiceEffect::Odd.allowed(1, 6), Some(vec![1, 3, 5]));
        assert_eq!(DiceEffect::Even.allowed(1, 6), Some(vec![2, 4, 6]));
        assert_eq!(
            DiceEffect::Faces { low: 5, high: 9 }.allowed(1, 6),
            Some(vec![5, 6])
        );
        assert!(!DiceEffect::Faces { low: 18, high: 20 }.fits(d6));
        assert!(DiceEffect::Bonus(3).fits(d6));
        // A range of negative numbers keeps its odd ones too.
        assert_eq!(DiceEffect::Odd.allowed(-3, 0), Some(vec![-3, -1]));
    }

    #[test]
    fn rarity_draws_follow_the_odds() {
        let odds = [1, 0, 0, 2, 0, 1];
        let mut got = Vec::new();
        for i in 0..4 {
            let mut fixed = |_n: u32| Ok(i);
            got.push(draw_rarity(&odds, &mut fixed).unwrap());
        }
        assert_eq!(
            got,
            [Rarity::Common, Rarity::Epic, Rarity::Epic, Rarity::Mythical]
        );
        assert!(validate_odds(&[0; 6]).is_err());
        assert!(validate_odds(&[1001, 0, 0, 0, 0, 0]).is_err());
        validate_odds(&DEFAULT_LOOT_ODDS).unwrap();
        assert_eq!(Rarity::parse(" Legendary"), Some(Rarity::Legendary));
        assert_eq!(Rarity::parse("shiny"), None);
    }
}

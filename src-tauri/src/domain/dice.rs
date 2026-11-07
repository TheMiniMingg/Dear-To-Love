//! Dice: fair rolls for uncertain moments.
//!
//! The storyteller asks for a roll with a `<roll for dice target stat/>`
//! tag and sets the odds from the story; the player can also roll on their
//! own, with one of their character's stats. The app rolls with the
//! operating system's random source and stores the result in the player's
//! action, so a reply can be regenerated without rerolling and every reader
//! of the story sees the same roll.

use std::fmt;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::story_state::Character;
use crate::errors::{AppError, AppResult};

const MAX_DICE: u32 = 20;
const MAX_SIDES: u32 = 1000;
const MAX_NUMBER: i32 = 1_000_000;
const MAX_LABEL: usize = 200;
/// Shown when the player rolls without saying what for.
pub const DEFAULT_LABEL: &str = "A roll";

/// What is rolled: dice such as `2d6+1`, or a whole number in a range such
/// as `40-100` (both ends included).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiceSpec {
    Dice {
        count: u32,
        sides: u32,
        modifier: i32,
    },
    Range {
        low: i32,
        high: i32,
    },
}

impl fmt::Display for DiceSpec {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::Dice {
                count,
                sides,
                modifier,
            } => {
                write!(f, "{count}d{sides}")?;
                match modifier {
                    0 => Ok(()),
                    m if m > 0 => write!(f, "+{m}"),
                    m => write!(f, "{m}"),
                }
            }
            Self::Range { low, high } if low < 0 => write!(f, "{low} to {high}"),
            Self::Range { low, high } => write!(f, "{low}-{high}"),
        }
    }
}

fn bad_spec(spec: &str) -> AppError {
    AppError::invalid_input(format!(
        "\"{}\" is not a roll the app understands; use dice such as 1d20 or 2d6+1, or a \
         range such as 40-100",
        spec.trim()
    ))
}

fn number(s: &str) -> Option<i32> {
    let s = s.trim();
    if s.is_empty() || s.len() > 8 {
        return None;
    }
    s.parse::<i32>()
        .ok()
        .filter(|n| n.unsigned_abs() <= MAX_NUMBER as u32)
}

impl DiceSpec {
    /// Parse `d20`, `1d20`, `2d6+1`, `1d100 - 5`, `40-100`, `40–100` or
    /// `-5 to 5`.
    pub fn parse(spec: &str) -> AppResult<Self> {
        let s = spec.trim().to_lowercase().replace(['–', '—'], "-");
        if let Some(d) = s.find('d') {
            let count = match s[..d].trim() {
                "" => 1,
                c => c.parse::<u32>().map_err(|_| bad_spec(spec))?,
            };
            let rest = &s[d + 1..];
            let (sides, modifier) = match rest.find(['+', '-']) {
                Some(i) => {
                    let m = number(&rest[i + 1..]).ok_or_else(|| bad_spec(spec))?;
                    (&rest[..i], if &rest[i..=i] == "-" { -m } else { m })
                }
                None => (rest, 0),
            };
            let sides = sides.trim().parse::<u32>().map_err(|_| bad_spec(spec))?;
            if !(1..=MAX_DICE).contains(&count) || !(2..=MAX_SIDES).contains(&sides) {
                return Err(AppError::invalid_input(format!(
                    "rolls use 1 to {MAX_DICE} dice of 2 to {MAX_SIDES} sides"
                )));
            }
            return Ok(Self::Dice {
                count,
                sides,
                modifier,
            });
        }
        let split = s.find(" to ").map(|i| (i, 4)).or_else(|| {
            // The dash between the two numbers, not a minus sign before the first.
            let first = s.find(|c: char| c.is_ascii_digit())?;
            s[first..].find('-').map(|i| (first + i, 1))
        });
        let (i, len) = split.ok_or_else(|| bad_spec(spec))?;
        let low = number(&s[..i]).ok_or_else(|| bad_spec(spec))?;
        let high = number(&s[i + len..]).ok_or_else(|| bad_spec(spec))?;
        if low >= high {
            return Err(AppError::invalid_input(
                "the low end of a range must be below the high end",
            ));
        }
        Ok(Self::Range { low, high })
    }

    /// Number of dice faces a roll of this spec records.
    fn faces(self) -> usize {
        match self {
            Self::Dice { count, .. } => count as usize,
            Self::Range { .. } => 1,
        }
    }

    /// Lowest and highest value one face can show.
    fn face_bounds(self) -> (i32, i32) {
        match self {
            Self::Dice { sides, .. } => (1, sides as i32),
            Self::Range { low, high } => (low, high),
        }
    }

    fn modifier(self) -> i32 {
        match self {
            Self::Dice { modifier, .. } => modifier,
            Self::Range { .. } => 0,
        }
    }

    /// The lowest and highest total a roll can make, before any stat.
    pub fn total_bounds(self) -> (i32, i32) {
        let (low, high) = self.face_bounds();
        let n = self.faces() as i32;
        (n * low + self.modifier(), n * high + self.modifier())
    }
}

/// A roll the player makes, either answering the storyteller's request or
/// on their own.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct RollRequest {
    /// What the roll decides, e.g. "Pass the chemistry test".
    pub label: String,
    /// Dice such as `1d20+2` or a range such as `40-100`.
    pub dice: String,
    /// One of the player character's stats, added to the roll.
    #[serde(default)]
    #[ts(optional)]
    pub stat: Option<String>,
    /// The total needed to succeed.
    #[serde(default)]
    #[ts(optional)]
    pub target: Option<i32>,
    /// The storyteller asked for this roll.
    #[serde(default)]
    #[ts(as = "Option<bool>", optional)]
    pub asked: bool,
}

/// A single die that landed on its highest or lowest face, in a story with
/// critical rolls: it succeeds or fails whatever the target.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Critical {
    Success,
    Failure,
}

/// A roll that was made, stored with the player's action.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct DiceRoll {
    pub label: String,
    /// The dice or range rolled, in the app's spelling (`2d6+1`, `40-100`).
    pub dice: String,
    /// The stat added, spelled as on the character.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub stat: Option<String>,
    /// The stat's value at the time of the roll.
    #[serde(default, skip_serializing_if = "is_zero")]
    #[ts(as = "Option<i32>", optional)]
    pub bonus: i32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub target: Option<i32>,
    /// What each die showed (one number for a range).
    pub faces: Vec<i32>,
    /// Faces plus the dice modifier and the stat.
    pub total: i32,
    #[serde(default, skip_serializing_if = "is_false")]
    #[ts(as = "Option<bool>", optional)]
    pub asked: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub critical: Option<Critical>,
}

fn is_zero(n: &i32) -> bool {
    *n == 0
}

fn is_false(b: &bool) -> bool {
    !*b
}

/// A value safe inside a tag attribute.
fn attr(value: &str) -> String {
    value.trim().replace(['"', '<', '>'], "'")
}

impl DiceRoll {
    /// `Some(true)` when the roll met its target (or was a critical
    /// success), `Some(false)` when it fell short (or was a critical failure).
    pub fn success(&self) -> Option<bool> {
        match self.critical {
            Some(Critical::Success) => Some(true),
            Some(Critical::Failure) => Some(false),
            None => self.target.map(|t| self.total >= t),
        }
    }

    /// The single die (not a range) that it was, if any: its number of sides.
    fn single_die(&self) -> Option<u32> {
        match DiceSpec::parse(&self.dice) {
            Ok(DiceSpec::Dice {
                count: 1, sides, ..
            }) if sides >= 2 => Some(sides),
            _ => None,
        }
    }

    /// In a story with critical rolls: a single die's highest face is a
    /// critical success and its lowest a critical failure.
    pub fn mark_critical(&mut self) {
        let (Some(sides), Some(&face)) = (self.single_die(), self.faces.first()) else {
            return;
        };
        self.critical = if face == sides as i32 {
            Some(Critical::Success)
        } else if face == 1 {
            Some(Critical::Failure)
        } else {
            None
        };
    }

    /// The roll as the storyteller reads it, e.g.
    /// `<roll for="Pick the lock" dice="1d20" stat="Hands" bonus="+2"
    /// target="12" result="15" outcome="success"/>`.
    pub fn tag(&self) -> String {
        let mut out = format!(
            "<roll for=\"{}\" dice=\"{}\"",
            attr(&self.label),
            attr(&self.dice)
        );
        if let Some(stat) = &self.stat {
            out.push_str(&format!(
                " stat=\"{}\" bonus=\"{:+}\"",
                attr(stat),
                self.bonus
            ));
        }
        if self.faces.len() > 1 {
            let faces: Vec<String> = self.faces.iter().map(i32::to_string).collect();
            out.push_str(&format!(" faces=\"{}\"", faces.join(",")));
        }
        if let Some(t) = self.target {
            out.push_str(&format!(" target=\"{t}\""));
        }
        out.push_str(&format!(" result=\"{}\"", self.total));
        match self.critical {
            Some(Critical::Success) => out.push_str(" critical=\"success\""),
            Some(Critical::Failure) => out.push_str(" critical=\"failure\""),
            None => {}
        }
        match self.success() {
            Some(true) => out.push_str(" outcome=\"success\""),
            Some(false) => out.push_str(" outcome=\"failure\""),
            None => {}
        }
        out.push_str("/>");
        out
    }

    /// A stored roll must be one the app could have made.
    pub fn validate(&self) -> AppResult<()> {
        let bad = |m: &str| Err(AppError::invalid_input(m.to_string()));
        if self.label.trim().is_empty() || self.label.chars().count() > MAX_LABEL {
            return bad("a roll needs a label of 1 to 200 characters");
        }
        let spec = DiceSpec::parse(&self.dice)?;
        let (lo, hi) = spec.face_bounds();
        if self.faces.len() != spec.faces() || self.faces.iter().any(|f| *f < lo || *f > hi) {
            return bad("the roll's dice do not match what was rolled");
        }
        let sum: i64 = self.faces.iter().map(|f| i64::from(*f)).sum::<i64>()
            + i64::from(spec.modifier())
            + i64::from(self.bonus);
        if sum != i64::from(self.total) {
            return bad("the roll's total does not add up");
        }
        if self.stat.as_ref().is_some_and(|s| s.chars().count() > 60) {
            return bad("a stat name is at most 60 characters");
        }
        if let Some(c) = self.critical {
            let face = self.faces.first().copied();
            let ok = match (self.single_die(), c) {
                (Some(sides), Critical::Success) => face == Some(sides as i32),
                (Some(_), Critical::Failure) => face == Some(1),
                (None, _) => false,
            };
            if !ok {
                return bad("only a single die's highest or lowest face is critical");
            }
        }
        // A bonus comes only from a stat, and a stat is at most 1000 either way.
        if (self.stat.is_none() && self.bonus != 0) || self.bonus.abs() > 1000 {
            return bad("the roll's bonus does not match its stat");
        }
        Ok(())
    }
}

/// A uniformly random whole number from `0` to `n - 1`, from the operating
/// system's random source.
pub fn os_uniform(n: u32) -> AppResult<u32> {
    let n = u64::from(n.max(1));
    // Rejection sampling keeps every value equally likely.
    let limit = u64::MAX - u64::MAX % n;
    loop {
        let x = getrandom::u64().map_err(|e| AppError::internal(format!("no randomness: {e}")))?;
        if x < limit {
            return Ok((x % n) as u32);
        }
    }
}

/// Make the roll. `uniform(n)` returns a whole number from 0 to n - 1.
/// A stat is looked up on `player` without regard to case; a stat they do
/// not have adds nothing and is not recorded.
pub fn roll(
    req: &RollRequest,
    player: Option<&Character>,
    uniform: &mut dyn FnMut(u32) -> AppResult<u32>,
) -> AppResult<DiceRoll> {
    let spec = DiceSpec::parse(&req.dice)?;
    let label = match req.label.trim() {
        "" => DEFAULT_LABEL.to_string(),
        l if l.chars().count() > MAX_LABEL => {
            return Err(AppError::invalid_input(
                "what the roll is for is at most 200 characters",
            ))
        }
        l => l.to_string(),
    };
    if let Some(t) = req.target {
        if t.unsigned_abs() > MAX_NUMBER as u32 {
            return Err(AppError::invalid_input("the roll's target is too large"));
        }
    }
    let stat = req
        .stat
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .and_then(|name| {
            player?
                .stats
                .iter()
                .find(|s| s.name.trim().eq_ignore_ascii_case(name))
        });
    let (lo, hi) = spec.face_bounds();
    let span = (hi - lo + 1) as u32;
    let mut faces = Vec::with_capacity(spec.faces());
    for _ in 0..spec.faces() {
        faces.push(lo + uniform(span)? as i32);
    }
    let bonus = stat.map_or(0, |s| s.value);
    let total = faces.iter().sum::<i32>() + spec.modifier() + bonus;
    Ok(DiceRoll {
        label,
        dice: spec.to_string(),
        stat: stat.map(|s| s.name.trim().to_string()),
        bonus,
        target: req.target,
        faces,
        total,
        asked: req.asked,
        critical: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::story_state::Stat;

    fn req(dice: &str) -> RollRequest {
        RollRequest {
            label: "Pass the test".into(),
            dice: dice.into(),
            stat: None,
            target: None,
            asked: false,
        }
    }

    #[test]
    fn parses_dice_and_ranges() {
        let dice = |count, sides, modifier| DiceSpec::Dice {
            count,
            sides,
            modifier,
        };
        assert_eq!(DiceSpec::parse("d20").unwrap(), dice(1, 20, 0));
        assert_eq!(DiceSpec::parse(" 2D6 + 1 ").unwrap(), dice(2, 6, 1));
        assert_eq!(DiceSpec::parse("1d100-5").unwrap(), dice(1, 100, -5));
        let range = |low, high| DiceSpec::Range { low, high };
        assert_eq!(DiceSpec::parse("40-100").unwrap(), range(40, 100));
        assert_eq!(DiceSpec::parse("40 – 100").unwrap(), range(40, 100));
        assert_eq!(DiceSpec::parse("-5 to 5").unwrap(), range(-5, 5));
        assert_eq!(DiceSpec::parse("-10--2").unwrap(), range(-10, -2));
        for s in [
            "",
            "d",
            "0d6",
            "21d6",
            "1d1",
            "3d6+x",
            "100-40",
            "7",
            "a-b",
            "1d6+9999999",
        ] {
            assert!(DiceSpec::parse(s).is_err(), "{s}");
        }
        assert_eq!(dice(2, 6, -1).to_string(), "2d6-1");
        assert_eq!(range(-5, 5).to_string(), "-5 to 5");
        assert_eq!(range(40, 100).to_string(), "40-100");
    }

    #[test]
    fn rolls_within_the_odds_and_adds_the_stat() {
        let mut lowest = |_n: u32| Ok(0);
        let r = roll(&req("40-100"), None, &mut lowest).unwrap();
        assert_eq!((r.faces.clone(), r.total), (vec![40], 40));
        let mut highest = |n: u32| Ok(n - 1);
        let r = roll(&req("2d6+1"), None, &mut highest).unwrap();
        assert_eq!((r.faces.clone(), r.total), (vec![6, 6], 13));

        let player = Character {
            name: "Sam".into(),
            stats: vec![Stat {
                name: "Smarts".into(),
                value: 3,
            }],
            ..Default::default()
        };
        let mut r = req("1d20");
        r.stat = Some(" smarts ".into());
        r.target = Some(12);
        r.asked = true;
        let mut nine = |_n: u32| Ok(8);
        let rolled = roll(&r, Some(&player), &mut nine).unwrap();
        assert_eq!(rolled.stat.as_deref(), Some("Smarts"));
        assert_eq!((rolled.total, rolled.success()), (12, Some(true)));
        assert_eq!(
            rolled.tag(),
            "<roll for=\"Pass the test\" dice=\"1d20\" stat=\"Smarts\" bonus=\"+3\" \
             target=\"12\" result=\"12\" outcome=\"success\"/>"
        );
        rolled.validate().unwrap();

        r.stat = Some("Charm".into());
        let rolled = roll(&r, Some(&player), &mut nine).unwrap();
        assert_eq!(
            (rolled.stat.as_deref(), rolled.bonus, rolled.total),
            (None, 0, 9)
        );
        assert_eq!(rolled.success(), Some(false));
        assert!(roll(&req("1d20"), None, &mut nine).unwrap().label == "Pass the test");
        let mut blank = req("1d20");
        blank.label = "  ".into();
        assert_eq!(roll(&blank, None, &mut nine).unwrap().label, DEFAULT_LABEL);
    }

    #[test]
    fn a_stored_roll_must_add_up() {
        let mut r = roll(&req("2d6"), None, &mut |_n| Ok(2)).unwrap();
        r.validate().unwrap();
        assert!(r.tag().contains("faces=\"3,3\" result=\"6\"/>"));
        r.total = 20;
        assert!(r.validate().is_err());
        r.total = 6;
        r.faces = vec![7, -1];
        assert!(r.validate().is_err());
        r.faces = vec![3];
        assert!(r.validate().is_err());
        // A bonus only comes from a stat.
        r.faces = vec![3, 3];
        r.bonus = 12;
        r.total = 18;
        assert!(r.validate().is_err(), "a bonus with no stat");
        r.stat = Some("Smarts".into());
        r.validate().unwrap();
    }

    #[test]
    fn os_rolls_cover_every_face() {
        let mut seen = [false; 6];
        for _ in 0..2000 {
            seen[os_uniform(6).unwrap() as usize] = true;
        }
        assert!(seen.iter().all(|s| *s));
        assert_eq!(os_uniform(1).unwrap(), 0);
    }

    #[test]
    fn a_single_die_can_be_critical() {
        let mut r = roll(&req("1d20"), None, &mut |_n| Ok(19)).unwrap();
        assert_eq!(r.total, 20);
        r.target = Some(25);
        r.mark_critical();
        assert_eq!(r.critical, Some(Critical::Success));
        assert_eq!(
            r.success(),
            Some(true),
            "a critical success beats any target"
        );
        assert!(r
            .tag()
            .contains(" result=\"20\" critical=\"success\" outcome=\"success\""));
        r.validate().unwrap();

        let mut low = roll(&req("1d20"), None, &mut |_n| Ok(0)).unwrap();
        low.target = Some(1);
        low.mark_critical();
        assert_eq!(low.success(), Some(false));
        let mut mid = roll(&req("1d20"), None, &mut |_n| Ok(9)).unwrap();
        mid.mark_critical();
        assert_eq!(mid.critical, None);
        // Ranges and several dice are never critical.
        let mut range = roll(&req("40-100"), None, &mut |_n| Ok(60)).unwrap();
        range.mark_critical();
        assert_eq!(range.critical, None);
        let mut two = roll(&req("2d6"), None, &mut |_n| Ok(5)).unwrap();
        two.mark_critical();
        assert_eq!(two.critical, None);
        // A stored critical must match the face.
        mid.critical = Some(Critical::Success);
        assert!(mid.validate().is_err());
    }
}

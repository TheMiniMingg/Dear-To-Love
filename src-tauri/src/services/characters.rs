//! Characters to bring into a new story: someone from the player's other
//! stories, or a character card file (the `.png` or `.json` cards that
//! character-chat apps share, versions 1 to 3 of the open card format).
//!
//! A card is read, never kept: its name, description and personality become
//! a character, and its scenario and first message are offered for the
//! story's opening. Its system prompt, example chats, creator notes and
//! lorebook are left out, so nothing in a card can instruct the storyteller.
//! A card that describes someone under 18 is refused.

use std::collections::HashSet;
use std::io::Read;
use std::path::Path;

use base64::Engine;
use serde::Serialize;
use serde_json::Value;
use ts_rs::TS;

use crate::db::stories::list_stories;
use crate::db::timeline::get_route;
use crate::db::Database;
use crate::domain::story_state::{Character, Control};
use crate::errors::{AppError, AppResult};

/// Largest card file read (a portrait PNG with the card inside).
const MAX_CARD_FILE: u64 = 30 * 1024 * 1024;
/// Longest text kept from a card field.
const MAX_FIELD: usize = 8_000;
const MAX_NAME: usize = 80;
/// A personality line is split into traits only when they are short.
const MAX_TRAIT: usize = 40;
const MAX_TRAITS: usize = 12;

pub const NOT_A_CARD: &str = "this file is not a character card";
pub const NO_NAME: &str = "the character card has no name";
pub const MINOR_CARD: &str = "this character reads as under 18, so it can't be used";

/// Someone from one of the player's stories, as that story has them now.
#[derive(Debug, Clone, Serialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct StoryCharacter {
    pub story_id: String,
    pub story_title: String,
    /// Whether they were the player's own character there.
    pub was_player: bool,
    pub character: Character,
}

/// What a character card gives.
#[derive(Debug, Clone, Serialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CharacterCard {
    /// An NPC with an empty id: the caller places them.
    pub character: Character,
    /// The situation the card sets up.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub scenario: Option<String>,
    /// The card's first message, the scene it opens with.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub greeting: Option<String>,
    /// The file is a PNG: its picture can be their portrait.
    pub has_picture: bool,
}

/// Everyone in the player's stories, newest story first, each person once
/// (the same name and description in two stories is listed from the newer).
pub async fn story_characters(db: &Database) -> AppResult<Vec<StoryCharacter>> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    for story in list_stories(db).await? {
        let head = {
            let mut conn = db.reader().acquire().await?;
            get_route(&mut conn, &story.last_route_id)
                .await?
                .head_event_id
        };
        let Some(head) = head else { continue };
        let state = crate::db::state::state_at(db, &story.id, &head)
            .await?
            .effective
            .state;
        let mut people: Vec<&Character> = state.characters.values().collect();
        // The player's own character first, then everyone else by name.
        people.sort_by_key(|c| (c.id != state.player_character_id, c.name.to_lowercase()));
        for c in people {
            if c.name.trim().is_empty() {
                continue;
            }
            let key = (
                c.name.trim().to_lowercase(),
                c.description.as_deref().unwrap_or("").trim().to_lowercase(),
            );
            if !seen.insert(key) {
                continue;
            }
            out.push(StoryCharacter {
                story_id: story.id.clone(),
                story_title: story.title.clone(),
                was_player: c.id == state.player_character_id,
                character: c.clone(),
            });
        }
    }
    Ok(out)
}

/// Read a character card from `path`. `player_name` replaces the card's
/// `{{user}}` (the player); without one it reads "you".
pub fn read_card(path: &Path, player_name: Option<&str>) -> AppResult<CharacterCard> {
    let file = std::fs::File::open(path)
        .map_err(|e| AppError::invalid_input(format!("could not open the file: {e}")))?;
    let mut bytes = Vec::new();
    file.take(MAX_CARD_FILE + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| AppError::invalid_input(format!("could not read the file: {e}")))?;
    if bytes.len() as u64 > MAX_CARD_FILE {
        return Err(AppError::invalid_input(NOT_A_CARD));
    }
    card_from_bytes(&bytes, player_name)
}

pub fn card_from_bytes(bytes: &[u8], player_name: Option<&str>) -> AppResult<CharacterCard> {
    let has_picture = bytes.starts_with(PNG_SIGNATURE);
    let json = if has_picture {
        card_json_in_png(bytes).ok_or_else(|| AppError::invalid_input(NOT_A_CARD))?
    } else {
        let text = std::str::from_utf8(bytes).map_err(|_| AppError::invalid_input(NOT_A_CARD))?;
        serde_json::from_str::<Value>(text.trim_start_matches('\u{feff}'))
            .map_err(|_| AppError::invalid_input(NOT_A_CARD))?
    };
    let mut card = card_from_json(&json, player_name)?;
    card.has_picture = has_picture;
    Ok(card)
}

fn card_from_json(json: &Value, player_name: Option<&str>) -> AppResult<CharacterCard> {
    // Versions 2 and 3 keep everything under `data`; version 1 at the top.
    let data = match json.get("data") {
        Some(d) if d.is_object() => d,
        _ => json,
    };
    let field = |k: &str| data.get(k).and_then(Value::as_str).unwrap_or("");
    if !data.is_object() || (field("name").is_empty() && field("description").is_empty()) {
        return Err(AppError::invalid_input(NOT_A_CARD));
    }
    let name = one_line(&clean(field("name"), "", ""))
        .chars()
        .take(MAX_NAME)
        .collect::<String>();
    if name.trim().is_empty() {
        return Err(AppError::invalid_input(NO_NAME));
    }
    let user = player_name
        .map(str::trim)
        .filter(|n| !n.is_empty())
        .unwrap_or("you");
    let text = |k: &str| {
        let t = clean(field(k), &name, user);
        (!t.is_empty()).then(|| t.chars().take(MAX_FIELD).collect::<String>())
    };
    let description = text("description");
    let personality = text("personality");
    let scenario = text("scenario");
    let greeting = text("first_mes");
    let everything = [&description, &personality, &scenario, &greeting]
        .into_iter()
        .flatten()
        .map(String::as_str)
        .chain([name.as_str()])
        .collect::<Vec<_>>()
        .join("\n");
    if reads_as_minor(&everything) {
        return Err(AppError::invalid_input(MINOR_CARD));
    }
    let (traits, personality_text) = match personality {
        Some(p) => match traits_of(&p) {
            Some(t) => (t, None),
            None => (Vec::new(), Some(p)),
        },
        None => (Vec::new(), None),
    };
    let description = match (description, personality_text) {
        (Some(d), Some(p)) => Some(format!("{d}\n\nPersonality: {p}")),
        (None, Some(p)) => Some(format!("Personality: {p}")),
        (d, None) => d,
    };
    Ok(CharacterCard {
        character: Character {
            id: String::new(),
            name,
            control: Control::Npc,
            description,
            personality: traits,
            ..Character::default()
        },
        scenario,
        greeting,
        has_picture: false,
    })
}

/// "kind, shy; curious" as traits, when every part is short.
fn traits_of(text: &str) -> Option<Vec<String>> {
    let parts: Vec<String> = text
        .split([',', ';', '\n', '/'])
        .map(|p| p.trim().trim_end_matches('.').trim().to_string())
        .filter(|p| !p.is_empty())
        .collect();
    let short = !parts.is_empty()
        && parts.len() <= MAX_TRAITS
        && parts.iter().all(|p| p.chars().count() <= MAX_TRAIT);
    short.then_some(parts)
}

fn one_line(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Card text as plain story text: the `{{char}}` and `{{user}}` stand-ins
/// filled in, HTML, pictures and emphasis marks taken out, blank lines kept
/// to one.
fn clean(s: &str, name: &str, user: &str) -> String {
    let mut out = s.replace("\r\n", "\n");
    for (from, to) in [
        ("{{char}}", name),
        ("{{Char}}", name),
        ("{{CHAR}}", name),
        ("<BOT>", name),
        ("<bot>", name),
        ("{{user}}", user),
        ("{{User}}", user),
        ("{{USER}}", user),
        ("<USER>", user),
        ("<user>", user),
    ] {
        out = out.replace(from, to);
    }
    // Chat apps mark actions with *asterisks*; here the words are prose.
    let out = strip_markup(&out).replace('*', "");
    let mut lines: Vec<&str> = Vec::new();
    let mut blank = false;
    for line in out.lines().map(str::trim_end) {
        if line.trim().is_empty() {
            if !lines.is_empty() {
                blank = true;
            }
            continue;
        }
        if blank {
            lines.push("");
            blank = false;
        }
        lines.push(line);
    }
    lines.join("\n").trim().to_string()
}

/// Without HTML tags and Markdown pictures (`![alt](url)`).
fn strip_markup(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(i) = rest.find(['<', '!']) {
        out.push_str(&rest[..i]);
        let tail = &rest[i..];
        if tail.starts_with("![") {
            if let Some(end) = tail.find(')').filter(|&e| tail[..e].contains("](")) {
                rest = &tail[end + 1..];
                continue;
            }
        } else if let Some(inside) = tail.strip_prefix('<') {
            let closes = tail.find('>');
            let tag_like = inside
                .chars()
                .next()
                .is_some_and(|c| c.is_ascii_alphabetic() || c == '/' || c == '!');
            if let (Some(end), true) = (closes, tag_like) {
                rest = &tail[end + 1..];
                continue;
            }
        }
        out.push_str(&tail[..1]);
        rest = &tail[1..];
    }
    out.push_str(rest);
    out
}

/// Whether a card's words describe someone under 18: words used for
/// minors in character cards, a pupil below university, or an age under 18
/// in the present ("16 years old", "a 15-year-old", "aged 12", "age: 14";
/// not "when she was 12 years old"). Strict on purpose, like the age check
/// of adults-only stories.
pub fn reads_as_minor(text: &str) -> bool {
    const WORDS: &[&str] = &[
        "loli",
        "lolis",
        "lolicon",
        "shota",
        "shotas",
        "shotacon",
        "underage",
        "under-age",
        "preteen",
        "pre-teen",
        "preteens",
        "schoolgirl",
        "schoolgirls",
        "schoolboy",
        "schoolboys",
        "highschooler",
        "middleschooler",
    ];
    const PHRASES: &[&str] = &[
        "under age",
        "high schooler",
        "high school student",
        "high school girl",
        "high school boy",
        "middle schooler",
        "middle school student",
        "junior high student",
        "elementary schooler",
        "elementary school student",
        "grade schooler",
    ];
    let lower = text.to_lowercase();
    if PHRASES.iter().any(|p| lower.contains(p)) {
        return true;
    }
    let words: Vec<&str> = lower
        .split(|c: char| !(c.is_alphanumeric() || c == '-'))
        .filter(|w| !w.is_empty())
        .collect();
    words.iter().any(|w| WORDS.contains(w)) || young_age(&lower)
}

/// An age under 18 written as a number, about now: "16 years old",
/// "15-year-old", "12 yo", "aged 14", "age: 9". An age in the past
/// ("was 12 years old", "when 15", "since 10") is a backstory, not an age.
fn young_age(lower: &str) -> bool {
    let chars: Vec<char> = lower.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if !chars[i].is_ascii_digit() || (i > 0 && chars[i - 1].is_alphanumeric()) {
            i += 1;
            continue;
        }
        let start = i;
        while i < chars.len() && chars[i].is_ascii_digit() {
            i += 1;
        }
        let n: u32 = chars[start..i]
            .iter()
            .collect::<String>()
            .parse()
            .unwrap_or(99);
        if i - start > 2 || n >= 18 {
            continue;
        }
        let before: String = chars[start.saturating_sub(24)..start].iter().collect();
        let near = before.trim_end().trim_end_matches([':', '=']).trim_end();
        let age_word = ["aged", "age"].iter().any(|w| {
            near.strip_suffix(w)
                .is_some_and(|b| !b.ends_with(|c: char| c.is_alphanumeric()))
        });
        let past = [" was ", " were ", "when ", "since ", "until ", " at "]
            .iter()
            .any(|w| format!(" {before}").contains(w));
        // "She is 16." but not "He is 6 feet tall".
        let bare = (["is", "am", "are"].iter().any(|w| {
            near.strip_suffix(w)
                .is_some_and(|b| !b.ends_with(|c: char| c.is_alphanumeric()))
        }) || near.ends_with("'s")
            || near.ends_with("\u{2019}s"))
            && chars
                .get(i)
                .is_none_or(|c| matches!(c, '.' | ',' | ';' | '!' | ')' | '\n'));
        if (age_word || bare || after_is_age(&chars[i..])) && !past {
            return true;
        }
    }
    false
}

/// Right after a number: "years old", "year-old", "yo", "y/o", "y.o.".
fn after_is_age(rest: &[char]) -> bool {
    let s: String = rest.iter().take(20).collect();
    let s = s.trim_start_matches([' ', '-']);
    let years = [
        "years old",
        "year old",
        "years-old",
        "year-old",
        "yrs old",
        "yr old",
    ];
    years.iter().any(|y| s.starts_with(y))
        || ["yo", "y/o", "y.o."].iter().any(|y| {
            s.strip_prefix(y)
                .is_some_and(|after| !after.starts_with(|c: char| c.is_alphanumeric()))
        })
}

const PNG_SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";

/// The card inside a PNG's text chunks: `ccv3` (version 3) wins over
/// `chara` (versions 1 and 2), each base64 JSON.
fn card_json_in_png(bytes: &[u8]) -> Option<Value> {
    let mut found: Vec<(String, String)> = Vec::new();
    let mut at = PNG_SIGNATURE.len();
    while at + 8 <= bytes.len() {
        let len = u32::from_be_bytes(bytes[at..at + 4].try_into().ok()?) as usize;
        let kind = &bytes[at + 4..at + 8];
        let start = at + 8;
        let end = start.checked_add(len)?;
        if end > bytes.len() {
            break;
        }
        let data = &bytes[start..end];
        match kind {
            b"tEXt" => {
                if let Some(z) = data.iter().position(|&b| b == 0) {
                    let key = String::from_utf8_lossy(&data[..z]).to_lowercase();
                    let text: String = data[z + 1..].iter().map(|&b| b as char).collect();
                    found.push((key, text));
                }
            }
            b"zTXt" => {
                if let Some(z) = data.iter().position(|&b| b == 0) {
                    let key = String::from_utf8_lossy(&data[..z]).to_lowercase();
                    if let Some(text) = data.get(z + 2..).and_then(inflate) {
                        found.push((key, text.chars().collect()));
                    }
                }
            }
            b"iTXt" => {
                if let Some(t) = itxt(data) {
                    found.push(t);
                }
            }
            b"IEND" => break,
            _ => {}
        }
        at = end + 4; // the chunk's CRC
    }
    ["ccv3", "chara"].iter().find_map(|want| {
        found
            .iter()
            .filter(|(k, _)| k == want)
            .find_map(|(_, text)| {
                let raw = base64::engine::general_purpose::STANDARD
                    .decode(text.trim())
                    .ok()
                    .and_then(|b| String::from_utf8(b).ok())
                    .unwrap_or_else(|| text.clone());
                serde_json::from_str::<Value>(&raw).ok()
            })
    })
}

/// An iTXt chunk: keyword, compression flag and method, language and
/// translated keyword, then the (maybe compressed) UTF-8 text.
fn itxt(data: &[u8]) -> Option<(String, String)> {
    let z = data.iter().position(|&b| b == 0)?;
    let key = String::from_utf8_lossy(&data[..z]).to_lowercase();
    let compressed = *data.get(z + 1)? == 1;
    let rest = data.get(z + 3..)?;
    let lang = rest.iter().position(|&b| b == 0)?;
    let rest = &rest[lang + 1..];
    let translated = rest.iter().position(|&b| b == 0)?;
    let text = &rest[translated + 1..];
    let text = if compressed {
        inflate(text)?
    } else {
        String::from_utf8(text.to_vec()).ok()?
    };
    Some((key, text))
}

fn inflate(data: &[u8]) -> Option<String> {
    let mut out = String::new();
    flate2::read::ZlibDecoder::new(data)
        .take(MAX_CARD_FILE)
        .read_to_string(&mut out)
        .ok()?;
    Some(out)
}

#[cfg(test)]
mod tests;

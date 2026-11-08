//! Voice pack files (`.dtlvoices`): which voice reads the narration and
//! which reads each character, to keep or share.
//!
//! A pack names voices only. It never holds a key, a service address or a
//! connection: whoever opens it picks their own computer's voices or their
//! own voice connection. Voices from a voice service are its voice ids
//! (ElevenLabs' or a voice server's), with the name the player saw, so a
//! pack still reads well where a voice isn't there.

use std::io::Read;
use std::path::Path;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::errors::{AppError, AppResult};
use crate::services::archive::write_atomic;

pub const FORMAT: &str = "dear-to-love-voices";
pub const VERSION: u32 = 1;
const MAX_FILE: u64 = 512 * 1024;
pub const MAX_CHARACTERS: usize = 300;
const MAX_NAME: usize = 80;
const MAX_VOICE: usize = 200;
const NOT_A_PACK: &str = "this file isn't a Dear to Love voice pack";

/// Where a pack's voices come from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum VoiceSource {
    /// The computer's own voices: free and offline.
    Computer,
    Elevenlabs,
    /// An OpenAI-style voice server, such as Kokoro on the player's computer.
    OpenaiSpeech,
}

/// How fast the computer's voices read.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum VoicePackSpeed {
    Slow,
    #[default]
    Normal,
    Fast,
}

/// One voice: its id at the source (empty for the computer's usual
/// voice), and the name the player saw.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct VoiceChoice {
    #[serde(default)]
    pub voice: String,
    #[serde(default)]
    pub label: String,
}

/// A character and the voice that reads their lines.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CharacterVoice {
    pub name: String,
    #[serde(default)]
    pub voice: String,
    #[serde(default)]
    pub label: String,
}

/// What a voice pack file holds.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct VoicePackFile {
    pub name: String,
    pub source: VoiceSource,
    #[serde(default)]
    pub narrator: VoiceChoice,
    #[serde(default)]
    pub speed: VoicePackSpeed,
    #[serde(default)]
    pub characters: Vec<CharacterVoice>,
}

#[derive(Serialize, Deserialize)]
struct Envelope {
    format: String,
    version: u32,
    pack: VoicePackFile,
}

fn clip(s: &str, max: usize) -> String {
    let s: String = s.chars().filter(|c| !c.is_control()).collect();
    s.trim()
        .chars()
        .take(max)
        .collect::<String>()
        .trim()
        .to_string()
}

fn clean_choice(c: &VoiceChoice) -> VoiceChoice {
    VoiceChoice {
        voice: clip(&c.voice, MAX_VOICE),
        label: clip(&c.label, MAX_NAME),
    }
}

/// The pack with names trimmed and shortened, unnamed characters left out
/// and each name once.
pub fn clean(pack: &VoicePackFile) -> AppResult<VoicePackFile> {
    let name = clip(&pack.name, MAX_NAME);
    if name.is_empty() {
        return Err(AppError::invalid_input("give the voice pack a name"));
    }
    let mut seen = std::collections::HashSet::new();
    let mut characters = Vec::new();
    for c in &pack.characters {
        let n = clip(&c.name, MAX_NAME);
        if n.is_empty() || !seen.insert(n.to_lowercase()) {
            continue;
        }
        if characters.len() == MAX_CHARACTERS {
            return Err(AppError::invalid_input(format!(
                "a voice pack holds at most {MAX_CHARACTERS} characters"
            )));
        }
        let v = clean_choice(&VoiceChoice {
            voice: c.voice.clone(),
            label: c.label.clone(),
        });
        characters.push(CharacterVoice {
            name: n,
            voice: v.voice,
            label: v.label,
        });
    }
    Ok(VoicePackFile {
        name,
        source: pack.source,
        narrator: clean_choice(&pack.narrator),
        speed: pack.speed,
        characters,
    })
}

/// The file's text.
pub fn to_json(pack: &VoicePackFile) -> AppResult<String> {
    let env = Envelope {
        format: FORMAT.into(),
        version: VERSION,
        pack: clean(pack)?,
    };
    serde_json::to_string_pretty(&env).map_err(|e| AppError::internal(e.to_string()))
}

/// A pack from a file's text. Anything else in the file is left out.
pub fn from_json(text: &str) -> AppResult<VoicePackFile> {
    let v: serde_json::Value = serde_json::from_str(text.trim_start_matches('\u{feff}'))
        .map_err(|_| AppError::invalid_input(NOT_A_PACK))?;
    if v.get("format").and_then(|f| f.as_str()) != Some(FORMAT) {
        return Err(AppError::invalid_input(NOT_A_PACK));
    }
    if v.get("version").and_then(|n| n.as_u64()).unwrap_or(0) > u64::from(VERSION) {
        return Err(AppError::invalid_input(
            "this voice pack was made by a newer version of Dear to Love; update the app to open it",
        ));
    }
    let env: Envelope =
        serde_json::from_value(v).map_err(|_| AppError::invalid_input(NOT_A_PACK))?;
    clean(&env.pack)
}

pub fn write(path: &Path, pack: &VoicePackFile) -> AppResult<()> {
    write_atomic(path, to_json(pack)?.as_bytes())
}

pub fn read(path: &Path) -> AppResult<VoicePackFile> {
    let file = std::fs::File::open(path)
        .map_err(|e| AppError::invalid_input(format!("could not open the file: {e}")))?;
    let mut bytes = Vec::new();
    file.take(MAX_FILE + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| AppError::invalid_input(format!("could not read the file: {e}")))?;
    if bytes.len() as u64 > MAX_FILE {
        return Err(AppError::invalid_input(NOT_A_PACK));
    }
    let text = std::str::from_utf8(&bytes).map_err(|_| AppError::invalid_input(NOT_A_PACK))?;
    from_json(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pack() -> VoicePackFile {
        VoicePackFile {
            name: "  Lighthouse cast ".into(),
            source: VoiceSource::Elevenlabs,
            narrator: VoiceChoice {
                voice: "abc123".into(),
                label: "Rachel".into(),
            },
            speed: VoicePackSpeed::Normal,
            characters: vec![
                CharacterVoice {
                    name: "Mina".into(),
                    voice: "mine9".into(),
                    label: "My voice".into(),
                },
                CharacterVoice {
                    name: " mina ".into(),
                    voice: "other".into(),
                    label: String::new(),
                },
                CharacterVoice {
                    name: "  ".into(),
                    voice: "x".into(),
                    label: String::new(),
                },
            ],
        }
    }

    #[test]
    fn a_pack_goes_to_a_file_and_back_cleaned() {
        let text = to_json(&pack()).unwrap();
        assert!(text.contains("\"format\": \"dear-to-love-voices\""));
        let back = from_json(&text).unwrap();
        assert_eq!(back.name, "Lighthouse cast");
        assert_eq!(back.characters.len(), 1, "one Mina, no unnamed character");
        assert_eq!(back.characters[0].voice, "mine9");
        assert_eq!(back.source, VoiceSource::Elevenlabs);
    }

    #[test]
    fn a_file_with_more_in_it_keeps_only_the_voices() {
        let text = r#"{"format":"dear-to-love-voices","version":1,
            "apiKey":"sk-secret","baseUrl":"https://evil.example",
            "pack":{"name":"Cast","source":"openai_speech","connectionId":"c1",
                    "apiKey":"sk-secret","narrator":{"voice":"af_bella"}}}"#;
        let p = from_json(text).unwrap();
        let again = to_json(&p).unwrap();
        assert!(!again.contains("sk-secret") && !again.contains("evil") && !again.contains("c1"));
        assert_eq!(p.narrator.voice, "af_bella");
        assert!(p.characters.is_empty());
    }

    #[test]
    fn other_files_and_newer_packs_are_refused() {
        for bad in [
            "not json",
            r#"{"format":"something-else","version":1,"pack":{"name":"x","source":"computer"}}"#,
            r#"{"format":"dear-to-love-voices","version":1,"pack":{"name":"x","source":"radio"}}"#,
            r#"{"format":"dear-to-love-voices","version":1,"pack":{"name":"  ","source":"computer"}}"#,
        ] {
            assert!(from_json(bad).is_err(), "{bad}");
        }
        let newer = r#"{"format":"dear-to-love-voices","version":2,"pack":{}}"#;
        assert!(from_json(newer)
            .unwrap_err()
            .message
            .contains("newer version"));
    }

    #[test]
    fn a_pack_is_written_and_read_from_disk() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("cast.dtlvoices");
        write(&path, &pack()).unwrap();
        assert_eq!(read(&path).unwrap().characters[0].name, "Mina");
        std::fs::write(&path, vec![b' '; (MAX_FILE + 10) as usize]).unwrap();
        assert!(read(&path).is_err());
    }
}

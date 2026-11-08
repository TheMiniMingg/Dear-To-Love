//! AI voices: a reply read aloud by a voice service instead of the
//! computer's own voices.
//!
//! Two kinds of service read text aloud: ElevenLabs (its own voices and any
//! the player made or cloned there) and OpenAI-style speech servers such as
//! Kokoro-FastAPI, which run on the player's own computer for free. The
//! reader sends one stretch of text at a time (the narrator's lines, or one
//! character's) and plays what comes back. Every call is one ledger row
//! (purpose `character_suggestion`, shown as "Story ideas, pictures and
//! voices"): the app can't price voices, so a budget that pauses paid
//! requests asks before the first one.
//!
//! Only the text being read is sent. Voices come back as WAV, which every
//! system's web view plays.

use std::time::Duration;

use reqwest::header::{HeaderValue, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio_util::sync::CancellationToken;
use ts_rs::TS;

use super::adapters::http::{self, http_error, provider_err, read_limited, send_error};
use super::adapters::{Charge, GenerateError};
use super::secrets::SecretStore;
use crate::db::providers;
use crate::db::usage::{self, NewRequest, RequestOutcome, RequestPurpose, RequestStatus};
use crate::db::Database;
use crate::domain::provider::{AdapterKind, NormalizedUsage};
use crate::errors::{AppError, AppResult};

/// The most text one call reads (ElevenLabs' smallest model limit). The
/// reader sends a paragraph or a character's line at a time.
pub const MAX_SPEECH_CHARS: usize = 5_000;
/// The largest answer accepted: minutes of 24 kHz speech.
const MAX_AUDIO_BYTES: usize = 40 * 1024 * 1024;
/// ElevenLabs sends raw 16-bit samples at this rate, wrapped here as WAV.
const PCM_RATE: u32 = 24_000;
const LIST_TIMEOUT: Duration = Duration::from_secs(20);
const SPEAK_TIMEOUT: Duration = Duration::from_secs(90);

/// One voice a service offers.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct VoiceInfo {
    /// What is sent to choose it.
    pub id: String,
    /// What the player sees.
    pub name: String,
    /// A few words from the service: "cloned", "British", and so on.
    pub note: Option<String>,
}

/// A ready-to-call voice service.
pub struct VoiceService {
    kind: AdapterKind,
    base_url: String,
    api_key: Option<String>,
    client: reqwest::Client,
}

impl VoiceService {
    pub fn new(kind: AdapterKind, base_url: &str, api_key: Option<String>) -> AppResult<Self> {
        if !kind.speaks() {
            return Err(AppError::invalid_input(
                "this connection doesn't read aloud; choose a voice connection",
            ));
        }
        Ok(Self {
            kind,
            base_url: base_url.trim_end_matches('/').to_string(),
            api_key: api_key.filter(|k| !k.trim().is_empty()),
            client: http::client(base_url)?,
        })
    }

    fn auth(&self, rb: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        match self.kind {
            AdapterKind::Elevenlabs => match self
                .api_key
                .as_deref()
                .and_then(|k| HeaderValue::from_str(k.trim()).ok())
            {
                Some(mut v) => {
                    v.set_sensitive(true);
                    rb.header("xi-api-key", v)
                }
                None => rb,
            },
            _ => http::bearer(rb, self.api_key.as_deref()),
        }
    }

    /// Where one reading is sent, and what is sent.
    pub fn speech_request(&self, model: &str, voice: &str, text: &str) -> (String, Value) {
        match self.kind {
            AdapterKind::Elevenlabs => (
                format!(
                    "{}/text-to-speech/{}?output_format=pcm_{PCM_RATE}",
                    self.base_url,
                    path_segment(voice)
                ),
                json!({ "text": text, "model_id": model }),
            ),
            _ => (
                format!("{}/audio/speech", self.base_url),
                json!({
                    "model": model,
                    "voice": voice,
                    "input": text,
                    "response_format": "wav",
                }),
            ),
        }
    }

    /// Read `text` aloud in `voice`. Returns WAV audio.
    pub async fn speak(
        &self,
        model: &str,
        voice: &str,
        text: &str,
        timeout: Duration,
    ) -> Result<Vec<u8>, GenerateError> {
        let text = text.trim();
        if text.is_empty() {
            return Err(GenerateError::not_sent(AppError::invalid_input(
                "there is nothing to read aloud",
            )));
        }
        if text.chars().count() > MAX_SPEECH_CHARS {
            return Err(GenerateError::not_sent(AppError::invalid_input(format!(
                "a voice reads at most {MAX_SPEECH_CHARS} characters at a time"
            ))));
        }
        if voice.trim().is_empty() {
            return Err(GenerateError::not_sent(AppError::invalid_input(
                "choose a voice for this voice pack first",
            )));
        }
        let (url, body) = self.speech_request(model, voice.trim(), text);
        let body = serde_json::to_vec(&body)
            .map_err(|e| GenerateError::not_sent(AppError::internal(e.to_string())))?;
        let rb = self
            .auth(self.client.post(url))
            .header(CONTENT_TYPE, "application/json")
            .body(body);
        let resp = tokio::time::timeout(timeout, rb.send())
            .await
            .map_err(|_| {
                GenerateError::maybe_charged(http::unreachable_err(
                    "the voice service did not answer in time",
                ))
            })?
            .map_err(send_error)?;
        let status = resp.status();
        if !status.is_success() {
            let text = read_limited(resp, &CancellationToken::new(), Duration::from_secs(20)).await;
            return Err(http_error(status.as_u16(), &text));
        }
        let audio = read_audio(resp, timeout).await?;
        if audio.is_empty() {
            return Err(GenerateError::maybe_charged(provider_err(
                "the voice service answered, but sent no sound",
            )));
        }
        Ok(match self.kind {
            AdapterKind::Elevenlabs => wav_from_pcm16(&audio, PCM_RATE),
            // Servers asked for WAV send it; one that sends something else
            // (MP3, say) is played as it is.
            _ => audio,
        })
    }

    /// Free connection check: the service's models. Never sends any text.
    pub async fn list_models(&self) -> AppResult<Vec<String>> {
        let v = self.get_json(&format!("{}/models", self.base_url)).await?;
        let list = v
            .as_array()
            .or_else(|| v.get("data").and_then(Value::as_array))
            .ok_or_else(|| provider_err("the server answered, but not with a model list"))?;
        Ok(list
            .iter()
            .filter(|m| {
                // ElevenLabs lists speech-to-speech models too.
                m.get("can_do_text_to_speech")
                    .and_then(Value::as_bool)
                    .unwrap_or(true)
            })
            .filter_map(|m| {
                m.get("model_id")
                    .or_else(|| m.get("id"))
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .collect())
    }

    /// The voices the service offers, including ones the player made there.
    pub async fn list_voices(&self) -> AppResult<Vec<VoiceInfo>> {
        let url = match self.kind {
            AdapterKind::Elevenlabs => format!("{}/voices", self.base_url),
            _ => format!("{}/audio/voices", self.base_url),
        };
        let v = self.get_json(&url).await?;
        Ok(voices_from(&v))
    }

    async fn get_json(&self, url: &str) -> AppResult<Value> {
        let resp = tokio::time::timeout(LIST_TIMEOUT, self.auth(self.client.get(url)).send())
            .await
            .map_err(|_| http::unreachable_err("the voice service did not answer in time"))?
            .map_err(|e| send_error(e).error)?;
        let status = resp.status();
        let text = read_limited(resp, &CancellationToken::new(), LIST_TIMEOUT).await;
        if !status.is_success() {
            return Err(http_error(status.as_u16(), &text).error);
        }
        serde_json::from_str(&text)
            .map_err(|_| provider_err("the voice service answered, but not with a list"))
    }
}

/// `voice` made safe to put in a URL path: anything but letters, digits,
/// `-`, `_` and `.` is percent-encoded, so a voice can't change the path.
fn path_segment(voice: &str) -> String {
    voice
        .bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// Voices from a list answer: ElevenLabs' `{"voices": [{voice_id, name,
/// category, labels}]}`, or a voice server's `{"voices": ["af_bella", …]}`.
pub fn voices_from(v: &Value) -> Vec<VoiceInfo> {
    let list = v
        .get("voices")
        .and_then(Value::as_array)
        .or_else(|| v.as_array())
        .or_else(|| v.get("data").and_then(Value::as_array));
    let Some(list) = list else {
        return Vec::new();
    };
    list.iter()
        .filter_map(|item| {
            if let Some(id) = item.as_str() {
                return Some(VoiceInfo {
                    id: id.to_string(),
                    name: id.to_string(),
                    note: None,
                });
            }
            let id = item
                .get("voice_id")
                .or_else(|| item.get("id"))
                .and_then(Value::as_str)?
                .to_string();
            let name = item
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or(&id)
                .to_string();
            let mut note: Vec<String> = Vec::new();
            if let Some(c) = item.get("category").and_then(Value::as_str) {
                if c != "premade" {
                    note.push(c.replace('_', " "));
                }
            }
            if let Some(labels) = item.get("labels").and_then(Value::as_object) {
                for k in ["accent", "gender", "age"] {
                    if let Some(l) = labels.get(k).and_then(Value::as_str) {
                        note.push(l.replace('_', " "));
                    }
                }
            }
            Some(VoiceInfo {
                id,
                name,
                note: (!note.is_empty()).then(|| note.join(", ")),
            })
        })
        .collect()
}

async fn read_audio(resp: reqwest::Response, timeout: Duration) -> Result<Vec<u8>, GenerateError> {
    let mut resp = resp;
    let mut out = Vec::new();
    loop {
        match tokio::time::timeout(timeout, resp.chunk()).await {
            Ok(Ok(Some(b))) => {
                out.extend_from_slice(&b);
                if out.len() > MAX_AUDIO_BYTES {
                    return Err(GenerateError::maybe_charged(provider_err(
                        "the voice service sent more sound than this app accepts",
                    )));
                }
            }
            Ok(Ok(None)) => return Ok(out),
            _ => {
                return Err(GenerateError::maybe_charged(http::unreachable_err(
                    "the connection dropped while the voice was sent",
                )))
            }
        }
    }
}

/// Mono 16-bit little-endian samples as a WAV file.
pub fn wav_from_pcm16(pcm: &[u8], rate: u32) -> Vec<u8> {
    // An odd byte at the end is half a sample; leave it out.
    let pcm = &pcm[..pcm.len() & !1];
    // Never near 4 GB (answers stop at MAX_AUDIO_BYTES); even, to be whole samples.
    let data_len = u32::try_from(pcm.len()).unwrap_or(u32::MAX - 1);
    let mut out = Vec::with_capacity(44 + pcm.len());
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + data_len).to_le_bytes());
    out.extend_from_slice(b"WAVEfmt ");
    out.extend_from_slice(&16u32.to_le_bytes()); // fmt chunk size
    out.extend_from_slice(&1u16.to_le_bytes()); // PCM
    out.extend_from_slice(&1u16.to_le_bytes()); // mono
    out.extend_from_slice(&rate.to_le_bytes());
    out.extend_from_slice(&(rate * 2).to_le_bytes()); // bytes per second
    out.extend_from_slice(&2u16.to_le_bytes()); // bytes per frame
    out.extend_from_slice(&16u16.to_le_bytes()); // bits per sample
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_len.to_le_bytes());
    out.extend_from_slice(&pcm[..data_len as usize]);
    out
}

/// What the reader asks one voice connection to read.
#[derive(Debug, Clone, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SpeakInput {
    pub connection_id: String,
    pub voice: String,
    pub text: String,
    /// The player chose to read aloud although the budget can't price it.
    #[serde(default)]
    pub allow_unpriced: bool,
}

/// Reads one stretch of text aloud with a voice connection. One ledger row.
pub async fn speak(
    db: &Database,
    secrets: &dyn SecretStore,
    session_id: &str,
    input: &SpeakInput,
) -> AppResult<Vec<u8>> {
    let row = providers::get_profile_row(db, &input.connection_id).await?;
    let kind = row.adapter()?;
    if !kind.speaks() {
        return Err(AppError::invalid_input(
            "that connection doesn't read aloud; choose a voice connection in the voice pack",
        ));
    }
    let key = match &row.secret_ref {
        Some(r) => secrets.get(r)?,
        None => None,
    };
    let service = VoiceService::new(kind, row.base_url.as_deref().unwrap_or_default(), key)?;
    let request = usage::open_request(
        db,
        NewRequest {
            generation_run_id: None,
            provider_profile_id: Some(&row.id),
            provider_label: &row.label,
            model_id: &row.model_id,
            billing: row.billing(),
            session_id,
            route_id: None,
            purpose: RequestPurpose::CharacterSuggestion,
            prompt_tokens: 0,
            max_output_tokens: 0,
            allow_unpriced: input.allow_unpriced,
        },
    )
    .await?;
    let timeout = Duration::from_millis(u64::from(row.settings().timeout_ms)).max(SPEAK_TIMEOUT);
    let result = service
        .speak(&row.model_id, &input.voice, &input.text, timeout)
        .await;
    let outcome = |status, may_be_charged, error_code| RequestOutcome {
        status,
        usage: NormalizedUsage::default(),
        may_be_charged,
        error_code,
    };
    match result {
        Ok(audio) => {
            usage::close_request(db, &request, outcome(RequestStatus::Completed, true, None))
                .await?;
            Ok(audio)
        }
        Err(e) => {
            let charged = matches!(e.charge, Charge::Unknown);
            usage::close_request(
                db,
                &request,
                outcome(RequestStatus::Failed, charged, Some(e.error.code)),
            )
            .await?;
            Err(e.error)
        }
    }
}

/// The voices a voice connection offers.
pub async fn connection_voices(
    db: &Database,
    secrets: &dyn SecretStore,
    connection_id: &str,
) -> AppResult<Vec<VoiceInfo>> {
    let row = providers::get_profile_row(db, connection_id).await?;
    let key = match &row.secret_ref {
        Some(r) => secrets.get(r)?,
        None => None,
    };
    VoiceService::new(
        row.adapter()?,
        row.base_url.as_deref().unwrap_or_default(),
        key,
    )?
    .list_voices()
    .await
}

#[cfg(test)]
mod tests;

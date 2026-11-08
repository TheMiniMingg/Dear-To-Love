//! Storyteller (model provider) profiles, model requests and the stream
//! contract shared with the UI. Adapters translate these to a wire protocol;
//! the story engine never builds provider-specific payloads.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::errors::{AppError, AppResult};

/// Wire protocol an adapter speaks.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum AdapterKind {
    /// `POST {baseUrl}/chat/completions` with server-sent events.
    OpenaiCompatible,
    /// Ollama's native `POST {baseUrl}/api/chat` (sets the context size).
    Ollama,
    /// Anthropic's Messages API, `POST {baseUrl}/messages`, for Claude.
    Anthropic,
    /// Pictures: OpenAI's `POST {baseUrl}/images/generations` (and servers
    /// that offer the same API).
    OpenaiImages,
    /// Pictures: Stable Diffusion WebUI (AUTOMATIC1111, Forge, SD.Next),
    /// `POST {baseUrl}/sdapi/v1/txt2img`.
    StableDiffusion,
    /// Voices: an OpenAI-style speech API, `POST {baseUrl}/audio/speech`
    /// (Kokoro-FastAPI and other voice servers that copy it).
    OpenaiSpeech,
    /// Voices: ElevenLabs, `POST {baseUrl}/text-to-speech/{voice}`.
    Elevenlabs,
}

impl AdapterKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::OpenaiCompatible => "openai_compatible",
            Self::Ollama => "ollama",
            Self::Anthropic => "anthropic",
            Self::OpenaiImages => "openai_images",
            Self::StableDiffusion => "stable_diffusion",
            Self::OpenaiSpeech => "openai_speech",
            Self::Elevenlabs => "elevenlabs",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "openai_compatible" => Some(Self::OpenaiCompatible),
            "ollama" => Some(Self::Ollama),
            "anthropic" => Some(Self::Anthropic),
            "openai_images" => Some(Self::OpenaiImages),
            "stable_diffusion" => Some(Self::StableDiffusion),
            "openai_speech" => Some(Self::OpenaiSpeech),
            "elevenlabs" => Some(Self::Elevenlabs),
            _ => None,
        }
    }

    /// Makes pictures rather than story replies.
    pub fn makes_pictures(self) -> bool {
        matches!(self, Self::OpenaiImages | Self::StableDiffusion)
    }

    /// Reads text aloud rather than writing story replies.
    pub fn speaks(self) -> bool {
        matches!(self, Self::OpenaiSpeech | Self::Elevenlabs)
    }

    /// Can write a story's replies (not a picture or voice connection).
    pub fn writes_stories(self) -> bool {
        !self.makes_pictures() && !self.speaks()
    }
}

/// `local` means the API-charge estimate is $0 whatever the adapter.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum Billing {
    Paid,
    Local,
}

impl Billing {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Paid => "paid",
            Self::Local => "local",
        }
    }

    pub fn parse(s: &str) -> Self {
        if s == "local" {
            Self::Local
        } else {
            Self::Paid
        }
    }
}

/// Who writes one story's replies, when the story doesn't follow the app's
/// storyteller (the one chosen in Settings).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", tag = "kind")]
#[ts(export)]
pub enum StorytellerChoice {
    /// The built-in offline storyteller.
    Offline,
    /// A saved AI connection, by id.
    Connection { id: String },
}

pub const DEFAULT_MAX_OUTPUT_TOKENS: u32 = 700;
pub const DEFAULT_TIMEOUT_MS: u32 = 120_000;
/// Prompt plus reply. Conservative for small local models; raise it for
/// large cloud models in the connection's advanced settings.
pub const DEFAULT_MAX_CONTEXT_TOKENS: u32 = 16_000;

/// Generation defaults stored in `provider_profiles.settings_json`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export)]
pub struct GenerationSettings {
    #[ts(optional)]
    pub temperature: Option<f32>,
    pub max_output_tokens: u32,
    /// Longest wait for the next piece of a streamed reply.
    pub timeout_ms: u32,
    /// Most tokens one request may use, prompt and reply together.
    pub max_context_tokens: u32,
}

impl Default for GenerationSettings {
    fn default() -> Self {
        Self {
            temperature: Some(0.9),
            max_output_tokens: DEFAULT_MAX_OUTPUT_TOKENS,
            timeout_ms: DEFAULT_TIMEOUT_MS,
            max_context_tokens: DEFAULT_MAX_CONTEXT_TOKENS,
        }
    }
}

impl GenerationSettings {
    pub fn validate(&self) -> AppResult<()> {
        if let Some(t) = self.temperature {
            if !(0.0..=2.0).contains(&t) {
                return Err(AppError::invalid_input(
                    "temperature must be between 0 and 2",
                ));
            }
        }
        if !(16..=32_000).contains(&self.max_output_tokens) {
            return Err(AppError::invalid_input(
                "reply length must be between 16 and 32000 tokens",
            ));
        }
        if !(5_000..=600_000).contains(&self.timeout_ms) {
            return Err(AppError::invalid_input(
                "timeout must be between 5 and 600 seconds",
            ));
        }
        if !(2_048..=2_000_000).contains(&self.max_context_tokens) {
            return Err(AppError::invalid_input(
                "context limit must be between 2048 and 2000000 tokens",
            ));
        }
        if self.max_output_tokens.saturating_mul(2) > self.max_context_tokens {
            return Err(AppError::invalid_input(
                "reply length can be at most half of the context limit",
            ));
        }
        Ok(())
    }
}

/// A saved connection, as the UI sees it. The API key never leaves Rust;
/// `has_key` only says whether one is stored.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ProviderProfile {
    pub id: String,
    pub label: String,
    pub adapter: AdapterKind,
    pub base_url: String,
    pub model_id: String,
    pub billing: Billing,
    pub has_key: bool,
    pub settings: GenerationSettings,
    pub created_at: String,
    pub updated_at: String,
}

/// Create or update a profile. `api_key`: `None` keeps the stored key,
/// `Some("")` removes it, anything else replaces it.
#[derive(Debug, Clone, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ProviderProfileInput {
    #[ts(optional)]
    pub id: Option<String>,
    pub label: String,
    pub adapter: AdapterKind,
    pub base_url: String,
    pub model_id: String,
    pub billing: Billing,
    #[ts(optional)]
    pub api_key: Option<String>,
    pub settings: GenerationSettings,
}

const MAX_LABEL: usize = 80;

impl ProviderProfileInput {
    /// Trim and check fields; returns the normalized base URL.
    pub fn validate(&mut self) -> AppResult<()> {
        self.label = self.label.trim().to_string();
        self.model_id = self.model_id.trim().to_string();
        if self.label.is_empty() || self.label.chars().count() > MAX_LABEL {
            return Err(AppError::invalid_input(
                "give the connection a name (up to 80 characters)",
            ));
        }
        if self.model_id.is_empty() || self.model_id.len() > 200 {
            return Err(AppError::invalid_input("enter the model name to use"));
        }
        self.base_url = normalize_base_url(&self.base_url)?;
        self.settings.validate()
    }
}

/// `https://host/v1/` -> `https://host/v1`. Only http(s), no credentials in
/// the URL (keys belong in the credential store), no query or fragment.
pub fn normalize_base_url(raw: &str) -> AppResult<String> {
    let url = url::Url::parse(raw.trim()).map_err(|_| {
        AppError::invalid_input("enter a full address, like https://api.example.com/v1")
    })?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(AppError::invalid_input(
            "the address must start with http:// or https://",
        ));
    }
    if url.host_str().is_none() {
        return Err(AppError::invalid_input("the address needs a host name"));
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(AppError::invalid_input(
            "put the API key in the key field, not in the address",
        ));
    }
    if url.query().is_some() || url.fragment().is_some() {
        return Err(AppError::invalid_input(
            "the address should not contain ? or # parts",
        ));
    }
    Ok(url.as_str().trim_end_matches('/').to_string())
}

/// True for localhost and loopback addresses; such requests skip any proxy.
pub fn is_loopback(base_url: &str) -> bool {
    match url::Url::parse(base_url)
        .ok()
        .and_then(|u| u.host().map(|h| h.to_owned()))
    {
        Some(url::Host::Domain(d)) => d.eq_ignore_ascii_case("localhost"),
        Some(url::Host::Ipv4(ip)) => ip.is_loopback(),
        Some(url::Host::Ipv6(ip)) => ip.is_loopback(),
        None => false,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum Role {
    System,
    User,
    Assistant,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ModelMessage {
    pub role: Role,
    pub content: String,
}

/// Provider-neutral request.
#[derive(Debug, Clone)]
pub struct GenerateRequest {
    pub model_id: String,
    pub messages: Vec<ModelMessage>,
    pub max_output_tokens: u32,
    pub temperature: Option<f32>,
    pub timeout_ms: u32,
    /// Context window to ask for, prompt and reply together. Servers that
    /// size it per request (Ollama) use it; others ignore it.
    pub context_tokens: Option<u32>,
}

/// Normalized token counts; `None` means the provider did not say.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct NormalizedUsage {
    #[ts(optional)]
    pub input_tokens: Option<u64>,
    #[ts(optional)]
    pub cached_input_tokens: Option<u64>,
    #[ts(optional)]
    pub output_tokens: Option<u64>,
}

impl NormalizedUsage {
    pub fn is_empty(&self) -> bool {
        self.input_tokens.is_none()
            && self.cached_input_tokens.is_none()
            && self.output_tokens.is_none()
    }
}

/// Messages streamed to the reader over a Tauri channel while a reply is
/// written. Drafts are display-only; the reply is committed once, at the end.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum StreamMessage {
    Started {
        run_id: String,
        provider_label: String,
    },
    Delta {
        run_id: String,
        seq: u32,
        text: String,
    },
    Usage {
        run_id: String,
        usage: NormalizedUsage,
    },
    Done {
        run_id: String,
        finish_reason: String,
    },
    Error {
        run_id: String,
        code: crate::errors::ErrorCode,
        message: String,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base_urls_are_normalized_and_checked() {
        assert_eq!(
            normalize_base_url(" https://api.example.com/v1/ ").unwrap(),
            "https://api.example.com/v1"
        );
        assert_eq!(
            normalize_base_url("http://localhost:11434/v1").unwrap(),
            "http://localhost:11434/v1"
        );
        assert!(normalize_base_url("ftp://example.com").is_err());
        assert!(normalize_base_url("api.example.com").is_err());
        assert!(normalize_base_url("https://user:sk-secret@example.com/v1").is_err());
        assert!(normalize_base_url("https://example.com/v1?key=x").is_err());
    }

    #[test]
    fn loopback_detection() {
        assert!(is_loopback("http://localhost:1234/v1"));
        assert!(is_loopback("http://127.0.0.1:8080"));
        assert!(is_loopback("http://[::1]:8080"));
        assert!(!is_loopback("https://api.example.com/v1"));
    }

    #[test]
    fn settings_bounds() {
        assert!(GenerationSettings::default().validate().is_ok());
        let s = GenerationSettings {
            temperature: Some(3.0),
            ..Default::default()
        };
        assert!(s.validate().is_err());
        let s = GenerationSettings {
            max_output_tokens: 1,
            ..Default::default()
        };
        assert!(s.validate().is_err());
    }
}

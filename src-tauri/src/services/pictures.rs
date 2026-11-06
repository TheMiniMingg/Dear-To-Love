//! Picture connections and character portraits made from a description.
//!
//! Two kinds of service make pictures: OpenAI's images API (and servers
//! that copy it) and Stable Diffusion WebUI. Each call is one ledger row
//! (purpose `character_suggestion`, shown as "Character picture"); the
//! picture goes into the library like any added image, for the story it
//! was made for. Portraits are always asked for as safe-for-work, fully
//! clothed head-and-shoulders pictures, whatever the story's rating.

use std::time::Duration;

use base64::Engine;
use reqwest::header::CONTENT_TYPE;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio_util::sync::CancellationToken;
use ts_rs::TS;

use super::adapters::http::{self, http_error, provider_err, read_limited, send_error};
use super::adapters::GenerateError;
use super::assets::{import_bytes, AssetStore, Imported, MAX_IMAGE_BYTES};
use super::secrets::SecretStore;
use crate::db::assets::{self as asset_rows, ImportScope};
use crate::db::providers::{self, ProfileRow};
use crate::db::usage::{self, NewRequest, RequestOutcome, RequestPurpose, RequestStatus};
use crate::db::Database;
use crate::domain::provider::{AdapterKind, NormalizedUsage};
use crate::domain::story_state::{Character, World};
use crate::errors::{AppError, AppResult, ErrorCode};

/// The largest base64 body accepted from a picture service (a 20 MB image
/// plus base64 and JSON overhead).
const MAX_PICTURE_BODY: usize = (MAX_IMAGE_BYTES as usize) * 4 / 3 + 64 * 1024;
const LIST_TIMEOUT: Duration = Duration::from_secs(20);

/// A ready-to-call picture service.
pub struct PictureMaker {
    kind: AdapterKind,
    base_url: String,
    api_key: Option<String>,
    client: reqwest::Client,
}

impl PictureMaker {
    pub fn new(kind: AdapterKind, base_url: &str, api_key: Option<String>) -> AppResult<Self> {
        if !kind.makes_pictures() {
            return Err(AppError::invalid_input(
                "this connection writes stories; choose a picture connection",
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
        http::bearer(rb, self.api_key.as_deref())
    }

    /// The request body for one picture.
    pub fn request_body(&self, model: &str, prompt: &Prompt) -> Value {
        match self.kind {
            AdapterKind::StableDiffusion => {
                let mut body = json!({
                    "prompt": prompt.text,
                    "negative_prompt": prompt.avoid,
                    "width": 512,
                    "height": 640,
                    "steps": 24,
                    "batch_size": 1,
                    "n_iter": 1,
                });
                let m = model.trim();
                if !m.is_empty() && !m.eq_ignore_ascii_case("default") {
                    body["override_settings"] = json!({ "sd_model_checkpoint": m });
                }
                body
            }
            _ => {
                // DALL·E answers with a link unless asked for the bytes;
                // GPT image models always send the bytes and refuse the field.
                let mut body = json!({
                    "model": model,
                    "prompt": format!("{} Avoid: {}.", prompt.text, prompt.avoid),
                    "n": 1,
                    "size": "1024x1024",
                });
                if !model.trim().to_ascii_lowercase().starts_with("gpt-image") {
                    body["response_format"] = json!("b64_json");
                }
                body
            }
        }
    }

    fn endpoint(&self) -> String {
        match self.kind {
            AdapterKind::StableDiffusion => format!("{}/sdapi/v1/txt2img", self.base_url),
            _ => format!("{}/images/generations", self.base_url),
        }
    }

    /// Make one picture. Returns its bytes (checked to be an image later,
    /// when it is added to the library).
    pub async fn make(
        &self,
        model: &str,
        prompt: &Prompt,
        timeout: Duration,
    ) -> Result<Vec<u8>, GenerateError> {
        let cancel = CancellationToken::new();
        let body = serde_json::to_vec(&self.request_body(model, prompt))
            .map_err(|e| GenerateError::not_sent(AppError::internal(e.to_string())))?;
        let rb = self
            .auth(self.client.post(self.endpoint()))
            .header(CONTENT_TYPE, "application/json")
            .body(body);
        let resp = tokio::time::timeout(timeout, rb.send())
            .await
            .map_err(|_| {
                GenerateError::maybe_charged(http::unreachable_err(
                    "the picture service did not answer in time",
                ))
            })?
            .map_err(send_error)?;
        let status = resp.status();
        if !status.is_success() {
            let text = read_limited(resp, &cancel, Duration::from_secs(20)).await;
            return Err(http_error(status.as_u16(), &text));
        }
        let body = read_body(resp, timeout).await?;
        let v: Value = serde_json::from_slice(&body).map_err(|_| {
            GenerateError::maybe_charged(provider_err(
                "the picture service answered, but not with a picture",
            ))
        })?;
        let b64 = match self.kind {
            AdapterKind::StableDiffusion => v
                .get("images")
                .and_then(Value::as_array)
                .and_then(|a| a.first())
                .and_then(Value::as_str),
            _ => v
                .get("data")
                .and_then(Value::as_array)
                .and_then(|a| a.first())
                .and_then(|d| d.get("b64_json"))
                .and_then(Value::as_str),
        };
        let Some(b64) = b64 else {
            if v.pointer("/data/0/url").is_some() {
                return Err(GenerateError::maybe_charged(provider_err(
                    "the picture service sent a link instead of the picture; use a model that \
                     returns the picture itself",
                )));
            }
            return Err(GenerateError::maybe_charged(provider_err(
                "the picture service answered, but sent no picture (it may have refused this \
                 description)",
            )));
        };
        decode_b64(b64).ok_or_else(|| {
            GenerateError::maybe_charged(provider_err("the picture service sent a broken picture"))
        })
    }

    /// Free connection check: the service's models. Never sends a prompt.
    pub async fn list_models(&self) -> AppResult<Vec<String>> {
        let url = match self.kind {
            AdapterKind::StableDiffusion => format!("{}/sdapi/v1/sd-models", self.base_url),
            _ => format!("{}/models", self.base_url),
        };
        let resp = tokio::time::timeout(LIST_TIMEOUT, self.auth(self.client.get(url)).send())
            .await
            .map_err(|_| http::unreachable_err("the picture service did not answer in time"))?
            .map_err(|e| send_error(e).error)?;
        let status = resp.status();
        let text = read_limited(resp, &CancellationToken::new(), LIST_TIMEOUT).await;
        if !status.is_success() {
            return Err(http_error(status.as_u16(), &text).error);
        }
        let v: Value = serde_json::from_str(&text)
            .map_err(|_| provider_err("the server answered, but not with a model list"))?;
        let list = match self.kind {
            AdapterKind::StableDiffusion => v.as_array(),
            _ => v.get("data").and_then(Value::as_array),
        }
        .ok_or_else(|| provider_err("the server answered, but not with a model list"))?;
        let mut out: Vec<String> = list
            .iter()
            .filter_map(|m| {
                m.get("title")
                    .or_else(|| m.get("model_name"))
                    .or_else(|| m.get("id"))
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .collect();
        if self.kind == AdapterKind::StableDiffusion {
            // "default" uses whatever model the WebUI has loaded.
            out.insert(0, "default".into());
        }
        Ok(out)
    }
}

async fn read_body(resp: reqwest::Response, timeout: Duration) -> Result<Vec<u8>, GenerateError> {
    let mut resp = resp;
    let mut out = Vec::new();
    loop {
        match tokio::time::timeout(timeout, resp.chunk()).await {
            Ok(Ok(Some(b))) => {
                out.extend_from_slice(&b);
                if out.len() > MAX_PICTURE_BODY {
                    return Err(GenerateError::maybe_charged(provider_err(
                        "the picture is larger than this app accepts (20 MB)",
                    )));
                }
            }
            Ok(Ok(None)) => return Ok(out),
            _ => {
                return Err(GenerateError::maybe_charged(http::unreachable_err(
                    "the connection dropped while the picture was sent",
                )))
            }
        }
    }
}

/// Base64 picture data, with or without a `data:image/…;base64,` prefix.
fn decode_b64(s: &str) -> Option<Vec<u8>> {
    let s = s.trim();
    let s = match s.strip_prefix("data:") {
        Some(rest) => rest.split_once(',')?.1,
        None => s,
    };
    base64::engine::general_purpose::STANDARD
        .decode(s.trim())
        .ok()
        .filter(|b| !b.is_empty())
}

/// How a portrait looks.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum PortraitStyle {
    #[default]
    Painted,
    Anime,
    Photo,
    Sketch,
}

impl PortraitStyle {
    fn words(self) -> &'static str {
        match self {
            Self::Painted => "a detailed digital painting",
            Self::Anime => "anime-style illustration, clean line art, soft shading",
            Self::Photo => "a realistic photograph, soft natural light",
            Self::Sketch => "a pencil sketch on paper",
        }
    }
}

/// What is sent to the picture service.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Prompt {
    pub text: String,
    /// What the picture must not show.
    pub avoid: String,
}

/// Longest description sent for one character.
const MAX_PROMPT_CHARS: usize = 1500;

fn clean(s: &Option<String>) -> Option<String> {
    s.as_ref()
        .map(|v| v.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|v| !v.is_empty())
}

/// "a woman", "a man" or "a person", from what the character says.
fn person(c: &Character) -> &'static str {
    let g = clean(&c.gender).unwrap_or_default().to_lowercase();
    let p = clean(&c.pronouns).unwrap_or_default().to_lowercase();
    if g.starts_with("woman") || g.starts_with("female") || g == "f" || p.starts_with("she") {
        "a woman"
    } else if g.starts_with("man") || g.starts_with("male") || g == "m" || p.starts_with("he") {
        "a man"
    } else {
        "a person"
    }
}

/// The description sent for a character's portrait. Names are left out
/// (picture models draw words, not people); the world's era and setting
/// set the clothes and the background.
pub fn portrait_prompt(c: &Character, world: &World, style: PortraitStyle) -> Prompt {
    let mut who = String::new();
    match clean(&c.species) {
        Some(sp) if !sp.eq_ignore_ascii_case("human") => {
            who.push_str(&format!("a {} ({})", sp.to_lowercase(), &person(c)[2..]));
        }
        _ => who.push_str(person(c)),
    }
    if let Some(age) = clean(&c.age) {
        if age.chars().all(|ch| ch.is_ascii_digit()) {
            who.push_str(&format!(", age {age}"));
        } else {
            who.push_str(&format!(", {age}"));
        }
    }
    if let Some(role) = clean(&c.role) {
        who.push_str(&format!(", a {}", role.to_lowercase()));
    }
    let mut parts = vec![format!(
        "Head-and-shoulders portrait of {who}, {}.",
        style.words()
    )];
    if let Some(look) = clean(&c.appearance) {
        parts.push(format!("Looks: {look}."));
    }
    let traits: Vec<&str> = c
        .personality
        .iter()
        .map(|t| t.trim())
        .filter(|t| !t.is_empty())
        .take(3)
        .collect();
    if !traits.is_empty() {
        parts.push(format!(
            "Expression that shows they are {}.",
            traits.join(", ")
        ));
    }
    let era = world.era.trim();
    let setting = world.setting.trim();
    match (era.is_empty(), setting.is_empty()) {
        (false, false) => parts.push(format!(
            "Clothes and a softly blurred background that fit {era}, {setting}."
        )),
        (false, true) => parts.push(format!("Clothes that fit {era}.")),
        (true, false) => parts.push(format!("A softly blurred background of {setting}.")),
        (true, true) => {}
    }
    parts.push("One person, fully clothed, safe for work, no text.".into());
    let mut text = parts.join(" ");
    if text.chars().count() > MAX_PROMPT_CHARS {
        text = text.chars().take(MAX_PROMPT_CHARS).collect();
    }
    Prompt {
        text,
        avoid: "nudity, sexual content, gore, text, watermark, extra people".into(),
    }
}

/// A portrait to make.
#[derive(Debug, Clone, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PortraitInput {
    pub character: Character,
    #[serde(default)]
    pub world: World,
    #[serde(default)]
    pub style: PortraitStyle,
    /// Keep the picture for this story only.
    #[serde(default)]
    #[ts(optional)]
    pub story_id: Option<String>,
    /// For the story being created (no `story_id` yet).
    #[serde(default)]
    #[ts(as = "Option<bool>", optional)]
    pub new_story: bool,
    /// The player allowed one request the budget can't price.
    #[serde(default)]
    #[ts(as = "Option<bool>", optional)]
    pub budget_override: bool,
}

/// The picture connection in use, or a message saying how to add one.
pub async fn picture_profile(db: &Database) -> AppResult<ProfileRow> {
    let none = || {
        AppError::new(
            ErrorCode::NoProvider,
            "no picture connection yet: add one in Settings (OpenAI images or Stable Diffusion \
             WebUI) and choose it under Pictures",
        )
    };
    let id = providers::picture_maker(db).await?.ok_or_else(none)?;
    providers::get_profile_row(db, &id)
        .await
        .map_err(|_| none())
}

/// Makes a portrait with the picture connection and adds it to the library
/// for the story it is for. One ledger row per attempt.
pub async fn make_portrait(
    db: &Database,
    store: &AssetStore,
    secrets: &dyn SecretStore,
    session_id: &str,
    input: &PortraitInput,
) -> AppResult<Imported> {
    let name = input.character.name.trim();
    if name.is_empty() {
        return Err(AppError::invalid_input(
            "give the character a name before making a portrait",
        ));
    }
    let row = picture_profile(db).await?;
    let kind = row.adapter()?;
    let key = match &row.secret_ref {
        Some(r) => secrets.get(r)?,
        None => None,
    };
    let maker = PictureMaker::new(kind, row.base_url.as_deref().unwrap_or_default(), key)?;
    let prompt = portrait_prompt(&input.character, &input.world, input.style);
    let scope = match (&input.story_id, input.new_story) {
        (Some(id), _) => ImportScope::Story(id.clone()),
        (None, true) => ImportScope::NewStory,
        (None, false) => ImportScope::Shared,
    };
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
            allow_unpriced: input.budget_override,
        },
    )
    .await?;
    let timeout = Duration::from_millis(u64::from(row.settings().timeout_ms.max(30_000)));
    let made = maker.make(&row.model_id, &prompt, timeout).await;
    let outcome = |status, may_be_charged, error_code| RequestOutcome {
        status,
        usage: NormalizedUsage::default(),
        may_be_charged,
        error_code,
    };
    let bytes = match made {
        Ok(b) => {
            usage::close_request(db, &request, outcome(RequestStatus::Completed, true, None))
                .await?;
            b
        }
        Err(e) => {
            let charged = matches!(e.charge, super::adapters::Charge::Unknown);
            usage::close_request(
                db,
                &request,
                outcome(RequestStatus::Failed, charged, Some(e.error.code)),
            )
            .await?;
            return Err(e.error);
        }
    };
    let label = format!("Portrait of {name}");
    let imported = import_bytes(db, store, bytes, &label, &scope)
        .await
        .map_err(|e| {
            AppError::new(
                ErrorCode::ProviderError,
                format!(
                    "the picture service sent something that isn't a picture ({})",
                    e.message
                ),
            )
        })?;
    if !imported.already_in_library {
        let asset =
            asset_rows::update_details(db, &imported.asset.id, &label, &["Portrait".into()])
                .await?;
        return Ok(Imported {
            asset,
            already_in_library: false,
        });
    }
    Ok(imported)
}

#[cfg(test)]
mod tests;

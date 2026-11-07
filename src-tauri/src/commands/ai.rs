use serde::Serialize;
use tauri::State;
use ts_rs::TS;

use crate::db::providers;
use crate::domain::provider::{ProviderProfile, ProviderProfileInput, StorytellerChoice};
use crate::errors::{AppResult, ErrorCode};
use crate::services::adapters::Adapter;
use crate::services::generation;
use crate::services::reader::{story_storyteller_info, storyteller_info, StorytellerInfo};
use crate::state::AppState;

#[tauri::command]
pub async fn list_connections(state: State<'_, AppState>) -> AppResult<Vec<ProviderProfile>> {
    providers::list_profiles(state.db()?).await
}

#[tauri::command]
pub async fn save_connection(
    state: State<'_, AppState>,
    input: ProviderProfileInput,
) -> AppResult<ProviderProfile> {
    providers::save_profile(state.db()?, state.secrets.as_ref(), input).await
}

#[tauri::command]
pub async fn delete_connection(state: State<'_, AppState>, id: String) -> AppResult<()> {
    providers::delete_profile(state.db()?, state.secrets.as_ref(), &id).await
}

#[tauri::command]
pub async fn get_storyteller(state: State<'_, AppState>) -> AppResult<StorytellerInfo> {
    storyteller_info(state.db()?).await
}

/// `None` switches back to the offline storyteller.
#[tauri::command]
pub async fn set_storyteller(
    state: State<'_, AppState>,
    profile_id: Option<String>,
) -> AppResult<StorytellerInfo> {
    let db = state.db()?;
    providers::set_storyteller(db, profile_id.as_deref()).await?;
    storyteller_info(db).await
}

/// One story's own storyteller; `None` makes it follow the app's again.
#[tauri::command]
pub async fn set_story_storyteller(
    state: State<'_, AppState>,
    story_id: String,
    choice: Option<StorytellerChoice>,
) -> AppResult<StorytellerInfo> {
    let db = state.db()?;
    providers::set_story_choice(db, &story_id, choice.as_ref()).await?;
    story_storyteller_info(db, &story_id).await
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ConnectionCheck {
    pub ok: bool,
    pub code: Option<ErrorCode>,
    pub message: String,
    /// Whether the configured model appears in the server's list.
    pub model_listed: Option<bool>,
    pub models: Vec<String>,
}

/// Free check: lists the server's models. No story text, no paid request.
#[tauri::command]
pub async fn test_connection(state: State<'_, AppState>, id: String) -> AppResult<ConnectionCheck> {
    let db = state.db()?;
    let row = providers::get_profile_row(db, &id).await?;
    let key = match &row.secret_ref {
        Some(r) => state.secrets.get(r)?,
        None => None,
    };
    let adapter = Adapter::live(
        row.adapter()?,
        row.base_url.as_deref().unwrap_or_default(),
        key,
    )?;
    Ok(match adapter.list_models().await {
        Ok(models) => {
            let listed = models.iter().any(|m| m == &row.model_id);
            ConnectionCheck {
                ok: true,
                code: None,
                message: if listed {
                    format!("Connected. \"{}\" is available.", row.model_id)
                } else {
                    format!(
                        "Connected, but \"{}\" is not in the server's model list. Check the model name.",
                        row.model_id
                    )
                },
                model_listed: Some(listed),
                models: models.into_iter().take(200).collect(),
            }
        }
        Err(e) => ConnectionCheck {
            ok: false,
            code: Some(e.code),
            message: e.message,
            model_listed: None,
            models: Vec::new(),
        },
    })
}

/// Explicit, possibly paid, one-line request. Recorded in the usage ledger.
#[tauri::command]
pub async fn send_test_message(state: State<'_, AppState>, id: String) -> AppResult<String> {
    generation::send_test_message(state.db()?, state.secrets.as_ref(), &state.session_id, &id).await
}

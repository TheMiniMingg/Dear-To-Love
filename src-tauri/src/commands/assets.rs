//! Image library commands, and the `dtlimg:` protocol the webview uses to
//! show library images (by id only: no file paths reach the frontend).

use std::path::PathBuf;

use serde::Serialize;
use tauri::http::{header, Response, StatusCode};
use tauri::State;
use ts_rs::TS;

use crate::db::assets::{self, AssetDto, AssetUsage, ImportScope, StoryVisual};
use crate::domain::visuals::VisualSlot;
use crate::errors::{AppError, AppResult};
use crate::services::assets::{self as library, Size};
use crate::state::AppState;

/// Most files added in one go.
pub const MAX_IMPORT_FILES: usize = 50;

/// The result of adding one file. One bad file does not stop the others.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ImageImport {
    pub file_name: String,
    pub asset: Option<AssetDto>,
    pub already_in_library: bool,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn list_images(state: State<'_, AppState>) -> AppResult<Vec<AssetDto>> {
    assets::list(state.db()?).await
}

/// Who may use the images being added.
#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ImageScope {
    /// Only this story may use them.
    #[serde(default)]
    #[ts(optional)]
    pub story_id: Option<String>,
    /// Only the story being created (with no `story_id`).
    #[serde(default)]
    #[ts(as = "Option<bool>", optional)]
    pub new_story: bool,
}

impl ImageScope {
    fn to_import(&self) -> ImportScope {
        match (&self.story_id, self.new_story) {
            (Some(id), _) => ImportScope::Story(id.clone()),
            (None, true) => ImportScope::NewStory,
            (None, false) => ImportScope::Shared,
        }
    }
}

/// Adds image files chosen in the file picker. With no `scope` they are
/// shared with every story.
#[tauri::command]
pub async fn import_images(
    state: State<'_, AppState>,
    paths: Vec<String>,
    scope: Option<ImageScope>,
) -> AppResult<Vec<ImageImport>> {
    let scope = scope.unwrap_or_default().to_import();
    if paths.len() > MAX_IMPORT_FILES {
        return Err(AppError::invalid_input(format!(
            "add at most {MAX_IMPORT_FILES} images at a time"
        )));
    }
    let db = state.db()?;
    let store = state.assets()?;
    let mut out = Vec::with_capacity(paths.len());
    for p in paths {
        let path = PathBuf::from(&p);
        let file_name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        out.push(
            match library::import_file(db, &store, &path, &scope).await {
                Ok(i) => ImageImport {
                    file_name,
                    asset: Some(i.asset),
                    already_in_library: i.already_in_library,
                    error: None,
                },
                Err(e) => ImageImport {
                    file_name,
                    asset: None,
                    already_in_library: false,
                    error: Some(e.message),
                },
            },
        );
    }
    Ok(out)
}

/// Share the image with every story (`story_id` empty), or keep it for one
/// story only. Stories that already show it keep it.
#[tauri::command]
pub async fn set_image_scope(
    state: State<'_, AppState>,
    asset_id: String,
    story_id: Option<String>,
) -> AppResult<AssetDto> {
    assets::set_scope(state.db()?, &asset_id, story_id.as_deref()).await
}

#[tauri::command]
pub async fn update_image(
    state: State<'_, AppState>,
    asset_id: String,
    label: String,
    tags: Vec<String>,
) -> AppResult<AssetDto> {
    assets::update_details(state.db()?, &asset_id, &label, &tags).await
}

/// Everywhere the image shows, including earlier turns on any route.
#[tauri::command]
pub async fn image_usages(
    state: State<'_, AppState>,
    asset_id: String,
) -> AppResult<Vec<AssetUsage>> {
    let mut conn = state.db()?.reader().acquire().await?;
    assets::usages(&mut conn, &asset_id).await
}

/// Deletes an image that nothing shows. Refused while anything does.
#[tauri::command]
pub async fn delete_image(state: State<'_, AppState>, asset_id: String) -> AppResult<()> {
    library::delete(state.db()?, &state.assets()?, &asset_id).await
}

/// Story-default picture for a slot (`cover`, `background`,
/// `portrait:<character id>`), or `None` to clear it.
#[tauri::command]
pub async fn set_story_picture(
    state: State<'_, AppState>,
    story_id: String,
    slot: String,
    asset_id: Option<String>,
) -> AppResult<Vec<StoryVisual>> {
    let slot = VisualSlot::parse(&slot)?;
    assets::set_story_visual(state.db()?, &story_id, &slot, asset_id.as_deref()).await
}

/// Answers `dtlimg://localhost/<thumb|full>/<asset id>` (the path may
/// arrive percent-encoded). Unknown or missing images are a 404.
pub async fn serve(state: &AppState, path: &str) -> Response<Vec<u8>> {
    let decoded = path
        .trim_start_matches('/')
        .replace("%2F", "/")
        .replace("%2f", "/");
    let parsed = decoded.split_once('/').and_then(|(size, id)| {
        let size = match size {
            "thumb" => Size::Thumb,
            "full" => Size::Full,
            _ => return None,
        };
        uuid::Uuid::parse_str(id)
            .ok()
            .map(|_| (size, id.to_string()))
    });
    let Some((size, id)) = parsed else {
        return status(StatusCode::BAD_REQUEST);
    };
    let (Ok(db), Ok(store)) = (state.db(), state.assets()) else {
        return status(StatusCode::SERVICE_UNAVAILABLE);
    };
    match library::load(db, &store, &id, size).await {
        Ok(Some((mime, bytes))) => Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, mime)
            .header(header::CACHE_CONTROL, "max-age=31536000, immutable")
            .header("X-Content-Type-Options", "nosniff")
            .body(bytes)
            .unwrap_or_else(|_| status(StatusCode::INTERNAL_SERVER_ERROR)),
        Ok(None) => status(StatusCode::NOT_FOUND),
        Err(e) => {
            eprintln!("could not load image {id}: {}", e.message);
            status(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

fn status(code: StatusCode) -> Response<Vec<u8>> {
    let mut r = Response::new(Vec::new());
    *r.status_mut() = code;
    r.headers_mut().insert(
        header::CACHE_CONTROL,
        "no-store".parse().expect("valid header"),
    );
    r
}

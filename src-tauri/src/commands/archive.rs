//! Storypack export and import, and readable text export of a route. Paths
//! come from the system save and open dialogs.

use std::path::{Path, PathBuf};

use tauri::State;

use crate::errors::{AppError, AppResult};
use crate::services::archive::{self, StorypackExport, StorypackImport, TextExport, TextFormat};
use crate::state::AppState;

pub const STORYPACK_EXTENSION: &str = "storypack";

/// An absolute file path ending in `.ext` (added when the name has none).
pub fn target(path: &str, ext: &str) -> AppResult<PathBuf> {
    let p = Path::new(path.trim());
    if path.trim().is_empty() || !p.is_absolute() || p.file_name().is_none() {
        return Err(AppError::invalid_input("choose where to save the file"));
    }
    let has_ext = p
        .extension()
        .is_some_and(|e| e.to_string_lossy().eq_ignore_ascii_case(ext));
    Ok(if has_ext {
        p.to_path_buf()
    } else {
        let mut name = p.as_os_str().to_owned();
        name.push(".");
        name.push(ext);
        PathBuf::from(name)
    })
}

#[tauri::command]
pub async fn export_storypack(
    state: State<'_, AppState>,
    story_id: String,
    path: String,
) -> AppResult<StorypackExport> {
    let dest = target(&path, STORYPACK_EXTENSION)?;
    archive::export_storypack(
        state.db()?,
        &state.assets()?,
        &state.version,
        &story_id,
        &dest,
    )
    .await
}

#[tauri::command]
pub async fn import_storypack(
    state: State<'_, AppState>,
    path: String,
) -> AppResult<StorypackImport> {
    let src = Path::new(path.trim());
    if !src.is_absolute() {
        return Err(AppError::invalid_input("choose a storypack file to import"));
    }
    let dir = state.data_dir.as_ref().map_err(|r| {
        AppError::new(
            crate::errors::ErrorCode::Io,
            format!("app data folder unavailable: {r}"),
        )
    })?;
    archive::import_storypack(state.db()?, dir, src).await
}

/// Copies a story under `title` (see `archive::duplicate_story`).
#[tauri::command]
pub async fn duplicate_story(
    state: State<'_, AppState>,
    story_id: String,
    title: String,
) -> AppResult<StorypackImport> {
    let dir = state.data_dir.as_ref().map_err(|r| {
        AppError::new(
            crate::errors::ErrorCode::Io,
            format!("app data folder unavailable: {r}"),
        )
    })?;
    archive::duplicate_story(
        state.db()?,
        &state.assets()?,
        &state.version,
        dir,
        &story_id,
        &title,
    )
    .await
}

#[tauri::command]
pub async fn export_route_text(
    state: State<'_, AppState>,
    route_id: String,
    path: String,
    format: TextFormat,
    timestamps: bool,
) -> AppResult<TextExport> {
    let dest = target(&path, format.extension())?;
    archive::export_route_text(state.db()?, &route_id, format, timestamps, &dest).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn targets_are_absolute_and_get_their_extension() {
        let root = if cfg!(windows) {
            "C:\\Users\\a\\"
        } else {
            "/home/a/"
        };
        let t =
            |p: &str, e: &str| target(&format!("{root}{p}"), e).map(|p| p.display().to_string());
        assert_eq!(
            t("Lamp", "storypack").unwrap(),
            format!("{root}Lamp.storypack")
        );
        assert_eq!(
            t("Lamp.STORYPACK", "storypack").unwrap(),
            format!("{root}Lamp.STORYPACK")
        );
        assert_eq!(
            t("v1.2 notes", "md").unwrap(),
            format!("{root}v1.2 notes.md")
        );
        assert_eq!(t("story.md", "md").unwrap(), format!("{root}story.md"));
        assert!(target("Lamp.storypack", "storypack").is_err(), "relative");
        assert!(target("  ", "md").is_err());
    }
}

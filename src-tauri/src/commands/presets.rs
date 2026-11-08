//! A player's own presets: saved from a story, started from, shared as a
//! `.dtlpreset` file. Paths come from the system save and open dialogs.

use std::path::Path;

use tauri::State;

use crate::commands::archive::target;
use crate::db::{presets, timeline};
use crate::domain::draft::CreateStoryDraft;
use crate::domain::presets::{draft_from_state, PresetFile, UserPreset, PRESET_EXTENSION};
use crate::domain::presets::{PRESET_FORMAT, PRESET_FORMAT_VERSION};
use crate::errors::{AppError, AppResult, ErrorCode};
use crate::state::AppState;

/// Largest preset file read: far beyond any hand-made world.
const MAX_FILE_BYTES: u64 = 4 * 1024 * 1024;

#[tauri::command]
pub async fn list_user_presets(state: State<'_, AppState>) -> AppResult<Vec<UserPreset>> {
    presets::list(state.db()?).await
}

/// The wizard draft that would make a story like this route as it stands
/// now, for the player to save as a preset.
#[tauri::command]
pub async fn preset_from_route(
    state: State<'_, AppState>,
    route_id: String,
) -> AppResult<CreateStoryDraft> {
    let db = state.db()?;
    let route = {
        let mut conn = db.reader().acquire().await?;
        timeline::get_route(&mut conn, &route_id).await?
    };
    let (title, description): (String, String) =
        sqlx::query_as("SELECT title, description FROM stories WHERE id = ?")
            .bind(&route.story_id)
            .fetch_one(db.reader())
            .await?;
    let head = route
        .head_event_id
        .clone()
        .ok_or_else(|| AppError::internal("route has no head event"))?;
    let view = crate::db::state::state_at(db, &route.story_id, &head).await?;
    let first_chapter = timeline::route_chapters(db, &route_id)
        .await?
        .into_iter()
        .next()
        .map(|c| c.title)
        .unwrap_or_default();
    Ok(draft_from_state(
        &title,
        &description,
        &first_chapter,
        &view.effective.state,
    ))
}

#[tauri::command]
pub async fn save_user_preset(
    state: State<'_, AppState>,
    name: String,
    from_story_title: Option<String>,
    draft: CreateStoryDraft,
) -> AppResult<UserPreset> {
    presets::save(
        state.db()?,
        &name,
        from_story_title.as_deref().unwrap_or(""),
        draft,
    )
    .await
}

#[tauri::command]
pub async fn rename_user_preset(
    state: State<'_, AppState>,
    preset_id: String,
    name: String,
) -> AppResult<UserPreset> {
    presets::rename(state.db()?, &preset_id, &name).await
}

#[tauri::command]
pub async fn delete_user_preset(state: State<'_, AppState>, preset_id: String) -> AppResult<()> {
    presets::delete(state.db()?, &preset_id).await
}

/// Writes the preset to `path` as a `.dtlpreset` file and returns the path
/// it was written to.
#[tauri::command]
pub async fn export_user_preset(
    state: State<'_, AppState>,
    preset_id: String,
    path: String,
) -> AppResult<String> {
    let preset = presets::get(state.db()?, &preset_id).await?;
    let dest = target(&path, PRESET_EXTENSION)?;
    let file = PresetFile::new(&preset.name, preset.draft);
    let json =
        serde_json::to_string_pretty(&file).map_err(|e| AppError::internal(e.to_string()))?;
    std::fs::write(&dest, json).map_err(|e| {
        AppError::new(
            ErrorCode::Io,
            format!("could not write {}: {e}", dest.display()),
        )
    })?;
    Ok(dest.to_string_lossy().into_owned())
}

/// Reads a `.dtlpreset` file and keeps it as a new preset.
#[tauri::command]
pub async fn import_user_preset(state: State<'_, AppState>, path: String) -> AppResult<UserPreset> {
    let src = Path::new(path.trim());
    if path.trim().is_empty() || !src.is_absolute() {
        return Err(AppError::invalid_input("choose a preset file to import"));
    }
    let size = std::fs::metadata(src)
        .map_err(|e| {
            AppError::new(
                ErrorCode::Io,
                format!("could not read {}: {e}", src.display()),
            )
        })?
        .len();
    if size > MAX_FILE_BYTES {
        return Err(AppError::invalid_input(
            "that file is too large to be a preset",
        ));
    }
    let text = std::fs::read_to_string(src).map_err(|e| {
        AppError::new(
            ErrorCode::Io,
            format!("could not read {}: {e}", src.display()),
        )
    })?;
    let file = parse_preset_file(&text)?;
    presets::save(state.db()?, &file.name, "", file.draft).await
}

/// The preset in a file's text, or why it is not one.
pub fn parse_preset_file(text: &str) -> AppResult<PresetFile> {
    let file: PresetFile = serde_json::from_str(text).map_err(|_| {
        AppError::invalid_input("that file is not a Dear to Love preset (.dtlpreset)")
    })?;
    if file.format != PRESET_FORMAT {
        return Err(AppError::invalid_input(
            "that file is not a Dear to Love preset (.dtlpreset)",
        ));
    }
    if file.format_version > PRESET_FORMAT_VERSION {
        return Err(AppError::invalid_input(
            "this preset was made with a newer version of the app; update to import it",
        ));
    }
    Ok(file)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_preset_file_round_trips_and_strangers_are_refused() {
        let mut player = CreateStoryDraft::default().player;
        player.name = "Ada".into();
        let draft = CreateStoryDraft {
            title: "Harbor Town".into(),
            player,
            ..CreateStoryDraft::default()
        };
        let json = serde_json::to_string(&PresetFile::new("Harbor", draft)).unwrap();
        let back = parse_preset_file(&json).unwrap();
        assert_eq!(back.name, "Harbor");
        assert_eq!(back.draft.player.name, "Ada");
        assert!(parse_preset_file("{\"hello\": 1}").is_err());
        assert!(parse_preset_file("not json").is_err());
        let newer = json.replace("\"formatVersion\":1", "\"formatVersion\":99");
        let err = parse_preset_file(&newer).unwrap_err();
        assert!(err.to_string().contains("newer"), "{err}");
    }
}

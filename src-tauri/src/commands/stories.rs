use tauri::State;

use crate::db::stories;
use crate::domain::story::{StoryCreated, StorySummary};
use crate::domain::templates::{QuickStartInput, TemplateCatalog};
use crate::errors::AppResult;
use crate::state::AppState;

#[tauri::command]
pub fn get_template_catalog() -> TemplateCatalog {
    TemplateCatalog::bundled()
}

#[tauri::command]
pub async fn quick_start(
    state: State<'_, AppState>,
    input: QuickStartInput,
) -> AppResult<StoryCreated> {
    let draft = TemplateCatalog::bundled().resolve_quick_start(&input)?;
    stories::create_story(state.db()?, draft).await
}

#[tauri::command]
pub async fn list_stories(state: State<'_, AppState>) -> AppResult<Vec<StorySummary>> {
    stories::list_stories(state.db()?).await
}

#[tauri::command]
pub async fn delete_story(state: State<'_, AppState>, story_id: String) -> AppResult<()> {
    stories::delete_story(state.db()?, &story_id).await
}

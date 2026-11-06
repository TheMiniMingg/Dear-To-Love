use tauri::State;

use crate::db::{drafts, stories};
use crate::domain::draft::{CreateStoryDraft, DraftProblem, WizardDraft};
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

/// The editable draft for a world, scenario and character (the wizard's
/// starting point). Nothing is saved.
#[tauri::command]
pub fn compose_story_draft(input: QuickStartInput) -> AppResult<CreateStoryDraft> {
    TemplateCatalog::bundled().compose_draft(&input)
}

/// What still has to be fixed before `create_story` will accept the draft.
#[tauri::command]
pub fn check_story_draft(draft: CreateStoryDraft) -> Vec<DraftProblem> {
    draft.check()
}

/// Create a story from the wizard and discard the wizard's saved draft.
#[tauri::command]
pub async fn create_story(
    state: State<'_, AppState>,
    draft: CreateStoryDraft,
) -> AppResult<StoryCreated> {
    let db = state.db()?;
    let created = stories::create_story(db, draft.into_story_input()?).await?;
    // The story exists either way; a leftover draft is only an extra prompt.
    if let Err(e) = drafts::clear(db).await {
        eprintln!("could not clear the wizard draft: {}", e.message);
    }
    Ok(created)
}

#[tauri::command]
pub async fn get_wizard_draft(state: State<'_, AppState>) -> AppResult<Option<WizardDraft>> {
    drafts::get(state.db()?).await
}

#[tauri::command]
pub async fn save_wizard_draft(
    state: State<'_, AppState>,
    wizard: WizardDraft,
) -> AppResult<WizardDraft> {
    drafts::save(state.db()?, wizard).await
}

#[tauri::command]
pub async fn clear_wizard_draft(state: State<'_, AppState>) -> AppResult<()> {
    drafts::clear(state.db()?).await
}

#[tauri::command]
pub async fn list_stories(state: State<'_, AppState>) -> AppResult<Vec<StorySummary>> {
    stories::list_stories(state.db()?).await
}

#[tauri::command]
pub async fn delete_story(state: State<'_, AppState>, story_id: String) -> AppResult<()> {
    stories::delete_story(state.db()?, &story_id).await
}

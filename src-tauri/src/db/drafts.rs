//! The creation wizard's unfinished draft, kept in `app_preferences` so a
//! story half-made survives closing the wizard or the app (T28).

use crate::db::{now, Database};
use crate::domain::draft::WizardDraft;
use crate::errors::{AppError, AppResult};

const KEY: &str = "wizard_draft";
/// Generous for typed text; refuses runaway pastes.
const MAX_BYTES: usize = 512 * 1024;

/// The saved draft, or `None` when there is none or it can no longer be
/// read (a draft is a convenience, never a reason to block the wizard).
pub async fn get(db: &Database) -> AppResult<Option<WizardDraft>> {
    let v: Option<String> =
        sqlx::query_scalar("SELECT value_json FROM app_preferences WHERE key = ?")
            .bind(KEY)
            .fetch_optional(db.reader())
            .await?;
    Ok(v.and_then(|j| serde_json::from_str(&j).ok()))
}

pub async fn save(db: &Database, mut draft: WizardDraft) -> AppResult<WizardDraft> {
    draft.saved_at = now();
    let json = serde_json::to_string(&draft).map_err(|e| AppError::internal(e.to_string()))?;
    if json.len() > MAX_BYTES {
        return Err(AppError::invalid_input(
            "this draft is too large to keep; shorten the longest fields",
        ));
    }
    sqlx::query(
        "INSERT INTO app_preferences (key, value_json) VALUES (?, ?) \
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
    )
    .bind(KEY)
    .bind(json)
    .execute(db.writer())
    .await?;
    Ok(draft)
}

pub async fn clear(db: &Database) -> AppResult<()> {
    sqlx::query("DELETE FROM app_preferences WHERE key = ?")
        .bind(KEY)
        .execute(db.writer())
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::test_db;
    use crate::domain::draft::{CreateStoryDraft, DraftStep, WizardMode};

    /// T28: a draft closed halfway comes back as it was.
    #[tokio::test]
    async fn draft_round_trips_and_clears() {
        let t = test_db().await;
        assert_eq!(get(&t.db).await.unwrap(), None);
        let mut d = CreateStoryDraft {
            title: "Half done".into(),
            ..Default::default()
        };
        d.player.name = "Ada".into();
        let saved = save(
            &t.db,
            WizardDraft {
                mode: WizardMode::Custom,
                step: DraftStep::Story,
                draft: d.clone(),
                saved_at: String::new(),
            },
        )
        .await
        .unwrap();
        assert!(!saved.saved_at.is_empty());
        let back = get(&t.db).await.unwrap().unwrap();
        assert_eq!(back, saved);
        assert_eq!(back.draft, d);

        d.title = "x".repeat(MAX_BYTES);
        let big = WizardDraft {
            draft: d,
            ..saved.clone()
        };
        assert!(save(&t.db, big).await.is_err());
        assert_eq!(get(&t.db).await.unwrap(), Some(saved), "kept on refusal");

        clear(&t.db).await.unwrap();
        assert_eq!(get(&t.db).await.unwrap(), None);
    }

    #[tokio::test]
    async fn unreadable_draft_is_ignored() {
        let t = test_db().await;
        sqlx::query("INSERT INTO app_preferences (key, value_json) VALUES (?, '{\"mode\":9}')")
            .bind(KEY)
            .execute(t.db.writer())
            .await
            .unwrap();
        assert_eq!(get(&t.db).await.unwrap(), None);
    }
}

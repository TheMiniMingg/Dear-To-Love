//! A player's own presets (`user_presets`): wizard drafts saved from their
//! stories, listed under Preset Story → Your presets.

use crate::db::{new_id, now, Database};
use crate::domain::draft::CreateStoryDraft;
use crate::domain::presets::{clean_preset_name, UserPreset};
use crate::errors::{AppError, AppResult};

/// Generous for a hand-made world; refuses runaway pastes.
const MAX_BYTES: usize = 512 * 1024;
/// More presets than anyone scrolls through.
pub const MAX_PRESETS: i64 = 500;

#[derive(sqlx::FromRow)]
struct Row {
    id: String,
    name: String,
    from_story_title: String,
    created_at: String,
    draft_json: String,
}

impl Row {
    /// A preset whose draft can still be read; one that cannot is left out
    /// of lists rather than breaking them.
    fn preset(self) -> Option<UserPreset> {
        let draft: CreateStoryDraft = serde_json::from_str(&self.draft_json).ok()?;
        Some(UserPreset {
            id: self.id,
            name: self.name,
            from_story_title: self.from_story_title,
            created_at: self.created_at,
            draft,
        })
    }
}

/// Every preset, newest first.
pub async fn list(db: &Database) -> AppResult<Vec<UserPreset>> {
    let rows = sqlx::query_as::<_, Row>(
        "SELECT id, name, from_story_title, created_at, draft_json FROM user_presets \
         ORDER BY created_at DESC, id DESC",
    )
    .fetch_all(db.reader())
    .await?;
    Ok(rows.into_iter().filter_map(Row::preset).collect())
}

pub async fn get(db: &Database, id: &str) -> AppResult<UserPreset> {
    let row = sqlx::query_as::<_, Row>(
        "SELECT id, name, from_story_title, created_at, draft_json FROM user_presets WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(db.reader())
    .await?;
    row.and_then(Row::preset)
        .ok_or_else(|| AppError::not_found("that preset is gone"))
}

/// Keeps `draft` as a new preset called `name`.
pub async fn save(
    db: &Database,
    name: &str,
    from_story_title: &str,
    draft: CreateStoryDraft,
) -> AppResult<UserPreset> {
    let name = clean_preset_name(name)
        .ok_or_else(|| AppError::invalid_input("give the preset a name of up to 80 characters"))?;
    let json = serde_json::to_string(&draft).map_err(|e| AppError::internal(e.to_string()))?;
    if json.len() > MAX_BYTES {
        return Err(AppError::invalid_input(
            "this preset is too large to keep; shorten the longest fields",
        ));
    }
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM user_presets")
        .fetch_one(db.reader())
        .await?;
    if count >= MAX_PRESETS {
        return Err(AppError::invalid_input(format!(
            "you already have {MAX_PRESETS} presets; delete one first"
        )));
    }
    let preset = UserPreset {
        id: new_id(),
        name,
        from_story_title: from_story_title.trim().chars().take(200).collect(),
        created_at: now(),
        draft,
    };
    sqlx::query(
        "INSERT INTO user_presets (id, name, from_story_title, created_at, draft_json) \
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&preset.id)
    .bind(&preset.name)
    .bind(&preset.from_story_title)
    .bind(&preset.created_at)
    .bind(&json)
    .execute(db.writer())
    .await?;
    Ok(preset)
}

pub async fn rename(db: &Database, id: &str, name: &str) -> AppResult<UserPreset> {
    let name = clean_preset_name(name)
        .ok_or_else(|| AppError::invalid_input("give the preset a name of up to 80 characters"))?;
    let changed = sqlx::query("UPDATE user_presets SET name = ? WHERE id = ?")
        .bind(&name)
        .bind(id)
        .execute(db.writer())
        .await?
        .rows_affected();
    if changed == 0 {
        return Err(AppError::not_found("that preset is gone"));
    }
    get(db, id).await
}

pub async fn delete(db: &Database, id: &str) -> AppResult<()> {
    sqlx::query("DELETE FROM user_presets WHERE id = ?")
        .bind(id)
        .execute(db.writer())
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::test_db;

    fn draft(title: &str) -> CreateStoryDraft {
        let mut d = CreateStoryDraft {
            title: title.into(),
            ..Default::default()
        };
        d.player.name = "Ada".into();
        d.world.setting = "A harbor town".into();
        d
    }

    #[tokio::test]
    async fn presets_are_kept_listed_newest_first_renamed_and_deleted() {
        let t = test_db().await;
        assert!(list(&t.db).await.unwrap().is_empty());
        let a = save(
            &t.db,
            "  Harbor  nights ",
            "Harbor Town",
            draft("Harbor Town"),
        )
        .await
        .unwrap();
        assert_eq!(a.name, "Harbor nights");
        assert_eq!(a.from_story_title, "Harbor Town");
        let b = save(&t.db, "Space", "", draft("Orbit")).await.unwrap();
        let listed = list(&t.db).await.unwrap();
        assert_eq!(
            listed.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(),
            vec![b.id.as_str(), a.id.as_str()]
        );
        assert_eq!(listed[1].draft.player.name, "Ada");
        assert_eq!(
            get(&t.db, &a.id).await.unwrap().draft.world.setting,
            "A harbor town"
        );
        let renamed = rename(&t.db, &a.id, "Harbor, later").await.unwrap();
        assert_eq!(renamed.name, "Harbor, later");
        delete(&t.db, &a.id).await.unwrap();
        assert!(get(&t.db, &a.id).await.is_err());
        assert_eq!(list(&t.db).await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn a_preset_needs_a_name() {
        let t = test_db().await;
        let err = save(&t.db, "   ", "", draft("x")).await.unwrap_err();
        assert!(err.to_string().contains("name"), "{err}");
    }
}

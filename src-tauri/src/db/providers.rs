//! Saved AI connections and which storyteller is in use. API keys live in
//! the OS credential store; rows only keep an opaque `secret_ref`.

use sqlx::FromRow;

use super::{new_id, now, Database};
use crate::domain::provider::{
    AdapterKind, Billing, GenerationSettings, ProviderProfile, ProviderProfileInput,
    StorytellerChoice,
};
use crate::errors::{AppError, AppResult};
use crate::services::secrets::{provider_secret_ref, SecretStore};

const STORYTELLER_KEY: &str = "storyteller";
/// The connection portraits are made with (`null`: none chosen).
const PICTURE_MAKER_KEY: &str = "picture_maker";

#[derive(Debug, Clone, FromRow)]
pub struct ProfileRow {
    pub id: String,
    pub label: String,
    pub adapter: String,
    pub model_id: String,
    pub base_url: Option<String>,
    pub secret_ref: Option<String>,
    pub billing: String,
    pub settings_json: String,
    pub created_at: String,
    pub updated_at: String,
}

impl ProfileRow {
    pub fn adapter(&self) -> AppResult<AdapterKind> {
        AdapterKind::parse(&self.adapter)
            .ok_or_else(|| AppError::internal(format!("unknown adapter {}", self.adapter)))
    }

    pub fn billing(&self) -> Billing {
        Billing::parse(&self.billing)
    }

    pub fn settings(&self) -> GenerationSettings {
        serde_json::from_str(&self.settings_json).unwrap_or_default()
    }

    pub fn to_profile(&self) -> AppResult<ProviderProfile> {
        Ok(ProviderProfile {
            id: self.id.clone(),
            label: self.label.clone(),
            adapter: self.adapter()?,
            base_url: self.base_url.clone().unwrap_or_default(),
            model_id: self.model_id.clone(),
            billing: self.billing(),
            has_key: self.secret_ref.is_some(),
            settings: self.settings(),
            created_at: self.created_at.clone(),
            updated_at: self.updated_at.clone(),
        })
    }
}

macro_rules! profile_columns {
    () => {
        "id, label, adapter, model_id, base_url, secret_ref, billing, settings_json, created_at, updated_at"
    };
}

pub async fn list_profiles(db: &Database) -> AppResult<Vec<ProviderProfile>> {
    let rows = sqlx::query_as::<_, ProfileRow>(concat!(
        "SELECT ",
        profile_columns!(),
        " FROM provider_profiles ORDER BY created_at"
    ))
    .fetch_all(db.reader())
    .await?;
    rows.iter().map(ProfileRow::to_profile).collect()
}

pub async fn get_profile_row(db: &Database, id: &str) -> AppResult<ProfileRow> {
    sqlx::query_as::<_, ProfileRow>(concat!(
        "SELECT ",
        profile_columns!(),
        " FROM provider_profiles WHERE id = ?"
    ))
    .bind(id)
    .fetch_optional(db.reader())
    .await?
    .ok_or_else(|| AppError::not_found("that AI connection no longer exists"))
}

/// Create or update a connection. The key goes to the credential store
/// first; if that fails nothing is saved.
pub async fn save_profile(
    db: &Database,
    secrets: &dyn SecretStore,
    mut input: ProviderProfileInput,
) -> AppResult<ProviderProfile> {
    input.validate()?;
    let existing = match &input.id {
        Some(id) => Some(get_profile_row(db, id).await?),
        None => None,
    };
    let id = input.id.clone().unwrap_or_else(new_id);
    let secret_ref = provider_secret_ref(&id);
    let new_secret_ref = match input.api_key.as_deref().map(str::trim) {
        None => existing.as_ref().and_then(|e| e.secret_ref.clone()),
        Some("") => {
            secrets.delete(&secret_ref)?;
            None
        }
        Some(key) => {
            secrets.set(&secret_ref, key)?;
            Some(secret_ref.clone())
        }
    };
    let ts = now();
    let settings =
        serde_json::to_string(&input.settings).map_err(|e| AppError::internal(e.to_string()))?;
    let mut tx = db.write_txn().await?;
    if existing.is_some() {
        sqlx::query(
            "UPDATE provider_profiles SET label = ?, adapter = ?, model_id = ?, base_url = ?, \
             secret_ref = ?, billing = ?, settings_json = ?, updated_at = ? WHERE id = ?",
        )
        .bind(&input.label)
        .bind(input.adapter.as_str())
        .bind(&input.model_id)
        .bind(&input.base_url)
        .bind(&new_secret_ref)
        .bind(input.billing.as_str())
        .bind(&settings)
        .bind(&ts)
        .bind(&id)
        .execute(&mut *tx)
        .await?;
    } else {
        sqlx::query(
            "INSERT INTO provider_profiles (id, label, adapter, model_id, base_url, secret_ref, \
             billing, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(&input.label)
        .bind(input.adapter.as_str())
        .bind(&input.model_id)
        .bind(&input.base_url)
        .bind(&new_secret_ref)
        .bind(input.billing.as_str())
        .bind(&settings)
        .bind(&ts)
        .bind(&ts)
        .execute(&mut *tx)
        .await?;
    }
    // A connection changed between writing stories and making pictures
    // stops doing the job it can no longer do.
    if !input.adapter.writes_stories() {
        if storyteller_tx(&mut tx).await?.as_deref() == Some(id.as_str()) {
            set_pref_id_tx(&mut tx, STORYTELLER_KEY, None).await?;
        }
        sqlx::query(
            "UPDATE stories SET storyteller_profile_id = NULL WHERE storyteller_profile_id = ?",
        )
        .bind(&id)
        .execute(&mut *tx)
        .await?;
    }
    if !input.adapter.makes_pictures()
        && pref_id_tx(&mut tx, PICTURE_MAKER_KEY).await?.as_deref() == Some(id.as_str())
    {
        set_pref_id_tx(&mut tx, PICTURE_MAKER_KEY, None).await?;
    }
    tx.commit().await?;
    get_profile_row(db, &id).await?.to_profile()
}

/// Delete a connection and its key. Runs waiting to start on it are
/// interrupted (they keep the player's text and can be retried).
pub async fn delete_profile(db: &Database, secrets: &dyn SecretStore, id: &str) -> AppResult<()> {
    let row = get_profile_row(db, id).await?;
    let mut tx = db.write_txn().await?;
    sqlx::query(
        "UPDATE generation_runs SET status = 'interrupted', error_code = 'NO_PROVIDER', \
         finished_at = ? WHERE provider_profile_id = ? AND status = 'pending'",
    )
    .bind(now())
    .bind(id)
    .execute(&mut *tx)
    .await?;
    sqlx::query("DELETE FROM provider_profiles WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    for key in [STORYTELLER_KEY, PICTURE_MAKER_KEY] {
        if pref_id_tx(&mut tx, key).await?.as_deref() == Some(id) {
            set_pref_id_tx(&mut tx, key, None).await?;
        }
    }
    tx.commit().await?;
    if let Some(r) = row.secret_ref {
        // Best effort: the profile is gone either way.
        let _ = secrets.delete(&r);
    }
    Ok(())
}

/// A connection id kept in app preferences (`None` when unset).
async fn pref_id_tx(conn: &mut sqlx::SqliteConnection, key: &str) -> AppResult<Option<String>> {
    let v: Option<String> =
        sqlx::query_scalar("SELECT value_json FROM app_preferences WHERE key = ?")
            .bind(key)
            .fetch_optional(&mut *conn)
            .await?;
    Ok(v.and_then(|j| serde_json::from_str::<Option<String>>(&j).ok().flatten()))
}

async fn set_pref_id_tx(
    conn: &mut sqlx::SqliteConnection,
    key: &str,
    profile_id: Option<&str>,
) -> AppResult<()> {
    sqlx::query(
        "INSERT INTO app_preferences (key, value_json) VALUES (?, ?) \
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
    )
    .bind(key)
    .bind(serde_json::to_string(&profile_id).unwrap_or_else(|_| "null".into()))
    .execute(&mut *conn)
    .await?;
    Ok(())
}

async fn storyteller_tx(conn: &mut sqlx::SqliteConnection) -> AppResult<Option<String>> {
    pref_id_tx(conn, STORYTELLER_KEY).await
}

/// The kind of a saved connection, read inside a transaction.
async fn adapter_tx(conn: &mut sqlx::SqliteConnection, id: &str) -> AppResult<Option<AdapterKind>> {
    let a: Option<String> =
        sqlx::query_scalar("SELECT adapter FROM provider_profiles WHERE id = ?")
            .bind(id)
            .fetch_optional(&mut *conn)
            .await?;
    Ok(a.as_deref().and_then(AdapterKind::parse))
}

fn not_a_storyteller() -> AppError {
    AppError::invalid_input(
        "that connection makes pictures or reads aloud, not story replies; choose one that \
         writes stories",
    )
}

/// The connection new replies use, or `None` for the offline storyteller.
pub async fn storyteller(db: &Database) -> AppResult<Option<String>> {
    let mut conn = db.reader().acquire().await?;
    storyteller_tx(&mut conn).await
}

pub async fn set_storyteller(db: &Database, profile_id: Option<&str>) -> AppResult<()> {
    if let Some(id) = profile_id {
        if !get_profile_row(db, id).await?.adapter()?.writes_stories() {
            return Err(not_a_storyteller());
        }
    }
    let mut tx = db.write_txn().await?;
    set_pref_id_tx(&mut tx, STORYTELLER_KEY, profile_id).await?;
    tx.commit().await?;
    Ok(())
}

/// The connection portraits are made with, if one was chosen.
pub async fn picture_maker(db: &Database) -> AppResult<Option<String>> {
    let mut conn = db.reader().acquire().await?;
    pref_id_tx(&mut conn, PICTURE_MAKER_KEY).await
}

/// Choose (or, with `None`, clear) the connection portraits are made with.
pub async fn set_picture_maker(db: &Database, profile_id: Option<&str>) -> AppResult<()> {
    if let Some(id) = profile_id {
        if !get_profile_row(db, id).await?.adapter()?.makes_pictures() {
            return Err(AppError::invalid_input(
                "that connection writes stories; choose a picture connection",
            ));
        }
    }
    let mut tx = db.write_txn().await?;
    set_pref_id_tx(&mut tx, PICTURE_MAKER_KEY, profile_id).await?;
    tx.commit().await?;
    Ok(())
}

/// The story's own storyteller choice, or `None` when it follows the app.
pub async fn story_choice(
    conn: &mut sqlx::SqliteConnection,
    story_id: &str,
) -> AppResult<Option<StorytellerChoice>> {
    let row: Option<(Option<String>, i64)> = sqlx::query_as(
        "SELECT storyteller_profile_id, storyteller_offline FROM stories WHERE id = ?",
    )
    .bind(story_id)
    .fetch_optional(&mut *conn)
    .await?;
    let Some((profile, offline)) = row else {
        return Err(AppError::not_found(format!("story {story_id} not found")));
    };
    Ok(match (offline != 0, profile) {
        (true, _) => Some(StorytellerChoice::Offline),
        (false, Some(id)) => Some(StorytellerChoice::Connection { id }),
        (false, None) => None,
    })
}

/// The connection this story's new replies use (`None`: offline): its own
/// choice, or the app's storyteller when it has none.
pub async fn story_storyteller(db: &Database, story_id: &str) -> AppResult<Option<String>> {
    let mut conn = db.reader().acquire().await?;
    match story_choice(&mut conn, story_id).await? {
        Some(StorytellerChoice::Offline) => Ok(None),
        Some(StorytellerChoice::Connection { id }) => Ok(Some(id)),
        None => storyteller_tx(&mut conn).await,
    }
}

/// [`story_storyteller`] for the story a route belongs to.
pub async fn route_storyteller(db: &Database, route_id: &str) -> AppResult<Option<String>> {
    let story_id: Option<String> = sqlx::query_scalar("SELECT story_id FROM routes WHERE id = ?")
        .bind(route_id)
        .fetch_optional(db.reader())
        .await?;
    let story_id =
        story_id.ok_or_else(|| AppError::not_found(format!("route {route_id} not found")))?;
    story_storyteller(db, &story_id).await
}

/// Sets (or, with `None`, clears) the story's own storyteller.
pub async fn set_story_choice_tx(
    conn: &mut sqlx::SqliteConnection,
    story_id: &str,
    choice: Option<&StorytellerChoice>,
) -> AppResult<()> {
    let (profile, offline) = match choice {
        None => (None, 0),
        Some(StorytellerChoice::Offline) => (None, 1),
        Some(StorytellerChoice::Connection { id }) => {
            match adapter_tx(conn, id).await? {
                None => {
                    return Err(AppError::invalid_input(
                        "that AI connection was removed; choose another storyteller",
                    ))
                }
                Some(kind) if !kind.writes_stories() => return Err(not_a_storyteller()),
                Some(_) => {}
            }
            (Some(id.as_str()), 0)
        }
    };
    let done = sqlx::query(
        "UPDATE stories SET storyteller_profile_id = ?, storyteller_offline = ? WHERE id = ?",
    )
    .bind(profile)
    .bind(offline)
    .bind(story_id)
    .execute(&mut *conn)
    .await?;
    if done.rows_affected() == 0 {
        return Err(AppError::not_found(format!("story {story_id} not found")));
    }
    Ok(())
}

pub async fn set_story_choice(
    db: &Database,
    story_id: &str,
    choice: Option<&StorytellerChoice>,
) -> AppResult<()> {
    let mut tx = db.write_txn().await?;
    set_story_choice_tx(&mut tx, story_id, choice).await?;
    tx.commit().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::test_db;
    use crate::domain::provider::{AdapterKind, Billing};
    use crate::errors::ErrorCode;
    use crate::services::secrets::MemoryStore;

    pub fn input(label: &str) -> ProviderProfileInput {
        ProviderProfileInput {
            id: None,
            label: label.into(),
            adapter: AdapterKind::OpenaiCompatible,
            base_url: "https://api.example.com/v1/".into(),
            model_id: "story-model".into(),
            billing: Billing::Paid,
            api_key: Some("sk-abc".into()),
            settings: GenerationSettings::default(),
        }
    }

    #[tokio::test]
    async fn key_goes_to_credential_store_not_database() {
        let t = test_db().await;
        let secrets = MemoryStore::default();
        let p = save_profile(&t.db, &secrets, input("Cloud")).await.unwrap();
        assert!(p.has_key);
        assert_eq!(p.base_url, "https://api.example.com/v1");
        assert_eq!(
            secrets.get(&provider_secret_ref(&p.id)).unwrap().as_deref(),
            Some("sk-abc")
        );
        let dump: Vec<String> = sqlx::query_scalar(
            "SELECT label || model_id || base_url || COALESCE(secret_ref,'') || settings_json FROM provider_profiles",
        )
        .fetch_all(t.db.reader())
        .await
        .unwrap();
        assert!(!dump.concat().contains("sk-abc"));

        // Editing without a key keeps it; an empty key removes it.
        let mut edit = input("Cloud 2");
        edit.id = Some(p.id.clone());
        edit.api_key = None;
        assert!(
            save_profile(&t.db, &secrets, edit.clone())
                .await
                .unwrap()
                .has_key
        );
        edit.api_key = Some(String::new());
        let p2 = save_profile(&t.db, &secrets, edit).await.unwrap();
        assert!(!p2.has_key);
        assert_eq!(secrets.get(&provider_secret_ref(&p.id)).unwrap(), None);
    }

    #[tokio::test]
    async fn storyteller_choice_and_delete() {
        let t = test_db().await;
        let secrets = MemoryStore::default();
        assert_eq!(storyteller(&t.db).await.unwrap(), None);
        let p = save_profile(&t.db, &secrets, input("Cloud")).await.unwrap();
        set_storyteller(&t.db, Some(&p.id)).await.unwrap();
        assert_eq!(storyteller(&t.db).await.unwrap(), Some(p.id.clone()));
        assert_eq!(
            set_storyteller(&t.db, Some("missing"))
                .await
                .unwrap_err()
                .code,
            ErrorCode::NotFound
        );
        delete_profile(&t.db, &secrets, &p.id).await.unwrap();
        assert_eq!(storyteller(&t.db).await.unwrap(), None);
        assert!(list_profiles(&t.db).await.unwrap().is_empty());
        assert_eq!(secrets.get(&provider_secret_ref(&p.id)).unwrap(), None);
    }

    #[tokio::test]
    async fn invalid_input_is_rejected() {
        let t = test_db().await;
        let secrets = MemoryStore::default();
        let mut bad = input("Cloud");
        bad.base_url = "not a url".into();
        assert_eq!(
            save_profile(&t.db, &secrets, bad).await.unwrap_err().code,
            ErrorCode::InvalidInput
        );
        let mut bad = input("  ");
        bad.api_key = None;
        assert!(save_profile(&t.db, &secrets, bad).await.is_err());
    }

    #[tokio::test]
    async fn a_story_can_choose_its_own_storyteller() {
        use crate::db::stories::create_story;
        use crate::domain::story::CreateStoryInput;
        use crate::domain::story_state::fixtures::lighthouse;

        let t = test_db().await;
        let secrets = MemoryStore::default();
        let app = save_profile(&t.db, &secrets, input("Cloud")).await.unwrap();
        let own = save_profile(&t.db, &secrets, input("Local")).await.unwrap();
        set_storyteller(&t.db, Some(&app.id)).await.unwrap();
        let story = create_story(
            &t.db,
            CreateStoryInput {
                title: "Harbor".into(),
                description: String::new(),
                base_state: lighthouse(),
                first_chapter_title: "One".into(),
                chapter_outlines: vec![],
            },
        )
        .await
        .unwrap();
        let id = &story.story_id;
        assert_eq!(
            story_storyteller(&t.db, id).await.unwrap(),
            Some(app.id.clone())
        );

        set_story_choice(&t.db, id, Some(&StorytellerChoice::Offline))
            .await
            .unwrap();
        assert_eq!(story_storyteller(&t.db, id).await.unwrap(), None);
        assert_eq!(
            storyteller(&t.db).await.unwrap(),
            Some(app.id.clone()),
            "the app's storyteller is unchanged"
        );

        let choice = StorytellerChoice::Connection { id: own.id.clone() };
        set_story_choice(&t.db, id, Some(&choice)).await.unwrap();
        assert_eq!(
            story_storyteller(&t.db, id).await.unwrap(),
            Some(own.id.clone())
        );
        let mut conn = t.db.reader().acquire().await.unwrap();
        assert_eq!(story_choice(&mut conn, id).await.unwrap(), Some(choice));
        drop(conn);

        // Deleting that connection sends the story back to the app's choice.
        delete_profile(&t.db, &secrets, &own.id).await.unwrap();
        assert_eq!(
            story_storyteller(&t.db, id).await.unwrap(),
            Some(app.id.clone())
        );
        let missing = StorytellerChoice::Connection { id: own.id.clone() };
        assert!(set_story_choice(&t.db, id, Some(&missing)).await.is_err());
        assert!(set_story_choice(&t.db, "nope", None).await.is_err());
    }
}

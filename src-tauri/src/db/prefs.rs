//! `app_preferences`: small JSON values by key. A value that no longer
//! parses reads as missing, so a changed shape falls back to defaults.

use serde::{Deserialize, Serialize};
use sqlx::SqliteConnection;

use crate::errors::{AppError, AppResult};

pub async fn get_pref<T: for<'de> Deserialize<'de>>(
    conn: &mut SqliteConnection,
    key: &str,
) -> AppResult<Option<T>> {
    let v: Option<String> =
        sqlx::query_scalar("SELECT value_json FROM app_preferences WHERE key = ?")
            .bind(key)
            .fetch_optional(&mut *conn)
            .await?;
    Ok(v.and_then(|j| serde_json::from_str(&j).ok()))
}

pub async fn set_pref<T: Serialize>(
    conn: &mut SqliteConnection,
    key: &str,
    v: &T,
) -> AppResult<()> {
    let json = serde_json::to_string(v).map_err(|e| AppError::internal(e.to_string()))?;
    sqlx::query(
        "INSERT INTO app_preferences (key, value_json) VALUES (?, ?) \
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
    )
    .bind(key)
    .bind(json)
    .execute(&mut *conn)
    .await?;
    Ok(())
}

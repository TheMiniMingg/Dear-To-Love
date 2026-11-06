//! WAL-safe database snapshots. Never copy `story.db` directly while the
//! app is running: recent writes may still live in the WAL file.

use std::path::Path;

use sqlx::SqlitePool;

use crate::errors::{AppError, AppResult, ErrorCode};

/// Write a consistent, compacted copy of the database to `dest` using
/// `VACUUM INTO`. `dest` must not already exist.
pub async fn vacuum_into(pool: &SqlitePool, dest: &Path) -> AppResult<()> {
    if dest.exists() {
        return Err(AppError::new(
            ErrorCode::Io,
            format!("backup target already exists: {}", dest.display()),
        ));
    }
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let dest_str = dest
        .to_str()
        .ok_or_else(|| AppError::invalid_input("backup path is not valid UTF-8"))?;
    sqlx::query("VACUUM INTO ?")
        .bind(dest_str)
        .execute(pool)
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::test_db;
    use crate::db::Database;

    #[tokio::test]
    async fn backup_contains_committed_rows_and_opens_cleanly() {
        let t = test_db().await;
        sqlx::query("INSERT INTO app_preferences (key, value_json) VALUES ('k', '\"v\"')")
            .execute(t.db.writer())
            .await
            .unwrap();
        let dest = t.dir.path().join("backups").join("copy.db");
        vacuum_into(t.db.reader(), &dest).await.unwrap();

        let (copy, report) = Database::open(&dest, &t.dir.path().join("b2"))
            .await
            .unwrap();
        assert!(report.applied_migrations.is_empty());
        let v: String = sqlx::query_scalar("SELECT value_json FROM app_preferences WHERE key='k'")
            .fetch_one(copy.reader())
            .await
            .unwrap();
        assert_eq!(v, "\"v\"");
        assert!(
            vacuum_into(t.db.reader(), &dest).await.is_err(),
            "never overwrites"
        );
    }
}

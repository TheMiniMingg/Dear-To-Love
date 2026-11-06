//! SQLite access. One single-connection writer pool serializes writes
//! (each write transaction uses `BEGIN IMMEDIATE`); a small reader pool
//! serves queries. Foreign keys are enabled on every connection.

pub mod backup;
pub mod contract;
pub mod providers;
pub mod runs;
pub mod saves;
pub mod state;
pub mod stories;
pub mod timeline;
pub mod usage;

use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::time::Duration;

use sqlx::migrate::{MigrateError, Migrator};
use sqlx::sqlite::{
    SqliteConnectOptions, SqliteJournalMode, SqlitePool, SqlitePoolOptions, SqliteSynchronous,
};
use sqlx::{Sqlite, Transaction};

use crate::errors::{AppError, AppResult, ErrorCode};

pub static MIGRATOR: Migrator = sqlx::migrate!("./migrations");

pub const DB_FILE_NAME: &str = "story.db";

#[derive(Clone)]
pub struct Database {
    writer: SqlitePool,
    reader: SqlitePool,
    path: PathBuf,
}

/// What happened while opening the database, for Diagnostics and the UI.
#[derive(Debug, Clone, Default)]
pub struct OpenReport {
    pub applied_migrations: Vec<i64>,
    pub pre_migration_backup: Option<PathBuf>,
}

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        AppError::new(ErrorCode::Database, err.to_string())
    }
}

/// UTC timestamp used for every `*_at` column.
pub fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

/// New time-ordered UUID (v7) as text.
pub fn new_id() -> String {
    uuid::Uuid::now_v7().to_string()
}

pub fn latest_migration_version() -> i64 {
    MIGRATOR.iter().map(|m| m.version).max().unwrap_or(0)
}

fn connect_options(path: &Path) -> AppResult<SqliteConnectOptions> {
    let url = format!("sqlite://{}", path.display());
    Ok(SqliteConnectOptions::from_str(&url)?
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .busy_timeout(Duration::from_secs(5)))
}

impl Database {
    /// Open (creating if needed) and migrate the database at `path`.
    /// Before applying migrations to a database that already has data, a
    /// consistent backup is written to `backups_dir`.
    pub async fn open(path: &Path, backups_dir: &Path) -> AppResult<(Self, OpenReport)> {
        Self::open_with(path, backups_dir, &MIGRATOR, None).await
    }

    /// Open and migrate only up to `target` (tests use this to build fixtures
    /// at historical schema versions).
    pub async fn open_with(
        path: &Path,
        backups_dir: &Path,
        migrator: &Migrator,
        target: Option<i64>,
    ) -> AppResult<(Self, OpenReport)> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let opts = connect_options(path)?;
        let writer = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(opts.clone())
            .await
            .map_err(|e| open_error(path, e))?;

        let applied = applied_versions(&writer).await?;
        let known: Vec<i64> = migrator.iter().map(|m| m.version).collect();
        if let Some(unknown) = applied.iter().find(|v| !known.contains(v)) {
            return Err(AppError::new(
                ErrorCode::MigrationFailed,
                format!(
                    "this database was created by a newer version of the app (schema {unknown}); \
                     install the newer version or restore a backup"
                ),
            ));
        }
        let wanted: Vec<i64> = known
            .iter()
            .copied()
            .filter(|v| target.is_none_or(|t| *v <= t))
            .collect();
        let pending: Vec<i64> = wanted
            .iter()
            .copied()
            .filter(|v| !applied.contains(v))
            .collect();

        let mut report = OpenReport::default();
        if !pending.is_empty() && !applied.is_empty() {
            let from = applied.iter().max().copied().unwrap_or(0);
            let dest = backups_dir.join(format!(
                "pre-migration-v{from}-{}.db",
                chrono::Utc::now().format("%Y%m%dT%H%M%SZ")
            ));
            backup::vacuum_into(&writer, &dest).await?;
            report.pre_migration_backup = Some(dest);
        }

        let result = match target {
            Some(t) => migrator.run_to(t, &writer).await,
            None => migrator.run(&writer).await,
        };
        result.map_err(migrate_error)?;
        report.applied_migrations = pending;

        let reader = SqlitePoolOptions::new()
            .max_connections(4)
            .connect_with(opts)
            .await
            .map_err(|e| open_error(path, e))?;

        let db = Self {
            writer,
            reader,
            path: path.to_path_buf(),
        };
        Ok((db, report))
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn reader(&self) -> &SqlitePool {
        &self.reader
    }

    /// Pool with exactly one connection, used only for writes.
    pub fn writer(&self) -> &SqlitePool {
        &self.writer
    }

    /// Start a write transaction that takes the database write lock up front.
    pub async fn write_txn(&self) -> AppResult<Transaction<'static, Sqlite>> {
        Ok(self.writer.begin_with("BEGIN IMMEDIATE").await?)
    }

    pub async fn schema_version(&self) -> AppResult<i64> {
        Ok(applied_versions(&self.reader)
            .await?
            .into_iter()
            .max()
            .unwrap_or(0))
    }

    pub async fn close(&self) {
        self.reader.close().await;
        self.writer.close().await;
    }
}

async fn applied_versions(pool: &SqlitePool) -> AppResult<Vec<i64>> {
    let exists: Option<String> = sqlx::query_scalar(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_sqlx_migrations'",
    )
    .fetch_optional(pool)
    .await?;
    if exists.is_none() {
        return Ok(vec![]);
    }
    Ok(sqlx::query_scalar(
        "SELECT version FROM _sqlx_migrations WHERE success = 1 ORDER BY version",
    )
    .fetch_all(pool)
    .await?)
}

fn open_error(path: &Path, err: sqlx::Error) -> AppError {
    AppError::new(
        ErrorCode::Database,
        format!(
            "could not open the story database at {}: {err}",
            path.display()
        ),
    )
}

fn migrate_error(err: MigrateError) -> AppError {
    AppError::new(ErrorCode::MigrationFailed, err.to_string())
}

#[cfg(test)]
pub mod test_support {
    use super::*;

    /// A migrated database in a temporary directory.
    pub struct TestDb {
        pub db: Database,
        pub dir: tempfile::TempDir,
    }

    pub async fn test_db() -> TestDb {
        let dir = tempfile::tempdir().unwrap();
        let (db, _) = Database::open(&dir.path().join(DB_FILE_NAME), &dir.path().join("backups"))
            .await
            .unwrap();
        TestDb { db, dir }
    }
}

#[cfg(test)]
mod tests {
    use super::test_support::test_db;
    use super::*;

    #[tokio::test]
    async fn foreign_keys_and_wal_enabled_on_every_connection() {
        let t = test_db().await;
        for pool in [t.db.reader(), t.db.writer()] {
            let fk: i64 = sqlx::query_scalar("PRAGMA foreign_keys")
                .fetch_one(pool)
                .await
                .unwrap();
            assert_eq!(fk, 1);
            let mode: String = sqlx::query_scalar("PRAGMA journal_mode")
                .fetch_one(pool)
                .await
                .unwrap();
            assert_eq!(mode, "wal");
        }
        assert_eq!(
            t.db.schema_version().await.unwrap(),
            latest_migration_version()
        );
    }

    #[tokio::test]
    async fn reopening_applies_nothing_and_takes_no_backup() {
        let t = test_db().await;
        let path = t.db.path().to_path_buf();
        t.db.close().await;
        let (_db, report) = Database::open(&path, &t.dir.path().join("backups"))
            .await
            .unwrap();
        assert!(report.applied_migrations.is_empty());
        assert!(report.pre_migration_backup.is_none());
    }

    #[tokio::test]
    async fn refuses_database_from_newer_app() {
        let t = test_db().await;
        sqlx::query(
            "INSERT INTO _sqlx_migrations (version, description, installed_on, success, checksum, execution_time) \
             VALUES (9999, 'future', CURRENT_TIMESTAMP, 1, x'00', 0)",
        )
        .execute(t.db.writer())
        .await
        .unwrap();
        let path = t.db.path().to_path_buf();
        t.db.close().await;
        let err = Database::open(&path, &t.dir.path().join("backups"))
            .await
            .err()
            .expect("must refuse");
        assert_eq!(err.code, ErrorCode::MigrationFailed);
    }

    #[tokio::test]
    async fn write_txn_serializes_writers() {
        let t = test_db().await;
        let mut tx = t.db.write_txn().await.unwrap();
        sqlx::query("INSERT INTO app_preferences (key, value_json) VALUES ('a', '1')")
            .execute(&mut *tx)
            .await
            .unwrap();
        // A second writer cannot start until the first commits.
        let db2 = t.db.clone();
        let waiter = tokio::spawn(async move {
            let mut tx2 = db2.write_txn().await.unwrap();
            let v: String =
                sqlx::query_scalar("SELECT value_json FROM app_preferences WHERE key = 'a'")
                    .fetch_one(&mut *tx2)
                    .await
                    .unwrap();
            tx2.commit().await.unwrap();
            v
        });
        tokio::task::yield_now().await;
        assert!(!waiter.is_finished());
        tx.commit().await.unwrap();
        assert_eq!(waiter.await.unwrap(), "1");
    }
}

//! Upgrade path tests: every historical schema fixture must migrate to the
//! current schema with its data intact and the schema contract satisfied.

use std::path::Path;

use dear_to_love_lib::db::{contract, latest_migration_version, Database, MIGRATOR};

async fn upgrade_fixture(version: i64, sql: &'static str) -> (Database, tempfile::TempDir) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("story.db");
    let backups = dir.path().join("backups");
    let (old, _) = Database::open_with(&path, &backups, &MIGRATOR, Some(version))
        .await
        .unwrap();
    assert_eq!(old.schema_version().await.unwrap(), version);
    sqlx::raw_sql(sql).execute(old.writer()).await.unwrap();
    old.close().await;

    let (db, report) = Database::open(&path, &backups).await.unwrap();
    assert_eq!(db.schema_version().await.unwrap(), latest_migration_version());
    if version < latest_migration_version() {
        let backup = report.pre_migration_backup.expect("pre-upgrade backup");
        assert!(Path::new(&backup).exists());
    }
    let problems = contract::verify(&db).await.unwrap();
    assert!(problems.is_empty(), "{problems:?}");
    (db, dir)
}

#[tokio::test]
async fn v1_fixture_upgrades_to_current() {
    let (db, _dir) = upgrade_fixture(1, include_str!("fixtures/data_v1.sql")).await;
    let counts: (i64, i64, i64, i64) = sqlx::query_as(
        "SELECT (SELECT COUNT(*) FROM stories), (SELECT COUNT(*) FROM routes), \
                (SELECT COUNT(*) FROM events), (SELECT COUNT(*) FROM api_requests)",
    )
    .fetch_one(db.reader())
    .await
    .unwrap();
    assert_eq!(counts, (1, 2, 4, 1));
    let head: String = sqlx::query_scalar("SELECT head_event_id FROM routes WHERE id = 'r-alt'")
        .fetch_one(db.reader())
        .await
        .unwrap();
    assert_eq!(head, "e4");
}

#[test]
fn every_migration_has_a_fixture() {
    for m in MIGRATOR.iter() {
        let p = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures")
            .join(format!("data_v{}.sql", m.version));
        assert!(p.exists(), "missing fixture {}", p.display());
    }
}

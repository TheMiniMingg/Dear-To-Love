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
    assert_eq!(
        db.schema_version().await.unwrap(),
        latest_migration_version()
    );
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

#[tokio::test]
async fn v2_fixture_upgrades_to_current() {
    let (db, _dir) = upgrade_fixture(2, include_str!("fixtures/data_v2.sql")).await;
    let summary: String =
        sqlx::query_scalar("SELECT summary_text FROM memory_caches WHERE id = 'm1'")
            .fetch_one(db.reader())
            .await
            .unwrap();
    assert_eq!(summary, "Rook bought a ferry ticket.");
}

#[tokio::test]
async fn v3_fixture_upgrades_to_current() {
    let (db, _dir) = upgrade_fixture(3, include_str!("fixtures/data_v3.sql")).await;
    let (label, links): (String, i64) = sqlx::query_as(
        "SELECT label, (SELECT COUNT(*) FROM asset_links WHERE asset_id = assets.id) FROM assets",
    )
    .fetch_one(db.reader())
    .await
    .unwrap();
    assert_eq!((label.as_str(), links), ("Lantern", 1));
    // Images from before story-only pictures stay shared with every story.
    let shared: i64 = sqlx::query_scalar("SELECT shared FROM assets")
        .fetch_one(db.reader())
        .await
        .unwrap();
    assert_eq!(shared, 1);
    let teller: (Option<String>, i64) = sqlx::query_as(
        "SELECT storyteller_profile_id, storyteller_offline FROM stories WHERE id = 's3'",
    )
    .fetch_one(db.reader())
    .await
    .unwrap();
    assert_eq!(
        teller,
        (None, 0),
        "older stories follow the app's storyteller"
    );
}

#[tokio::test]
async fn v4_fixture_upgrades_to_current() {
    let (db, _dir) = upgrade_fixture(4, include_str!("fixtures/data_v4.sql")).await;
    let (status, story): (String, Option<String>) =
        sqlx::query_as("SELECT status, story_id FROM archive_operations WHERE id = 'op1'")
            .fetch_one(db.reader())
            .await
            .unwrap();
    assert_eq!(
        (status.as_str(), story.as_deref()),
        ("complete", Some("s4"))
    );
}

#[tokio::test]
async fn v5_fixture_upgrades_to_current() {
    let (db, _dir) = upgrade_fixture(5, include_str!("fixtures/data_v5.sql")).await;
    let (label, event): (String, String) =
        sqlx::query_as("SELECT label, event_id FROM bookmarks WHERE id = 'b1'")
            .fetch_one(db.reader())
            .await
            .unwrap();
    assert_eq!((label.as_str(), event.as_str()), ("The winter pear", "g3"));
}

#[tokio::test]
async fn v6_fixture_upgrades_to_current() {
    let (db, _dir) = upgrade_fixture(6, include_str!("fixtures/data_v6.sql")).await;
    let (profile, member): (Option<String>, String) = sqlx::query_as(
        "SELECT s.storyteller_profile_id, a.story_id FROM stories s \
         JOIN asset_stories a ON a.story_id = s.id WHERE s.id = 's6'",
    )
    .fetch_one(db.reader())
    .await
    .unwrap();
    assert_eq!((profile.as_deref(), member.as_str()), (Some("p6"), "s6"));

    // Deleting the connection sends the story back to the app's storyteller.
    let mut tx = db.write_txn().await.unwrap();
    sqlx::query("DELETE FROM provider_profiles WHERE id = 'p6'")
        .execute(&mut *tx)
        .await
        .unwrap();
    tx.commit().await.unwrap();
    let profile: Option<String> =
        sqlx::query_scalar("SELECT storyteller_profile_id FROM stories WHERE id = 's6'")
            .fetch_one(db.reader())
            .await
            .unwrap();
    assert_eq!(profile, None);
}

#[tokio::test]
async fn v7_fixture_upgrades_to_current() {
    let (db, _dir) = upgrade_fixture(7, include_str!("fixtures/data_v7.sql")).await;
    let links: Vec<(String, String)> = sqlx::query_as(
        "SELECT owner_type, owner_id FROM asset_links WHERE story_id = 's7' ORDER BY owner_type",
    )
    .fetch_all(db.reader())
    .await
    .unwrap();
    assert_eq!(
        links,
        [
            ("item".to_string(), "brass lantern".to_string()),
            ("story".to_string(), "s7".to_string())
        ]
    );
}

#[tokio::test]
async fn v8_fixture_upgrades_to_current() {
    let (db, _dir) = upgrade_fixture(8, include_str!("fixtures/data_v8.sql")).await;
    let options: Option<String> =
        sqlx::query_scalar("SELECT options_json FROM generation_runs WHERE id = 'run8'")
            .fetch_one(db.reader())
            .await
            .unwrap();
    assert_eq!(
        options.as_deref(),
        Some(r#"{"length":"short","hint":"more fog"}"#)
    );
}

/// Replies asked for before reply options existed are plain replies.
#[tokio::test]
async fn v1_runs_have_no_reply_options() {
    let (db, _dir) = upgrade_fixture(1, include_str!("fixtures/data_v1.sql")).await;
    let n: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM generation_runs WHERE options_json IS NOT NULL")
            .fetch_one(db.reader())
            .await
            .unwrap();
    assert_eq!(n, 0);
}

/// Pictures chosen before item pictures existed survive the rebuild of
/// asset_links, and the rebuilt table still refuses unknown owners.
#[tokio::test]
async fn v6_pictures_survive_the_item_pictures_migration() {
    let (db, _dir) = upgrade_fixture(6, include_str!("fixtures/data_v6.sql")).await;
    let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM asset_links WHERE id = 'l6'")
        .fetch_one(db.reader())
        .await
        .unwrap();
    assert_eq!(n, 1);
    let bad = sqlx::query(
        "INSERT INTO asset_links VALUES ('x', 's6', '0190a1b2-0000-7000-8000-000000000006', \
         'route', 'r6', 'cover', '2026-11-07T00:00:00.000Z')",
    )
    .execute(db.writer())
    .await;
    assert!(bad.is_err());
}

#[tokio::test]
async fn deleting_a_story_removes_its_memory() {
    let (db, _dir) = upgrade_fixture(2, include_str!("fixtures/data_v2.sql")).await;
    let mut tx = db.write_txn().await.unwrap();
    sqlx::query("DELETE FROM stories WHERE id = 's2'")
        .execute(&mut *tx)
        .await
        .unwrap();
    tx.commit().await.unwrap();
    let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM memory_caches")
        .fetch_one(db.reader())
        .await
        .unwrap();
    assert_eq!(n, 0);
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

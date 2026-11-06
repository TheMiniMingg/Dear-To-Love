use std::sync::Arc;

use super::*;
use crate::db::test_support::test_db;
use crate::services::secrets::MemoryStore;

#[test]
fn only_an_explicit_flag_with_a_path_starts_a_smoke_test() {
    let args = |a: &[&str]| parse_args(a.iter().map(|s| s.to_string()));
    assert_eq!(args(&["dear-to-love"]), None);
    assert_eq!(args(&["dear-to-love", FLAG]), None);
    assert_eq!(args(&["dear-to-love", FLAG, SEED_FLAG]), None);
    assert_eq!(args(&["dear-to-love", FLAG, ""]), None);
    assert_eq!(
        args(&["dear-to-love", FLAG, "/tmp/r.json"]),
        Some(SmokeArgs {
            report: "/tmp/r.json".into(),
            seed: false
        })
    );
    assert_eq!(
        args(&["dear-to-love", SEED_FLAG, FLAG, "C:\\r.json"]),
        Some(SmokeArgs {
            report: "C:\\r.json".into(),
            seed: true
        })
    );
}

fn ctx(t: &crate::db::test_support::TestDb, data: &Path) -> DiagnosticsContext {
    DiagnosticsContext {
        version: "0.1.0".into(),
        data_dir: Ok(data.to_path_buf()),
        db: Ok(t.db.clone()),
        secrets: Arc::new(MemoryStore::default()),
        deep: false,
    }
}

/// T49 in miniature: a first run seeds a story and a save, a backup of it
/// passes the restore checks, and a later run on the same data finds them.
#[tokio::test]
async fn seeds_then_finds_the_story_and_checks_a_backup() {
    let t = test_db().await;
    let data = t.dir.path().join("data");
    std::fs::create_dir_all(&data).unwrap();
    let scratch = t.dir.path().join("scratch");
    std::fs::create_dir_all(&scratch).unwrap();

    let first = run(ctx(&t, &data), true, true, &scratch).await;
    assert_eq!(first.errors, Vec::<String>::new());
    assert!(first.frontend);
    assert!(first.seeded_story.is_some());
    assert!(first.seed_kept);
    assert_eq!((first.stories, first.saves), (Some(1), Some(1)));
    assert_eq!(first.schema_version, t.db.schema_version().await.ok());
    assert_eq!(
        first.restore_check,
        Some(RestoreCheck {
            stories: 1,
            routes: 1,
            images: 0
        })
    );
    for id in ["APP_VERSION", "DATA_DIR", "DATABASE", "TIMELINE_REPLAY"] {
        let c = first.checks.iter().find(|c| c.id == id).unwrap();
        assert_eq!(c.status, CheckStatus::Pass, "{id}: {}", c.summary);
    }
    // The check leaves nothing behind: no backup file, no staged restore.
    assert_eq!(std::fs::read_dir(&scratch).unwrap().count(), 0);
    assert!(!data.join("restore").exists());

    let again = run(ctx(&t, &data), false, true, &scratch).await;
    assert_eq!(again.seeded_story, None);
    assert!(again.seed_kept);
    assert_eq!(again.stories, Some(1));

    let path = scratch.join("report.json");
    write_report(&path, &again).unwrap();
    let json: serde_json::Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    assert_eq!(json["seedKept"], true);
    assert_eq!(json["version"], "0.1.0");
    assert!(json["checks"]
        .as_array()
        .unwrap()
        .iter()
        .any(|c| c["id"] == "DATABASE" && c["status"] == "PASS"));
}

#[tokio::test]
async fn reports_a_missing_interface_and_database_instead_of_failing() {
    let t = test_db().await;
    let data = t.dir.path().join("data");
    std::fs::create_dir_all(&data).unwrap();
    let mut c = ctx(&t, &data);
    c.db = Err(AppError::internal("locked"));
    let r = run(c, true, false, t.dir.path()).await;
    assert!(!r.frontend);
    assert_eq!(r.seeded_story, None);
    assert_eq!(r.errors.len(), 2, "{:?}", r.errors);
    assert!(r.errors[0].contains("did not load"));
    assert_eq!(r.errors[1], "database: locked");
    assert!(!r.checks.is_empty());
}

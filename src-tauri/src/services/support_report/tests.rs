use std::sync::Arc;

use super::*;
use crate::db::stories::create_story;
use crate::db::test_support::test_db;
use crate::db::timeline::{append_event, AppendEvent};
use crate::domain::app_info::BuildProfile;
use crate::domain::events::{EventBody, PlayerPayload};
use crate::domain::story::CreateStoryInput;
use crate::domain::story_state::fixtures::lighthouse;
use crate::services::diagnostics::{run_all, DiagnosticsContext};
use crate::services::secrets::{MemoryStore, SecretStore};

fn private() -> Vec<(String, &'static str)> {
    let mut p = vec![
        (
            "/home/mira/.local/share/io.github.theminimingg.deartolove".to_string(),
            "<app data>",
        ),
        ("/home/mira".to_string(), "~"),
    ];
    p.sort_by_key(|(p, _)| std::cmp::Reverse(p.len()));
    p
}

#[test]
fn sanitize_removes_paths_keys_and_url_credentials() {
    let cases = [
        (
            "Cannot write to /home/mira/.local/share/io.github.theminimingg.deartolove/assets: denied",
            "Cannot write to <app data>/assets: denied",
        ),
        ("Backup at /home/mira/Backups/x.dtlbackup.", "Backup at <path>."),
        ("Missing (/var/lib/other/file.db)", "Missing (<path>)"),
        ("Open C:\\Users\\Mira\\story.db now", "Open <path> now"),
        ("Open ~/notes.txt", "Open <path>"),
        (
            "Rejected key sk-proj-AbC123dEf456GhI789 for \"My key\"",
            "Rejected key <redacted> for \"My key\"",
        ),
        ("header Bearer abc", "header Bearer <redacted>"),
        (
            "token ghp_16C7e42F292c6912E7710c838347Ae178B4a was refused",
            "token <redacted> was refused",
        ),
        (
            "Could not reach https://user:pw@api.example.com/v1/models?key=abc123#x",
            "Could not reach https://api.example.com/v1/models",
        ),
        (
            "Images missing: 0190f3a2-7c4e-7d1a-9b2c-3d4e5f6a7b8c.",
            "Images missing: 0190f3a2-7c4e-7d1a-9b2c-3d4e5f6a7b8c.",
        ),
        (
            "Schema version 5; foreign keys on; write test passed.",
            "Schema version 5; foreign keys on; write test passed.",
        ),
    ];
    for (input, want) in cases {
        assert_eq!(sanitize(input, &private()), want, "{input}");
    }
}

/// T50 (and T66): a report from a used install has counts and results,
/// never story titles or text, keys or paths.
#[tokio::test]
async fn report_has_counts_and_results_but_nothing_private() {
    let t = test_db().await;
    let s = create_story(
        &t.db,
        CreateStoryInput {
            title: "The Glass Orchard".into(),
            description: "A private description".into(),
            base_state: lighthouse(),
            first_chapter_title: "Frost".into(),
            chapter_outlines: vec![],
        },
    )
    .await
    .unwrap();
    append_event(
        &t.db,
        AppendEvent {
            story_id: s.story_id.clone(),
            route_id: s.main_route_id.clone(),
            expected_head_id: s.head_event_id.clone(),
            body: EventBody::Player(PlayerPayload::new(
                "I hide the brass key under the third stone.",
            )),
            generation_run_id: None,
        },
    )
    .await
    .unwrap();
    let secrets = Arc::new(MemoryStore::default());
    secrets
        .set("probe", "sk-live-0123456789abcdefghij")
        .unwrap();

    let data = t.dir.path().join("data");
    let checks = run_all(DiagnosticsContext {
        version: "0.1.0".into(),
        data_dir: Ok(data.clone()),
        db: Ok(t.db.clone()),
        secrets: secrets.clone(),
        deep: false,
    })
    .await;
    // A check that quotes a path and a key, as an error message might.
    let mut checks = checks;
    checks.push(DiagnosticCheck {
        id: "EXAMPLE".into(),
        label: "Example".into(),
        status: CheckStatus::Fail,
        summary: format!(
            "Could not read {} with key sk-live-0123456789abcdefghij",
            data.join("story.db").display()
        ),
        remediation: Some(format!("Check {}", t.dir.path().display())),
        duration_ms: 1,
        checked_at: String::new(),
    });

    let app = AppInfo {
        name: "Dear to Love".into(),
        version: "0.1.0".into(),
        os: "linux".into(),
        arch: "x86_64".into(),
        build_profile: BuildProfile::Debug,
        repository_url: "https://github.com/TheMiniMingg/Dear-To-Love".into(),
        support_url: None,
    };
    let mut private = private_paths(Some(data));
    private.push((t.dir.path().display().to_string(), "<test dir>"));
    private.sort_by_key(|(p, _)| std::cmp::Reverse(p.len()));
    let text = render(&ReportInput {
        app: &app,
        generated_at: "2026-11-06T12:00:00Z".into(),
        schema_version: t.db.schema_version().await.ok(),
        counts: counts(&t.db).await.ok(),
        updates: crate::services::updates::status(&t.db, "0.1.0").await.ok(),
        checks: &checks,
        deep: false,
        private,
    });

    assert!(text.starts_with(HEADER));
    for want in [
        "Version: v0.1.0 (linux x86_64, Debug build)",
        "Database schema: v5",
        "Stories: 1 story, 1 route, 2 events, 0 saves, 0 bookmarks, 0 images",
        "AI connections: none; 0 API requests recorded",
        "Update checks: off\n",
        "[PASS] DATABASE Story database:",
        "[SKIPPED] UPDATES Updates: Update checks are off.",
        "[FAIL] EXAMPLE Example: Could not read <app data>/story.db with key <redacted>",
        "    Fix: Check <test dir>",
    ] {
        assert!(text.contains(want), "missing {want:?} in\n{text}");
    }
    let home = std::env::var("HOME").unwrap_or_default();
    for secret in [
        "Glass Orchard",
        "private description",
        "Frost",
        "brass key",
        "sk-live",
        t.dir.path().to_str().unwrap(),
    ] {
        assert!(!text.contains(secret), "{secret:?} leaked:\n{text}");
    }
    if home.len() > 1 {
        assert!(!text.contains(&home), "home path leaked:\n{text}");
    }
}

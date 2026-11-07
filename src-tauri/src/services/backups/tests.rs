use super::*;
use crate::db::assets as rows;
use crate::db::stories::{create_story, list_stories};
use crate::db::test_support::{test_db, TestDb};
use crate::db::timeline::{append_event, route_history, AppendEvent};
use crate::domain::events::{EventBody, PlayerPayload};
use crate::domain::story::{CreateStoryInput, StoryCreated};
use crate::domain::story_state::fixtures::lighthouse;
use crate::domain::visuals::VisualSlot;
use crate::services::assets::{check, import_bytes, sha256_hex, AssetStore};
use image::{ImageFormat, Rgb, RgbImage};
use std::io::{Cursor, Read};

fn png(shade: u8) -> Vec<u8> {
    let img = RgbImage::from_pixel(64, 48, Rgb([shade, 40, 90]));
    let mut out = Vec::new();
    img.write_to(&mut Cursor::new(&mut out), ImageFormat::Png)
        .unwrap();
    out
}

async fn story(t: &TestDb, title: &str) -> StoryCreated {
    let s = create_story(
        &t.db,
        CreateStoryInput {
            title: title.into(),
            description: String::new(),
            base_state: lighthouse(),
            first_chapter_title: "The Stairs".into(),
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
            body: EventBody::Player(PlayerPayload::new(format!("I open {title}."))),
            generation_run_id: None,
        },
    )
    .await
    .unwrap();
    s
}

/// A story with a cover picture.
async fn pictured(t: &TestDb, title: &str, shade: u8) -> (StoryCreated, String) {
    let s = story(t, title).await;
    let img = import_bytes(
        &t.db,
        &AssetStore::new(t.dir.path()),
        png(shade),
        title,
        &crate::db::assets::ImportScope::Shared,
    )
    .await
    .unwrap()
    .asset
    .id;
    rows::set_story_visual(&t.db, &s.story_id, &VisualSlot::Cover, Some(&img))
        .await
        .unwrap();
    (s, img)
}

async fn titles(db: &Database) -> Vec<String> {
    let mut t: Vec<String> = list_stories(db)
        .await
        .unwrap()
        .into_iter()
        .map(|s| s.title)
        .collect();
    t.sort();
    t
}

async fn reopen(t: &TestDb) -> Database {
    Database::open(
        &t.dir.path().join(DB_FILE_NAME),
        &t.dir.path().join(BACKUPS_DIR),
    )
    .await
    .unwrap()
    .0
}

fn leftovers(data_dir: &Path) -> bool {
    data_dir.join(RESTORE_DIR).exists() || data_dir.join(MARKER).exists()
}

/// Automatic backups: only when something changed, at most daily, newest
/// five kept; other kinds of backup are never pruned.
#[tokio::test]
async fn automatic_backups_are_daily_after_changes_and_keep_five() {
    let t = test_db().await;
    let dir = t.dir.path();
    let start = Utc::now() - chrono::Duration::days(10);
    assert_eq!(
        auto_backup_if_due(&t.db, dir, start).await.unwrap(),
        None,
        "nothing to back up"
    );

    story(&t, "Lamp").await;
    // Older kinds sit next to the automatic ones and are left alone.
    fs::create_dir_all(dir.join(BACKUPS_DIR)).unwrap();
    fs::write(
        dir.join(BACKUPS_DIR)
            .join("pre-migration-v2-20200101T000000Z.db"),
        b"x",
    )
    .unwrap();
    fs::write(dir.join(BACKUPS_DIR).join("notes.txt"), b"x").unwrap();

    let first = auto_backup_if_due(&t.db, dir, start)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(first.kind, BackupKind::Automatic);
    assert!(first.id.starts_with("auto/auto-"));
    let soon = start + chrono::Duration::hours(23);
    assert_eq!(
        auto_backup_if_due(&t.db, dir, soon).await.unwrap(),
        None,
        "once a day"
    );

    for day in 1..=6 {
        let at = start + chrono::Duration::hours(25 * day);
        assert!(
            auto_backup_if_due(&t.db, dir, at).await.unwrap().is_some(),
            "day {day}"
        );
    }
    let all = list_backups(dir).unwrap();
    let autos: Vec<&BackupInfo> = all
        .iter()
        .filter(|b| b.kind == BackupKind::Automatic)
        .collect();
    assert_eq!(autos.len(), AUTO_KEEP);
    assert!(
        autos.windows(2).all(|w| w[0].created_at > w[1].created_at),
        "newest first"
    );
    assert!(!autos.iter().any(|b| b.id == first.id), "the oldest went");
    assert!(all.iter().any(|b| b.kind == BackupKind::BeforeUpgrade));
    assert_eq!(all.len(), AUTO_KEEP + 1);
    let parts = fs::read_dir(dir.join(BACKUPS_DIR).join(AUTO_DIR))
        .unwrap()
        .filter(|e| {
            e.as_ref()
                .unwrap()
                .file_name()
                .to_string_lossy()
                .ends_with(".part")
        })
        .count();
    assert_eq!(parts, 0);

    // The copy is a healthy database with the story in it.
    let path = dir.join(BACKUPS_DIR).join(&autos[0].id);
    check_backup_file(&path).await.unwrap();
    let mut conn = read_only(&path).await.unwrap();
    assert_eq!(contents(&mut conn).await.unwrap().stories, 1);
}

#[tokio::test]
async fn no_backup_without_a_change_since_the_last_one() {
    let t = test_db().await;
    let dir = t.dir.path();
    story(&t, "Lamp").await;
    let at = Utc::now() + chrono::Duration::seconds(1);
    auto_backup_if_due(&t.db, dir, at).await.unwrap().unwrap();
    // A day later, nothing changed since `at`.
    let next = at + chrono::Duration::hours(25);
    assert_eq!(auto_backup_if_due(&t.db, dir, next).await.unwrap(), None);
}

type Entries = Vec<(String, Vec<u8>)>;

fn zip_entries(path: &Path) -> Entries {
    let mut zip = ZipArchive::new(File::open(path).unwrap()).unwrap();
    (0..zip.len())
        .map(|i| {
            let mut e = zip.by_index(i).unwrap();
            let mut buf = Vec::new();
            e.read_to_end(&mut buf).unwrap();
            (e.name().unwrap().to_string(), buf)
        })
        .collect()
}

fn write_zip(path: &Path, entries: &[(String, Vec<u8>)]) {
    let mut zip = ZipWriter::new(File::create(path).unwrap());
    for (name, bytes) in entries {
        zip.start_file(name.as_str(), SimpleFileOptions::default())
            .unwrap();
        zip.write_all(bytes).unwrap();
    }
    zip.finish().unwrap();
}

/// Replaces one file and updates the manifest to match, so only the
/// content is wrong.
fn resign(
    mut entries: Vec<(String, Vec<u8>)>,
    name: &str,
    bytes: Vec<u8>,
) -> Vec<(String, Vec<u8>)> {
    let mut m: BackupManifest = serde_json::from_slice(&entries[0].1).unwrap();
    m.files.insert(
        name.into(),
        PackFile {
            sha256: sha256_hex(&bytes),
            size: bytes.len() as u64,
        },
    );
    entries[0].1 = serde_json::to_vec(&m).unwrap();
    match entries.iter_mut().find(|(n, _)| n == name) {
        Some(e) => e.1 = bytes,
        None => entries.push((name.into(), bytes)),
    }
    entries
}

/// T35: back up everything, restore into a fresh install, and get every
/// story and image back; then go back with the "before restore" copy.
#[tokio::test]
async fn back_up_everything_then_restore_into_a_fresh_install() {
    let a = test_db().await;
    let (lamp, img) = pictured(&a, "Lamp", 10).await;
    story(&a, "Ferry").await;
    let file = a.dir.path().join("everything.dtlbackup");
    let done = export_backup(&a.db, a.dir.path(), "0.1.0", &file)
        .await
        .unwrap();
    assert_eq!((done.stories, done.images, done.missing_images), (2, 1, 0));
    assert_eq!(done.file_name, "everything.dtlbackup");
    let names: Vec<String> = zip_entries(&file).into_iter().map(|(n, _)| n).collect();
    assert_eq!(names[0], MANIFEST);
    assert_eq!(names[1], DB_FILE_NAME);
    assert!(names.iter().any(|n| n.starts_with("assets/originals/")));
    assert!(names.iter().any(|n| n.starts_with("assets/thumbs/")));
    assert_eq!(names.len(), 4);
    assert!(!fs::read_dir(a.dir.path().join(BACKUPS_DIR))
        .unwrap()
        .any(|e| e
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with(".export")));

    let b = test_db().await;
    story(&b, "Other").await;
    let source = RestoreSource::File {
        path: file.display().to_string(),
    };
    let plan = prepare_restore(b.dir.path(), &source, &Limits::default())
        .await
        .unwrap();
    assert_eq!(
        (
            plan.stories,
            plan.images,
            plan.missing_images,
            plan.upgraded
        ),
        (2, 1, 0, false)
    );
    assert_eq!(plan.app_version.as_deref(), Some("0.1.0"));
    assert_eq!(
        titles(&b.db).await,
        ["Other"],
        "nothing changes before confirming"
    );

    let before = confirm_restore(&b.db, b.dir.path(), &plan.token)
        .await
        .unwrap();
    assert_eq!(before.kind, BackupKind::BeforeRestore);
    b.db.close().await;

    // Next start.
    let result = apply_pending_restore(b.dir.path()).unwrap();
    assert!(result.ok, "{:?}", result.message);
    assert_eq!(result.source, "everything.dtlbackup");
    assert!(!leftovers(b.dir.path()));
    let db = reopen(&b).await;
    assert_eq!(titles(&db).await, ["Ferry", "Lamp"]);
    assert_eq!(
        route_history(&db, &lamp.main_route_id).await.unwrap(),
        route_history(&a.db, &lamp.main_route_id).await.unwrap()
    );
    assert_eq!(
        rows::story_visuals(&db, &lamp.story_id).await.unwrap()[0].asset_id,
        img
    );
    let report = check(&db, &AssetStore::new(b.dir.path()), true)
        .await
        .unwrap();
    assert_eq!(report.images, 1);
    assert!(report.missing.is_empty() && report.damaged.is_empty() && report.dangling.is_empty());
    assert_eq!(contract::verify(&db).await.unwrap(), Vec::<String>::new());
    assert_eq!(take_restore_result(b.dir.path()), Some(result));
    assert_eq!(take_restore_result(b.dir.path()), None, "shown once");

    // Changed your mind: the "before restore" copy brings "Other" back.
    let plan = prepare_restore(
        b.dir.path(),
        &RestoreSource::Kept {
            id: before.id.clone(),
        },
        &Limits::default(),
    )
    .await
    .unwrap();
    assert_eq!((plan.stories, plan.missing_images), (1, 0));
    assert_eq!(plan.source, "Backup from before a restore");
    confirm_restore(&db, b.dir.path(), &plan.token)
        .await
        .unwrap();
    db.close().await;
    assert!(apply_pending_restore(b.dir.path()).unwrap().ok);
    let db = reopen(&b).await;
    assert_eq!(titles(&db).await, ["Other"]);
    // The restored story's image stays in the library folder (harmless).
    assert_eq!(
        fs::read_dir(b.dir.path().join("assets/originals"))
            .unwrap()
            .count(),
        1
    );
}

/// An interrupted swap finishes on the following start; an unconfirmed
/// restore is simply dropped.
#[tokio::test]
async fn interrupted_restore_finishes_on_the_next_start() {
    let a = test_db().await;
    pictured(&a, "Lamp", 20).await;
    let file = a.dir.path().join("all.dtlbackup");
    export_backup(&a.db, a.dir.path(), "0.1.0", &file)
        .await
        .unwrap();
    let source = RestoreSource::File {
        path: file.display().to_string(),
    };

    for stop in [Step::ImagesPlaced, Step::OldLogRemoved] {
        let b = test_db().await;
        story(&b, "Other").await;
        let plan = prepare_restore(b.dir.path(), &source, &Limits::default())
            .await
            .unwrap();
        confirm_restore(&b.db, b.dir.path(), &plan.token)
            .await
            .unwrap();
        b.db.close().await;
        // A stale log from the old database must never reach the new one.
        fs::write(b.dir.path().join("story.db-wal"), b"old log").unwrap();

        assert_eq!(apply_until(b.dir.path(), Some(stop)), None, "{stop:?}");
        assert!(b.dir.path().join(MARKER).exists(), "still pending");
        let result = apply_pending_restore(b.dir.path()).unwrap();
        assert!(result.ok, "{stop:?}: {:?}", result.message);
        assert!(!b.dir.path().join("story.db-wal").exists());
        assert!(!leftovers(b.dir.path()));
        let db = reopen(&b).await;
        assert_eq!(titles(&db).await, ["Lamp"], "{stop:?}");
        assert_eq!(contract::verify(&db).await.unwrap(), Vec::<String>::new());
        db.close().await;
    }

    // Prepared, never confirmed: the next start drops it.
    let b = test_db().await;
    story(&b, "Other").await;
    prepare_restore(b.dir.path(), &source, &Limits::default())
        .await
        .unwrap();
    assert!(b.dir.path().join(RESTORE_DIR).exists());
    assert_eq!(apply_pending_restore(b.dir.path()), None);
    assert!(!leftovers(b.dir.path()));
    assert_eq!(titles(&b.db).await, ["Other"]);

    // And cancelling clears it straight away.
    let plan = prepare_restore(b.dir.path(), &source, &Limits::default())
        .await
        .unwrap();
    cancel_restore(b.dir.path()).unwrap();
    assert!(!leftovers(b.dir.path()));
    assert!(confirm_restore(&b.db, b.dir.path(), &plan.token)
        .await
        .is_err());
}

/// Damaged, foreign or newer backups are refused before anything changes.
#[tokio::test]
async fn damaged_backups_are_refused_and_change_nothing() {
    let a = test_db().await;
    pictured(&a, "Lamp", 30).await;
    let good = a.dir.path().join("good.dtlbackup");
    export_backup(&a.db, a.dir.path(), "0.1.0", &good)
        .await
        .unwrap();
    let base = zip_entries(&good);
    let image = base
        .iter()
        .find(|(n, _)| n.starts_with("assets/originals/"))
        .unwrap()
        .clone();

    // A database from a newer app: one migration this app doesn't know.
    let newer_db = {
        let p = a.dir.path().join("newer.db");
        fs::write(&p, &base[1].1).unwrap();
        let mut c = SqliteConnectOptions::new()
            .filename(&p)
            .connect()
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO _sqlx_migrations (version, description, success, checksum, execution_time) \
             VALUES (9999, 'future', 1, x'00', 0)",
        )
        .execute(&mut c)
        .await
        .unwrap();
        c.close().await.unwrap();
        fs::read(&p).unwrap()
    };

    let mut m: BackupManifest = serde_json::from_slice(&base[0].1).unwrap();
    m.format_version = FORMAT_VERSION + 1;
    let mut newer_format = base.clone();
    newer_format[0].1 = serde_json::to_vec(&m).unwrap();

    let mut m: BackupManifest = serde_json::from_slice(&base[0].1).unwrap();
    m.app = "Something else".into();
    let mut foreign = base.clone();
    foreign[0].1 = serde_json::to_vec(&m).unwrap();

    let mut tampered = base.clone();
    let len = tampered[1].1.len();
    tampered[1].1[len / 2] ^= 0xff;

    let mut extra = base.clone();
    extra.push(("../../escape.db".into(), b"x".to_vec()));

    let swapped_image = resign(base.clone(), &image.0, png(99));
    let mut garbage = vec![0u8; 8192];
    garbage[..16].copy_from_slice(b"SQLite format 3\0");

    let cases: Vec<(&str, Entries, &str)> = vec![
        (
            "newer format",
            newer_format,
            "newer version of Dear to Love",
        ),
        (
            "newer database",
            resign(base.clone(), DB_FILE_NAME, newer_db),
            "newer version of Dear to Love",
        ),
        ("not ours", foreign, "not made by Dear to Love"),
        ("changed database", tampered, "doesn't match its checksum"),
        ("path traversal", extra, "unexpected file"),
        ("image renamed", swapped_image, "doesn't match its checksum"),
        (
            "broken database",
            resign(base.clone(), DB_FILE_NAME, garbage),
            "can't be opened",
        ),
        (
            "no database",
            base.iter()
                .filter(|(n, _)| n != DB_FILE_NAME)
                .cloned()
                .collect(),
            "is missing",
        ),
    ];
    let b = test_db().await;
    story(&b, "Other").await;
    let dir = tempfile::tempdir().unwrap();
    for (i, (name, entries, expect)) in cases.into_iter().enumerate() {
        let path = dir.path().join(format!("{i}.dtlbackup"));
        write_zip(&path, &entries);
        let err = prepare_restore(
            b.dir.path(),
            &RestoreSource::File {
                path: path.display().to_string(),
            },
            &Limits::default(),
        )
        .await
        .expect_err(name);
        assert_eq!(
            err.code,
            ErrorCode::ArchiveInvalid,
            "{name}: {}",
            err.message
        );
        assert!(err.message.contains(expect), "{name}: {}", err.message);
        assert!(!leftovers(b.dir.path()), "{name}");
    }
    let path = dir.path().join("text.dtlbackup");
    fs::write(&path, b"hello").unwrap();
    let err = prepare_restore(
        b.dir.path(),
        &RestoreSource::File {
            path: path.display().to_string(),
        },
        &Limits::default(),
    )
    .await
    .unwrap_err();
    assert!(
        err.message.contains("not a Dear to Love backup"),
        "{}",
        err.message
    );
    let err = prepare_restore(
        b.dir.path(),
        &RestoreSource::Kept {
            id: "../story.db".into(),
        },
        &Limits::default(),
    )
    .await
    .unwrap_err();
    assert_eq!(err.code, ErrorCode::NotFound);
    let small = Limits {
        max_image_bytes: 10,
        ..Limits::default()
    };
    let err = prepare_restore(
        b.dir.path(),
        &RestoreSource::File {
            path: good.display().to_string(),
        },
        &small,
    )
    .await
    .unwrap_err();
    assert!(
        err.message.contains("larger than allowed"),
        "{}",
        err.message
    );

    assert_eq!(titles(&b.db).await, ["Other"]);
    assert!(!leftovers(b.dir.path()));
    assert!(!b.dir.path().join("escape.db").exists());
}

/// A backup from an older version is upgraded while it is checked.
#[tokio::test]
async fn older_backups_are_upgraded_when_checked() {
    let t = test_db().await;
    let old = t
        .dir
        .path()
        .join(BACKUPS_DIR)
        .join("pre-migration-v3-20260101T000000Z.db");
    fs::create_dir_all(old.parent().unwrap()).unwrap();
    let (db, _) = Database::open_with(
        &t.dir.path().join("v3.db"),
        &t.dir.path().join("b3"),
        &crate::db::MIGRATOR,
        Some(3),
    )
    .await
    .unwrap();
    vacuum_into(db.reader(), &old).await.unwrap();
    db.close().await;
    let plan = prepare_restore(
        t.dir.path(),
        &RestoreSource::Kept {
            id: "pre-migration-v3-20260101T000000Z.db".into(),
        },
        &Limits::default(),
    )
    .await
    .unwrap();
    assert!(plan.upgraded);
    assert_eq!(plan.created_at, "2026-01-01T00:00:00.000Z");
    cancel_restore(t.dir.path()).unwrap();
}

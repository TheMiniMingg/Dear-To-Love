use super::*;
use crate::db::assets as rows;
use crate::db::contract;
use crate::db::memory::{insert_summary, latest_eligible_summary, NewSummary};
use crate::db::saves::{create_save, list_saves};
use crate::db::stories::{create_story, list_stories};
use crate::db::test_support::{test_db, TestDb};
use crate::db::timeline::{
    ancestors, append_event, fork_route, list_routes, route_history, AppendEvent,
};
use crate::domain::events::{AssistantPayload, CheckpointPayload, EditPayload, PlayerPayload};
use crate::domain::story::{ChapterOutlineInput, CreateStoryInput, StoryCreated};
use crate::domain::story_state::fixtures::lighthouse;
use crate::services::assets::import_bytes;
use image::{ImageFormat, Rgb, RgbImage};
use std::io::Cursor;

fn png(w: u32, h: u32, shade: u8) -> Vec<u8> {
    let img = RgbImage::from_pixel(w, h, Rgb([shade, 40, 90]));
    let mut out = Vec::new();
    img.write_to(&mut Cursor::new(&mut out), ImageFormat::Png)
        .unwrap();
    out
}

async fn head(db: &Database, story: &str, route: &str) -> String {
    list_routes(db, story)
        .await
        .unwrap()
        .into_iter()
        .find(|r| r.id == route)
        .unwrap()
        .head_event_id
        .unwrap()
}

async fn push(db: &Database, story: &str, route: &str, body: EventBody) -> String {
    let head = head(db, story, route).await;
    append_event(
        db,
        AppendEvent {
            story_id: story.into(),
            route_id: route.into(),
            expected_head_id: head,
            body,
            generation_run_id: None,
        },
    )
    .await
    .unwrap()
    .event_id
}

async fn turn(db: &Database, story: &str, route: &str, act: &str, reply: &str) -> String {
    push(
        db,
        story,
        route,
        EventBody::Player(PlayerPayload { text: act.into() }),
    )
    .await;
    push(
        db,
        story,
        route,
        EventBody::Assistant(AssistantPayload {
            text: reply.into(),
            finish_reason: None,
            provider_label: Some("Test".into()),
            model_id: None,
        }),
    )
    .await
}

fn picture(slot: &str, asset_id: &str) -> EventBody {
    EventBody::Edit(EditPayload {
        changes: vec![StateEdit::SetVisualRef {
            slot: slot.into(),
            asset_id: Some(asset_id.into()),
        }],
        note: Some("Background".into()),
    })
}

/// Two routes, a save on each, a story summary (and a stale one), a cover
/// default and a background chosen on the second route only.
struct Rich {
    story: StoryCreated,
    alt: String,
    image: String,
}

async fn rich_story(t: &TestDb) -> Rich {
    let store = AssetStore::new(t.dir.path());
    let image = import_bytes(&t.db, &store, png(300, 200, 3), "Harbor")
        .await
        .unwrap()
        .asset
        .id;
    let story = create_story(
        &t.db,
        CreateStoryInput {
            title: "The Lamp Room".into(),
            description: "Someone keeps lighting the lamp.".into(),
            base_state: lighthouse(),
            first_chapter_title: "The Stairs".into(),
            chapter_outlines: vec![
                ChapterOutlineInput {
                    title: "The Stairs".into(),
                    outline: "Climb up.".into(),
                },
                ChapterOutlineInput {
                    title: "The Ferry".into(),
                    outline: "Meet Mara.".into(),
                },
            ],
        },
    )
    .await
    .unwrap();
    let (sid, main) = (story.story_id.clone(), story.main_route_id.clone());
    rows::set_story_visual(&t.db, &sid, &VisualSlot::Cover, Some(&image))
        .await
        .unwrap();
    let first = turn(&t.db, &sid, &main, "I climb the stairs.", "The lamp hums.").await;
    let alt = fork_route(&t.db, &sid, &main, &first, Some("Docks".into()))
        .await
        .unwrap()
        .id;
    turn(&t.db, &sid, &main, "I call out.", "Nobody answers.").await;
    push(
        &t.db,
        &sid,
        &main,
        EventBody::Checkpoint(CheckpointPayload {
            label: "Top of the stairs".into(),
        }),
    )
    .await;
    push(&t.db, &sid, &alt, picture("background", &image)).await;
    turn(&t.db, &sid, &alt, "I walk to the docks.", "Mara waves.").await;
    create_save(&t.db, &sid, &main, "Before the lamp")
        .await
        .unwrap();
    create_save(&t.db, &sid, &alt, "At the docks")
        .await
        .unwrap();

    // A summary of main's first turn, and one whose hash no longer matches.
    let chain = {
        let mut c = t.db.reader().acquire().await.unwrap();
        ancestors(&mut c, &sid, &first).await.unwrap()
    };
    let hash = chain_hash(&chain);
    for (end, hash, text) in [
        (first.as_str(), hash.as_str(), "Wren climbed the stairs."),
        (chain[0].id.as_str(), "stale", "Out of date."),
    ] {
        insert_summary(
            &t.db,
            NewSummary {
                story_id: &sid,
                source_start_event_id: None,
                source_end_event_id: end,
                source_hash: hash,
                text,
                covered_turns: 1,
                generator: "test",
                api_request_id: None,
            },
        )
        .await
        .unwrap();
    }
    Rich { story, alt, image }
}

fn pack_path(t: &TestDb) -> PathBuf {
    t.dir.path().join("The Lamp Room.storypack")
}

async fn export(t: &TestDb, story_id: &str) -> (PathBuf, StorypackExport) {
    let dest = pack_path(t);
    let done = export_storypack(
        &t.db,
        &AssetStore::new(t.dir.path()),
        "0.1.0",
        story_id,
        &dest,
    )
    .await
    .unwrap();
    (dest, done)
}

/// Route history and state with ids replaced by their order, so two copies
/// of one story compare equal.
async fn route_shape(db: &Database, route_id: &str) -> (Vec<serde_json::Value>, String) {
    let history = route_history(db, route_id).await.unwrap();
    let state = crate::db::state::route_state(db, route_id).await.unwrap();
    let mut json = serde_json::to_string(&state.effective).unwrap();
    let mut events = Vec::new();
    for (i, e) in history.iter().enumerate() {
        json = json.replace(&e.id, &format!("E{i}"));
        let mut body = serde_json::to_value(&e.body).unwrap();
        if let Some(o) = body.get_mut("payload").and_then(|p| p.as_object_mut()) {
            o.remove("chapterInstanceId");
            o.remove("sourceOutlineId");
            if let Some(changes) = o.get_mut("changes").and_then(|c| c.as_array_mut()) {
                for c in changes {
                    c.as_object_mut().unwrap().remove("assetId");
                }
            }
        }
        events.push(body);
    }
    for (slot, asset) in &state.effective.state.visual_refs {
        json = json.replace(asset, &format!("IMG:{slot}"));
    }
    (events, json)
}

fn zip_names(path: &Path) -> Vec<String> {
    let mut zip = ZipArchive::new(File::open(path).unwrap()).unwrap();
    (0..zip.len())
        .map(|i| zip.by_index(i).unwrap().name().unwrap().to_string())
        .collect()
}

fn leftovers(data_dir: &Path) -> Vec<String> {
    let mut out = Vec::new();
    for dir in [
        data_dir.join(IMPORTS_DIR),
        data_dir.join("assets").join("tmp"),
    ] {
        if let Ok(d) = fs::read_dir(&dir) {
            out.extend(d.map(|e| e.unwrap().path().display().to_string()));
        }
    }
    out
}

async fn ops(db: &Database) -> Vec<(String, Option<String>)> {
    sqlx::query_as("SELECT status, story_id FROM archive_operations ORDER BY created_at")
        .fetch_all(db.reader())
        .await
        .unwrap()
}

/// Every asset row's files are on disk.
async fn rows_have_files(db: &Database, data_dir: &Path) {
    let store = AssetStore::new(data_dir);
    for a in rows::all_rows(db).await.unwrap() {
        assert!(store.path(&a.original_rel).unwrap().is_file(), "{}", a.id);
        if let Some(thumb) = &a.thumb_rel {
            assert!(store.path(thumb).unwrap().is_file(), "{}", a.id);
        }
    }
}

/// T32: export, import into a fresh install, and get the same story back:
/// every route's history and state, saves, summaries and pictures.
#[tokio::test]
async fn storypack_round_trips_into_a_fresh_install() {
    let t = test_db().await;
    let r = rich_story(&t).await;
    let (path, done) = export(&t, &r.story.story_id).await;
    assert_eq!((done.routes, done.images, done.missing_images), (2, 1, 0));
    assert_eq!(done.file_name, "The Lamp Room.storypack");

    // Only the story: no keys, connections, usage, logs or paths (T66).
    let names = zip_names(&path);
    assert_eq!(names.len(), 3, "{names:?}");
    assert_eq!(&names[..2], [MANIFEST, STORY]);
    assert!(names[2].starts_with(IMAGES_DIR) && names[2].ends_with(".png"));
    let raw = String::from_utf8_lossy(&fs::read(&path).unwrap()).into_owned();
    let home = t.dir.path().display().to_string();
    assert!(!raw.contains(&home), "no absolute paths in the pack");
    let parent = t.dir.path().parent().unwrap().display().to_string();
    assert!(!raw.contains(&parent));

    let fresh = test_db().await;
    let got = import_storypack(&fresh.db, fresh.dir.path(), &path)
        .await
        .unwrap();
    assert_eq!(got.title, "The Lamp Room");
    assert_eq!((got.routes, got.images_added, got.images_reused), (2, 1, 0));
    assert_ne!(got.story_id, r.story.story_id);

    let before = list_routes(&t.db, &r.story.story_id).await.unwrap();
    let after = list_routes(&fresh.db, &got.story_id).await.unwrap();
    assert_eq!(after.len(), 2);
    for old in &before {
        let new = after.iter().find(|n| n.label == old.label).unwrap();
        assert_ne!(new.id, old.id, "new ids");
        assert_eq!(new.is_main, old.is_main);
        assert_eq!(
            route_shape(&fresh.db, &new.id).await,
            route_shape(&t.db, &old.id).await,
            "route {}",
            old.label
        );
    }
    let docks = after.iter().find(|n| n.label == "Docks").unwrap();
    let main = after.iter().find(|n| n.is_main).unwrap();
    assert_eq!(main.id, got.main_route_id);
    assert_eq!(
        docks.parent_route_id.as_deref(),
        Some(main.id.as_str()),
        "the branch keeps its parent"
    );

    // The background chosen on Docks points at the imported image.
    let new_image = rows::by_sha(&fresh.db, &rows::get(&t.db, &r.image).await.unwrap().sha256)
        .await
        .unwrap()
        .unwrap()
        .id;
    let docks_state = crate::db::state::route_state(&fresh.db, &docks.id)
        .await
        .unwrap();
    assert_eq!(
        docks_state.effective.state.visual_refs.get("background"),
        Some(&new_image)
    );
    let defaults = rows::story_visuals(&fresh.db, &got.story_id).await.unwrap();
    assert_eq!(defaults.len(), 1);
    assert_eq!(
        (defaults[0].slot.as_str(), defaults[0].asset_id.as_str()),
        ("cover", new_image.as_str())
    );
    rows_have_files(&fresh.db, fresh.dir.path()).await;

    let saves = |db: Database, story: String| async move {
        let mut v: Vec<(String, String, String)> = list_saves(&db, &story)
            .await
            .unwrap()
            .into_iter()
            .map(|s| (s.route_label, s.label, s.save_type))
            .collect();
        v.sort();
        v
    };
    let imported = saves(fresh.db.clone(), got.story_id.clone()).await;
    assert_eq!(
        imported,
        saves(t.db.clone(), r.story.story_id.clone()).await
    );
    assert!(imported.contains(&("Docks".into(), "At the docks".into(), "manual".into())));

    // The summary still matches its (renamed) events; the stale one stayed behind.
    let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM memory_caches WHERE story_id = ?")
        .bind(&got.story_id)
        .fetch_one(fresh.db.reader())
        .await
        .unwrap();
    assert_eq!(n, 1);
    let mut c = fresh.db.reader().acquire().await.unwrap();
    let chain = ancestors(&mut c, &got.story_id, main.head_event_id.as_ref().unwrap())
        .await
        .unwrap();
    let summary = latest_eligible_summary(&mut c, &got.story_id, &chain)
        .await
        .unwrap()
        .expect("summary usable after import");
    assert_eq!(summary.row.summary_text, "Wren climbed the stairs.");
    drop(c);

    assert_eq!(
        contract::verify(&fresh.db).await.unwrap(),
        Vec::<String>::new()
    );
    assert_eq!(
        ops(&fresh.db).await,
        [("complete".to_string(), Some(got.story_id.clone()))]
    );
    assert!(leftovers(fresh.dir.path()).is_empty());
    assert_eq!(list_stories(&fresh.db).await.unwrap().len(), 1);
}

/// T32: the same pack imported twice gives two independent stories that
/// share one copy of each image.
#[tokio::test]
async fn importing_twice_gives_independent_stories_sharing_images() {
    let t = test_db().await;
    let r = rich_story(&t).await;
    let (path, _) = export(&t, &r.story.story_id).await;

    let a = import_storypack(&t.db, t.dir.path(), &path).await.unwrap();
    let b = import_storypack(&t.db, t.dir.path(), &path).await.unwrap();
    assert_eq!((a.images_added, a.images_reused), (0, 1));
    assert_eq!((b.images_added, b.images_reused), (0, 1));
    assert_ne!(a.story_id, b.story_id);
    assert_eq!(rows::list(&t.db).await.unwrap().len(), 1);
    let originals = fs::read_dir(t.dir.path().join("assets/originals"))
        .unwrap()
        .count();
    assert_eq!(originals, 1);
    assert_eq!(list_stories(&t.db).await.unwrap().len(), 3);

    // Playing on one copy leaves the others alone.
    let before = route_history(&t.db, &b.main_route_id).await.unwrap();
    turn(
        &t.db,
        &a.story_id,
        &a.main_route_id,
        "I leave.",
        "The door shuts.",
    )
    .await;
    assert_eq!(
        route_history(&t.db, &b.main_route_id).await.unwrap(),
        before
    );
    assert_eq!(
        route_history(&t.db, &r.story.main_route_id)
            .await
            .unwrap()
            .len(),
        before.len()
    );
    let ids =
        |h: Vec<crate::db::timeline::EventDto>| h.into_iter().map(|e| e.id).collect::<HashSet<_>>();
    let shared: Vec<_> = ids(route_history(&t.db, &a.main_route_id).await.unwrap())
        .intersection(&ids(before))
        .cloned()
        .collect();
    assert!(shared.is_empty(), "no event ids shared between copies");

    // The image stays while any copy shows it.
    assert!(rows::delete(&t.db, &r.image).await.is_err());
    assert_eq!(contract::verify(&t.db).await.unwrap(), Vec::<String>::new());
    assert!(leftovers(t.dir.path()).is_empty());
}

/// A picture whose file is gone is left out of the pack, not a failure.
#[tokio::test]
async fn export_leaves_out_missing_image_files() {
    let t = test_db().await;
    let r = rich_story(&t).await;
    let a = rows::get(&t.db, &r.image).await.unwrap();
    let store = AssetStore::new(t.dir.path());
    fs::remove_file(store.path(&a.original_rel).unwrap()).unwrap();
    let (path, done) = export(&t, &r.story.story_id).await;
    assert_eq!((done.images, done.missing_images), (0, 1));
    assert_eq!(zip_names(&path), [MANIFEST, STORY]);

    let fresh = test_db().await;
    let got = import_storypack(&fresh.db, fresh.dir.path(), &path)
        .await
        .unwrap();
    assert_eq!(got.images_added, 0);
    assert!(rows::story_visuals(&fresh.db, &got.story_id)
        .await
        .unwrap()
        .is_empty());
    let docks = list_routes(&fresh.db, &got.story_id)
        .await
        .unwrap()
        .into_iter()
        .find(|r| r.label == "Docks")
        .unwrap();
    let state = crate::db::state::route_state(&fresh.db, &docks.id)
        .await
        .unwrap();
    assert!(
        state.effective.state.visual_refs.is_empty(),
        "no picture points at an image this install doesn't have"
    );
    assert!(rows::dangling_refs(&fresh.db).await.unwrap().is_empty());
}

// ------------------------------------------------------------- T33

/// The entries of a real pack, to tamper with.
type Entries = Vec<(String, Vec<u8>)>;

fn entries(path: &Path) -> Entries {
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
    let opts = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    for (name, bytes) in entries {
        zip.start_file(name.as_str(), opts).unwrap();
        zip.write_all(bytes).unwrap();
    }
    zip.finish().unwrap();
}

fn manifest_of(entries: &[(String, Vec<u8>)]) -> Manifest {
    serde_json::from_slice(&entries[0].1).unwrap()
}

fn with_manifest(mut entries: Vec<(String, Vec<u8>)>, m: &Manifest) -> Vec<(String, Vec<u8>)> {
    entries[0].1 = serde_json::to_vec(m).unwrap();
    entries
}

/// Re-signs a changed story so only its content is wrong.
fn with_story(entries: Vec<(String, Vec<u8>)>, story: &PackStory) -> Vec<(String, Vec<u8>)> {
    let bytes = serde_json::to_vec(story).unwrap();
    let mut m = manifest_of(&entries);
    m.files.insert(
        STORY.into(),
        PackFile {
            sha256: sha256_hex(&bytes),
            size: bytes.len() as u64,
        },
    );
    let mut e = with_manifest(entries, &m);
    e[1].1 = bytes;
    e
}

/// T33: damaged or malicious packs are refused before the database or the
/// library change, and nothing is left behind.
#[tokio::test]
async fn damaged_and_malicious_packs_change_nothing() {
    let src = test_db().await;
    let r = rich_story(&src).await;
    let (good, _) = export(&src, &r.story.story_id).await;
    let base = entries(&good);
    let story: PackStory = serde_json::from_slice(&base[1].1).unwrap();
    let image = base[2].0.clone();

    let mut cases: Vec<(String, Entries, &str)> = Vec::new();
    let mut add = |name: &str, extra: (String, Vec<u8>), expect: &'static str| {
        let mut e = base.clone();
        e.push(extra);
        cases.push((name.to_string(), e, expect));
    };
    add(
        "path traversal",
        ("../../escape.txt".into(), b"x".to_vec()),
        "unexpected file",
    );
    add(
        "traversal inside images",
        ("images/../../../escape.png".into(), b"x".to_vec()),
        "unexpected file",
    );
    add(
        "absolute path",
        ("/tmp/escape.png".into(), b"x".to_vec()),
        "unexpected file",
    );
    add(
        "unexpected file",
        ("notes.txt".into(), b"hello".to_vec()),
        "unexpected file",
    );
    add(
        "unlisted image",
        (format!("images/{}.png", "a".repeat(64)), png(4, 4, 1)),
        "doesn't list",
    );

    let mut tampered = base.clone();
    tampered[1].1[10] ^= 1;
    cases.push((
        "changed story".into(),
        tampered,
        "doesn't match its checksum",
    ));

    let mut swapped = base.clone();
    swapped[2].1 = png(300, 200, 99);
    cases.push((
        "changed image".into(),
        swapped,
        "doesn't match its checksum",
    ));

    let mut m = manifest_of(&base);
    m.format_version = FORMAT_VERSION + 1;
    cases.push((
        "newer format".into(),
        with_manifest(base.clone(), &m),
        "newer version of Dear to Love",
    ));

    let mut m = manifest_of(&base);
    m.files.insert(
        format!("images/{}.png", "b".repeat(64)),
        PackFile {
            sha256: "0".repeat(64),
            size: 1,
        },
    );
    cases.push((
        "listed but missing".into(),
        with_manifest(base.clone(), &m),
        "is missing",
    ));

    cases.push(("no manifest".into(), base[1..].to_vec(), "has no manifest"));

    let mut s = story.clone();
    s.events[3].parent_event_id = Some("nowhere".into());
    cases.push((
        "broken event chain".into(),
        with_story(base.clone(), &s),
        "unknown event",
    ));

    let mut s = story.clone();
    for r in &mut s.routes {
        r.is_main = true;
    }
    cases.push((
        "two main routes".into(),
        with_story(base.clone(), &s),
        "one main route",
    ));

    let mut s = story.clone();
    s.routes[1].head_event_id = "nowhere".into();
    cases.push((
        "unknown head".into(),
        with_story(base.clone(), &s),
        "unknown event",
    ));

    let mut s = story.clone();
    s.saves[0].event_id = s.events.last().unwrap().id.clone();
    let main = s.routes.iter().position(|r| r.is_main).unwrap();
    s.saves[0].route_id = s.routes[main].id.clone();
    cases.push((
        "save off its route".into(),
        with_story(base.clone(), &s),
        "outside its route",
    ));

    let mut story_json: serde_json::Value = serde_json::from_slice(&base[1].1).unwrap();
    story_json["apiKey"] = "sk-test".into();
    let mut e = base.clone();
    let bytes = serde_json::to_vec(&story_json).unwrap();
    let mut m = manifest_of(&e);
    m.files.insert(
        STORY.into(),
        PackFile {
            sha256: sha256_hex(&bytes),
            size: bytes.len() as u64,
        },
    );
    e = with_manifest(e, &m);
    e[1].1 = bytes;
    cases.push(("unknown fields".into(), e, "story is unreadable"));

    let mut s = story.clone();
    s.images[0].mime = "image/webp".into();
    let mut e = with_story(base.clone(), &s);
    let webp = image.replace(".png", ".webp");
    let mut m = manifest_of(&e);
    let f = m.files.remove(&image).unwrap();
    m.files.insert(webp.clone(), f);
    e = with_manifest(e, &m);
    e[2].0 = webp;
    cases.push((
        "image not what it claims".into(),
        e,
        "not the type it claims",
    ));

    let t = test_db().await;
    let dir = tempfile::tempdir().unwrap();
    for (i, (name, e, expect)) in cases.into_iter().enumerate() {
        let path = dir.path().join(format!("{i}.storypack"));
        write_zip(&path, &e);
        let err = import_storypack(&t.db, t.dir.path(), &path)
            .await
            .expect_err(&name);
        assert_eq!(
            err.code,
            ErrorCode::ArchiveInvalid,
            "{name}: {}",
            err.message
        );
        assert!(err.message.contains(expect), "{name}: {}", err.message);
    }

    // Not a ZIP at all.
    let path = dir.path().join("notes.storypack");
    fs::write(&path, b"just some text").unwrap();
    let err = import_storypack(&t.db, t.dir.path(), &path)
        .await
        .unwrap_err();
    assert!(err.message.contains("not a storypack"), "{}", err.message);

    // A symlink entry.
    let path = dir.path().join("link.storypack");
    {
        let mut zip = ZipWriter::new(File::create(&path).unwrap());
        zip.add_symlink(image.as_str(), "/etc/passwd", SimpleFileOptions::default())
            .unwrap();
        zip.finish().unwrap();
    }
    let err = import_storypack(&t.db, t.dir.path(), &path)
        .await
        .unwrap_err();
    assert!(err.message.contains("unexpected file"), "{}", err.message);

    // A small file that unpacks huge (a "ZIP bomb") stops at the limit.
    let path = dir.path().join("bomb.storypack");
    let mut e = base.clone();
    e[1].1 = vec![b' '; 4 * 1024 * 1024];
    write_zip(&path, &e);
    assert!(fs::metadata(&path).unwrap().len() < 64 * 1024);
    let small = Limits {
        max_story_bytes: 1024 * 1024,
        ..Limits::default()
    };
    let err = import_with(&t.db, t.dir.path(), &path, &small, None)
        .await
        .unwrap_err();
    assert!(
        err.message.contains("larger than allowed"),
        "{}",
        err.message
    );
    let tiny_total = Limits {
        max_total_bytes: 2048,
        ..Limits::default()
    };
    let err = import_with(&t.db, t.dir.path(), &good, &tiny_total, None)
        .await
        .unwrap_err();
    assert!(
        err.message.contains("larger than allowed"),
        "{}",
        err.message
    );
    let few = Limits {
        max_entries: 2,
        ..Limits::default()
    };
    let err = import_with(&t.db, t.dir.path(), &good, &few, None)
        .await
        .unwrap_err();
    assert!(err.message.contains("too many files"), "{}", err.message);

    // Nothing changed anywhere.
    assert!(list_stories(&t.db).await.unwrap().is_empty());
    assert!(rows::all_rows(&t.db).await.unwrap().is_empty());
    assert!(ops(&t.db).await.is_empty());
    assert!(leftovers(t.dir.path()).is_empty());
    assert!(!t.dir.path().join("assets/originals").exists());
    assert!(!dir.path().join("escape.txt").exists());

    // And the good pack still imports.
    import_storypack(&t.db, t.dir.path(), &good).await.unwrap();
    assert_eq!(list_stories(&t.db).await.unwrap().len(), 1);
}

// ------------------------------------------------------------- T34

/// T34: an import interrupted at any step leaves either no story or the
/// whole story after the startup check, with no row pointing at a missing
/// file and nothing left in the staging folders.
#[tokio::test]
async fn interrupted_imports_recover_to_all_or_nothing() {
    let src = test_db().await;
    let r = rich_story(&src).await;
    let (path, _) = export(&src, &r.story.story_id).await;

    for phase in [
        Phase::Checked,
        Phase::Recorded,
        Phase::FilesPlaced,
        Phase::Committed,
    ] {
        let t = test_db().await;
        let err = import_with(&t.db, t.dir.path(), &path, &Limits::default(), Some(phase))
            .await
            .unwrap_err();
        assert!(err.message.contains("simulated"), "{phase:?}");
        // Until recovery runs, a half-finished import never shows.
        assert!(list_stories(&t.db).await.unwrap().is_empty(), "{phase:?}");
        rows_have_files(&t.db, t.dir.path()).await;

        // Restart.
        let db_path = t.db.path().to_path_buf();
        t.db.close().await;
        let (db, _) = Database::open(&db_path, &t.dir.path().join("backups"))
            .await
            .unwrap();
        let rec = recover_imports(&db, t.dir.path()).await.unwrap();
        let stories = list_stories(&db).await.unwrap();
        match phase {
            Phase::Checked => {
                assert_eq!(rec, Recovered::default());
                assert!(stories.is_empty());
                assert!(ops(&db).await.is_empty());
            }
            Phase::Recorded | Phase::FilesPlaced => {
                assert_eq!(
                    rec,
                    Recovered {
                        rolled_back: 1,
                        finished: 0
                    },
                    "{phase:?}"
                );
                assert!(stories.is_empty(), "{phase:?}");
                assert_eq!(ops(&db).await[0].0, "rolled_back");
                assert!(rows::all_rows(&db).await.unwrap().is_empty());
            }
            Phase::Committed => {
                assert_eq!(
                    rec,
                    Recovered {
                        rolled_back: 0,
                        finished: 1
                    }
                );
                assert_eq!(stories.len(), 1);
                let routes = list_routes(&db, &stories[0].id).await.unwrap();
                assert_eq!(routes.len(), 2);
                assert_eq!(ops(&db).await[0].0, "complete");
            }
        }
        assert_eq!(
            contract::verify(&db).await.unwrap(),
            Vec::<String>::new(),
            "{phase:?}"
        );
        assert!(leftovers(t.dir.path()).is_empty(), "{phase:?}");
        rows_have_files(&db, t.dir.path()).await;

        // A second recovery does nothing, and importing again works.
        assert_eq!(
            recover_imports(&db, t.dir.path()).await.unwrap(),
            Recovered::default()
        );
        import_storypack(&db, t.dir.path(), &path).await.unwrap();
        let expected = if phase == Phase::Committed { 2 } else { 1 };
        assert_eq!(
            list_stories(&db).await.unwrap().len(),
            expected,
            "{phase:?}"
        );
        rows_have_files(&db, t.dir.path()).await;
    }
}

// ------------------------------------------------------------- T36

/// T36: a route as Markdown keeps chapter order, who said what, and notes.
#[tokio::test]
async fn route_text_is_ordered_and_labelled() {
    let t = test_db().await;
    let r = rich_story(&t).await;
    let (sid, main) = (&r.story.story_id, &r.story.main_route_id);
    push(
        &t.db,
        sid,
        main,
        EventBody::Player(PlayerPayload {
            text: "# not a heading\n\n> nor a quote".into(),
        }),
    )
    .await;
    push(
        &t.db,
        sid,
        main,
        EventBody::Assistant(AssistantPayload {
            text: "First line.\n\nSecond paragraph.".into(),
            finish_reason: None,
            provider_label: None,
            model_id: None,
        }),
    )
    .await;
    let at = head(&t.db, sid, main).await;
    crate::db::timeline::next_chapter(&t.db, sid, main, &at, None)
        .await
        .unwrap();
    turn(&t.db, sid, main, "I board the ferry.", "Mara casts off.").await;

    let (md, info) = route_text(&t.db, main, TextFormat::Markdown, false)
        .await
        .unwrap();
    assert_eq!((info.chapters, info.turns), (2, 8));
    let order = [
        "# The Lamp Room\n",
        "Route: Main · Exported ",
        "## Chapter 1: The Stairs",
        "**Wren**: I climb the stairs.",
        "**Storyteller**: The lamp hums.",
        "**Wren**: I call out.",
        "**Storyteller**: Nobody answers.",
        "*Checkpoint: Top of the stairs*",
        "**Wren**: \\# not a heading\n\n\\> nor a quote",
        "**Storyteller**: First line.\n\nSecond paragraph.",
        "## Chapter 2: The Ferry",
        "**Wren**: I board the ferry.",
        "**Storyteller**: Mara casts off.",
    ];
    let mut at = 0;
    for part in order {
        let found = md[at..]
            .find(part)
            .unwrap_or_else(|| panic!("{part:?} missing or out of order in:\n{md}"));
        at += found + part.len();
    }
    assert!(!md.contains("Docks"), "only this route");
    assert!(!md.contains("Mara waves"), "only this route");

    // The other route shows its picture change as a note.
    let (alt, _) = route_text(&t.db, &r.alt, TextFormat::Markdown, false)
        .await
        .unwrap();
    assert!(alt.contains("*Picture changed: Background.*"), "{alt}");
    assert!(alt.contains("Route: Docks"));

    // Plain text, with times, to a file.
    let dest = t.dir.path().join("lamp.txt");
    let info = export_route_text(&t.db, main, TextFormat::Text, true, &dest)
        .await
        .unwrap();
    assert_eq!(info.file_name, "lamp.txt");
    let txt = fs::read_to_string(&dest).unwrap();
    assert!(txt.starts_with("The Lamp Room\n=============\n"), "{txt}");
    assert!(
        txt.contains("Chapter 1: The Stairs\n---------------------\n"),
        "{txt}"
    );
    assert!(txt.contains(" UTC): I climb the stairs."), "{txt}");
    assert!(txt.contains("[Checkpoint: Top of the stairs]"));
    assert!(!txt.contains("**"));
    let parts: Vec<_> = fs::read_dir(t.dir.path())
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .filter(|n| n.ends_with(".part"))
        .collect();
    assert!(parts.is_empty(), "{parts:?}");
}

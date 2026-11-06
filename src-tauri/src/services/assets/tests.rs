use super::*;
use crate::db::assets as rows;
use crate::db::stories::{create_story, delete_story};
use crate::db::test_support::{test_db, TestDb};
use crate::db::timeline::{append_event, fork_route, set_route_hidden, AppendEvent};
use crate::domain::events::{EditPayload, EventBody, PlayerPayload, StateEdit};
use crate::domain::story::{CreateStoryInput, StoryCreated};
use crate::domain::story_state::fixtures::lighthouse;
use crate::domain::visuals::VisualSlot;
use image::{Rgb, RgbImage, Rgba, RgbaImage};

fn png(w: u32, h: u32, shade: u8) -> Vec<u8> {
    let img = RgbImage::from_pixel(w, h, Rgb([shade, 40, 90]));
    let mut out = Vec::new();
    img.write_to(&mut Cursor::new(&mut out), ImageFormat::Png)
        .unwrap();
    out
}

fn transparent_png(w: u32, h: u32) -> Vec<u8> {
    let img = RgbaImage::from_pixel(w, h, Rgba([10, 20, 30, 0]));
    let mut out = Vec::new();
    img.write_to(&mut Cursor::new(&mut out), ImageFormat::Png)
        .unwrap();
    out
}

fn jpeg(w: u32, h: u32) -> Vec<u8> {
    let img = RgbImage::from_pixel(w, h, Rgb([200, 120, 40]));
    let mut out = Vec::new();
    JpegEncoder::new_with_quality(&mut out, 90)
        .encode_image(&img)
        .unwrap();
    out
}

async fn story(t: &TestDb, title: &str) -> StoryCreated {
    create_story(
        &t.db,
        CreateStoryInput {
            title: title.into(),
            description: String::new(),
            base_state: lighthouse(),
            first_chapter_title: "The Lamp".into(),
            chapter_outlines: vec![],
        },
    )
    .await
    .unwrap()
}

fn files(dir: &Path) -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(dir)
        .map(|d| {
            d.filter_map(|e| e.ok())
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .collect()
        })
        .unwrap_or_default();
    names.sort();
    names
}

fn store(t: &TestDb) -> AssetStore {
    AssetStore::new(t.dir.path())
}

#[test]
fn decode_reads_real_bytes_and_makes_small_thumbnails() {
    let d = decode(&png(1000, 500, 1)).unwrap();
    assert_eq!(
        (d.mime, d.ext, d.width, d.height),
        ("image/png", "png", 1000, 500)
    );
    let thumb = image::load_from_memory(&d.thumb).unwrap();
    assert_eq!((thumb.width(), thumb.height()), (320, 160));
    assert_eq!(d.thumb_ext, "jpg", "opaque pictures get a JPEG thumbnail");

    let d = decode(&transparent_png(40, 30)).unwrap();
    assert_eq!(d.thumb_ext, "png", "transparency is kept");
    let thumb = image::load_from_memory(&d.thumb).unwrap();
    assert_eq!(
        (thumb.width(), thumb.height()),
        (40, 30),
        "small images are not enlarged"
    );

    let d = decode(&jpeg(64, 64)).unwrap();
    assert_eq!((d.mime, d.ext), ("image/jpeg", "jpg"));
}

#[test]
fn decode_refuses_disguised_damaged_and_oversized_files() {
    let svg = br#"<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>"#;
    for bad in [&b"just some text"[..], &svg[..], &b""[..]] {
        let e = decode(bad).err().unwrap();
        assert!(e.message.contains("PNG, JPEG or WebP"), "{}", e.message);
    }
    let mut truncated = png(200, 200, 3);
    truncated.truncate(truncated.len() / 2);
    assert!(decode(&truncated).is_err());

    // A tiny file that claims to be enormous is refused before decoding.
    let huge = {
        let img = image::GrayImage::new(MAX_SIDE + 1, 1);
        let mut out = Vec::new();
        img.write_to(&mut Cursor::new(&mut out), ImageFormat::Png)
            .unwrap();
        out
    };
    let e = decode(&huge).err().unwrap();
    assert!(e.message.contains("too large"), "{}", e.message);
}

/// T30: the same image twice keeps one file; story links stay independent.
#[tokio::test]
async fn same_image_twice_is_stored_once_and_links_stay_independent() {
    let t = test_db().await;
    let s = store(&t);
    let bytes = png(600, 400, 7);
    let first = import_bytes(&t.db, &s, bytes.clone(), "Harbor")
        .await
        .unwrap();
    let second = import_bytes(&t.db, &s, bytes, "Harbor again")
        .await
        .unwrap();
    assert!(!first.already_in_library);
    assert!(second.already_in_library);
    assert_eq!(first.asset.id, second.asset.id);
    assert_eq!(first.asset.label, "Harbor");
    assert_eq!(files(&s.root().join("originals")).len(), 1);
    assert_eq!(files(&s.root().join("thumbs")).len(), 1);
    assert!(
        files(&s.root().join("tmp")).is_empty(),
        "no temp files left"
    );
    assert_eq!(rows::list(&t.db).await.unwrap().len(), 1);

    let a = story(&t, "A").await;
    let b = story(&t, "B").await;
    let id = first.asset.id.as_str();
    rows::set_story_visual(&t.db, &a.story_id, &VisualSlot::Cover, Some(id))
        .await
        .unwrap();
    rows::set_story_visual(&t.db, &b.story_id, &VisualSlot::Background, Some(id))
        .await
        .unwrap();
    rows::set_story_visual(&t.db, &a.story_id, &VisualSlot::Cover, None)
        .await
        .unwrap();
    assert!(rows::story_visuals(&t.db, &a.story_id)
        .await
        .unwrap()
        .is_empty());
    let kept = rows::story_visuals(&t.db, &b.story_id).await.unwrap();
    assert_eq!(kept.len(), 1);
    assert_eq!(
        (kept[0].slot.as_str(), kept[0].asset_id.as_str()),
        ("background", id)
    );
    assert!(load(&t.db, &s, id, Size::Full).await.unwrap().is_some());
}

/// T31: a picture an older, hidden route once showed can't be deleted.
#[tokio::test]
async fn image_in_any_history_cannot_be_deleted() {
    let t = test_db().await;
    let s = store(&t);
    let img = import_bytes(&t.db, &s, png(50, 50, 9), "Storm")
        .await
        .unwrap()
        .asset;
    let st = story(&t, "Lamp").await;

    // Alt route shows it for one turn, then moves on and is hidden.
    let alt = fork_route(
        &t.db,
        &st.story_id,
        &st.main_route_id,
        &st.head_event_id,
        None,
    )
    .await
    .unwrap();
    let edit = append_event(
        &t.db,
        AppendEvent {
            story_id: st.story_id.clone(),
            route_id: alt.id.clone(),
            expected_head_id: st.head_event_id.clone(),
            body: EventBody::Edit(EditPayload {
                changes: vec![StateEdit::SetVisualRef {
                    slot: "background".into(),
                    asset_id: Some(img.id.clone()),
                }],
                note: None,
            }),
            generation_run_id: None,
        },
    )
    .await
    .unwrap();
    let cleared = append_event(
        &t.db,
        AppendEvent {
            story_id: st.story_id.clone(),
            route_id: alt.id.clone(),
            expected_head_id: edit.event_id.clone(),
            body: EventBody::Edit(EditPayload {
                changes: vec![StateEdit::SetVisualRef {
                    slot: "background".into(),
                    asset_id: None,
                }],
                note: None,
            }),
            generation_run_id: None,
        },
    )
    .await
    .unwrap();
    append_event(
        &t.db,
        AppendEvent {
            story_id: st.story_id.clone(),
            route_id: alt.id.clone(),
            expected_head_id: cleared.event_id,
            body: EventBody::Player(PlayerPayload {
                text: "Walk on".into(),
            }),
            generation_run_id: None,
        },
    )
    .await
    .unwrap();
    set_route_hidden(&t.db, &st.story_id, &alt.id, true)
        .await
        .unwrap();

    let mut conn = t.db.reader().acquire().await.unwrap();
    let used = rows::usages(&mut conn, &img.id).await.unwrap();
    drop(conn);
    assert_eq!(used.len(), 1);
    assert!(used[0].in_history);
    assert_eq!(used[0].place, format!("Background on route {}", alt.label));

    let e = delete(&t.db, &s, &img.id).await.err().unwrap();
    assert_eq!(e.code, ErrorCode::InvalidInput);
    assert!(e.message.contains("still used"), "{}", e.message);
    assert!(load(&t.db, &s, &img.id, Size::Thumb)
        .await
        .unwrap()
        .is_some());

    // Once the story itself is gone, nothing shows the image any more.
    delete_story(&t.db, &st.story_id).await.unwrap();
    delete(&t.db, &s, &img.id).await.unwrap();
    assert!(files(&s.root().join("originals")).is_empty());
    assert!(files(&s.root().join("thumbs")).is_empty());
    assert!(load(&t.db, &s, &img.id, Size::Full)
        .await
        .unwrap()
        .is_none());
}

#[tokio::test]
async fn story_defaults_block_delete_and_name_the_character() {
    let t = test_db().await;
    let s = store(&t);
    let img = import_bytes(&t.db, &s, jpeg(30, 30), "Mara")
        .await
        .unwrap()
        .asset;
    let st = story(&t, "Lamp").await;
    let slot = VisualSlot::parse("portrait:npc-mara").unwrap();
    rows::set_story_visual(&t.db, &st.story_id, &slot, Some(&img.id))
        .await
        .unwrap();
    let mut conn = t.db.reader().acquire().await.unwrap();
    let used = rows::usages(&mut conn, &img.id).await.unwrap();
    drop(conn);
    assert_eq!(used.len(), 1);
    assert!(!used[0].in_history);
    assert!(
        used[0].place.starts_with("Portrait of "),
        "{}",
        used[0].place
    );
    assert!(used[0].place.ends_with("(story default)"));
    assert!(delete(&t.db, &s, &img.id).await.is_err());

    rows::set_story_visual(&t.db, &st.story_id, &slot, None)
        .await
        .unwrap();
    delete(&t.db, &s, &img.id).await.unwrap();

    let e = rows::set_story_visual(&t.db, &st.story_id, &slot, Some(&img.id))
        .await
        .err()
        .unwrap();
    assert_eq!(e.code, ErrorCode::AssetMissing);
}

#[tokio::test]
async fn files_over_the_limit_are_refused_before_reading() {
    let t = test_db().await;
    let path = t.dir.path().join("huge.png");
    let f = std::fs::File::create(&path).unwrap();
    f.set_len(MAX_IMAGE_BYTES + 1).unwrap();
    let e = import_file(&t.db, &store(&t), &path).await.err().unwrap();
    assert!(e.message.contains("larger than 20 MB"), "{}", e.message);

    let ok = t.dir.path().join("Ferry at dusk.png");
    std::fs::write(&ok, png(10, 10, 1)).unwrap();
    let got = import_file(&t.db, &store(&t), &ok).await.unwrap();
    assert_eq!(got.asset.label, "Ferry at dusk");
}

#[tokio::test]
async fn health_check_finds_missing_files_and_reimport_repairs_them() {
    let t = test_db().await;
    let s = store(&t);
    let bytes = png(20, 20, 4);
    let img = import_bytes(&t.db, &s, bytes.clone(), "x")
        .await
        .unwrap()
        .asset;
    assert_eq!(check(&t.db, &s, true).await.unwrap().missing.len(), 0);

    for name in files(&s.root().join("originals")) {
        std::fs::remove_file(s.root().join("originals").join(name)).unwrap();
    }
    let report = check(&t.db, &s, false).await.unwrap();
    assert_eq!(report.missing, vec![img.id.clone()]);
    assert!(load(&t.db, &s, &img.id, Size::Full)
        .await
        .unwrap()
        .is_none());

    import_bytes(&t.db, &s, bytes, "x").await.unwrap();
    assert!(check(&t.db, &s, true).await.unwrap().missing.is_empty());
}

#[test]
fn store_paths_stay_inside_the_assets_folder() {
    let s = AssetStore::new(Path::new("/data"));
    assert!(s.path("originals/abc.png").is_ok());
    for bad in [
        "../story.db",
        "originals/../../x",
        "originals/.hidden",
        "tmp/a.png",
        "abc",
    ] {
        assert!(s.path(bad).is_err(), "{bad}");
    }
}

use super::*;
use crate::db::assets as rows;
use crate::db::assets::ImportScope;
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

/// A moving GIF of `frames` frames, each a different colour.
fn gif(w: u32, h: u32, frames: u8) -> Vec<u8> {
    use image::codecs::gif::{GifEncoder, Repeat};
    use image::{Delay, Frame};
    let mut out = Vec::new();
    {
        let mut enc = GifEncoder::new(&mut out);
        enc.set_repeat(Repeat::Infinite).unwrap();
        for i in 0..frames {
            let img = RgbaImage::from_pixel(w, h, Rgba([i.wrapping_mul(60), 90, 160, 255]));
            enc.encode_frame(Frame::from_parts(
                img,
                0,
                0,
                Delay::from_numer_denom_ms(100, 1),
            ))
            .unwrap();
        }
    }
    out
}

#[tokio::test]
async fn a_moving_gif_is_kept_whole_with_a_still_thumbnail() {
    let t = test_db().await;
    let s = store(&t);
    let bytes = gif(400, 300, 3);
    let d = decode(&bytes).unwrap();
    assert_eq!(
        (d.mime, d.ext, d.width, d.height),
        ("image/gif", "gif", 400, 300)
    );
    assert!(d.thumb_ext == "png" || d.thumb_ext == "jpg");

    let made = import_bytes(&t.db, &s, bytes.clone(), "Fireflies", &ImportScope::Shared)
        .await
        .unwrap();
    assert_eq!(made.asset.mime, "image/gif");
    // The original is the same bytes, so every frame is still there.
    let (mime, full) = load(&t.db, &s, &made.asset.id, Size::Full)
        .await
        .unwrap()
        .unwrap();
    assert_eq!((mime.as_str(), full), ("image/gif", bytes));
    let (thumb_mime, _) = load(&t.db, &s, &made.asset.id, Size::Thumb)
        .await
        .unwrap()
        .unwrap();
    assert_ne!(thumb_mime, "image/gif", "the thumbnail is a still picture");
}

#[test]
fn decode_refuses_disguised_damaged_and_oversized_files() {
    let svg = br#"<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>"#;
    for bad in [&b"just some text"[..], &svg[..], &b""[..]] {
        let e = decode(bad).err().unwrap();
        assert!(
            e.message.contains("PNG, JPEG, WebP or GIF"),
            "{}",
            e.message
        );
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
    let first = import_bytes(&t.db, &s, bytes.clone(), "Harbor", &ImportScope::Shared)
        .await
        .unwrap();
    let second = import_bytes(&t.db, &s, bytes, "Harbor again", &ImportScope::Shared)
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
    let img = import_bytes(&t.db, &s, png(50, 50, 9), "Storm", &ImportScope::Shared)
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
            body: EventBody::Player(PlayerPayload::new("Walk on")),
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
    let img = import_bytes(&t.db, &s, jpeg(30, 30), "Mara", &ImportScope::Shared)
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

/// An inventory item's picture is a story default like a portrait, and it
/// keeps its image from being deleted.
#[tokio::test]
async fn an_item_picture_is_saved_for_the_story() {
    let t = test_db().await;
    let s = store(&t);
    let img = import_bytes(&t.db, &s, png(30, 30, 90), "Potion", &ImportScope::Shared)
        .await
        .unwrap()
        .asset;
    let st = story(&t, "Lamp").await;
    let slot = VisualSlot::parse("item:healing draught").unwrap();
    rows::set_story_visual(&t.db, &st.story_id, &slot, Some(&img.id))
        .await
        .unwrap();
    let visuals = rows::story_visuals(&t.db, &st.story_id).await.unwrap();
    assert!(visuals
        .iter()
        .any(|v| v.slot == "item:healing draught" && v.asset_id == img.id));
    let mut conn = t.db.reader().acquire().await.unwrap();
    let used = rows::usages(&mut conn, &img.id).await.unwrap();
    drop(conn);
    assert_eq!(used.len(), 1);
    assert!(delete(&t.db, &s, &img.id).await.is_err());
    rows::set_story_visual(&t.db, &st.story_id, &slot, None)
        .await
        .unwrap();
    assert!(rows::story_visuals(&t.db, &st.story_id)
        .await
        .unwrap()
        .iter()
        .all(|v| !v.slot.starts_with("item:")));
}

#[tokio::test]
async fn files_over_the_limit_are_refused_before_reading() {
    let t = test_db().await;
    let path = t.dir.path().join("huge.png");
    let f = std::fs::File::create(&path).unwrap();
    f.set_len(MAX_IMAGE_BYTES + 1).unwrap();
    let e = import_file(&t.db, &store(&t), &path, &ImportScope::Shared)
        .await
        .err()
        .unwrap();
    assert!(e.message.contains("larger than 20 MB"), "{}", e.message);

    let ok = t.dir.path().join("Ferry at dusk.png");
    std::fs::write(&ok, png(10, 10, 1)).unwrap();
    let got = import_file(&t.db, &store(&t), &ok, &ImportScope::Shared)
        .await
        .unwrap();
    assert_eq!(got.asset.label, "Ferry at dusk");
}

#[tokio::test]
async fn health_check_finds_missing_files_and_reimport_repairs_them() {
    let t = test_db().await;
    let s = store(&t);
    let bytes = png(20, 20, 4);
    let img = import_bytes(&t.db, &s, bytes.clone(), "x", &ImportScope::Shared)
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

    import_bytes(&t.db, &s, bytes, "x", &ImportScope::Shared)
        .await
        .unwrap();
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

/// Pictures for one story stay in that story; shared ones show everywhere.
#[tokio::test]
async fn story_only_images_stay_in_their_story() {
    let t = test_db().await;
    let s = store(&t);
    let a = story(&t, "A").await;
    let b = story(&t, "B").await;
    let mine = import_bytes(
        &t.db,
        &s,
        png(12, 12, 1),
        "Mine",
        &ImportScope::Story(a.story_id.clone()),
    )
    .await
    .unwrap()
    .asset;
    assert!(!mine.shared);
    assert_eq!(
        mine.stories
            .iter()
            .map(|x| x.title.as_str())
            .collect::<Vec<_>>(),
        vec!["A"]
    );
    let all = import_bytes(&t.db, &s, png(12, 12, 2), "All", &ImportScope::Shared)
        .await
        .unwrap()
        .asset;
    assert!(all.shared && all.stories.is_empty());

    // Story A can show it; story B can't, as a default or on a route.
    rows::set_story_visual(&t.db, &a.story_id, &VisualSlot::Cover, Some(&mine.id))
        .await
        .unwrap();
    let e = rows::set_story_visual(&t.db, &b.story_id, &VisualSlot::Cover, Some(&mine.id))
        .await
        .unwrap_err();
    assert!(e.message.contains("another story"), "{}", e.message);
    let e = crate::services::reader::edit_details(
        &t.db,
        &b.story_id,
        &b.main_route_id,
        &b.head_event_id,
        vec![StateEdit::SetVisualRef {
            slot: "background".into(),
            asset_id: Some(mine.id.clone()),
        }],
        None,
    )
    .await
    .unwrap_err();
    assert!(e.message.contains("another story"), "{}", e.message);
    rows::set_story_visual(&t.db, &b.story_id, &VisualSlot::Cover, Some(&all.id))
        .await
        .unwrap();

    // The same picture added for story B too: it belongs to both.
    let again = import_bytes(
        &t.db,
        &s,
        png(12, 12, 1),
        "Mine",
        &ImportScope::Story(b.story_id.clone()),
    )
    .await
    .unwrap();
    assert!(again.already_in_library && !again.asset.shared);
    assert_eq!(again.asset.stories.len(), 2);
    // Added for all stories: it is shared from now on.
    let shared = import_bytes(&t.db, &s, png(12, 12, 1), "Mine", &ImportScope::Shared)
        .await
        .unwrap()
        .asset;
    assert!(shared.shared && shared.stories.is_empty());
    // A shared picture added "for this story" stays shared.
    let still = import_bytes(
        &t.db,
        &s,
        png(12, 12, 2),
        "All",
        &ImportScope::Story(a.story_id.clone()),
    )
    .await
    .unwrap()
    .asset;
    assert!(still.shared);
}

/// Making a picture story-only keeps it in every story that shows it.
#[tokio::test]
async fn keeping_a_picture_for_one_story_keeps_it_where_it_is_used() {
    let t = test_db().await;
    let s = store(&t);
    let a = story(&t, "A").await;
    let b = story(&t, "B").await;
    let img = import_bytes(&t.db, &s, png(12, 12, 3), "Fog", &ImportScope::Shared)
        .await
        .unwrap()
        .asset;
    rows::set_story_visual(&t.db, &b.story_id, &VisualSlot::Background, Some(&img.id))
        .await
        .unwrap();
    let only = rows::set_scope(&t.db, &img.id, Some(&a.story_id))
        .await
        .unwrap();
    assert!(!only.shared);
    assert_eq!(
        only.stories
            .iter()
            .map(|x| x.title.as_str())
            .collect::<Vec<_>>(),
        vec!["A", "B"]
    );
    let back = rows::set_scope(&t.db, &img.id, None).await.unwrap();
    assert!(back.shared && back.stories.is_empty());
    assert!(rows::set_scope(&t.db, &img.id, Some("no-such-story"))
        .await
        .is_err());
}

/// A story-only picture outlives its story: it waits in "Not in any story".
#[tokio::test]
async fn deleting_a_story_keeps_its_own_pictures_in_no_story() {
    let t = test_db().await;
    let s = store(&t);
    let a = story(&t, "A").await;
    let img = import_bytes(
        &t.db,
        &s,
        png(12, 12, 4),
        "Keep",
        &ImportScope::Story(a.story_id.clone()),
    )
    .await
    .unwrap()
    .asset;
    delete_story(&t.db, &a.story_id).await.unwrap();
    let list = rows::list(&t.db).await.unwrap();
    let got = list.iter().find(|x| x.id == img.id).unwrap();
    assert!(!got.shared && got.stories.is_empty());
    // Nothing shows it, so it can be deleted.
    delete(&t.db, &s, &img.id).await.unwrap();
}

/// Pictures, story-only images and the storyteller picked in the wizard are
/// saved with the new story.
#[tokio::test]
async fn a_new_story_keeps_the_pictures_picked_while_creating_it() {
    use crate::db::stories::create_story_with;
    use crate::domain::draft::{CreateStoryDraft, DraftPicture};
    use crate::domain::provider::StorytellerChoice;

    let t = test_db().await;
    let s = store(&t);
    let own = import_bytes(&t.db, &s, png(12, 12, 5), "Me", &ImportScope::NewStory)
        .await
        .unwrap()
        .asset;
    assert!(
        !own.shared && own.stories.is_empty(),
        "in no story until it is made"
    );
    let cover = import_bytes(&t.db, &s, png(12, 12, 6), "Cover", &ImportScope::Shared)
        .await
        .unwrap()
        .asset;

    let draft_named = |title: &str, setting: &str, name: &str, place: &str| {
        let mut d = CreateStoryDraft {
            title: title.into(),
            first_chapter_title: "Arrival".into(),
            ..CreateStoryDraft::default()
        };
        d.world.setting = setting.into();
        d.player.name = name.into();
        d.scene.location = place.into();
        d
    };
    let mut draft = draft_named("Harbor", "A small coastal town", "Wren", "The pier");
    draft.pictures = vec![
        DraftPicture {
            slot: "cover".into(),
            asset_id: cover.id.clone(),
        },
        DraftPicture {
            slot: "portrait:@player".into(),
            asset_id: own.id.clone(),
        },
        DraftPicture {
            slot: "portrait:gone".into(),
            asset_id: own.id.clone(),
        },
    ];
    draft.story_images = vec![own.id.clone()];
    draft.storyteller = Some(StorytellerChoice::Offline);
    let setup = draft.setup().unwrap();
    assert_eq!(
        setup.pictures.len(),
        2,
        "the portrait of a removed character is left out"
    );
    let created = create_story_with(&t.db, draft.into_story_input().unwrap(), &setup)
        .await
        .unwrap();

    let visuals = rows::story_visuals(&t.db, &created.story_id).await.unwrap();
    let mut slots: Vec<String> = visuals.iter().map(|v| v.slot.clone()).collect();
    slots.sort();
    assert_eq!(
        slots,
        vec!["cover".to_string(), "portrait:custom:player".to_string()]
    );
    let list = rows::list(&t.db).await.unwrap();
    let got = list.iter().find(|x| x.id == own.id).unwrap();
    assert_eq!(got.stories.len(), 1);
    assert_eq!(got.stories[0].id, created.story_id);
    assert!(list.iter().find(|x| x.id == cover.id).unwrap().shared);
    let info = crate::services::reader::story_storyteller_info(&t.db, &created.story_id)
        .await
        .unwrap();
    assert_eq!(info.story_choice, Some(StorytellerChoice::Offline));

    // Another story's own picture can't be used in a new story.
    let mut other = draft_named("Other", "A big city", "Sam", "A rooftop");
    other.pictures = vec![DraftPicture {
        slot: "background".into(),
        asset_id: own.id.clone(),
    }];
    let setup = other.setup().unwrap();
    let e = create_story_with(&t.db, other.into_story_input().unwrap(), &setup)
        .await
        .unwrap_err();
    assert!(e.message.contains("another story"), "{}", e.message);
    assert_eq!(
        crate::db::stories::list_stories(&t.db).await.unwrap().len(),
        1,
        "nothing is saved when a picture is refused"
    );
}

/// An image for a story that doesn't exist is refused and never stored.
#[tokio::test]
async fn images_for_a_missing_story_are_not_added() {
    let t = test_db().await;
    let s = store(&t);
    let err = import_bytes(
        &t.db,
        &s,
        png(12, 12, 7),
        "Lost",
        &ImportScope::Story("no-such-story".into()),
    )
    .await
    .unwrap_err();
    assert_eq!(err.code, crate::errors::ErrorCode::NotFound);
    assert!(rows::list(&t.db).await.unwrap().is_empty());
}

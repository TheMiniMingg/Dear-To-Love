use std::io::Read;

use super::*;
use crate::db::stories::create_story;
use crate::db::test_support::test_db;
use crate::db::timeline::{append_event, get_route, AppendEvent};
use crate::domain::events::{AssistantPayload, PlayerPayload};
use crate::domain::templates::{QuickStartInput, TemplateCatalog};

/// Every tag closes in order: the page is well-formed XML.
fn assert_well_formed(name: &str, xml: &str) {
    let mut stack: Vec<String> = Vec::new();
    let mut rest = xml;
    while let Some(i) = rest.find('<') {
        let text = &rest[..i];
        for (j, _) in text.match_indices('&') {
            let entity = &text[j..];
            assert!(
                ["&amp;", "&lt;", "&gt;", "&quot;", "&#39;"]
                    .iter()
                    .any(|e| entity.starts_with(e)),
                "{name}: a bare & in {text:?}"
            );
        }
        let end = rest[i..].find('>').expect("a tag ends") + i;
        let tag = &rest[i + 1..end];
        rest = &rest[end + 1..];
        if tag.starts_with('?') || tag.starts_with('!') || tag.ends_with('/') {
            continue;
        }
        let tag_name = tag
            .trim_start_matches('/')
            .split_whitespace()
            .next()
            .unwrap_or_default()
            .to_string();
        if tag.starts_with('/') {
            assert_eq!(stack.pop().as_deref(), Some(tag_name.as_str()), "{name}");
        } else {
            stack.push(tag_name);
        }
    }
    assert!(stack.is_empty(), "{name}: {stack:?} never closed");
}

#[test]
fn story_text_becomes_safe_xhtml() {
    assert_eq!(
        inline("She said *hush* & **ran**."),
        "She said <em>hush</em> &amp; <strong>ran</strong>."
    );
    // Marks that cross, or have no partner, stay as written.
    assert_eq!(inline("*a **b* c**"), "*a **b* c**");
    assert_eq!(
        inline("**bold *both***"),
        "<strong>bold <em>both</em></strong>"
    );
    assert_eq!(inline("5 * 3 <tag>"), "5 * 3 &lt;tag&gt;");
    assert_eq!(inline("Bell\u{7}\nline"), "Bell<br/>line");
    assert_eq!(inline("* bread\n- milk"), "• bread<br/>• milk");
    assert_eq!(
        paragraphs_html(
            "## The ferry\n\nMara waits.\n\n---\n\nNight falls.",
            Some("x")
        ),
        "<h3>The ferry</h3>\n<p class=\"x\">Mara waits.</p>\n<hr class=\"break\"/>\n\
         <p class=\"x\">Night falls.</p>\n"
    );
}

#[test]
fn a_drawn_cover_wraps_the_title() {
    assert_eq!(
        cover_lines("The Keeper of the Unsigned Letter", 16),
        ["The Keeper of", "the Unsigned", "Letter"]
    );
    assert_eq!(
        cover_lines("灯台守と差出人のない手紙", 9),
        ["灯台守と差出人のな", "い手紙"]
    );
    let svg = drawn_cover("Love & <Lies>", "Played as Sam");
    assert!(svg.contains("Love &amp; &lt;Lies&gt;"));
    assert_well_formed("cover.svg", &svg);
}

fn book(cover: Option<(String, Vec<u8>)>) -> Book {
    Book {
        id: "dear-to-love:s1:r1".into(),
        title: "The Lamp & the Letter".into(),
        author: "Sam".into(),
        labels: BookLabels {
            language: Some("en-GB".into()),
            subtitle: Some("Route: Alt 1".into()),
            byline: "Played as Sam".into(),
            colophon: "Made with Dear to Love on 7 November 2026".into(),
            contents: "Contents".into(),
        },
        chapters: vec![
            Chapter {
                heading: "Chapter 1: The Lamp Room".into(),
                blocks: vec![
                    Block::Action("Hold the letter up to the lamp.".into()),
                    Block::Story("A gull crest shows in the paper. *Odd.*".into()),
                ],
            },
            Chapter {
                heading: "Chapter 2: Low Tide".into(),
                blocks: vec![Block::Story("Mara waits by the ferry.".into())],
            },
        ],
        cover,
        made_at: "2026-11-07T20:09:35Z".into(),
    }
}

fn unzip(bytes: &[u8]) -> Vec<(String, Vec<u8>, CompressionMethod)> {
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
    (0..zip.len())
        .map(|i| {
            let mut f = zip.by_index(i).unwrap();
            let mut data = Vec::new();
            f.read_to_end(&mut data).unwrap();
            (f.name().unwrap().to_string(), data, f.compression())
        })
        .collect()
}

#[test]
fn the_book_is_an_epub_with_every_page_it_lists() {
    let files = unzip(&build(&book(None)).unwrap());
    assert_eq!(files[0].0, "mimetype");
    assert_eq!(files[0].1, b"application/epub+zip");
    assert_eq!(files[0].2, CompressionMethod::Stored);
    let text = |name: &str| {
        String::from_utf8(
            files
                .iter()
                .find(|f| f.0 == name)
                .unwrap_or_else(|| panic!("{name} is missing"))
                .1
                .clone(),
        )
        .unwrap()
    };
    let opf = text("OEBPS/package.opf");
    // Every file the package lists is in the book.
    for href in opf.split("href=\"").skip(1) {
        let href = &href[..href.find('"').unwrap()];
        assert!(
            files.iter().any(|f| f.0 == format!("OEBPS/{href}")),
            "{href} is listed but missing"
        );
    }
    assert!(opf.contains("<dc:title>The Lamp &amp; the Letter</dc:title>"));
    assert!(opf.contains("<dc:language>en-GB</dc:language>"));
    assert!(opf.contains("properties=\"cover-image\""));
    assert!(opf.contains("<meta property=\"dcterms:modified\">2026-11-07T20:09:35Z</meta>"));
    assert_eq!(opf.matches("media-type=\"font/woff2\"").count(), 4);
    for f in &files {
        if f.0.ends_with(".xhtml") || f.0.ends_with(".opf") || f.0.ends_with(".ncx") {
            assert_well_formed(&f.0, &String::from_utf8(f.1.clone()).unwrap());
        }
    }
    let one = text("OEBPS/chapter-001.xhtml");
    assert!(one.contains("<h2>Chapter 1: The Lamp Room</h2>"));
    assert!(one.contains("<p class=\"action\">Hold the letter up to the lamp.</p>"));
    assert!(one.contains("<p>A gull crest shows in the paper. <em>Odd.</em></p>"));
    let title = text("OEBPS/title.xhtml");
    assert!(title.contains("Route: Alt 1") && title.contains("Played as Sam"));
    let nav = text("OEBPS/nav.xhtml");
    assert!(nav.contains("<a href=\"chapter-002.xhtml\">Chapter 2: Low Tide</a>"));
    assert!(text("OEBPS/style.css").contains("font-family: 'Literata'"));
    assert!(files.iter().any(|f| f.0 == "OEBPS/images/cover.svg"));

    // A cover picture goes on the front as it is; an unknown type is drawn.
    let files = unzip(&build(&book(Some(("image/png".into(), vec![1, 2, 3])))).unwrap());
    let png = files
        .iter()
        .find(|f| f.0 == "OEBPS/images/cover.png")
        .unwrap();
    assert_eq!(png.1, [1, 2, 3]);
    let files = unzip(&build(&book(Some(("image/tiff".into(), vec![1])))).unwrap());
    assert!(files.iter().any(|f| f.0 == "OEBPS/images/cover.svg"));
}

#[test]
fn odd_labels_fall_back_to_plain_ones() {
    let mut b = book(None);
    b.labels = BookLabels {
        language: Some("en\"><script".into()),
        ..BookLabels::default()
    };
    let files = unzip(&build(&b).unwrap());
    let opf = String::from_utf8(
        files
            .iter()
            .find(|f| f.0 == "OEBPS/package.opf")
            .unwrap()
            .1
            .clone(),
    )
    .unwrap();
    assert!(opf.contains("<dc:language>en</dc:language>"));
    let title = files.iter().find(|f| f.0 == "OEBPS/title.xhtml").unwrap();
    let title = String::from_utf8(title.1.clone()).unwrap();
    assert!(title.contains("Played as Sam") && title.contains("Made with Dear to Love"));
    assert!(!title.contains("subtitle"));
}

#[tokio::test]
async fn a_route_becomes_a_book_of_its_story_text_only() {
    let t = test_db().await;
    let draft = TemplateCatalog::bundled()
        .resolve_quick_start(&QuickStartInput {
            world_id: "starter:harbor-town".into(),
            scenario_id: "starter:unsigned-letter".into(),
            character_id: "starter:new-keeper".into(),
            perspective: None,
            detail: None,
            story_type: None,
            language: None,
            next_move: None,
        })
        .unwrap();
    let story = create_story(&t.db, draft).await.unwrap();
    let store = AssetStore::new(t.dir.path());
    let route = story.main_route_id.clone();
    let err = route_book(&t.db, &store, &route, BookLabels::default())
        .await
        .unwrap_err();
    assert_eq!(err.code, ErrorCode::InvalidInput);

    let push = |body: EventBody| {
        let (db, story_id, route) = (&t.db, story.story_id.clone(), route.clone());
        async move {
            let mut conn = db.reader().acquire().await.unwrap();
            let head = get_route(&mut conn, &route)
                .await
                .unwrap()
                .head_event_id
                .unwrap();
            drop(conn);
            append_event(
                db,
                AppendEvent {
                    story_id,
                    route_id: route,
                    expected_head_id: head,
                    body,
                    generation_run_id: None,
                },
            )
            .await
            .unwrap();
        }
    };
    push(EventBody::Player(PlayerPayload::new(
        "Hold the letter up to the lamp.",
    )))
    .await;
    push(EventBody::Assistant(AssistantPayload {
        text: "A gull crest shows.\n<remember person=\"Mara\">Runs the ferry.</remember>\n\
               <text from=\"Mara\">Come down to the ferry.</text>"
            .into(),
        finish_reason: None,
        provider_label: None,
        model_id: None,
    }))
    .await;
    let dest = t.dir.path().join("Lamp.epub");
    let info = export_route_book(&t.db, &store, &route, BookLabels::default(), &dest)
        .await
        .unwrap();
    assert_eq!((info.chapters, info.turns), (1, 2));
    assert_eq!(info.file_name, "Lamp.epub");
    assert!(!info.cover_picture);
    let bytes = std::fs::read(&dest).unwrap();
    assert_eq!(info.bytes, bytes.len() as u64);
    let files = unzip(&bytes);
    let page = files
        .iter()
        .find(|f| f.0 == "OEBPS/chapter-001.xhtml")
        .unwrap();
    let page = String::from_utf8(page.1.clone()).unwrap();
    assert!(page.contains("Hold the letter up to the lamp."));
    assert!(page.contains("A gull crest shows."));
    assert!(
        page.contains("[Text from Mara] Come down to the ferry."),
        "{page}"
    );
    assert!(!page.contains("Runs the ferry"), "memory notes stay out");
}

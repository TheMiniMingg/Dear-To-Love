//! A route as a book: an EPUB 3 file any e-reader opens, with the story's
//! cover (or one drawn from its title), a title page, one page per chapter
//! and the reading font, Literata, so it reads like it does in the app.
//!
//! The book holds the story's text only: what the player did, in italics,
//! and the storyteller's replies. Memory notes, story details, pictures in
//! the story and the app's own notes stay out, and so does anything about
//! connections, keys or the computer it was made on.

use std::io::{Cursor, Write};
use std::path::Path;

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

use crate::db::Database;
use crate::domain::events::{chapter_heading, EventBody};
use crate::domain::text::plain_message_tags;
use crate::domain::visuals::COVER;
use crate::errors::{AppError, AppResult, ErrorCode};
use crate::services::archive::{file_name, write_atomic};
use crate::services::assets::{self, AssetStore, Size};

pub const BOOK_EXTENSION: &str = "epub";

/// The words on the book's own pages, in the app's language.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BookLabels {
    /// The story's language as a BCP 47 tag ("ja-JP"); English when unset.
    #[serde(default)]
    #[ts(optional)]
    pub language: Option<String>,
    /// Under the title: the route, when it is not the main one.
    #[serde(default)]
    #[ts(optional)]
    pub subtitle: Option<String>,
    /// "Played as Sam".
    #[serde(default)]
    pub byline: String,
    /// "Made with Dear to Love on 7 November 2026".
    #[serde(default)]
    pub colophon: String,
    /// "Contents".
    #[serde(default)]
    pub contents: String,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BookExport {
    pub file_name: String,
    pub chapters: u32,
    pub turns: u32,
    #[ts(type = "number")]
    pub bytes: u64,
    /// The story's own cover picture is on the front; otherwise one is
    /// drawn from the title.
    pub cover_picture: bool,
}

/// One block of a chapter page.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Block {
    /// What the player did or said.
    Action(String),
    /// The storyteller's reply.
    Story(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Chapter {
    pub heading: String,
    pub blocks: Vec<Block>,
}

/// Everything a book is made from.
#[derive(Debug, Clone)]
pub struct Book {
    pub id: String,
    pub title: String,
    pub author: String,
    pub labels: BookLabels,
    pub chapters: Vec<Chapter>,
    /// The cover picture's media type and bytes.
    pub cover: Option<(String, Vec<u8>)>,
    /// When it was made, as `2026-11-07T20:09:35Z`.
    pub made_at: String,
}

const FONTS: [(&str, &[u8], &str, &str); 4] = [
    (
        "latin-normal.woff2",
        include_bytes!("../../assets/fonts/literata/latin-normal.woff2"),
        "normal",
        LATIN,
    ),
    (
        "latin-italic.woff2",
        include_bytes!("../../assets/fonts/literata/latin-italic.woff2"),
        "italic",
        LATIN,
    ),
    (
        "latin-ext-normal.woff2",
        include_bytes!("../../assets/fonts/literata/latin-ext-normal.woff2"),
        "normal",
        LATIN_EXT,
    ),
    (
        "latin-ext-italic.woff2",
        include_bytes!("../../assets/fonts/literata/latin-ext-italic.woff2"),
        "italic",
        LATIN_EXT,
    ),
];
const LATIN: &str = "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, \
     U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, \
     U+FFFD";
const LATIN_EXT: &str = "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, \
     U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, \
     U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF";

/// Text safe inside XML: markup characters escaped, and characters XML
/// cannot hold at all left out.
pub fn escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            '\t' | '\n' => out.push(c),
            c if (c as u32) < 0x20 || matches!(c, '\u{FFFE}' | '\u{FFFF}') => {}
            c => out.push(c),
        }
    }
    out
}

/// `**bold**` and `*italic*` in escaped text. Marks pair up only when they
/// nest, so the result is always well formed; the rest stay as they are.
fn emphasis(escaped: &str) -> String {
    #[derive(Clone, Copy, PartialEq, Eq)]
    enum Mark {
        Strong,
        Em,
    }
    enum Piece<'a> {
        Text(&'a str),
        /// `Some(true)` opens, `Some(false)` closes, `None` stays as written.
        Mark(Mark, Option<bool>),
    }
    let mut pieces: Vec<Piece> = Vec::new();
    let mut open: Vec<usize> = Vec::new();
    let mut rest = escaped;
    while let Some(i) = rest.find('*') {
        if i > 0 {
            pieces.push(Piece::Text(&rest[..i]));
        }
        let run = rest[i..].chars().take_while(|&c| c == '*').count();
        rest = &rest[i + run..];
        let mut n = run;
        while n > 0 {
            let top = open.last().map(|&j| match pieces[j] {
                Piece::Mark(m, _) => m,
                Piece::Text(_) => unreachable!("only marks are open"),
            });
            let (mark, closes) = match top {
                // `**` after an open `*` opens bold; `*` or `***` closes it.
                Some(Mark::Em) if n % 2 == 1 => (Mark::Em, true),
                Some(Mark::Strong) if n >= 2 => (Mark::Strong, true),
                _ if n >= 2 => (Mark::Strong, false),
                _ => (Mark::Em, false),
            };
            n -= if mark == Mark::Strong { 2 } else { 1 };
            if closes {
                let j = open.pop().expect("an open mark");
                pieces[j] = Piece::Mark(mark, Some(true));
                pieces.push(Piece::Mark(mark, Some(false)));
            } else {
                open.push(pieces.len());
                pieces.push(Piece::Mark(mark, None));
            }
        }
    }
    if !rest.is_empty() {
        pieces.push(Piece::Text(rest));
    }
    let mut out = String::with_capacity(escaped.len() + 16);
    for p in pieces {
        match p {
            Piece::Text(t) => out.push_str(t),
            Piece::Mark(m, role) => {
                let tag = if m == Mark::Strong { "strong" } else { "em" };
                match role {
                    Some(true) => out.push_str(&format!("<{tag}>")),
                    Some(false) => out.push_str(&format!("</{tag}>")),
                    None => out.push_str(if m == Mark::Strong { "**" } else { "*" }),
                }
            }
        }
    }
    out
}

/// One paragraph of story text as XHTML: escaped, with its emphasis,
/// list bullets and line breaks.
pub fn inline(text: &str) -> String {
    let lines: Vec<String> = text
        .trim()
        .split('\n')
        .map(|l| {
            let l = l.trim();
            match l.strip_prefix("* ").or_else(|| l.strip_prefix("- ")) {
                Some(item) => format!("• {}", item.trim_start()),
                None => l.to_string(),
            }
        })
        .collect();
    emphasis(&escape(&lines.join("\n"))).replace('\n', "<br/>")
}

/// A reply or an action as XHTML paragraphs; `# Heading` lines become
/// headings and `---` a scene break.
pub fn paragraphs_html(text: &str, class: Option<&str>) -> String {
    let attr = class.map(|c| format!(" class=\"{c}\"")).unwrap_or_default();
    let mut out = String::new();
    for para in text.replace("\r\n", "\n").split("\n\n") {
        let para = para.trim();
        if para.is_empty() {
            continue;
        }
        if matches!(para, "---" | "***" | "* * *" | "___") {
            out.push_str("<hr class=\"break\"/>\n");
            continue;
        }
        if let Some(h) = para
            .strip_prefix('#')
            .filter(|_| !para.contains('\n'))
            .map(|h| h.trim_start_matches('#').trim())
        {
            if !h.is_empty() {
                out.push_str(&format!("<h3>{}</h3>\n", inline(h)));
                continue;
            }
        }
        out.push_str(&format!("<p{attr}>{}</p>\n", inline(para)));
    }
    out
}

fn page(lang: &str, title: &str, body_class: &str, body: &str) -> String {
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE html>\n\
         <html xmlns=\"http://www.w3.org/1999/xhtml\" xmlns:epub=\"http://www.idpf.org/2007/ops\" \
         lang=\"{lang}\" xml:lang=\"{lang}\">\n<head>\n<meta charset=\"UTF-8\"/>\n\
         <title>{}</title>\n<link rel=\"stylesheet\" type=\"text/css\" href=\"style.css\"/>\n\
         </head>\n<body class=\"{body_class}\">\n{body}</body>\n</html>\n",
        escape(title)
    )
}

fn style() -> String {
    let mut css = String::new();
    for (file, _, style, range) in FONTS {
        css.push_str(&format!(
            "@font-face {{\n  font-family: 'Literata';\n  font-style: {style};\n  \
             font-weight: 200 900;\n  src: url(fonts/{file}) format('woff2');\n  \
             unicode-range: {range};\n}}\n"
        ));
    }
    css.push_str(
        "body {\n  font-family: 'Literata', Georgia, 'Noto Serif', serif;\n  line-height: 1.55;\n  \
         margin: 0 5%;\n}\n\
         h1, h2, h3 { font-weight: 600; line-height: 1.25; }\n\
         h2 { margin: 2.5em 0 1.5em; text-align: center; }\n\
         h3 { margin: 1.5em 0 0.75em; font-size: 1.05em; }\n\
         p { margin: 0 0 0.85em; }\n\
         p.action { font-style: italic; margin: 1.4em 0 1.1em; padding-left: 0.9em; \
         border-left: 2px solid #c98a9e; color: #4a3f44; }\n\
         p.action em { font-style: normal; }\n\
         hr.break { border: 0; text-align: center; margin: 1.5em 0; }\n\
         hr.break::after { content: '* * *'; }\n\
         body.title { text-align: center; }\n\
         body.title h1 { margin: 30% 0 0.5em; font-size: 2em; }\n\
         body.title .subtitle { font-style: italic; }\n\
         body.title .byline { margin-top: 2em; }\n\
         body.title .colophon { margin-top: 6em; font-size: 0.85em; color: #666; }\n\
         body.cover { margin: 0; padding: 0; text-align: center; }\n\
         body.cover img { max-width: 100%; max-height: 100%; height: 100vh; object-fit: contain; }\n\
         nav ol { list-style: none; padding: 0; }\n\
         nav li { margin: 0.4em 0; }\n",
    );
    css
}

/// The title split into lines of about `width` characters for the drawn cover.
fn cover_lines(title: &str, width: usize) -> Vec<String> {
    let mut lines: Vec<String> = Vec::new();
    let mut cur = String::new();
    for word in title.split_whitespace() {
        let word_len = word.chars().count();
        if word_len > width {
            // A long run without spaces (Japanese, Chinese) is cut by width.
            if !cur.is_empty() {
                lines.push(std::mem::take(&mut cur));
            }
            let chars: Vec<char> = word.chars().collect();
            for chunk in chars.chunks(width) {
                lines.push(chunk.iter().collect());
            }
            continue;
        }
        if !cur.is_empty() && cur.chars().count() + 1 + word_len > width {
            lines.push(std::mem::take(&mut cur));
        }
        if !cur.is_empty() {
            cur.push(' ');
        }
        cur.push_str(word);
    }
    if !cur.is_empty() {
        lines.push(cur);
    }
    lines.truncate(6);
    lines
}

/// A cover drawn from the title, for a story without a cover picture.
pub fn drawn_cover(title: &str, byline: &str) -> String {
    let wide = title.chars().any(|c| (c as u32) >= 0x2E80);
    let lines = cover_lines(title, if wide { 9 } else { 16 });
    let size = if wide { 104 } else { 92 };
    let top = 700 - (lines.len() as i32 * size * 6 / 5) / 2;
    let mut text = String::new();
    for (i, l) in lines.iter().enumerate() {
        text.push_str(&format!(
            "<text x=\"800\" y=\"{}\" font-size=\"{size}\" text-anchor=\"middle\" \
             fill=\"#fff7f2\" font-family=\"Literata, Georgia, serif\" font-weight=\"600\">{}</text>\n",
            top + (i as i32 + 1) * size * 6 / 5,
            escape(l)
        ));
    }
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1600 2400\" width=\"1600\" height=\"2400\">\n\
         <defs><linearGradient id=\"g\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\">\
         <stop offset=\"0\" stop-color=\"#5b2340\"/><stop offset=\"1\" stop-color=\"#1f1424\"/>\
         </linearGradient></defs>\n\
         <rect width=\"1600\" height=\"2400\" fill=\"url(#g)\"/>\n\
         <rect x=\"80\" y=\"80\" width=\"1440\" height=\"2240\" fill=\"none\" stroke=\"#e9a6bd\" \
         stroke-width=\"4\"/>\n{text}\
         <text x=\"800\" y=\"2050\" font-size=\"52\" text-anchor=\"middle\" fill=\"#e9a6bd\" \
         font-family=\"Literata, Georgia, serif\" font-style=\"italic\">{}</text>\n</svg>\n",
        escape(byline)
    )
}

fn cover_extension(mime: &str) -> Option<&'static str> {
    match mime {
        "image/jpeg" => Some("jpg"),
        "image/png" => Some("png"),
        "image/gif" => Some("gif"),
        "image/webp" => Some("webp"),
        _ => None,
    }
}

/// A tag safe as the book's language: letters, digits and hyphens.
fn language_tag(tag: Option<&str>) -> String {
    tag.map(str::trim)
        .filter(|t| {
            !t.is_empty()
                && t.len() <= 35
                && t.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
        })
        .unwrap_or("en")
        .to_string()
}

fn or_default(s: &str, default: &str) -> String {
    let s = s.split_whitespace().collect::<Vec<_>>().join(" ");
    let s: String = s.chars().take(200).collect();
    if s.is_empty() {
        default.to_string()
    } else {
        s
    }
}

/// The book as EPUB 3 bytes.
pub fn build(book: &Book) -> AppResult<Vec<u8>> {
    let lang = language_tag(book.labels.language.as_deref());
    let title = or_default(&book.title, "Untitled story");
    let byline = or_default(&book.labels.byline, &format!("Played as {}", book.author));
    let colophon = or_default(&book.labels.colophon, "Made with Dear to Love");
    let contents = or_default(&book.labels.contents, "Contents");
    let subtitle = book
        .labels
        .subtitle
        .as_deref()
        .map(|s| or_default(s, ""))
        .filter(|s| !s.is_empty());

    let err = |e: zip::result::ZipError| {
        AppError::new(ErrorCode::Io, format!("could not write the book: {e}"))
    };
    let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
    let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
    let deflated = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    let put = |zip: &mut ZipWriter<Cursor<Vec<u8>>>,
               name: &str,
               bytes: &[u8],
               options: SimpleFileOptions|
     -> AppResult<()> {
        zip.start_file(name, options).map_err(err)?;
        zip.write_all(bytes)?;
        Ok(())
    };

    // The media type comes first and uncompressed, as readers expect.
    put(&mut zip, "mimetype", b"application/epub+zip", stored)?;
    put(
        &mut zip,
        "META-INF/container.xml",
        b"<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
          <container version=\"1.0\" xmlns=\"urn:oasis:names:tc:opendocument:xmlns:container\">\n\
          <rootfiles><rootfile full-path=\"OEBPS/package.opf\" \
          media-type=\"application/oebps-package+xml\"/></rootfiles>\n</container>\n",
        deflated,
    )?;
    put(&mut zip, "OEBPS/style.css", style().as_bytes(), deflated)?;

    let mut manifest = vec![
        "<item id=\"nav\" href=\"nav.xhtml\" media-type=\"application/xhtml+xml\" properties=\"nav\"/>"
            .to_string(),
        "<item id=\"ncx\" href=\"toc.ncx\" media-type=\"application/x-dtbncx+xml\"/>".into(),
        "<item id=\"style\" href=\"style.css\" media-type=\"text/css\"/>".into(),
    ];
    for (i, (file, bytes, _, _)) in FONTS.iter().enumerate() {
        put(&mut zip, &format!("OEBPS/fonts/{file}"), bytes, stored)?;
        manifest.push(format!(
            "<item id=\"font-{}\" href=\"fonts/{file}\" media-type=\"font/woff2\"/>",
            i + 1
        ));
    }

    // The cover: the story's picture, or one drawn from the title.
    let picture = book
        .cover
        .as_ref()
        .and_then(|(mime, bytes)| Some((mime.as_str(), cover_extension(mime)?, bytes)));
    let cover_href = match picture {
        Some((mime, ext, bytes)) => {
            let href = format!("images/cover.{ext}");
            put(&mut zip, &format!("OEBPS/{href}"), bytes, stored)?;
            manifest.push(format!(
                "<item id=\"cover-image\" href=\"{href}\" media-type=\"{mime}\" \
                 properties=\"cover-image\"/>"
            ));
            href
        }
        None => {
            let href = "images/cover.svg".to_string();
            put(
                &mut zip,
                &format!("OEBPS/{href}"),
                drawn_cover(&title, &byline).as_bytes(),
                deflated,
            )?;
            manifest.push(format!(
                "<item id=\"cover-image\" href=\"{href}\" media-type=\"image/svg+xml\" \
                 properties=\"cover-image\"/>"
            ));
            href
        }
    };
    let cover_page = page(
        &lang,
        &title,
        "cover",
        &format!(
            "<section epub:type=\"cover\"><img src=\"{cover_href}\" alt=\"{}\"/></section>\n",
            escape(&title)
        ),
    );
    put(
        &mut zip,
        "OEBPS/cover.xhtml",
        cover_page.as_bytes(),
        deflated,
    )?;
    manifest.push(
        "<item id=\"cover\" href=\"cover.xhtml\" media-type=\"application/xhtml+xml\"/>".into(),
    );

    let title_page = page(
        &lang,
        &title,
        "title",
        &format!(
            "<section epub:type=\"titlepage\">\n<h1>{}</h1>\n{}<p class=\"byline\">{}</p>\n\
             <p class=\"colophon\">{}</p>\n</section>\n",
            escape(&title),
            subtitle
                .as_deref()
                .map(|s| format!("<p class=\"subtitle\">{}</p>\n", escape(s)))
                .unwrap_or_default(),
            escape(&byline),
            escape(&colophon)
        ),
    );
    put(
        &mut zip,
        "OEBPS/title.xhtml",
        title_page.as_bytes(),
        deflated,
    )?;
    manifest.push(
        "<item id=\"title\" href=\"title.xhtml\" media-type=\"application/xhtml+xml\"/>".into(),
    );

    let mut spine = vec![
        "<itemref idref=\"cover\"/>".to_string(),
        "<itemref idref=\"title\"/>".to_string(),
    ];
    let mut toc = Vec::new();
    for (i, c) in book.chapters.iter().enumerate() {
        let file = format!("chapter-{:03}.xhtml", i + 1);
        let mut body = format!(
            "<section epub:type=\"chapter\" role=\"doc-chapter\">\n<h2>{}</h2>\n",
            escape(&c.heading)
        );
        for b in &c.blocks {
            body.push_str(&match b {
                Block::Action(t) => paragraphs_html(t, Some("action")),
                Block::Story(t) => paragraphs_html(t, None),
            });
        }
        body.push_str("</section>\n");
        put(
            &mut zip,
            &format!("OEBPS/{file}"),
            page(&lang, &c.heading, "chapter", &body).as_bytes(),
            deflated,
        )?;
        let id = format!("c{}", i + 1);
        manifest.push(format!(
            "<item id=\"{id}\" href=\"{file}\" media-type=\"application/xhtml+xml\"/>"
        ));
        spine.push(format!("<itemref idref=\"{id}\"/>"));
        toc.push((file, c.heading.clone()));
    }

    let nav = page(
        &lang,
        &contents,
        "nav",
        &format!(
            "<nav epub:type=\"toc\" id=\"toc\" role=\"doc-toc\">\n<h2>{}</h2>\n<ol>\n{}</ol>\n</nav>\n\
             <nav epub:type=\"landmarks\" hidden=\"hidden\">\n<ol>\n\
             <li><a epub:type=\"cover\" href=\"cover.xhtml\">{}</a></li>\n\
             <li><a epub:type=\"bodymatter\" href=\"{}\">{}</a></li>\n</ol>\n</nav>\n",
            escape(&contents),
            toc.iter()
                .map(|(f, h)| format!("<li><a href=\"{f}\">{}</a></li>\n", escape(h)))
                .collect::<String>(),
            escape(&title),
            toc.first().map(|(f, _)| f.as_str()).unwrap_or("title.xhtml"),
            escape(toc.first().map(|(_, h)| h.as_str()).unwrap_or(&title)),
        ),
    );
    put(&mut zip, "OEBPS/nav.xhtml", nav.as_bytes(), deflated)?;

    let ncx = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <ncx xmlns=\"http://www.daisy.org/z3986/2005/ncx/\" version=\"2005-1\" xml:lang=\"{lang}\">\n\
         <head><meta name=\"dtb:uid\" content=\"{}\"/><meta name=\"dtb:depth\" content=\"1\"/>\
         <meta name=\"dtb:totalPageCount\" content=\"0\"/><meta name=\"dtb:maxPageNumber\" content=\"0\"/></head>\n\
         <docTitle><text>{}</text></docTitle>\n<navMap>\n{}</navMap>\n</ncx>\n",
        escape(&book.id),
        escape(&title),
        toc.iter()
            .enumerate()
            .map(|(i, (f, h))| format!(
                "<navPoint id=\"n{0}\" playOrder=\"{0}\"><navLabel><text>{1}</text></navLabel>\
                 <content src=\"{f}\"/></navPoint>\n",
                i + 1,
                escape(h)
            ))
            .collect::<String>()
    );
    put(&mut zip, "OEBPS/toc.ncx", ncx.as_bytes(), deflated)?;

    let opf = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <package xmlns=\"http://www.idpf.org/2007/opf\" version=\"3.0\" unique-identifier=\"book-id\" \
         xml:lang=\"{lang}\">\n<metadata xmlns:dc=\"http://purl.org/dc/elements/1.1/\">\n\
         <dc:identifier id=\"book-id\">{}</dc:identifier>\n<dc:title>{}</dc:title>\n\
         <dc:creator>{}</dc:creator>\n<dc:language>{lang}</dc:language>\n\
         <dc:date>{}</dc:date>\n<meta property=\"dcterms:modified\">{}</meta>\n\
         <meta name=\"cover\" content=\"cover-image\"/>\n</metadata>\n\
         <manifest>\n{}\n</manifest>\n<spine toc=\"ncx\">\n{}\n</spine>\n</package>\n",
        escape(&book.id),
        escape(&title),
        escape(&or_default(&book.author, "You")),
        book.made_at.get(..10).unwrap_or("2026-01-01"),
        escape(&book.made_at),
        manifest.join("\n"),
        spine.join("\n"),
    );
    put(&mut zip, "OEBPS/package.opf", opf.as_bytes(), deflated)?;

    Ok(zip.finish().map_err(err)?.into_inner())
}

/// The book made from `route_id`, ready to write.
pub async fn route_book(
    db: &Database,
    store: &AssetStore,
    route_id: &str,
    labels: BookLabels,
) -> AppResult<(Book, u32)> {
    let view = crate::services::reader::route_view(db, route_id).await?;
    let state = &view.state.effective.state;
    let author = state
        .characters
        .get(&state.player_character_id)
        .map(|c| c.name.clone())
        .unwrap_or_else(|| "You".into());
    let mut chapters: Vec<Chapter> = Vec::new();
    let mut turns = 0u32;
    for e in &view.history {
        let block = match &e.body {
            EventBody::ChapterStart(c) => {
                chapters.push(Chapter {
                    heading: chapter_heading(c.ordinal, &c.title),
                    blocks: Vec::new(),
                });
                continue;
            }
            EventBody::Player(p) => Block::Action(plain_message_tags(&p.story_text())),
            EventBody::Assistant(p) => Block::Story(plain_message_tags(&p.text)),
            _ => continue,
        };
        let empty = match &block {
            Block::Action(t) | Block::Story(t) => t.trim().is_empty(),
        };
        if empty {
            continue;
        }
        turns += 1;
        if chapters.is_empty() {
            chapters.push(Chapter {
                heading: chapter_heading(1, ""),
                blocks: Vec::new(),
            });
        }
        chapters.last_mut().expect("a chapter").blocks.push(block);
    }
    chapters.retain(|c| !c.blocks.is_empty());
    if chapters.is_empty() {
        return Err(AppError::invalid_input(
            "this route has no story yet. Play at least one turn, then save it as a book",
        ));
    }
    let cover = match view.visuals.iter().find(|v| v.slot == COVER) {
        Some(v) => assets::load(db, store, &v.asset_id, Size::Full).await?,
        None => None,
    };
    Ok((
        Book {
            id: format!("dear-to-love:{}:{}", view.story.id, view.route.id),
            title: view.story.title.clone(),
            author,
            labels,
            chapters,
            cover,
            made_at: chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
        },
        turns,
    ))
}

/// Write `route_id` as an EPUB book at `dest`.
pub async fn export_route_book(
    db: &Database,
    store: &AssetStore,
    route_id: &str,
    labels: BookLabels,
    dest: &Path,
) -> AppResult<BookExport> {
    let (book, turns) = route_book(db, store, route_id, labels).await?;
    let chapters = book.chapters.len() as u32;
    let cover_picture = book
        .cover
        .as_ref()
        .is_some_and(|(mime, _)| cover_extension(mime).is_some());
    let dest = dest.to_path_buf();
    let d = dest.clone();
    let bytes = tokio::task::spawn_blocking(move || -> AppResult<u64> {
        let bytes = build(&book)?;
        write_atomic(&d, &bytes)?;
        Ok(bytes.len() as u64)
    })
    .await
    .map_err(|e| AppError::internal(e.to_string()))??;
    Ok(BookExport {
        file_name: file_name(&dest),
        chapters,
        turns,
        bytes,
        cover_picture,
    })
}

#[cfg(test)]
mod tests;

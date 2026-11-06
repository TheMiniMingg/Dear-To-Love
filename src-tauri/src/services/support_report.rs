//! The Diagnostics report a user can copy into a support request (T50).
//! It holds versions, counts and check results only: no story text, no
//! titles, no API keys and no file system paths. Every line passes through
//! `sanitize` as a second line of defence.

use std::path::PathBuf;

use crate::db::Database;
use crate::domain::app_info::AppInfo;
use crate::domain::diagnostics::{CheckStatus, DiagnosticCheck};
use crate::errors::AppResult;
use crate::services::updates::{UpdateState, UpdateStatus};

pub const HEADER: &str = "Dear to Love diagnostics report";
/// Largest report the app writes to a file.
pub const MAX_REPORT: usize = 256 * 1024;

/// Row counts; numbers only.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Counts {
    pub stories: i64,
    pub routes: i64,
    pub events: i64,
    pub saves: i64,
    pub bookmarks: i64,
    pub images: i64,
    pub connections: Vec<(String, i64)>,
    pub api_requests: i64,
}

pub async fn counts(db: &Database) -> AppResult<Counts> {
    let (stories, routes, events, saves, bookmarks, images, api_requests): (
        i64,
        i64,
        i64,
        i64,
        i64,
        i64,
        i64,
    ) = sqlx::query_as(
        "SELECT (SELECT COUNT(*) FROM stories), (SELECT COUNT(*) FROM routes), \
                (SELECT COUNT(*) FROM events), (SELECT COUNT(*) FROM saves), \
                (SELECT COUNT(*) FROM bookmarks), (SELECT COUNT(*) FROM assets), \
                (SELECT COUNT(*) FROM api_requests)",
    )
    .fetch_one(db.reader())
    .await?;
    let connections: Vec<(String, i64)> = sqlx::query_as(
        "SELECT adapter, COUNT(*) FROM provider_profiles GROUP BY adapter ORDER BY adapter",
    )
    .fetch_all(db.reader())
    .await?;
    Ok(Counts {
        stories,
        routes,
        events,
        saves,
        bookmarks,
        images,
        connections,
        api_requests,
    })
}

/// Folders whose paths must never appear, with what to show instead.
/// Longer (more specific) paths are replaced first.
pub fn private_paths(data_dir: Option<PathBuf>) -> Vec<(String, &'static str)> {
    let mut out: Vec<(String, &'static str)> = Vec::new();
    if let Some(d) = data_dir {
        out.push((d.display().to_string(), "<app data>"));
    }
    for (var, shown) in [
        ("HOME", "~"),
        ("USERPROFILE", "~"),
        ("APPDATA", "<appdata>"),
    ] {
        if let Ok(v) = std::env::var(var) {
            out.push((v, shown));
        }
    }
    out.push((std::env::temp_dir().display().to_string(), "<temp>"));
    out.retain(|(p, _)| p.trim_matches(['/', '\\']).len() > 1);
    out.sort_by_key(|(p, _)| std::cmp::Reverse(p.len()));
    out
}

fn is_uuid(s: &str) -> bool {
    let parts: Vec<&str> = s.split('-').collect();
    parts.len() == 5
        && parts
            .iter()
            .zip([8, 4, 4, 4, 12])
            .all(|(p, n)| p.len() == n && p.chars().all(|c| c.is_ascii_hexdigit()))
}

fn looks_secret(s: &str) -> bool {
    let lower = s.to_ascii_lowercase();
    if lower.starts_with("sk-") || lower.starts_with("sk_") || lower.starts_with("key-") {
        return s.len() > 8;
    }
    s.len() >= 24
        && !is_uuid(s)
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '+' | '/' | '='))
        && s.chars().any(|c| c.is_ascii_digit())
        && s.chars().any(|c| c.is_ascii_alphabetic())
}

fn looks_like_path(s: &str) -> bool {
    let b = s.as_bytes();
    (s.starts_with('/') && s[1..].contains('/'))
        || s.starts_with("~/")
        || s.starts_with("\\\\")
        || (b.len() > 2
            && b[0].is_ascii_alphabetic()
            && b[1] == b':'
            && matches!(b[2], b'\\' | b'/'))
}

/// A URL without its user name, password, query or fragment.
fn clean_url(s: &str) -> Option<String> {
    let mut u = url::Url::parse(s).ok()?;
    if !matches!(u.scheme(), "http" | "https") {
        return None;
    }
    let _ = u.set_username("");
    let _ = u.set_password(None);
    u.set_query(None);
    u.set_fragment(None);
    Some(u.to_string())
}

fn clean_word(word: &str) -> String {
    const OPEN: &[char] = &['(', '[', '{', '<', '"', '\'', '`', '“'];
    const CLOSE: &[char] = &[
        ')', ']', '}', '>', '"', '\'', '`', '”', '.', ',', ';', ':', '!', '?',
    ];
    let core = word.trim_start_matches(OPEN);
    let lead = &word[..word.len() - core.len()];
    let trimmed = core.trim_end_matches(CLOSE);
    let tail = &core[trimmed.len()..];
    let core = trimmed;
    if core.is_empty() {
        return word.to_string();
    }
    let lower = core.to_ascii_lowercase();
    let replaced = if lower.starts_with("http://") || lower.starts_with("https://") {
        clean_url(core).unwrap_or_else(|| "<link>".into())
    } else if looks_like_path(core) {
        "<path>".into()
    } else if looks_secret(core) {
        "<redacted>".into()
    } else {
        core.to_string()
    };
    format!("{lead}{replaced}{tail}")
}

/// Removes paths, secrets and URL credentials from one piece of text.
pub fn sanitize(text: &str, private: &[(String, &'static str)]) -> String {
    let mut text = text.to_string();
    for (p, shown) in private {
        for variant in [p.clone(), p.replace('\\', "/"), p.replace('/', "\\")] {
            if variant.len() > 1 {
                text = text.replace(&variant, shown);
            }
        }
    }
    let mut out = String::with_capacity(text.len());
    let mut word = String::new();
    // The word after "Bearer" is a token, whatever it looks like.
    let mut after_bearer = false;
    let flush = |word: &mut String, out: &mut String, after_bearer: &mut bool| {
        if word.is_empty() {
            return;
        }
        if *after_bearer {
            out.push_str("<redacted>");
        } else {
            out.push_str(&clean_word(word));
        }
        *after_bearer = word.eq_ignore_ascii_case("bearer");
        word.clear();
    };
    for c in text.chars() {
        if c.is_whitespace() {
            flush(&mut word, &mut out, &mut after_bearer);
            out.push(c);
        } else {
            word.push(c);
        }
    }
    flush(&mut word, &mut out, &mut after_bearer);
    out
}

fn plural(n: i64, one: &str, many: &str) -> String {
    format!("{n} {}", if n == 1 { one } else { many })
}

fn status_word(s: CheckStatus) -> &'static str {
    match s {
        CheckStatus::Pass => "PASS",
        CheckStatus::Warn => "WARN",
        CheckStatus::Fail => "FAIL",
        CheckStatus::Skipped => "SKIPPED",
    }
}

pub struct ReportInput<'a> {
    pub app: &'a AppInfo,
    pub generated_at: String,
    pub schema_version: Option<i64>,
    pub counts: Option<Counts>,
    pub updates: Option<UpdateStatus>,
    pub checks: &'a [DiagnosticCheck],
    pub deep: bool,
    pub private: Vec<(String, &'static str)>,
}

pub fn render(r: &ReportInput) -> String {
    let mut lines: Vec<String> = vec![
        HEADER.to_string(),
        format!("Generated: {}", r.generated_at),
        format!(
            "Version: v{} ({} {}, {:?} build)",
            r.app.version, r.app.os, r.app.arch, r.app.build_profile
        ),
    ];
    lines.push(match r.schema_version {
        Some(v) => format!("Database schema: v{v}"),
        None => "Database schema: unavailable".into(),
    });
    if let Some(c) = &r.counts {
        lines.push(format!(
            "Stories: {}, {}, {}, {}, {}, {}",
            plural(c.stories, "story", "stories"),
            plural(c.routes, "route", "routes"),
            plural(c.events, "event", "events"),
            plural(c.saves, "save", "saves"),
            plural(c.bookmarks, "bookmark", "bookmarks"),
            plural(c.images, "image", "images"),
        ));
        let kinds = if c.connections.is_empty() {
            "none".to_string()
        } else {
            c.connections
                .iter()
                .map(|(k, n)| format!("{k} {n}"))
                .collect::<Vec<_>>()
                .join(", ")
        };
        lines.push(format!(
            "AI connections: {kinds}; {} recorded",
            plural(c.api_requests, "API request", "API requests")
        ));
    }
    if let Some(u) = &r.updates {
        let result = match u.state {
            UpdateState::Off => String::new(),
            UpdateState::NotChecked => ", not checked yet".into(),
            UpdateState::UpToDate => ", up to date".into(),
            UpdateState::Available => format!(
                ", v{} available",
                u.latest.as_ref().map(|l| l.version.as_str()).unwrap_or("?")
            ),
            UpdateState::Unavailable => ", last check failed".into(),
        };
        lines.push(format!(
            "Update checks: {}{result}",
            if u.enabled { "on" } else { "off" }
        ));
    }
    lines.push(String::new());
    lines.push(format!(
        "Checks ({}):",
        if r.deep { "deep" } else { "standard" }
    ));
    for c in r.checks {
        lines.push(format!(
            "[{}] {} {}: {}",
            status_word(c.status),
            c.id,
            c.label,
            c.summary
        ));
        if let Some(fix) = &c.remediation {
            lines.push(format!("    Fix: {fix}"));
        }
    }
    lines.push(String::new());
    lines.push("This report has no story text, titles, API keys or file paths.".into());
    lines
        .iter()
        .map(|l| sanitize(l, &r.private))
        .collect::<Vec<_>>()
        .join("\n")
        + "\n"
}

#[cfg(test)]
mod tests;

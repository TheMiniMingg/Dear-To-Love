//! Route search (T37): find words in one route's history. Only events the
//! route has reached are searched, so text from other branches never shows.
//! Every word of the query must appear in an event (in any order, ignoring
//! case); results come in story order with a short marked snippet.

use serde::Serialize;
use ts_rs::TS;

use crate::db::timeline::{route_history, EventDto};
use crate::db::Database;
use crate::domain::events::{EventBody, EventKind};
use crate::domain::text::fold;
use crate::errors::{AppError, AppResult};

pub const MAX_QUERY: usize = 200;
pub const MAX_TERMS: usize = 8;
/// Hits returned; `total` still counts every match.
pub const MAX_HITS: usize = 200;
/// Characters of context before the first match.
const BEFORE: usize = 60;
/// Snippet length in characters.
const SNIPPET: usize = 200;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SnippetPart {
    pub text: String,
    /// True for the words that matched.
    pub mark: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SearchHit {
    pub event_id: String,
    pub kind: EventKind,
    /// The chapter the event is in.
    pub chapter_ordinal: Option<u32>,
    pub chapter_title: Option<String>,
    pub snippet: Vec<SnippetPart>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SearchResults {
    pub route_id: String,
    pub query: String,
    /// Every matching event, even past the hits returned.
    pub total: u32,
    pub hits: Vec<SearchHit>,
}

/// The query's distinct words, folded for comparison.
pub fn terms(query: &str) -> AppResult<Vec<Vec<char>>> {
    let query = query.trim();
    if query.is_empty() {
        return Err(AppError::invalid_input("type something to search for"));
    }
    if query.chars().count() > MAX_QUERY {
        return Err(AppError::invalid_input(format!(
            "search for at most {MAX_QUERY} characters"
        )));
    }
    let mut out: Vec<Vec<char>> = Vec::new();
    for word in query.split_whitespace() {
        let t: Vec<char> = word.chars().map(fold).collect();
        if !out.contains(&t) {
            out.push(t);
        }
    }
    if out.len() > MAX_TERMS {
        return Err(AppError::invalid_input(format!(
            "search for at most {MAX_TERMS} words"
        )));
    }
    Ok(out)
}

/// Start positions of `needle` in `hay`, without overlaps.
fn find_all(hay: &[char], needle: &[char]) -> Vec<usize> {
    let mut out = Vec::new();
    if needle.is_empty() || needle.len() > hay.len() {
        return out;
    }
    let mut i = 0;
    while i + needle.len() <= hay.len() {
        if hay[i..i + needle.len()] == *needle {
            out.push(i);
            i += needle.len();
        } else {
            i += 1;
        }
    }
    out
}

/// A marked snippet when every term is in `text`.
pub fn match_text(text: &str, terms: &[Vec<char>]) -> Option<Vec<SnippetPart>> {
    let chars: Vec<char> = text.chars().collect();
    let folded: Vec<char> = chars.iter().copied().map(fold).collect();
    let mut ranges: Vec<(usize, usize)> = Vec::new();
    for t in terms {
        let found = find_all(&folded, t);
        if found.is_empty() {
            return None;
        }
        ranges.extend(found.into_iter().map(|s| (s, s + t.len())));
    }
    ranges.sort_unstable();
    let mut marks: Vec<(usize, usize)> = Vec::new();
    for (s, e) in ranges {
        match marks.last_mut() {
            Some(last) if s <= last.1 => last.1 = last.1.max(e),
            _ => marks.push((s, e)),
        }
    }

    // A window around the first match, cut at spaces.
    let first = marks.first()?.0;
    let len = chars.len();
    let mut start = first.saturating_sub(BEFORE);
    let mut end = (start + SNIPPET).min(len);
    start = start.min(end.saturating_sub(SNIPPET));
    if start > 0 {
        if let Some(p) = (start..first).find(|&i| chars[i].is_whitespace()) {
            start = p + 1;
        }
    }
    if end < len {
        let last_mark = marks
            .iter()
            .map(|m| m.1)
            .filter(|&e| e <= end)
            .max()
            .unwrap_or(first);
        if let Some(p) = (last_mark..end).rev().find(|&i| chars[i].is_whitespace()) {
            end = p;
        }
    }

    let mut parts: Vec<SnippetPart> = Vec::new();
    let mut last_space = true;
    let mut push = |text: &[char], mark: bool, parts: &mut Vec<SnippetPart>| {
        let mut s = String::new();
        for &c in text {
            if c.is_whitespace() {
                if !last_space {
                    s.push(' ');
                }
                last_space = true;
            } else {
                s.push(c);
                last_space = false;
            }
        }
        if s.is_empty() {
            return;
        }
        match parts.last_mut() {
            Some(p) if p.mark == mark => p.text.push_str(&s),
            _ => parts.push(SnippetPart { text: s, mark }),
        }
    };
    if start > 0 {
        push(&['…', ' '], false, &mut parts);
    }
    let mut at = start;
    for &(s, e) in &marks {
        let (s, e) = (s.max(start), e.min(end));
        if s >= e {
            continue;
        }
        push(&chars[at..s], false, &mut parts);
        push(&chars[s..e], true, &mut parts);
        at = e;
    }
    push(&chars[at..end], false, &mut parts);
    if let Some(p) = parts.last_mut().filter(|p| !p.mark) {
        let trimmed = p.text.trim_end().len();
        p.text.truncate(trimmed);
    }
    if end < len {
        match parts.last_mut() {
            Some(p) if !p.mark => p.text.push_str(" …"),
            _ => parts.push(SnippetPart {
                text: " …".into(),
                mark: false,
            }),
        }
    }
    Some(parts)
}

/// Search `history` (one route, root first).
pub fn search_history(
    route_id: &str,
    history: &[EventDto],
    query: &str,
) -> AppResult<SearchResults> {
    let terms = terms(query)?;
    let mut chapter: Option<(u32, String)> = None;
    let mut hits = Vec::new();
    let mut total = 0u32;
    for e in history {
        if let EventBody::ChapterStart(c) = &e.body {
            chapter = Some((c.ordinal, c.title.clone()));
        }
        let Some(snippet) = match_text(&e.body.reader_text(), &terms) else {
            continue;
        };
        total += 1;
        if hits.len() < MAX_HITS {
            hits.push(SearchHit {
                event_id: e.id.clone(),
                kind: e.body.kind(),
                chapter_ordinal: chapter.as_ref().map(|c| c.0),
                chapter_title: chapter.as_ref().map(|c| c.1.clone()),
                snippet,
            });
        }
    }
    Ok(SearchResults {
        route_id: route_id.to_string(),
        query: query.trim().to_string(),
        total,
        hits,
    })
}

pub async fn search_route(db: &Database, route_id: &str, query: &str) -> AppResult<SearchResults> {
    terms(query)?;
    let history = route_history(db, route_id).await?;
    search_history(route_id, &history, query)
}

#[cfg(test)]
mod tests;

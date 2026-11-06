//! The shape of a story's routes, for the reader's list, map and timeline
//! views: where each route left its parent, what it did differently first,
//! how far it has got and where it is now.

use std::collections::HashMap;

use serde::Serialize;
use ts_rs::TS;

use crate::db::timeline::{list_routes, RouteDto};
use crate::db::Database;
use crate::domain::events::EventBody;
use crate::domain::text::{excerpt, plain_message_tags};
use crate::errors::{AppError, AppResult};

/// Longest excerpt shown for a route's first change or latest words.
const EXCERPT_CHARS: usize = 140;
/// How far back from a route's head to look for its latest words.
const LATEST_LOOKBACK: usize = 50;

/// What a route did differently first.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum BranchKind {
    /// A different action ("change an earlier action").
    Action,
    /// Another reply to the same action.
    Reply,
    /// A change in Story details, or anything else that isn't a turn.
    Edit,
    /// A chapter started (or restarted) here.
    Chapter,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BranchStart {
    pub kind: BranchKind,
    pub text: String,
}

/// One route, placed among the others.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RouteNode {
    pub route: RouteDto,
    /// Player actions from the start of the story to this route's head.
    pub turns: u32,
    /// Player actions before this route left its parent; absent for a
    /// route that starts the story.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub fork_turn: Option<u32>,
    /// The first thing this route did differently; absent until it does.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub branch: Option<BranchStart>,
    /// The newest words on this route.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub latest: Option<String>,
    /// The chapter this route is in now.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub chapter: Option<ChapterRef>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ChapterRef {
    pub ordinal: u32,
    pub title: String,
}

struct Node {
    parent: Option<String>,
    kind: String,
}

/// Turn count and nearest chapter start for each event, filled in as needed.
struct Tree {
    nodes: HashMap<String, Node>,
    /// (player actions up to and including the event, nearest chapter start)
    memo: HashMap<String, (u32, Option<String>)>,
}

impl Tree {
    fn place(&mut self, id: &str) -> (u32, Option<String>) {
        // Walk up to a known event (or the root), then fill in downwards.
        let mut path = Vec::new();
        let mut at = Some(id.to_string());
        let mut base = (0, None);
        while let Some(cur) = at {
            if let Some(known) = self.memo.get(&cur) {
                base = known.clone();
                break;
            }
            let Some(node) = self.nodes.get(&cur) else {
                break;
            };
            at = node.parent.clone();
            path.push(cur);
            if path.len() > self.nodes.len() {
                break; // a cycle can't happen, but never loop forever
            }
        }
        for cur in path.into_iter().rev() {
            let node = &self.nodes[&cur];
            let turns = base.0 + u32::from(node.kind == "player");
            let chapter = if node.kind == "chapter_start" {
                Some(cur.clone())
            } else {
                base.1.clone()
            };
            base = (turns, chapter);
            self.memo.insert(cur, base.clone());
        }
        base
    }

    /// The event on `head`'s chain whose parent is `fork`, if any.
    fn first_after(&self, head: &str, fork: &str) -> Option<String> {
        let mut at = Some(head.to_string());
        let mut steps = 0;
        while let Some(cur) = at {
            let node = self.nodes.get(&cur)?;
            if node.parent.as_deref() == Some(fork) {
                return Some(cur);
            }
            at = node.parent.clone();
            steps += 1;
            if steps > self.nodes.len() {
                return None;
            }
        }
        None
    }
}

async fn body(db: &Database, id: &str) -> AppResult<EventBody> {
    let (kind, payload): (String, String) =
        sqlx::query_as("SELECT kind, payload_json FROM events WHERE id = ?")
            .bind(id)
            .fetch_optional(db.reader())
            .await?
            .ok_or_else(|| AppError::internal(format!("event {id} is missing")))?;
    EventBody::from_parts(&kind, &payload)
}

fn short(text: &str) -> String {
    excerpt(&plain_message_tags(text), EXCERPT_CHARS)
}

/// Every route of a story (hidden ones too), in the order they were made.
pub async fn route_map(db: &Database, story_id: &str) -> AppResult<Vec<RouteNode>> {
    let routes = list_routes(db, story_id).await?;
    if routes.is_empty() {
        return Err(AppError::not_found(format!("story {story_id} not found")));
    }
    let rows: Vec<(String, Option<String>, String)> =
        sqlx::query_as("SELECT id, parent_event_id, kind FROM events WHERE story_id = ?")
            .bind(story_id)
            .fetch_all(db.reader())
            .await?;
    let mut tree = Tree {
        nodes: rows
            .into_iter()
            .map(|(id, parent, kind)| (id, Node { parent, kind }))
            .collect(),
        memo: HashMap::new(),
    };
    let mut out = Vec::with_capacity(routes.len());
    for route in routes {
        let Some(head) = route.head_event_id.clone() else {
            continue;
        };
        let (turns, chapter_id) = tree.place(&head);
        let forked = route
            .parent_route_id
            .as_ref()
            .and(route.fork_event_id.clone());
        let fork_turn = forked.as_deref().map(|f| tree.place(f).0);
        let branch = match forked.as_deref().and_then(|f| tree.first_after(&head, f)) {
            Some(first) => {
                let b = body(db, &first).await?;
                let (kind, text) = match &b {
                    EventBody::Player(_) => (BranchKind::Action, short(&b.reader_text())),
                    EventBody::Assistant(_) => (BranchKind::Reply, short(&b.reader_text())),
                    EventBody::ChapterStart(p) => (BranchKind::Chapter, short(&p.title)),
                    _ => (BranchKind::Edit, short(&b.reader_text())),
                };
                Some(BranchStart { kind, text })
            }
            None => None,
        };
        let mut latest = None;
        let mut at = Some(head.clone());
        for _ in 0..LATEST_LOOKBACK {
            let Some(cur) = at else { break };
            let Some(node) = tree.nodes.get(&cur) else {
                break;
            };
            if node.kind == "player" || node.kind == "assistant" {
                let text = short(&body(db, &cur).await?.reader_text());
                if !text.is_empty() {
                    latest = Some(text);
                    break;
                }
            }
            at = node.parent.clone();
        }
        let chapter = match chapter_id {
            Some(id) => match body(db, &id).await? {
                EventBody::ChapterStart(p) => Some(ChapterRef {
                    ordinal: p.ordinal,
                    title: p.title,
                }),
                _ => None,
            },
            None => None,
        };
        out.push(RouteNode {
            route,
            turns,
            fork_turn,
            branch,
            latest,
            chapter,
        });
    }
    Ok(out)
}

#[cfg(test)]
mod tests;

//! Other versions of a reply: the replies written for the same moment
//! (**Another reply**, or **Keep going** again after **Take back**). Each
//! lives on its own route; the reader flips between them by opening that
//! route, so nothing here changes the story.

use std::collections::{HashMap, HashSet};

use serde::Serialize;
use ts_rs::TS;

use crate::db::timeline::{EventDto, RouteDto};
use crate::db::Database;
use crate::domain::events::EventBody;
use crate::errors::AppResult;

/// The versions of one reply on this route.
#[derive(Debug, Clone, Serialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ReplyVersions {
    /// The reply as this route has it.
    pub event_id: String,
    /// The route to open for each version, oldest version first. A version
    /// kept on several routes opens the one played most recently.
    pub route_ids: Vec<String>,
    /// Which of them is this route's own.
    pub current: u32,
}

/// Every reply on `history` (this route's turns) that has other versions a
/// visible route keeps. Empty for most stories, which costs one query.
pub async fn reply_versions(
    db: &Database,
    route: &RouteDto,
    routes: &[RouteDto],
    history: &[EventDto],
) -> AppResult<Vec<ReplyVersions>> {
    // Replies that answer the same moment, anywhere in the story.
    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT id, parent_event_id FROM events \
         WHERE story_id = ? AND kind = 'assistant' AND parent_event_id IN ( \
           SELECT parent_event_id FROM events \
           WHERE story_id = ? AND kind = 'assistant' AND parent_event_id IS NOT NULL \
           GROUP BY parent_event_id HAVING COUNT(*) > 1) \
         ORDER BY created_at, id",
    )
    .bind(&route.story_id)
    .bind(&route.story_id)
    .fetch_all(db.reader())
    .await?;
    if rows.is_empty() {
        return Ok(Vec::new());
    }
    let mut groups: HashMap<&str, Vec<&str>> = HashMap::new();
    for (id, parent) in &rows {
        groups.entry(parent.as_str()).or_default().push(id.as_str());
    }
    let here: Vec<(&EventDto, &Vec<&str>)> = history
        .iter()
        .filter(|e| matches!(e.body, EventBody::Assistant(_)))
        .filter_map(|e| groups.get(e.parent_event_id.as_deref()?).map(|g| (e, g)))
        .collect();
    if here.is_empty() {
        return Ok(Vec::new());
    }
    let wanted: HashSet<&str> = here.iter().flat_map(|(_, g)| g.iter().copied()).collect();

    // Where each other version is read: walk every visible route back from
    // its head and keep, for each version it passes, the route played last.
    let parents: HashMap<String, Option<String>> = sqlx::query_as::<_, (String, Option<String>)>(
        "SELECT id, parent_event_id FROM events WHERE story_id = ?",
    )
    .bind(&route.story_id)
    .fetch_all(db.reader())
    .await?
    .into_iter()
    .collect();
    let mut best: HashMap<&str, &RouteDto> = HashMap::new();
    for r in routes.iter().filter(|r| !r.hidden && r.id != route.id) {
        let mut at = r.head_event_id.as_deref();
        // A broken chain can't loop forever: no line is longer than the story.
        for _ in 0..=parents.len() {
            let Some(id) = at else { break };
            if let Some(&w) = wanted.get(id) {
                let newer = best.get(w).is_none_or(|b| {
                    (r.updated_at.as_str(), r.id.as_str()) > (b.updated_at.as_str(), b.id.as_str())
                });
                if newer {
                    best.insert(w, r);
                }
            }
            at = parents.get(id).and_then(|p| p.as_deref());
        }
    }

    Ok(here
        .into_iter()
        .filter_map(|(e, group)| {
            let mut route_ids = Vec::new();
            let mut current = 0;
            for &id in group {
                if id == e.id {
                    current = route_ids.len();
                    route_ids.push(route.id.clone());
                } else if let Some(r) = best.get(id) {
                    route_ids.push(r.id.clone());
                }
            }
            (route_ids.len() > 1).then(|| ReplyVersions {
                event_id: e.id.clone(),
                route_ids,
                current: current as u32,
            })
        })
        .collect())
}

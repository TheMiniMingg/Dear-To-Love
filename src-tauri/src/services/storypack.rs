//! The `.storypack` format (roadmap section 10): one whole story with every
//! route, its saves and bookmarks, story memory, picture choices and the
//! images it shows.
//! Never API keys, connections, usage records, preferences, logs or absolute
//! paths.
//!
//! ```text
//! manifest.json   format version, app version, SHA-256 and size of every
//!                 other file
//! story.json      PackStory
//! images/<sha256>.<png|jpg|webp>
//! ```
//!
//! This module is pure: checking a pack and planning its new ids touch no
//! files and no database. `services::archive` does the I/O.

use std::collections::{BTreeMap, HashMap, HashSet};

use serde::{Deserialize, Serialize};

use crate::db::memory::chain_hash;
use crate::db::timeline::EventRow;
use crate::domain::events::{EventBody, StateEdit, EVENT_PAYLOAD_VERSION};
use crate::domain::replay::EffectiveState;
use crate::domain::story_state::StoryStateV1;
use crate::domain::visuals::VisualSlot;
use crate::errors::{AppError, AppResult, ErrorCode};

pub const FORMAT_VERSION: u32 = 1;
pub const MANIFEST: &str = "manifest.json";
pub const STORY: &str = "story.json";
pub const IMAGES_DIR: &str = "images/";

pub const MAX_ROUTES: usize = 10_000;
pub const MAX_EVENTS: usize = 500_000;
pub const MAX_SAVES: usize = 10_000;
pub const MAX_BOOKMARKS: usize = 10_000;
pub const MAX_IMAGES: usize = 2_000;
const MAX_TITLE: usize = 200;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub format_version: u32,
    pub app: String,
    pub app_version: String,
    pub exported_at: String,
    pub title: String,
    /// Every file except the manifest, by its name in the ZIP.
    pub files: BTreeMap<String, PackFile>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackFile {
    pub sha256: String,
    pub size: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackStory {
    pub id: String,
    pub title: String,
    pub description: String,
    pub base_state: StoryStateV1,
    pub created_at: String,
    pub updated_at: String,
    pub chapter_outlines: Vec<PackOutline>,
    pub routes: Vec<PackRoute>,
    pub events: Vec<PackEvent>,
    pub saves: Vec<PackSave>,
    #[serde(default)]
    pub bookmarks: Vec<PackBookmark>,
    #[serde(default)]
    pub memory: Vec<PackMemory>,
    #[serde(default)]
    pub pictures: Vec<PackPicture>,
    #[serde(default)]
    pub images: Vec<PackImage>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackOutline {
    pub id: String,
    pub ordinal: i64,
    pub title: String,
    pub outline: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackRoute {
    pub id: String,
    pub label: String,
    pub parent_route_id: Option<String>,
    pub fork_event_id: Option<String>,
    pub head_event_id: String,
    pub is_main: bool,
    pub hidden: bool,
    pub version: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackEvent {
    pub id: String,
    pub origin_route_id: String,
    pub parent_event_id: Option<String>,
    pub kind: String,
    pub payload: serde_json::Value,
    pub payload_version: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackSave {
    pub id: String,
    pub route_id: String,
    pub event_id: String,
    pub label: String,
    pub save_type: String,
    pub slot: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackBookmark {
    pub id: String,
    pub route_id: String,
    pub event_id: String,
    pub label: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackMemory {
    pub kind: String,
    pub source_start_event_id: Option<String>,
    pub source_end_event_id: String,
    pub schema_version: i64,
    pub summary_text: String,
    pub scene_hint_json: Option<String>,
    pub covered_turns: i64,
    pub generator: String,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackPicture {
    pub slot: String,
    pub asset_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackImage {
    pub id: String,
    pub sha256: String,
    pub mime: String,
    pub width: u32,
    pub height: u32,
    pub byte_size: u64,
    pub label: String,
    pub tags: Vec<String>,
    /// For a picture the app made: the description it was drawn from.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub made_from: Option<String>,
}

/// `images/<sha256>.<ext>` for an image, by its type.
pub fn image_file(sha256: &str, mime: &str) -> AppResult<String> {
    let ext = match mime {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        _ => {
            return Err(invalid(format!(
                "an image has an unsupported type {mime:?}"
            )))
        }
    };
    if sha256.len() != 64
        || !sha256
            .chars()
            .all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c))
    {
        return Err(invalid("an image has a malformed checksum"));
    }
    Ok(format!("{IMAGES_DIR}{sha256}.{ext}"))
}

pub fn invalid(detail: impl Into<String>) -> AppError {
    AppError::new(
        ErrorCode::ArchiveInvalid,
        format!("this storypack is damaged or incomplete: {}", detail.into()),
    )
}

/// What `check` learned, for `remap`.
#[derive(Debug, Clone)]
pub struct Checked {
    /// Route indexes, parents before children.
    pub route_order: Vec<usize>,
    /// Event indexes, parents before children.
    pub event_order: Vec<usize>,
    pub bodies: Vec<EventBody>,
}

fn unique<'a>(what: &str, ids: impl Iterator<Item = &'a str>) -> AppResult<HashSet<&'a str>> {
    let mut seen = HashSet::new();
    for id in ids {
        if id.is_empty() || id.len() > 200 {
            return Err(invalid(format!("a {what} has an invalid id")));
        }
        if !seen.insert(id) {
            return Err(invalid(format!("two {what}s share the id {id}")));
        }
    }
    Ok(seen)
}

/// Every cross-reference resolves inside the pack, the event graph is one
/// tree, every event's payload is valid, and every branch replays.
pub fn check(pack: &PackStory) -> AppResult<Checked> {
    if pack.routes.len() > MAX_ROUTES
        || pack.events.len() > MAX_EVENTS
        || pack.saves.len() > MAX_SAVES
        || pack.bookmarks.len() > MAX_BOOKMARKS
        || pack.images.len() > MAX_IMAGES
    {
        return Err(invalid("it is larger than this app accepts"));
    }
    let title = pack.title.trim();
    if title.is_empty() || title.chars().count() > MAX_TITLE {
        return Err(invalid("the story has no usable title"));
    }
    pack.base_state
        .validate()
        .map_err(|e| invalid(format!("the starting state is invalid ({})", e.message)))?;

    let route_ids = unique("route", pack.routes.iter().map(|r| r.id.as_str()))?;
    let event_ids = unique("event", pack.events.iter().map(|e| e.id.as_str()))?;
    unique("save", pack.saves.iter().map(|s| s.id.as_str()))?;
    unique("bookmark", pack.bookmarks.iter().map(|b| b.id.as_str()))?;
    unique(
        "chapter outline",
        pack.chapter_outlines.iter().map(|o| o.id.as_str()),
    )?;
    let image_ids = unique("image", pack.images.iter().map(|i| i.id.as_str()))?;
    unique("image file", pack.images.iter().map(|i| i.sha256.as_str()))?;
    let mut ordinals = HashSet::new();
    for o in &pack.chapter_outlines {
        if !ordinals.insert(o.ordinal) {
            return Err(invalid("two chapter outlines share a number"));
        }
    }

    // Routes: one main route, references resolve, no parent cycles.
    if pack.routes.iter().filter(|r| r.is_main).count() != 1 {
        return Err(invalid("it needs exactly one main route"));
    }
    let route_index: HashMap<&str, usize> = pack
        .routes
        .iter()
        .enumerate()
        .map(|(i, r)| (r.id.as_str(), i))
        .collect();
    for r in &pack.routes {
        if r.label.trim().is_empty() {
            return Err(invalid("a route has no name"));
        }
        if r.is_main && r.parent_route_id.is_some() {
            return Err(invalid("the main route can't have a parent route"));
        }
        if r.is_main && r.hidden {
            return Err(invalid("the main route can't be hidden"));
        }
        if let Some(p) = &r.parent_route_id {
            if !route_ids.contains(p.as_str()) || p == &r.id {
                return Err(invalid(format!("route {} has an unknown parent", r.id)));
            }
        }
        if !event_ids.contains(r.head_event_id.as_str()) {
            return Err(invalid(format!("route {} ends at an unknown event", r.id)));
        }
        if let Some(f) = &r.fork_event_id {
            if !event_ids.contains(f.as_str()) {
                return Err(invalid(format!(
                    "route {} branches from an unknown event",
                    r.id
                )));
            }
        }
    }
    let route_order = topo_order(pack.routes.len(), |i| {
        pack.routes[i]
            .parent_route_id
            .as_deref()
            .map(|p| route_index[p])
    })
    .ok_or_else(|| invalid("the routes refer to each other in a loop"))?;

    // Events: one tree under a chapter start.
    let event_index: HashMap<&str, usize> = pack
        .events
        .iter()
        .enumerate()
        .map(|(i, e)| (e.id.as_str(), i))
        .collect();
    let roots: Vec<&PackEvent> = pack
        .events
        .iter()
        .filter(|e| e.parent_event_id.is_none())
        .collect();
    if roots.len() != 1 || roots[0].kind != "chapter_start" {
        return Err(invalid("the story must start with exactly one chapter"));
    }
    for e in &pack.events {
        if !route_ids.contains(e.origin_route_id.as_str()) {
            return Err(invalid(format!(
                "event {} belongs to an unknown route",
                e.id
            )));
        }
        if let Some(p) = &e.parent_event_id {
            if !event_ids.contains(p.as_str()) {
                return Err(invalid(format!("event {} follows an unknown event", e.id)));
            }
        }
        if e.payload_version < 1 || e.payload_version > EVENT_PAYLOAD_VERSION as i64 {
            return Err(invalid(format!(
                "event {} was written by a newer version of the app",
                e.id
            )));
        }
    }
    let event_order = topo_order(pack.events.len(), |i| {
        pack.events[i]
            .parent_event_id
            .as_deref()
            .map(|p| event_index[p])
    })
    .ok_or_else(|| invalid("the events refer to each other in a loop"))?;

    let bodies = pack
        .events
        .iter()
        .map(|e| {
            EventBody::from_parts(&e.kind, &e.payload.to_string())
                .map_err(|err| invalid(format!("event {} is unreadable ({})", e.id, err.message)))
        })
        .collect::<AppResult<Vec<_>>>()?;

    replay_tree(pack, &event_order, &bodies, &event_index)?;

    // Saves point at an event on their route.
    for s in &pack.saves {
        let Some(&ri) = route_index.get(s.route_id.as_str()) else {
            return Err(invalid(format!(
                "save {} belongs to an unknown route",
                s.id
            )));
        };
        if !matches!(s.save_type.as_str(), "manual" | "quick" | "auto") {
            return Err(invalid(format!("save {} has an unknown type", s.id)));
        }
        let head = pack.routes[ri].head_event_id.as_str();
        if !is_ancestor(pack, &event_index, &s.event_id, head) {
            return Err(invalid(format!("save {} points outside its route", s.id)));
        }
    }

    // Bookmarks too, at most one per event on a route, with a usable name.
    let mut marked = HashSet::new();
    for b in &pack.bookmarks {
        let Some(&ri) = route_index.get(b.route_id.as_str()) else {
            return Err(invalid(format!(
                "bookmark {} belongs to an unknown route",
                b.id
            )));
        };
        let label = b.label.trim();
        if label.is_empty() || label.chars().count() > crate::db::bookmarks::MAX_LABEL {
            return Err(invalid(format!("bookmark {} has no usable name", b.id)));
        }
        let head = pack.routes[ri].head_event_id.as_str();
        if !is_ancestor(pack, &event_index, &b.event_id, head) {
            return Err(invalid(format!(
                "bookmark {} points outside its route",
                b.id
            )));
        }
        if !marked.insert((b.route_id.as_str(), b.event_id.as_str())) {
            return Err(invalid(format!(
                "two bookmarks mark the same place ({})",
                b.id
            )));
        }
    }

    for m in &pack.memory {
        let ok = event_ids.contains(m.source_end_event_id.as_str())
            && m.source_start_event_id
                .as_deref()
                .is_none_or(|s| event_ids.contains(s))
            && matches!(m.kind.as_str(), "summary" | "scene_hint")
            && m.covered_turns >= 0;
        if !ok {
            return Err(invalid("a story summary refers to unknown events"));
        }
    }
    for p in &pack.pictures {
        VisualSlot::parse(&p.slot).map_err(|_| invalid("a picture has an unknown slot"))?;
        if !image_ids.contains(p.asset_id.as_str()) {
            return Err(invalid("a picture refers to an image that isn't included"));
        }
    }
    for i in &pack.images {
        image_file(&i.sha256, &i.mime)?;
    }
    Ok(Checked {
        route_order,
        event_order,
        bodies,
    })
}

/// Indexes ordered so each item comes after its parent; `None` on a cycle.
fn topo_order(n: usize, parent: impl Fn(usize) -> Option<usize>) -> Option<Vec<usize>> {
    let mut children: Vec<Vec<usize>> = vec![Vec::new(); n];
    let mut roots = Vec::new();
    for i in 0..n {
        match parent(i) {
            Some(p) => children[p].push(i),
            None => roots.push(i),
        }
    }
    let mut order = Vec::with_capacity(n);
    let mut stack = roots;
    while let Some(i) = stack.pop() {
        order.push(i);
        stack.extend(children[i].iter().rev());
    }
    (order.len() == n).then_some(order)
}

/// Replays every event once, depth first, cloning state only where the
/// story branches.
fn replay_tree(
    pack: &PackStory,
    order: &[usize],
    bodies: &[EventBody],
    index: &HashMap<&str, usize>,
) -> AppResult<()> {
    let mut children: Vec<Vec<usize>> = vec![Vec::new(); pack.events.len()];
    let mut root = None;
    for &i in order {
        match pack.events[i].parent_event_id.as_deref() {
            Some(p) => children[index[p]].push(i),
            None => root = Some(i),
        }
    }
    let Some(root) = root else {
        return Ok(());
    };
    let mut stack = vec![(root, EffectiveState::new(pack.base_state.clone()))];
    while let Some((i, mut state)) = stack.pop() {
        state.apply(&pack.events[i].id, &bodies[i]).map_err(|e| {
            invalid(format!(
                "event {} can't be applied ({})",
                pack.events[i].id, e.message
            ))
        })?;
        let kids = &children[i];
        if let Some((last, rest)) = kids.split_last() {
            for &c in rest {
                stack.push((c, state.clone()));
            }
            stack.push((*last, state));
        }
    }
    Ok(())
}

fn is_ancestor(
    pack: &PackStory,
    index: &HashMap<&str, usize>,
    candidate: &str,
    head: &str,
) -> bool {
    let mut cur = Some(head);
    let mut steps = 0;
    while let Some(id) = cur {
        if id == candidate {
            return true;
        }
        steps += 1;
        if steps > pack.events.len() {
            return false;
        }
        cur = index
            .get(id)
            .and_then(|&i| pack.events[i].parent_event_id.as_deref());
    }
    false
}

/// The pack with fresh ids for this install, ready to insert in order.
#[derive(Debug, Clone)]
pub struct Remapped {
    pub story_id: String,
    pub base_state: StoryStateV1,
    pub outlines: Vec<PackOutline>,
    /// Parents before children.
    pub routes: Vec<PackRoute>,
    /// Parents before children; payloads rewritten to the new ids.
    pub events: Vec<RemappedEvent>,
    pub saves: Vec<PackSave>,
    pub bookmarks: Vec<PackBookmark>,
    pub memory: Vec<RemappedMemory>,
    pub pictures: Vec<PackPicture>,
    pub main_route_id: String,
}

#[derive(Debug, Clone)]
pub struct RemappedEvent {
    pub id: String,
    pub origin_route_id: String,
    pub parent_event_id: Option<String>,
    pub kind: String,
    pub payload_json: String,
    pub payload_version: i64,
    pub created_at: String,
}

#[derive(Debug, Clone)]
pub struct RemappedMemory {
    pub memory: PackMemory,
    pub source_hash: String,
}

/// New ids for everything the story owns, references rewritten to match.
/// `images` maps each pack image id to the id this install uses for it.
/// Story summaries get their chain hash recomputed, so they stay usable.
pub fn remap(
    pack: &PackStory,
    checked: &Checked,
    images: &HashMap<String, String>,
    mut new_id: impl FnMut() -> String,
) -> Remapped {
    let story_id = new_id();
    let routes_map: HashMap<&str, String> = pack
        .routes
        .iter()
        .map(|r| (r.id.as_str(), new_id()))
        .collect();
    let events_map: HashMap<String, String> = pack
        .events
        .iter()
        .map(|e| (e.id.clone(), new_id()))
        .collect();
    let outlines_map: HashMap<String, String> = pack
        .chapter_outlines
        .iter()
        .map(|o| (o.id.clone(), new_id()))
        .collect();
    let ev = |id: &str| events_map[id].clone();

    let mut base_state = pack.base_state.clone();
    remap_state(&mut base_state, &events_map, images);

    let routes: Vec<PackRoute> = checked
        .route_order
        .iter()
        .map(|&i| {
            let r = &pack.routes[i];
            PackRoute {
                id: routes_map[r.id.as_str()].clone(),
                parent_route_id: r.parent_route_id.as_deref().map(|p| routes_map[p].clone()),
                fork_event_id: r.fork_event_id.as_deref().map(ev),
                head_event_id: ev(&r.head_event_id),
                ..r.clone()
            }
        })
        .collect();
    let main_route_id = routes
        .iter()
        .find(|r| r.is_main)
        .map(|r| r.id.clone())
        .unwrap_or_default();

    let mut events = Vec::with_capacity(pack.events.len());
    for &i in &checked.event_order {
        let e = &pack.events[i];
        let mut body = checked.bodies[i].clone();
        remap_body(&mut body, &events_map, &outlines_map, images);
        events.push(RemappedEvent {
            id: ev(&e.id),
            origin_route_id: routes_map[e.origin_route_id.as_str()].clone(),
            parent_event_id: e.parent_event_id.as_deref().map(ev),
            kind: e.kind.clone(),
            payload_json: body.payload_json(),
            payload_version: e.payload_version,
            created_at: e.created_at.clone(),
        });
    }

    let by_id: HashMap<&str, &RemappedEvent> = events.iter().map(|e| (e.id.as_str(), e)).collect();
    let memory = pack
        .memory
        .iter()
        .map(|m| {
            let end = ev(&m.source_end_event_id);
            RemappedMemory {
                source_hash: chain_hash(&chain_to(&by_id, &story_id, &end)),
                memory: PackMemory {
                    source_start_event_id: m.source_start_event_id.as_deref().map(ev),
                    source_end_event_id: end,
                    ..m.clone()
                },
            }
        })
        .collect();

    Remapped {
        base_state,
        outlines: pack
            .chapter_outlines
            .iter()
            .map(|o| PackOutline {
                id: outlines_map[&o.id].clone(),
                ..o.clone()
            })
            .collect(),
        saves: pack
            .saves
            .iter()
            .map(|s| PackSave {
                id: new_id(),
                route_id: routes_map[s.route_id.as_str()].clone(),
                event_id: ev(&s.event_id),
                ..s.clone()
            })
            .collect(),
        bookmarks: pack
            .bookmarks
            .iter()
            .map(|b| PackBookmark {
                id: new_id(),
                route_id: routes_map[b.route_id.as_str()].clone(),
                event_id: ev(&b.event_id),
                ..b.clone()
            })
            .collect(),
        pictures: pack
            .pictures
            .iter()
            .filter_map(|p| {
                images.get(&p.asset_id).map(|a| PackPicture {
                    slot: p.slot.clone(),
                    asset_id: a.clone(),
                })
            })
            .collect(),
        routes,
        events,
        memory,
        story_id,
        main_route_id,
    }
}

/// Root-first chain ending at `end`, as event rows (for `chain_hash`).
fn chain_to(by_id: &HashMap<&str, &RemappedEvent>, story_id: &str, end: &str) -> Vec<EventRow> {
    let mut chain = Vec::new();
    let mut cur = Some(end);
    while let Some(id) = cur {
        let Some(e) = by_id.get(id) else { break };
        chain.push(EventRow {
            id: e.id.clone(),
            story_id: story_id.to_string(),
            origin_route_id: e.origin_route_id.clone(),
            parent_event_id: e.parent_event_id.clone(),
            kind: e.kind.clone(),
            payload_json: e.payload_json.clone(),
            generation_run_id: None,
            created_at: e.created_at.clone(),
        });
        cur = e.parent_event_id.as_deref();
    }
    chain.reverse();
    chain
}

fn remap_event_ref(id: &mut Option<String>, events: &HashMap<String, String>) {
    *id = id.as_ref().and_then(|i| events.get(i).cloned());
}

fn remap_state(
    state: &mut StoryStateV1,
    events: &HashMap<String, String>,
    images: &HashMap<String, String>,
) {
    for f in &mut state.known_facts {
        remap_event_ref(&mut f.source_event_id, events);
    }
    for r in &mut state.relationships {
        remap_event_ref(&mut r.source_event_id, events);
    }
    for n in &mut state.notes {
        remap_event_ref(&mut n.source_event_id, events);
    }
    // A picture whose image isn't in the pack is dropped, never left
    // pointing at whatever this install might have under that id.
    state.visual_refs = std::mem::take(&mut state.visual_refs)
        .into_iter()
        .filter_map(|(slot, a)| images.get(&a).map(|n| (slot, n.clone())))
        .collect();
}

fn remap_body(
    body: &mut EventBody,
    events: &HashMap<String, String>,
    outlines: &HashMap<String, String>,
    images: &HashMap<String, String>,
) {
    match body {
        EventBody::ChapterStart(p) => {
            p.source_outline_id = p
                .source_outline_id
                .as_ref()
                .and_then(|o| outlines.get(o).cloned());
        }
        EventBody::Edit(p) => {
            for c in &mut p.changes {
                match c {
                    StateEdit::UpsertFact { fact } => {
                        remap_event_ref(&mut fact.source_event_id, events)
                    }
                    StateEdit::UpsertNote { note } => {
                        remap_event_ref(&mut note.source_event_id, events)
                    }
                    StateEdit::SetRelationships { relationships } => {
                        for r in relationships {
                            remap_event_ref(&mut r.source_event_id, events);
                        }
                    }
                    StateEdit::SetVisualRef { asset_id, .. } => {
                        *asset_id = asset_id.as_ref().and_then(|a| images.get(a).cloned());
                    }
                    _ => {}
                }
            }
        }
        EventBody::FactConfirm(p) => remap_event_ref(&mut p.fact.source_event_id, events),
        EventBody::Player(_) | EventBody::Assistant(_) | EventBody::Checkpoint(_) => {}
    }
}

#[cfg(test)]
mod tests;

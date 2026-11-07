//! Reader-facing view that combines timeline, state, saves and the reply
//! status of the route head into one DTO.

use serde::Serialize;
use sqlx::FromRow;
use ts_rs::TS;

use crate::db::assets::{self, StoryVisual};
use crate::db::providers;
use crate::db::runs::{self, RunDto};
use crate::db::state::StateView;
use crate::db::timeline::{
    append_event, get_event, get_route, is_ancestor, list_routes, route_chapters, route_history,
    AppendEvent, Appended, ChapterDto, EventDto, RouteDto,
};
use crate::db::Database;
use crate::domain::bonds;
use crate::domain::events::{EditPayload, EventBody, StateEdit};
use crate::domain::notes::{self, MemoryNote, NoteKind, NoteTag};
use crate::domain::provider::{Billing, StorytellerChoice};
use crate::domain::story_state::StoryStateV1;
use crate::domain::threads;
use crate::domain::visuals::VisualSlot;
use crate::errors::{AppError, AppResult};
use crate::services::mock_storyteller::MOCK_PROVIDER_LABEL;

#[derive(Debug, Clone, Serialize, TS, FromRow)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct StoryHeader {
    pub id: String,
    pub title: String,
    pub description: String,
}

/// Who writes new replies.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct StorytellerInfo {
    /// `None` = the built-in offline storyteller.
    pub profile_id: Option<String>,
    pub label: String,
    pub model_id: Option<String>,
    pub billing: Billing,
    /// The story's own choice; absent when it follows the app's storyteller
    /// (and always absent for the app's storyteller itself).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub story_choice: Option<StorytellerChoice>,
}

/// Present when the route head is a player action without a reply.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AwaitingReply {
    pub input_event_id: String,
    /// A run that is pending or streaming right now.
    pub active_run: Option<RunDto>,
    /// The most recent finished attempt (failed, cancelled, interrupted).
    pub last_run: Option<RunDto>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RouteView {
    pub story: StoryHeader,
    pub route: RouteDto,
    pub routes: Vec<RouteDto>,
    pub history: Vec<EventDto>,
    pub chapters: Vec<ChapterDto>,
    pub state: StateView,
    pub awaiting_reply: Option<AwaitingReply>,
    pub storyteller: StorytellerInfo,
    /// Story-default pictures. A route's own choices are in
    /// `state.state.visualRefs` and win over these.
    pub visuals: Vec<StoryVisual>,
}

/// The app's storyteller (Settings).
pub async fn storyteller_info(db: &Database) -> AppResult<StorytellerInfo> {
    info_for(db, providers::storyteller(db).await?, None).await
}

/// Who writes this story's replies, and whether the story chose it itself.
pub async fn story_storyteller_info(db: &Database, story_id: &str) -> AppResult<StorytellerInfo> {
    let choice = {
        let mut conn = db.reader().acquire().await?;
        providers::story_choice(&mut conn, story_id).await?
    };
    let profile = providers::story_storyteller(db, story_id).await?;
    info_for(db, profile, choice).await
}

async fn info_for(
    db: &Database,
    profile_id: Option<String>,
    story_choice: Option<StorytellerChoice>,
) -> AppResult<StorytellerInfo> {
    if let Some(id) = profile_id {
        if let Ok(row) = providers::get_profile_row(db, &id).await {
            return Ok(StorytellerInfo {
                profile_id: Some(row.id.clone()),
                label: row.label.clone(),
                model_id: Some(row.model_id.clone()),
                billing: row.billing(),
                story_choice,
            });
        }
    }
    Ok(StorytellerInfo {
        profile_id: None,
        label: MOCK_PROVIDER_LABEL.into(),
        model_id: None,
        billing: Billing::Local,
        story_choice,
    })
}

pub async fn route_view(db: &Database, route_id: &str) -> AppResult<RouteView> {
    let route = {
        let mut conn = db.reader().acquire().await?;
        get_route(&mut conn, route_id).await?
    };
    let story =
        sqlx::query_as::<_, StoryHeader>("SELECT id, title, description FROM stories WHERE id = ?")
            .bind(&route.story_id)
            .fetch_one(db.reader())
            .await?;
    let head = route
        .head_event_id
        .clone()
        .ok_or_else(|| AppError::internal("route has no head event"))?;
    let history = route_history(db, route_id).await?;
    let awaiting_reply = match history.last() {
        Some(e) if matches!(e.body, EventBody::Player(_)) => {
            let active_run = runs::active_run_for_route(db, route_id)
                .await?
                .filter(|r| r.input_event_id == e.id);
            let last_run = match &active_run {
                Some(_) => None,
                None => runs::latest_run_for_input(db, route_id, &e.id).await?,
            };
            Some(AwaitingReply {
                input_event_id: e.id.clone(),
                active_run,
                last_run,
            })
        }
        _ => None,
    };
    Ok(RouteView {
        routes: list_routes(db, &route.story_id).await?,
        chapters: route_chapters(db, route_id).await?,
        state: crate::db::state::state_at(db, &route.story_id, &head).await?,
        storyteller: story_storyteller_info(db, &story.id).await?,
        visuals: assets::story_visuals(db, &route.story_id).await?,
        history,
        awaiting_reply,
        story,
        route,
    })
}

/// Longest note kept on a story-details edit (shown in the story).
const MAX_EDIT_NOTE: usize = 500;

/// Change structured story details from the head of this route on. The
/// edit is one event: earlier turns and other routes are untouched, and an
/// edit that would leave an invalid state is refused before anything is
/// written.
pub async fn edit_details(
    db: &Database,
    story_id: &str,
    route_id: &str,
    expected_head_id: &str,
    changes: Vec<StateEdit>,
    note: Option<String>,
) -> AppResult<Appended> {
    let note = note
        .map(|n| n.trim().to_string())
        .filter(|n| !n.is_empty())
        .map(|n| {
            if n.chars().count() > MAX_EDIT_NOTE {
                n.chars().take(MAX_EDIT_NOTE - 1).chain(['…']).collect()
            } else {
                n
            }
        });
    check_pictures(db, story_id, expected_head_id, &changes).await?;
    append_event(
        db,
        AppendEvent {
            story_id: story_id.into(),
            route_id: route_id.into(),
            expected_head_id: expected_head_id.into(),
            body: EventBody::Edit(EditPayload { changes, note }),
            generation_run_id: None,
        },
    )
    .await
}

/// Undo the memory notes one of the storyteller's replies wrote: each note
/// it added is removed, and each one it changed or removed goes back to how
/// it was, from now on. A note changed again since then is left as it is.
/// `note` is shown in the story (the reader's own words); without one it
/// names the notes.
pub async fn undo_reply_notes(
    db: &Database,
    story_id: &str,
    route_id: &str,
    expected_head_id: &str,
    assistant_event_id: &str,
    note: Option<String>,
) -> AppResult<Appended> {
    let event = {
        let mut conn = db.reader().acquire().await?;
        let event = get_event(&mut conn, assistant_event_id).await?;
        if event.story_id != story_id
            || !is_ancestor(&mut conn, story_id, assistant_event_id, expected_head_id).await?
        {
            return Err(AppError::invalid_input("that reply is not on this route"));
        }
        event
    };
    let EventBody::Assistant(reply) = EventBody::from_parts(&event.kind, &event.payload_json)?
    else {
        return Err(AppError::invalid_input(
            "only a storyteller's reply writes notes",
        ));
    };
    let parent = event
        .parent_event_id
        .as_deref()
        .ok_or_else(|| AppError::internal("a reply always follows an action"))?;
    let state = |id: String| async move {
        Ok::<_, AppError>(
            crate::db::state::state_at(db, story_id, &id)
                .await?
                .effective
                .state,
        )
    };
    let before = state(parent.to_string()).await?;
    let after = state(assistant_event_id.to_string()).await?;
    let now = state(expected_head_id.to_string()).await?;
    let find = |list: &[MemoryNote], kind: NoteKind, name: &str| -> Option<MemoryNote> {
        list.iter().find(|n| n.is(kind, name)).cloned()
    };

    let mut keys: Vec<(NoteKind, String)> = Vec::new();
    for tag in notes::scan(&reply.text) {
        let (NoteTag::Remember { kind, name, .. } | NoteTag::Forget { kind, name }) = tag;
        if !keys
            .iter()
            .any(|(k, n)| *k == kind && notes::note_key(n) == notes::note_key(&name))
        {
            keys.push((kind, name));
        }
    }
    let mut changes = Vec::new();
    let mut names = Vec::new();
    for (kind, name) in &keys {
        let (was, wrote, is) = (
            find(&before.notes, *kind, name),
            find(&after.notes, *kind, name),
            find(&now.notes, *kind, name),
        );
        // Notes are the same when their words are (who wrote them last
        // doesn't matter).
        let words = |n: &Option<MemoryNote>| n.as_ref().map(|n| n.text.clone());
        if words(&was) == words(&wrote) || words(&is) != words(&wrote) {
            // The reply changed nothing here, or the note changed since.
            continue;
        }
        changes.push(match was {
            Some(note) => StateEdit::UpsertNote { note },
            None => StateEdit::RemoveNote {
                kind: *kind,
                name: name.clone(),
            },
        });
        names.push(name.clone());
    }
    // Threads it opened or settled go back to where they stood, unless they
    // moved again since.
    let thread_tags = threads::scan(&reply.text);
    let (mut open, mut done) = (now.open_threads.clone(), now.done_threads.clone());
    let mut seen: Vec<String> = Vec::new();
    for tag in &thread_tags {
        let text = tag.text();
        if seen.contains(&threads::thread_key(text)) {
            continue;
        }
        seen.push(threads::thread_key(text));
        let was = threads::standing(&before.open_threads, &before.done_threads, text);
        let wrote = threads::standing(&after.open_threads, &after.done_threads, text);
        if was == wrote || threads::standing(&open, &done, text) != wrote {
            continue;
        }
        // Named in the undo note with the words the log shows.
        let (from_open, from_done) = (
            threads::take(&mut open, text),
            threads::take(&mut done, text),
        );
        let shown = from_open
            .or(from_done)
            .map_or_else(|| text.to_string(), |(_, words)| words);
        let back = |list: &mut Vec<String>, from: &[String]| {
            if let Some((i, words)) = threads::find(from, text) {
                list.insert(i.min(list.len()), words.clone());
            }
        };
        match was {
            Some(false) => back(&mut open, &before.open_threads),
            Some(true) => back(&mut done, &before.done_threads),
            None => {}
        }
        names.push(shown);
    }
    if open != now.open_threads {
        changes.push(StateEdit::SetOpenThreads { open_threads: open });
    }
    if done != now.done_threads {
        changes.push(StateEdit::SetDoneThreads { done_threads: done });
    }
    // Feelings it moved go back to how they were, unless they moved again.
    let bond_tags = bonds::scan(&reply.text);
    let mut relationships = now.relationships.clone();
    let mut moved: Vec<String> = Vec::new();
    for tag in &bond_tags {
        let Some(id) = bonds::character_id(&after, &tag.name) else {
            continue;
        };
        if moved.contains(&id) {
            continue;
        }
        moved.push(id.clone());
        let feeling = |s: &StoryStateV1| {
            bonds::towards_player(s, &id).map(|i| {
                let r = &s.relationships[i];
                (r.status.clone(), r.bond)
            })
        };
        let (was, wrote, is) = (feeling(&before), feeling(&after), feeling(&now));
        if was == wrote || is != wrote {
            continue;
        }
        let Some(i) = relationships
            .iter()
            .position(|r| r.from_id == id && r.to_id == now.player_character_id)
        else {
            continue;
        };
        match was {
            Some((status, bond)) => {
                relationships[i].status = status;
                relationships[i].bond = bond;
            }
            // The reply began this relationship; it goes unless it says more.
            None if relationships[i].label.trim().is_empty() => {
                relationships.remove(i);
            }
            None => {
                relationships[i].status.clear();
                relationships[i].bond = None;
            }
        }
        names.push(
            now.characters
                .get(&id)
                .map_or_else(|| tag.name.clone(), |c| c.name.clone()),
        );
    }
    if relationships != now.relationships {
        changes.push(StateEdit::SetRelationships { relationships });
    }
    if changes.is_empty() {
        return Err(AppError::invalid_input(
            if keys.is_empty() && thread_tags.is_empty() && bond_tags.is_empty() {
                "this reply wrote no memory notes or threads"
            } else {
                "what this reply noted has changed since; change it in Story memory"
            },
        ));
    }
    edit_details(
        db,
        story_id,
        route_id,
        expected_head_id,
        changes,
        note.filter(|n| !n.trim().is_empty())
            .or_else(|| Some(names.join(", "))),
    )
    .await
}

/// A route-specific picture must name a real slot, an image that is in
/// the library, and (for a portrait) a character who is in the story here.
async fn check_pictures(
    db: &Database,
    story_id: &str,
    head_id: &str,
    changes: &[StateEdit],
) -> AppResult<()> {
    let mut characters = None;
    for change in changes {
        let StateEdit::SetVisualRef { slot, asset_id } = change else {
            continue;
        };
        let parsed = VisualSlot::parse(slot)?;
        if !parsed.route_scoped() {
            return Err(AppError::invalid_input(
                "the cover belongs to the whole story; set it as a story default",
            ));
        }
        if let Some(id) = asset_id {
            let mut conn = db.reader().acquire().await?;
            assets::check_available(&mut conn, id, story_id).await?;
        }
        if let VisualSlot::Portrait(cid) = &parsed {
            if characters.is_none() {
                characters = Some(
                    crate::db::state::state_at(db, story_id, head_id)
                        .await?
                        .effective
                        .state
                        .characters,
                );
            }
            let known = characters.as_ref().is_some_and(|c| c.contains_key(cid));
            let added = changes.iter().any(
                |c| matches!(c, StateEdit::UpsertCharacter { character } if &character.id == cid),
            );
            if !known && !added {
                return Err(AppError::invalid_input(format!(
                    "no character {cid} is in the story at this point"
                )));
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests;

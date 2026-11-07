//! Deterministic state reducer: `replay(base, ancestors) -> effective state`.
//!
//! Only explicit events change structured state: `edit` (StateEdit ops) and
//! `fact_confirm`. Chapter starts move the active chapter. Player and
//! assistant prose never silently changes structured fields; the
//! exceptions are tags in the storyteller's replies, which the reader shows
//! where they happen: `<meter>` and `<item>` in a story that keeps bars and
//! items (`tracking`), and the `<remember>` and `<forget>` memory notes
//! unless the player keeps the notes themselves (`manual_memory`).

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use ts_rs::TS;

use super::events::{EventBody, StateEdit};
use super::notes::{self, MAX_NOTES};
use super::story_state::{KnownFact, StoryStateV1};
use crate::errors::{AppError, AppResult};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ActiveChapter {
    pub event_id: String,
    pub chapter_instance_id: String,
    pub title: String,
    pub ordinal: u32,
}

/// Effective state at one event. Also the snapshot cache format.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct EffectiveState {
    pub state: StoryStateV1,
    pub active_chapter: Option<ActiveChapter>,
}

impl EffectiveState {
    pub fn new(base: StoryStateV1) -> Self {
        Self {
            state: base,
            active_chapter: None,
        }
    }

    /// Hash over the canonical serialization (struct order, sorted maps).
    pub fn hash(&self) -> String {
        let json = serde_json::to_string(self).expect("effective state serializes");
        hex::encode(Sha256::digest(json.as_bytes()))
    }

    /// Apply one committed event. Fails if the result would be invalid.
    pub fn apply(&mut self, event_id: &str, body: &EventBody) -> AppResult<()> {
        match body {
            EventBody::ChapterStart(p) => {
                self.active_chapter = Some(ActiveChapter {
                    event_id: event_id.to_string(),
                    chapter_instance_id: p.chapter_instance_id.clone(),
                    title: p.title.clone(),
                    ordinal: p.ordinal,
                });
            }
            EventBody::Assistant(p) => {
                if let Some(tracking) = &mut self.state.tracking {
                    let player = self
                        .state
                        .characters
                        .get(&self.state.player_character_id)
                        .map(|c| c.name.as_str())
                        .unwrap_or_default();
                    tracking.apply_reply(&p.text, player);
                }
                if !self.state.narration.manual_memory {
                    let chapter = self.active_chapter.as_ref().map(|c| c.ordinal);
                    notes::apply_reply(&mut self.state.notes, &p.text, chapter, event_id);
                }
            }
            EventBody::Player(_) | EventBody::Checkpoint(_) => {}
            EventBody::Edit(p) => {
                let chapter = self.active_chapter.as_ref().map(|c| c.ordinal);
                for change in &p.changes {
                    apply_edit(&mut self.state, change, event_id, chapter)?;
                }
                self.state.validate()?;
            }
            EventBody::FactConfirm(p) => {
                let mut fact = p.fact.clone();
                fact.confirmed = true;
                fact.source_event_id
                    .get_or_insert_with(|| event_id.to_string());
                upsert_fact(&mut self.state, fact);
                self.state.validate()?;
            }
        }
        Ok(())
    }
}

fn upsert_fact(state: &mut StoryStateV1, fact: KnownFact) {
    match state.known_facts.iter_mut().find(|f| f.id == fact.id) {
        Some(existing) => *existing = fact,
        None => state.known_facts.push(fact),
    }
}

fn apply_edit(
    state: &mut StoryStateV1,
    edit: &StateEdit,
    event_id: &str,
    chapter: Option<u32>,
) -> AppResult<()> {
    match edit {
        StateEdit::SetWorld { world } => state.world = world.clone(),
        StateEdit::SetNarration { narration } => state.narration = narration.clone(),
        StateEdit::UpsertCharacter { character } => {
            if character.id == state.player_character_id
                && character.control != super::story_state::Control::Player
            {
                return Err(AppError::invalid_input(
                    "the player character must stay player-controlled",
                ));
            }
            state
                .characters
                .insert(character.id.clone(), character.clone());
        }
        StateEdit::RemoveCharacter { character_id } => {
            if character_id == &state.player_character_id {
                return Err(AppError::invalid_input(
                    "the player character cannot be removed",
                ));
            }
            if state.characters.remove(character_id).is_none() {
                return Err(AppError::invalid_input(format!(
                    "character {character_id} does not exist"
                )));
            }
            state
                .relationships
                .retain(|r| &r.from_id != character_id && &r.to_id != character_id);
            for f in &mut state.known_facts {
                f.known_by.retain(|id| id != character_id);
            }
            state.scene.participant_ids.retain(|id| id != character_id);
        }
        StateEdit::SetRelationships { relationships } => {
            state.relationships = relationships.clone();
            for r in &mut state.relationships {
                r.source_event_id
                    .get_or_insert_with(|| event_id.to_string());
            }
        }
        StateEdit::UpsertFact { fact } => {
            let mut fact = fact.clone();
            fact.source_event_id
                .get_or_insert_with(|| event_id.to_string());
            upsert_fact(state, fact);
        }
        StateEdit::RemoveFact { fact_id } => state.known_facts.retain(|f| &f.id != fact_id),
        StateEdit::SetScene { scene } => state.scene = scene.clone(),
        StateEdit::SetOpenThreads { open_threads } => state.open_threads = open_threads.clone(),
        StateEdit::SetTracking { tracking } => state.tracking = tracking.clone(),
        StateEdit::UpsertNote { note } => {
            let exists = state.notes.iter().any(|n| n.is(note.kind, &note.name));
            if !exists && state.notes.len() >= MAX_NOTES {
                return Err(AppError::invalid_input(format!(
                    "this story already keeps {MAX_NOTES} memory notes; remove some first"
                )));
            }
            let mut note = note.clone();
            note.name = note.name.split_whitespace().collect::<Vec<_>>().join(" ");
            note.text = note.text.trim().to_string();
            note.chapter = note.chapter.or(chapter);
            note.source_event_id = Some(event_id.to_string());
            notes::upsert(&mut state.notes, note);
        }
        StateEdit::RemoveNote { kind, name } => {
            notes::remove(&mut state.notes, *kind, name);
        }
        StateEdit::SetVisualRef { slot, asset_id } => match asset_id {
            Some(a) => {
                state.visual_refs.insert(slot.clone(), a.clone());
            }
            None => {
                state.visual_refs.remove(slot);
            }
        },
    }
    Ok(())
}

/// Replay `events` (ordered root..head) on top of `start`.
pub fn replay<'a>(
    start: EffectiveState,
    events: impl IntoIterator<Item = (&'a str, &'a EventBody)>,
) -> AppResult<EffectiveState> {
    let mut s = start;
    for (id, body) in events {
        s.apply(id, body)?;
    }
    Ok(s)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::events::{
        ChapterStartPayload, EditPayload, FactConfirmPayload, PlayerPayload,
    };
    use crate::domain::story_state::fixtures::lighthouse;
    use crate::domain::story_state::{Character, Control};

    fn edit(changes: Vec<StateEdit>) -> EventBody {
        EventBody::Edit(EditPayload {
            changes,
            note: None,
        })
    }

    #[test]
    fn prose_does_not_change_state_but_chapters_and_edits_do() {
        let base = EffectiveState::new(lighthouse());
        let events = [
            (
                "c1".to_string(),
                EventBody::ChapterStart(ChapterStartPayload {
                    chapter_instance_id: "ci1".into(),
                    title: "One".into(),
                    ordinal: 1,
                    source_outline_id: None,
                    previous_chapter_recap: None,
                }),
            ),
            (
                "p1".to_string(),
                EventBody::Player(PlayerPayload::new("I sail to the mainland")),
            ),
        ];
        let s = replay(base.clone(), events.iter().map(|(i, b)| (i.as_str(), b))).unwrap();
        assert_eq!(s.state, base.state);
        assert_eq!(s.active_chapter.as_ref().unwrap().title, "One");

        let mut s2 = s.clone();
        s2.apply(
            "e1",
            &edit(vec![StateEdit::SetOpenThreads {
                open_threads: vec![],
            }]),
        )
        .unwrap();
        assert!(s2.state.open_threads.is_empty());
        assert_ne!(s2.hash(), s.hash());
    }

    #[test]
    fn replies_change_tracked_bars_and_items_only_when_kept() {
        use crate::domain::events::AssistantPayload;
        use crate::domain::tracking::{Meter, Tracking};
        let reply = |text: &str| {
            EventBody::Assistant(AssistantPayload {
                text: text.into(),
                finish_reason: None,
                provider_label: None,
                model_id: None,
            })
        };
        let hit = reply("A wave slams you into the rail. <meter name=\"Health\" change=\"-15\"/>");
        let mut s = EffectiveState::new(lighthouse());
        s.apply("a1", &hit).unwrap();
        assert_eq!(s.state, lighthouse().clone(), "no tracking, no change");

        s.apply(
            "e1",
            &edit(vec![StateEdit::SetTracking {
                tracking: Some(Tracking {
                    meters: vec![Meter {
                        name: "Health".into(),
                        value: 100,
                        max: Some(100),
                        who: None,
                    }],
                    inventory: true,
                    items: vec![],
                }),
            }]),
        )
        .unwrap();
        s.apply("a2", &hit).unwrap();
        s.apply(
            "a3",
            &reply("<item gain=\"Brass Key\">Cold and heavy.</item>"),
        )
        .unwrap();
        // The player's own words change nothing.
        s.apply(
            "p1",
            &EventBody::Player(PlayerPayload::new("<meter name=\"Health\" set=\"100\"/>")),
        )
        .unwrap();
        let t = s.state.tracking.as_ref().unwrap();
        assert_eq!(t.meters[0].value, 85);
        assert_eq!(t.items[0].name, "Brass Key");

        s.apply("e2", &edit(vec![StateEdit::SetTracking { tracking: None }]))
            .unwrap();
        assert_eq!(s.state.tracking, None);
    }

    #[test]
    fn remove_character_cleans_references_and_protects_player() {
        let mut s = EffectiveState::new(lighthouse());
        s.apply(
            "e",
            &edit(vec![StateEdit::RemoveCharacter {
                character_id: "npc-mara".into(),
            }]),
        )
        .unwrap();
        assert!(s.state.relationships.is_empty());
        let err = s
            .apply(
                "e2",
                &edit(vec![StateEdit::RemoveCharacter {
                    character_id: "pc".into(),
                }]),
            )
            .unwrap_err();
        assert_eq!(err.code, crate::errors::ErrorCode::InvalidInput);
    }

    #[test]
    fn invalid_edit_is_rejected() {
        let mut s = EffectiveState::new(lighthouse());
        let before = s.clone();
        let bad = Character {
            id: "pc".into(),
            name: "Wren".into(),
            control: Control::Npc,
            gender: None,
            pronouns: None,
            age: None,
            role: None,
            species: None,
            description: None,
            appearance: None,
            personality: vec![],
            goals: vec![],
            abilities: vec![],
            stats: vec![],
            color: None,
        };
        assert!(s
            .apply(
                "e",
                &edit(vec![StateEdit::UpsertCharacter { character: bad }])
            )
            .is_err());
        // Callers discard `s` on error; replay of committed events never sees this.
        let _ = before;
    }

    #[test]
    fn fact_confirm_marks_confirmed_with_source() {
        let mut s = EffectiveState::new(lighthouse());
        s.apply(
            "f1",
            &EventBody::FactConfirm(FactConfirmPayload {
                fact: KnownFact {
                    id: "lamp".into(),
                    text: "Mara has a key to the lighthouse".into(),
                    known_by: vec!["pc".into()],
                    source_event_id: None,
                    confirmed: false,
                },
            }),
        )
        .unwrap();
        let f = &s.state.known_facts[0];
        assert!(f.confirmed);
        assert_eq!(f.source_event_id.as_deref(), Some("f1"));
    }

    #[test]
    fn replies_write_memory_notes_with_their_chapter() {
        use crate::domain::events::AssistantPayload;
        use crate::domain::notes::{MemoryNote, NoteKind};
        let reply = |text: &str| {
            EventBody::Assistant(AssistantPayload {
                text: text.into(),
                finish_reason: None,
                provider_label: None,
                model_id: None,
            })
        };
        let mut s = EffectiveState::new(lighthouse());
        s.apply(
            "c4",
            &EventBody::ChapterStart(ChapterStartPayload {
                chapter_instance_id: "ci4".into(),
                title: "Four".into(),
                ordinal: 4,
                source_outline_id: None,
                previous_chapter_recap: None,
            }),
        )
        .unwrap();
        s.apply(
            "a1",
            &reply("<remember event=\"Ring given\">Z gave Erika a ring.</remember>"),
        )
        .unwrap();
        let n = &s.state.notes[0];
        assert_eq!((n.kind, n.chapter), (NoteKind::Event, Some(4)));
        assert_eq!(n.source_event_id.as_deref(), Some("a1"));

        // The player's own note keeps the chapter it is written in.
        s.apply(
            "e1",
            &edit(vec![StateEdit::UpsertNote {
                note: MemoryNote {
                    kind: NoteKind::Place,
                    name: "  Z's   house ".into(),
                    text: " Two floors. ".into(),
                    chapter: None,
                    source_event_id: Some("elsewhere".into()),
                },
            }]),
        )
        .unwrap();
        let n = &s.state.notes[1];
        assert_eq!(
            (n.name.as_str(), n.text.as_str(), n.chapter),
            ("Z's house", "Two floors.", Some(4))
        );
        assert_eq!(n.source_event_id.as_deref(), Some("e1"));

        // With notes kept by hand, replies don't write them.
        let mut narration = s.state.narration.clone();
        narration.manual_memory = true;
        s.apply("e2", &edit(vec![StateEdit::SetNarration { narration }]))
            .unwrap();
        s.apply("a2", &reply("<forget event=\"Ring given\"/>"))
            .unwrap();
        assert_eq!(s.state.notes.len(), 2);
        s.apply(
            "e3",
            &edit(vec![StateEdit::RemoveNote {
                kind: NoteKind::Event,
                name: "ring GIVEN".into(),
            }]),
        )
        .unwrap();
        assert_eq!(s.state.notes.len(), 1);
    }
}

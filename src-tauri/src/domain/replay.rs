//! Deterministic state reducer: `replay(base, ancestors) -> effective state`.
//!
//! Only explicit events change structured state: `edit` (StateEdit ops) and
//! `fact_confirm`. Chapter starts move the active chapter. Player and
//! assistant prose never silently changes structured fields.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use ts_rs::TS;

use super::events::{EventBody, StateEdit};
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
            EventBody::Player(_) | EventBody::Assistant(_) | EventBody::Checkpoint(_) => {}
            EventBody::Edit(p) => {
                for change in &p.changes {
                    apply_edit(&mut self.state, change, event_id)?;
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

fn apply_edit(state: &mut StoryStateV1, edit: &StateEdit, event_id: &str) -> AppResult<()> {
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
                }),
            ),
            (
                "p1".to_string(),
                EventBody::Player(PlayerPayload {
                    text: "I sail to the mainland".into(),
                }),
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
            description: None,
            appearance: None,
            personality: vec![],
            goals: vec![],
            abilities: vec![],
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
}

use super::*;
use crate::db::memory::MemoryRow;
use crate::domain::events::{AssistantPayload, PlayerPayload};
use crate::domain::templates::{QuickStartInput, TemplateCatalog};
use crate::services::tokens::estimate_messages;

fn state() -> EffectiveState {
    let input = TemplateCatalog::bundled()
        .resolve_quick_start(&QuickStartInput {
            world_id: "starter:harbor-town".into(),
            scenario_id: "starter:unsigned-letter".into(),
            character_id: "starter:new-keeper".into(),
            perspective: None,
            detail: None,
        })
        .unwrap();
    EffectiveState::new(input.base_state)
}

fn event(i: usize, body: EventBody) -> EventRow {
    let (kind, payload_json) = (body.kind().as_str(), body.payload_json());
    EventRow {
        id: format!("e{i}"),
        story_id: "s".into(),
        origin_route_id: "r".into(),
        parent_event_id: i.checked_sub(1).map(|p| format!("e{p}")),
        kind: kind.to_string(),
        payload_json,
        generation_run_id: None,
        created_at: String::new(),
    }
}

/// `turns` exchanges, then one unanswered action: e0 player, e1 reply, ...
fn history(turns: usize, words: usize) -> Vec<EventRow> {
    let filler = " word".repeat(words);
    let mut out = Vec::new();
    for t in 0..turns {
        out.push(event(
            out.len(),
            EventBody::Player(PlayerPayload {
                text: format!("action {t}{filler}"),
            }),
        ));
        out.push(event(
            out.len(),
            EventBody::Assistant(AssistantPayload {
                text: format!("reply {t}{filler}"),
                finish_reason: None,
                provider_label: None,
                model_id: None,
            }),
        ));
    }
    out.push(event(
        out.len(),
        EventBody::Player(PlayerPayload {
            text: "the latest action".into(),
        }),
    ));
    out
}

fn roomy() -> Budget {
    Budget {
        max_context_tokens: 100_000,
        max_output_tokens: 700,
    }
}

fn summary_at(end_index: usize, covered: i64, text: &str) -> EligibleSummary {
    EligibleSummary {
        row: MemoryRow {
            id: "m1".into(),
            story_id: "s".into(),
            kind: "summary".into(),
            source_start_event_id: None,
            source_end_event_id: format!("e{end_index}"),
            source_hash: String::new(),
            schema_version: 1,
            summary_text: text.into(),
            covered_turns: covered,
            generator: "test".into(),
            api_request_id: None,
            created_at: String::new(),
        },
        end_index,
    }
}

fn all_text(a: &Assembled) -> String {
    a.messages
        .iter()
        .map(|m| m.content.as_str())
        .collect::<Vec<_>>()
        .join("\n")
}

/// T18: the latest action is sent exactly once, last, as the user's turn.
#[test]
fn latest_action_once_and_last() {
    let a = assemble(&state(), &history(3, 0), None, None, roomy()).unwrap();
    assert_eq!(a.messages[0].role, Role::System);
    assert_eq!(all_text(&a).matches("the latest action").count(), 1);
    let last = a.messages.last().unwrap();
    assert_eq!(
        (last.role, last.content.as_str()),
        (Role::User, "the latest action")
    );
    assert_eq!(a.verbatim_messages, 7);
    assert_eq!(a.omitted_messages, 0);
    assert_eq!(a.estimated_input_tokens, estimate_messages(&a.messages));
}

#[test]
fn reply_needs_a_player_action() {
    let mut h = history(1, 0);
    h.pop();
    let err = assemble(&state(), &h, None, None, roomy()).unwrap_err();
    assert_eq!(err.code, ErrorCode::InvalidInput);
    // Prompt Preview supplies a stand-in action instead.
    let a = assemble(&state(), &h, None, Some("(next)"), roomy()).unwrap();
    assert_eq!(a.messages.last().unwrap().content, "(next)");
}

#[test]
fn tight_budget_drops_oldest_turns_first() {
    let h = history(20, 40);
    let full = assemble(&state(), &h, None, None, roomy()).unwrap();
    let budget = Budget {
        max_context_tokens: full.estimated_input_tokens / 2 + 700,
        max_output_tokens: 700,
    };
    let a = assemble(&state(), &h, None, None, budget).unwrap();
    assert!(a.estimated_input_tokens <= budget.max_context_tokens - budget.max_output_tokens);
    assert!(a.omitted_messages > 0);
    assert_eq!(a.verbatim_messages + a.omitted_messages, 41);
    let text = all_text(&a);
    assert!(text.contains("reply 19"), "newest turns kept");
    assert!(!text.contains("action 0 "), "oldest turns dropped");
    // The window still opens with the user's turn.
    assert_eq!(a.messages[1].role, Role::User);
}

#[test]
fn context_too_long_before_anything_is_sent() {
    let budget = Budget {
        max_context_tokens: 800,
        max_output_tokens: 700,
    };
    let err = assemble(&state(), &history(1, 0), None, None, budget).unwrap_err();
    assert_eq!(err.code, ErrorCode::ContextTooLong);
    assert!(err.message.contains("Settings"));
}

#[test]
fn summary_replaces_the_turns_it_covers() {
    let h = history(10, 0);
    // Summary ends at the reply of turn 4 (index 9).
    let s = summary_at(9, 5, "Mara found the ferry ticket.");
    let a = assemble(&state(), &h, Some(&s), None, roomy()).unwrap();
    assert!(a.messages[0].content.contains("STORY SO FAR"));
    assert!(a.messages[0]
        .content
        .contains("Mara found the ferry ticket."));
    let text = all_text(&a);
    assert!(!text.contains("action 4"), "covered turns are not repeated");
    assert!(text.contains("action 5"));
    let used = a.summary.unwrap();
    assert_eq!((used.covered_turns, used.chunk_from_turn), (5, 1));
    assert_eq!(a.verbatim_messages, 11);
}

#[test]
fn recent_turns_win_over_the_summary_when_room_is_short() {
    let h = history(6, 30);
    let s = summary_at(1, 1, &"memory ".repeat(400));
    let without = assemble(&state(), &h, None, None, roomy()).unwrap();
    let budget = Budget {
        max_context_tokens: without.estimated_input_tokens + 700,
        max_output_tokens: 700,
    };
    let a = assemble(&state(), &h, Some(&s), None, budget).unwrap();
    assert!(a.summary.is_none());
    assert!(a.summary_dropped);
    assert!(a.verbatim_messages > MIN_RECENT_MESSAGES);
}

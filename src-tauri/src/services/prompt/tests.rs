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
            story_type: None,
            language: None,
        })
        .unwrap();
    EffectiveState::new(input.base_state)
}

fn frame() -> StoryFrame {
    StoryFrame {
        title: "The Unsigned Letter".into(),
        premise: "A letter addressed to the keeper.".into(),
        chapter_outline: Some("Arrive, find the letter.".into()),
        earlier_chapters: Vec::new(),
    }
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
            EventBody::Player(PlayerPayload::new(format!("action {t}{filler}"))),
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
        EventBody::Player(PlayerPayload::new("the latest action")),
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
    let a = assemble(&state(), &frame(), &history(3, 0), None, None, roomy()).unwrap();
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
    let err = assemble(&state(), &frame(), &h, None, None, roomy()).unwrap_err();
    assert_eq!(err.code, ErrorCode::InvalidInput);
    // Prompt Preview supplies a stand-in action instead.
    let a = assemble(&state(), &frame(), &h, None, Some("(next)"), roomy()).unwrap();
    assert_eq!(a.messages.last().unwrap().content, "(next)");
}

#[test]
fn tight_budget_drops_oldest_turns_first() {
    let h = history(20, 40);
    let full = assemble(&state(), &frame(), &h, None, None, roomy()).unwrap();
    let budget = Budget {
        max_context_tokens: full.estimated_input_tokens / 2 + 700,
        max_output_tokens: 700,
    };
    let a = assemble(&state(), &frame(), &h, None, None, budget).unwrap();
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
    let err = assemble(&state(), &frame(), &history(1, 0), None, None, budget).unwrap_err();
    assert_eq!(err.code, ErrorCode::ContextTooLong);
    assert!(err.message.contains("Settings"));
}

#[test]
fn summary_replaces_the_turns_it_covers() {
    let h = history(10, 0);
    // Summary ends at the reply of turn 4 (index 9).
    let s = summary_at(9, 5, "Mara found the ferry ticket.");
    let a = assemble(&state(), &frame(), &h, Some(&s), None, roomy()).unwrap();
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
    let without = assemble(&state(), &frame(), &h, None, None, roomy()).unwrap();
    let budget = Budget {
        max_context_tokens: without.estimated_input_tokens + 700,
        max_output_tokens: 700,
    };
    let a = assemble(&state(), &frame(), &h, Some(&s), None, budget).unwrap();
    assert!(a.summary.is_none());
    assert!(a.summary_dropped);
    assert!(a.verbatim_messages > MIN_RECENT_MESSAGES);
}

/// The storyteller learns the premise, the chapter plan and what kind of
/// story this is from the system message.
#[test]
fn premise_chapter_plan_and_content_settings_reach_the_storyteller() {
    let plain = system_prompt(&state(), &frame());
    assert!(
        plain.contains(
            "\nSTORY\nTitle: The Unsigned Letter\nPremise: A letter addressed to the keeper.\n"
        ),
        "{plain}"
    );
    assert!(plain.contains(
        "Chapter plan (a direction to steer toward, not a script): Arrive, find the letter."
    ));
    assert!(
        !plain.contains("Content:") && !plain.contains("under 18"),
        "unset rating says nothing"
    );

    let mut s = state();
    s.state.narration.genres = vec!["Romance".into(), "Comedy".into()];
    s.state.narration.rating = Some(ContentRating::Explicit);
    s.state.narration.themes = vec!["slow burn".into(), "banter".into()];
    s.state.narration.limits = vec!["gore".into()];
    let p = system_prompt(&s, &frame());
    assert!(p.contains("Genre: Romance; Comedy\n"), "{p}");
    assert!(p.contains("Content: adults only."));
    assert!(p.contains("18 or older"));
    assert!(p.contains(MINORS_RULE));
    assert!(p.contains("woven in when they fit: slow burn; banter\n"));
    assert!(p.contains("never write these even if the story drifts toward them: gore\n"));

    s.state.narration.rating = Some(ContentRating::General);
    let p = system_prompt(&s, &frame());
    assert!(p.contains("Content: suitable for all ages."));
    assert!(!p.contains(MINORS_RULE));

    // The starter world's genres reach the storyteller too.
    assert!(
        plain.contains("Genre: Mystery; Romance; Slice of life\n"),
        "{plain}"
    );

    // Nothing to say: no empty STORY heading.
    let mut bare = state();
    bare.state.narration.genres.clear();
    let p = system_prompt(&bare, &StoryFrame::default());
    assert!(!p.contains("STORY\n") && !p.contains("Chapter plan"), "{p}");
}

#[test]
fn the_storyteller_plays_everyone_else_in_one_continuing_world() {
    let p = system_prompt(&state(), &frame());
    assert!(p.contains("- The player controls Sam Ashby. Never decide Sam Ashby's actions"));
    assert!(p.contains("- You play everyone else, from allies to villains to passers-by"));
    assert!(p.contains("not from a script"));
    assert!(p.contains("when Sam Ashby isn't there."));
    assert!(p.contains("- This is one continuing world."));
    assert!(p.contains("a chapter can cover one night or several months"));
    assert!(p.contains("secrets (and who knows them)"));
}

#[test]
fn narration_style_thoughts_messages_and_language_reach_the_storyteller() {
    let mut s = state();
    assert!(s.state.narration.message_cards, "new stories show cards");
    s.state.narration.message_cards = false;
    let plain = system_prompt(&s, &frame());
    assert!(plain.contains("- Narrate in second person"));
    for absent in ["<thought", "MESSAGES\n", "- Write in "] {
        assert!(!plain.contains(absent), "{absent} only when asked");
    }

    s.state.narration.inner_thoughts = true;
    s.state.narration.message_cards = true;
    s.state.narration.language = Some("Japanese".into());
    let p = system_prompt(&s, &frame());
    assert!(p.contains(
        "- Show the inner thoughts of characters other than Sam Ashby as they react, in \
         <thought who=\"Name\">…</thought> tags"
    ));
    assert!(p.contains("Never write Sam Ashby's thoughts."));
    assert!(p.contains("- Write in Japanese, including dialogue and messages"));
    assert!(p.contains("\nMESSAGES\n"));
    assert!(p.contains("<text from=\"Name\" time=\"7:11 PM\">the message</text>"));
    assert!(p.contains("<call with=\"Name\" status=\"ringing\"/>"));
    assert!(p.contains("Sam Ashby may text and call the same way (<text to=\"Name\">)"));
    assert!(p.contains("- Write texts the way that person really texts: short and casual"));
    assert!(p.contains("- Calls sound like real speech"));
    assert!(p.contains("- Characters may text or call Sam Ashby first"));
    assert!(s.state.narration.scene_headings, "new stories have headings");
    s.state.narration.scene_headings = false;
    let p = system_prompt(&s, &frame());
    assert!(!p.contains("SCENE HEADINGS"), "only when asked");
    s.state.narration.scene_headings = true;
    let p = system_prompt(&s, &frame());
    assert!(p.contains(
        "\nSCENE HEADINGS\nWhen the story moves to a new place or a new time, start that part \
         with a heading the app shows above it: <scene place=\"Countryside\" time=\"7:11 PM\"/>."
    ));

    s.state.narration.style = Some(NarrationStyle::Thoughts);
    let p = system_prompt(&s, &frame());
    assert!(p.contains("- Do not narrate. Write only what the characters say and think"));
    assert!(!p.contains("- Narrate in"));
    assert!(
        !p.contains("- Show the inner thoughts"),
        "the style already asks for thoughts"
    );

    s.state.narration.style = Some(NarrationStyle::Messages);
    s.state.narration.message_cards = false;
    let p = system_prompt(&s, &frame());
    assert!(p.contains("- Tell the story mostly through messages"));
    assert!(
        p.contains("\nMESSAGES\n"),
        "the messages style needs the tags"
    );
}

#[test]
fn dice_stats_and_rolls_reach_the_storyteller() {
    let mut s = state();
    let p = system_prompt(&s, &frame());
    assert!(!p.contains("\nDICE\n") && !p.contains("stats: "));

    s.state.narration.dice = true;
    let pc = s.state.player_character_id.clone();
    s.state.characters.get_mut(&pc).unwrap().stats = vec![
        crate::domain::story_state::Stat {
            name: "Smarts".into(),
            value: 2,
        },
        crate::domain::story_state::Stat {
            name: "Nerve".into(),
            value: -1,
        },
    ];
    let p = system_prompt(&s, &frame());
    assert!(p.contains("\nDICE\nDice decide uncertain moments"));
    assert!(p.contains("<roll for=\"what the roll decides\" dice=\"1d20\" target=\"12\"/>"));
    assert!(p.contains("a test scored 0-100 becomes dice=\"40-100\" after Sam Ashby studied"));
    assert!(p.contains("stats: Smarts 2, Nerve -1"));

    // The roll goes to the storyteller ahead of the player's words.
    let roll = crate::domain::dice::roll(
        &crate::domain::dice::RollRequest {
            label: "Pass the exam".into(),
            dice: "40-100".into(),
            stat: None,
            target: Some(60),
            asked: true,
        },
        None,
        &mut |_n| Ok(33),
    )
    .unwrap();
    let action = event(
        1,
        EventBody::Player(PlayerPayload {
            text: "I turn the paper over.".into(),
            roll: Some(roll),
        }),
    );
    let m = turn_message(&action).unwrap().unwrap();
    assert_eq!(
        m.content,
        "<roll for=\"Pass the exam\" dice=\"40-100\" target=\"60\" result=\"73\" \
         outcome=\"success\"/>\n\nI turn the paper over."
    );
}

#[test]
fn a_characters_race_reaches_the_storyteller() {
    let mut s = state();
    let pc = s.state.player_character_id.clone();
    s.state.characters.get_mut(&pc).unwrap().species = Some("Lizardfolk".into());
    let p = system_prompt(&s, &frame());
    assert!(
        p.contains("- Sam Ashby (player character): pronouns: they/them; species: Lizardfolk;"),
        "{p}"
    );
}

use super::*;
use crate::db::memory::MemoryRow;
use crate::domain::events::{AssistantPayload, ChapterStartPayload, PlayerPayload};
use crate::domain::notes::{MemoryNote, NoteKind};
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
        "Chapter plan (only a guide: if the story has gone another way, follow the story and \
         drop or rework the plan): Arrive, find the letter."
    ));
    assert!(plain.contains("Anything not given here (looks, age, species and so on) is left open"));
    assert!(
        !plain.contains("Left open by the player"),
        "the world is set"
    );
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
    assert!(
        s.state.narration.scene_headings,
        "new stories have headings"
    );
    s.state.narration.scene_headings = false;
    let p = system_prompt(&s, &frame());
    assert!(!p.contains("SCENE HEADINGS"), "only when asked");
    assert!(
        p.contains("\nWHERE AND WHEN\n") && p.contains("does not show it"),
        "the app still follows the place and time"
    );
    s.state.narration.scene_headings = true;
    let p = system_prompt(&s, &frame());
    assert!(p.contains(
        "\nSCENE HEADINGS\nWhen the story moves to a new place or a new time, start that part \
         with a heading the app shows above it: <scene place=\"Countryside\" time=\"7:11 PM\"/>."
    ));

    assert!(p.contains("- That is the story's usual way of telling, not a rule"));
    s.state.narration.style = Some(NarrationStyle::Mixed);
    s.state.narration.style_notes = Some("  Like a cozy anime, lots of banter ".into());
    let p = system_prompt(&s, &frame());
    assert!(p.contains("- Tell each moment the way that suits it, in second person"));
    assert!(!p.contains("not a rule"), "mixed is never one way");
    assert!(p.contains("- How the player would like it told: Like a cozy anime, lots of banter\n"));
    // Thoughts come into the mix only when the player shows them.
    let thoughts_were = s.state.narration.inner_thoughts;
    s.state.narration.inner_thoughts = false;
    let p = system_prompt(&s, &frame());
    assert!(p.contains("dialogue for talk, and messages when people text or call"));
    assert!(!p.contains("inner thoughts"));
    s.state.narration.inner_thoughts = true;
    assert!(system_prompt(&s, &frame()).contains(
        "dialogue for talk, other characters' inner thoughts when they matter, and messages"
    ));
    s.state.narration.inner_thoughts = thoughts_were;
    s.state.narration.style_notes = None;

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
fn dice_rules_change_how_rolls_are_asked_for() {
    use crate::domain::story_state::{DiceRules, RollFrequency, RollOdds};
    let mut s = state();
    s.state.narration.dice = true;
    s.state.narration.dice_rules = Some(DiceRules {
        dice: Some("2d6".into()),
        frequency: Some(RollFrequency::Rare),
        odds: Some(RollOdds::Tough),
        no_stats: true,
        crits: true,
        hide_target: true,
        player_only: false,
    });
    let p = system_prompt(&s, &frame());
    assert!(p.contains("<roll for=\"what the roll decides\" dice=\"2d6\" target=\"…\"/>"));
    assert!(p.contains("- Use dice=\"2d6\" for every roll."));
    assert!(!p.contains("Add stat=") && !p.contains("dice=\"40-100\" after"));
    assert!(p.contains("Lean tough: failure is common and costly."));
    assert!(p.contains("- Ask for a roll only at big, dramatic turning points"));
    assert!(p.contains("- Stats are not added to rolls in this story."));
    assert!(p.contains("critical=\"success\" or critical=\"failure\""));

    s.state.narration.dice_rules = Some(DiceRules {
        player_only: true,
        ..DiceRules::default()
    });
    let p = system_prompt(&s, &frame());
    assert!(p.contains("- Never ask for a roll yourself: Sam Ashby rolls when they choose to."));
    assert!(!p.contains("end your reply with a roll"));
    assert!(p.contains("never reroll, ignore or soften it"));
}

#[test]
fn styles_tense_twists_and_control_reach_the_storyteller() {
    use crate::domain::story_state::{Surprises, Tense};
    let mut s = state();
    let p = system_prompt(&s, &frame());
    assert!(p.contains("Never decide Sam Ashby's actions, words, thoughts or feelings"));
    assert!(p.contains("Don't rush to resolve threads or force a twist."));
    assert!(!p.contains("tense"));

    s.state.narration.style = Some(NarrationStyle::Roleplay);
    s.state.narration.tense = Some(Tense::Past);
    s.state.narration.surprises = Some(Surprises::Often);
    s.state.narration.autopilot = true;
    s.state.narration.quiet_phones = true;
    let p = system_prompt(&s, &frame());
    assert!(p.contains("- Write like a roleplay chat, in second person"));
    assert!(p.contains("- Write in the past tense."));
    assert!(p.contains("bring in twists, complications and surprises often"));
    assert!(p.contains("You may describe Sam Ashby's small, natural reactions"));
    assert!(p.contains("- Only Sam Ashby starts texts and calls; others answer."));
    assert!(!p.contains("may text or call Sam Ashby first"));

    s.state.narration.style = Some(NarrationStyle::Adventure);
    s.state.narration.surprises = Some(Surprises::Off);
    let p = system_prompt(&s, &frame());
    assert!(p.contains("- Write like a classic text adventure"));
    assert!(p.contains("don't add surprises of your own"));
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

#[test]
fn tracked_bars_and_items_reach_the_storyteller() {
    use crate::domain::tracking::{Item, Meter, Tracking};
    let mut s = state();
    assert!(!system_prompt(&s, &frame()).contains("TRACKING"));
    s.state.tracking = Some(Tracking {
        meters: vec![
            Meter {
                name: "Health".into(),
                value: 80,
                max: Some(100),
                who: None,
            },
            Meter {
                name: "Gold".into(),
                value: 35,
                max: None,
                who: None,
            },
            Meter {
                name: "Health".into(),
                value: 40,
                max: Some(60),
                who: Some("Kira".into()),
            },
        ],
        inventory: true,
        items: vec![
            Item {
                name: "Healing Potion".into(),
                qty: 2,
                description: "Red and fizzy.".into(),
            },
            Item {
                name: "Rope".into(),
                qty: 1,
                description: String::new(),
            },
        ],
    });
    let p = system_prompt(&s, &frame());
    assert!(p.contains(
        "- Sam Ashby's Health: 80/100\n- Sam Ashby's Gold: 35\n- Kira's Health: 40/60\n\
         - Sam Ashby's inventory:\n  - Healing Potion x2: Red and fizzy.\n  - Rope\n"
    ));
    assert!(p.contains("<meter name=\"Health\" change=\"-12\"/>"));
    assert!(p.contains("<item gain=\"Name\" qty=\"1\">"));

    s.state.tracking.as_mut().unwrap().inventory = false;
    let p = system_prompt(&s, &frame());
    assert!(!p.contains("<item") && !p.contains("inventory"));
}

fn note(kind: NoteKind, name: &str, text: &str, chapter: Option<u32>) -> MemoryNote {
    MemoryNote {
        kind,
        name: name.into(),
        text: text.into(),
        chapter,
        source_event_id: None,
    }
}

#[test]
fn memory_notes_reach_the_storyteller_grouped_by_kind() {
    let mut s = state();
    let p = system_prompt(&s, &frame());
    assert!(p.contains("MEMORY NOTES") && p.contains("<remember person=\"Name\">"));
    assert!(p.contains("<forget person=\"Name\"/>"));
    assert!(!p.contains("\nMEMORY\n"));

    s.state.notes = vec![
        note(
            NoteKind::Event,
            "Ring given",
            "Z gave Erika a ring.",
            Some(4),
        ),
        note(
            NoteKind::Person,
            "Erika",
            "Z's girlfriend.\n Wears his ring.",
            Some(4),
        ),
        note(
            NoteKind::Place,
            "Z's house",
            "Two floors, in the suburbs.",
            None,
        ),
        note(NoteKind::Person, "Haruka", "Won't forgive Z.", Some(3)),
    ];
    let p = system_prompt(&s, &frame());
    assert!(p.contains(
        "\nMEMORY\nNotes kept so far. They stay true unless the story changes them.\n\
         People:\n- Erika: Z's girlfriend. Wears his ring.\n- Haruka: Won't forgive Z.\n\
         Places:\n- Z's house: Two floors, in the suburbs.\n\
         Timeline:\n- Chapter 4, Ring given: Z gave Erika a ring.\n"
    ));

    // Kept by hand: the notes are still read, but the storyteller isn't
    // asked to write any.
    s.state.narration.manual_memory = true;
    s.state.narration.language = Some("Japanese".into());
    let p = system_prompt(&s, &frame());
    assert!(p.contains("- Erika: Z's girlfriend."));
    assert!(!p.contains("MEMORY NOTES") && !p.contains("<remember"));
    assert!(!p.contains("OPEN THREADS") && !p.contains("<character"));

    s.state.narration.manual_memory = false;
    let p = system_prompt(&s, &frame());
    assert!(p.contains("- Write notes in Japanese.\n"));
    assert!(p.contains("\nOPEN THREADS\n") && p.contains("<thread done>"));
    assert!(p.contains("\nNEW CHARACTERS\n") && p.contains("<character name=\"Rowan Ellis\""));
    assert!(
        p.contains("skin tone or heritage, hair, eyes, clothes"),
        "cards give a painter what they need"
    );
    assert!(p.contains("Write threads and cards in Japanese.\n"));
}

#[test]
fn next_moves_the_time_and_open_threads_reach_the_storyteller() {
    let mut s = state();
    s.state.scene.time = "  Midnight ".into();
    s.state.open_threads = vec!["Find the sender".into()];
    let p = system_prompt(&s, &frame());
    assert!(p.contains("Time: Midnight\n"));
    assert!(p.contains("Open threads: Find the sender\n"));
    assert!(p.contains("\nNEXT MOVES\n"));
    assert!(p.contains("<next>Ask Mina about the sketches</next>"));
    s.state.narration.no_suggestions = true;
    let p = system_prompt(&s, &frame());
    assert!(!p.contains("NEXT MOVES") && !p.contains("<next>"));
    s.state.scene.time.clear();
    assert!(!system_prompt(&s, &frame()).contains("Time:"));
}

#[test]
fn when_notes_dont_fit_the_scene_comes_first_and_the_rest_are_named() {
    let filler = " detail".repeat(40);
    let mut notes: Vec<MemoryNote> = (0..30)
        .map(|i| {
            note(
                NoteKind::Place,
                &format!("Room {i}"),
                &format!("Room{filler}"),
                None,
            )
        })
        .collect();
    notes.insert(0, note(NoteKind::Person, "Erika", "Wears Z's ring.", None));
    notes.push(note(
        NoteKind::Event,
        "Old fight",
        &format!("Fight{filler}"),
        Some(1),
    ));

    // Room enough: everything, in order.
    let all = pick_notes(&notes, "", Some(1_000_000));
    assert_eq!(all.shown.len(), notes.len());
    assert!(all.unshown.is_empty());

    // Not enough: Erika (named in the scene) first, then the newest
    // places; the event and the oldest rooms are left out but named.
    let line_cost = crate::services::tokens::estimate_text(&format!("- Room 10: Room{filler}\n"));
    let pick = pick_notes(&notes, "erika smiles at you", Some(line_cost * 5 + 20));
    let shown: Vec<&str> = pick.shown.iter().map(|n| n.name.as_str()).collect();
    assert_eq!(
        shown,
        ["Erika", "Room 25", "Room 26", "Room 27", "Room 28", "Room 29"]
    );
    assert!(pick.unshown.iter().any(|n| n.name == "Old fight"));

    let mut s = state();
    s.state.notes = notes;
    let mut history = history(1, 0);
    // A tiny context: the notes get a fifth of what's left for the prompt.
    let a = assemble(
        &s,
        &frame(),
        &history,
        None,
        Some("I ask Erika about the ring"),
        Budget {
            max_context_tokens: 9_000,
            max_output_tokens: 700,
        },
    )
    .unwrap();
    let text = all_text(&a);
    assert!(text.contains("- Erika: Wears Z's ring."));
    assert!(text.contains("Also kept but not shown here for room: "));
    assert!(text.contains("Old fight (event)"));
    history.clear();
}

#[test]
fn older_chapters_are_sent_in_brief_instead_of_dropped() {
    let s = state();
    let mut f = frame();
    f.earlier_chapters = (1..=60)
        .map(|i| ChapterRecap {
            ordinal: i,
            title: format!("Part {i}"),
            recap: format!(
                "Chapter {i} opened at the harbor. Then a lot more happened{} in the end.",
                " and more".repeat(40)
            ),
        })
        .collect();
    let p = system_prompt(&s, &f);
    // 60 chapters: 1-10 left to the summary, 11-50 in brief, 51-60 in full.
    assert!(p.contains("(Chapters 1 to 10 are covered by the story summary and the notes.)\n"));
    assert!(p.contains("In brief:\nChapter 11, Part 11: Chapter 11 opened at the harbor.\n"));
    assert!(p.contains("Chapter 50, Part 50: Chapter 50 opened at the harbor.\nIn full:\n"));
    assert!(p.contains("Chapter 51, Part 51: Chapter 51 opened at the harbor. Then a lot more"));
    assert!(!p.contains("Chapter 10, Part 10"));

    // A few chapters: all in full, no headings.
    f.earlier_chapters.truncate(3);
    let p = system_prompt(&s, &f);
    assert!(!p.contains("In brief") && !p.contains("In full"));
    assert!(p.contains("Chapter 3, Part 3: Chapter 3 opened"));
}

#[test]
fn a_brief_keeps_whole_sentences_and_cuts_one_long_one() {
    assert_eq!(brief("One.  Two!\nThree?"), "One. Two! Three?");
    let long = format!("{}.", "word ".repeat(100));
    let b = brief(&long);
    assert!(b.ends_with('…'));
    assert!(b.chars().count() <= BRIEF_RECAP_CHARS);
}

#[test]
fn a_world_left_blank_is_left_open() {
    let mut s = state();
    s.state.world = crate::domain::story_state::World::default();
    let p = system_prompt(&s, &frame());
    assert!(p.contains(
        "\nWORLD\nLeft open by the player: let it take shape from the opening and from what \
         they do.\n"
    ));
}

#[test]
fn an_unnamed_chapter_and_a_bare_relationship_read_plainly() {
    use crate::domain::replay::ActiveChapter;
    use crate::domain::story_state::Relationship;
    let mut s = state();
    s.active_chapter = Some(ActiveChapter {
        event_id: "e1".into(),
        chapter_instance_id: "c1".into(),
        title: "Chapter 1".into(),
        ordinal: 1,
    });
    s.state.relationships = vec![Relationship {
        from_id: "@player".into(),
        to_id: "@player".into(),
        label: "Rival".into(),
        status: " ".into(),
        source_event_id: None,
        bond: None,
    }];
    let p = system_prompt(&s, &frame());
    assert!(p.contains("\nNOW\nChapter 1\n"), "{p}");
    assert!(!p.contains("Chapter 1: Chapter 1"));
    assert!(p.contains(": Rival\n") && !p.contains("Rival ("), "{p}");

    s.active_chapter.as_mut().unwrap().title = "Low Tide".into();
    assert!(system_prompt(&s, &frame()).contains("\nNOW\nChapter 1: Low Tide\n"));
}

#[test]
fn feelings_and_their_bars_reach_the_storyteller() {
    use crate::domain::story_state::{Bond, BondKind, Relationship};
    let mut s = state();
    let player = s.state.player_character_id.clone();
    s.state.relationships.push(Relationship {
        from_id: "starter:npc-mara".into(),
        to_id: player,
        label: String::new(),
        status: "Warmer since the lamp".into(),
        source_event_id: None,
        bond: Some(Bond {
            kind: BondKind::Trust,
            value: 35,
        }),
    });
    let p = system_prompt(&s, &frame());
    assert!(
        p.contains(": Warmer since the lamp [trust 35/100]\n"),
        "{p}"
    );
    assert!(p.contains("\nFEELINGS\n") && p.contains("<bond name=\"Mina\" heart=\"+10\">"));
    // Kept by hand: the bars are read, but the storyteller doesn't move them.
    s.state.narration.manual_memory = true;
    let p = system_prompt(&s, &frame());
    assert!(p.contains("[trust 35/100]") && !p.contains("FEELINGS"));
}

/// A story after a few hundred turns and twenty chapters, with a big cast,
/// full notebook and long replies, still fits the default context: the
/// storyteller gets the summary, the scene and the newest turns.
#[test]
fn a_long_story_still_fits_the_default_context() {
    use crate::domain::provider::{DEFAULT_MAX_CONTEXT_TOKENS, DEFAULT_MAX_OUTPUT_TOKENS};
    use crate::domain::story_state::{Character, KnownFact, Relationship};

    let sentence = |n: usize, what: &str| -> String {
        (0..n)
            .map(|i| format!("{what} {i} goes on a while about small things."))
            .collect::<Vec<_>>()
            .join(" ")
    };
    let mut s = state();
    for i in 0..30 {
        let c: Character = serde_json::from_value(serde_json::json!({
            "id": format!("custom:npc-{i:08x}"),
            "name": format!("Person {i} Lastname"),
            "control": "npc",
            "pronouns": "she/her",
            "age": "around thirty",
            "role": "dockhand at the harbor",
            "description": sentence(4, "About"),
            "appearance": sentence(5, "Looks"),
            "personality": ["wry", "patient", "stubborn", "kind"],
            "goals": ["Pay off the boat", "Find out who wrote the letter"],
        }))
        .unwrap();
        s.state.characters.insert(c.id.clone(), c);
    }
    let ids: Vec<String> = s.state.characters.keys().cloned().collect();
    s.state.scene.participant_ids = vec!["custom:npc-00000007".into()];
    s.state.relationships = ids
        .iter()
        .take(30)
        .map(|id| Relationship {
            from_id: id.clone(),
            to_id: "@player".into(),
            label: "old friend".into(),
            status: "wary since the storm".into(),
            source_event_id: None,
            bond: None,
        })
        .collect();
    s.state.known_facts = (0..25)
        .map(|i| KnownFact {
            id: format!("f{i}"),
            text: sentence(2, "Fact"),
            known_by: ids.iter().take(3).cloned().collect(),
            source_event_id: None,
            confirmed: true,
        })
        .collect();
    s.state.notes = (0..crate::domain::notes::MAX_NOTES)
        .map(|i| {
            note(
                NoteKind::Person,
                &format!("Note {i}"),
                &sentence(5, "Detail"),
                Some(1),
            )
        })
        .collect();
    s.state.open_threads = (0..crate::domain::threads::MAX_OPEN)
        .map(|i| format!("Thread {i}: find out what happened at the old pier"))
        .collect();
    let mut f = frame();
    f.earlier_chapters = (1..=20)
        .map(|i| ChapterRecap {
            ordinal: i,
            title: format!("Part {i}"),
            recap: sentence(12, "Recap"),
        })
        .collect();

    // 300 turns of long replies; the newest summary (offline, its longest)
    // covers all but the last eight.
    let history = history(300, 250);
    let summary_text = (0..40)
        .map(|i| {
            format!(
                "- Sam: {} → {}",
                sentence(2, "Did"),
                sentence(3, &format!("Then {i}"))
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    let end = 2 * 292 - 1;
    let a = assemble(
        &s,
        &f,
        &history,
        Some(&summary_at(end, 292, &summary_text)),
        None,
        Budget {
            max_context_tokens: DEFAULT_MAX_CONTEXT_TOKENS,
            max_output_tokens: DEFAULT_MAX_OUTPUT_TOKENS,
        },
    )
    .unwrap();
    assert!(a.estimated_input_tokens <= DEFAULT_MAX_CONTEXT_TOKENS - DEFAULT_MAX_OUTPUT_TOKENS);
    assert!(a.summary.is_some(), "the summary should still fit");
    assert!(a.verbatim_messages > MIN_RECENT_MESSAGES);

    // The player and whoever is in the scene in full; others in brief.
    let system = &a.messages[0].content;
    let line = |name: &str| {
        system
            .lines()
            .find(|l| l.starts_with(&format!("- {name} (")))
            .unwrap_or_default()
            .to_string()
    };
    assert!(line("Person 7 Lastname").contains("looks: Looks 0"));
    let player = &s.state.characters[&s.state.player_character_id].name;
    assert!(line(player).contains("(player character)"));
    let brief = line("Person 29 Lastname");
    assert!(
        brief.contains("role: dockhand") && !brief.contains("looks:"),
        "{brief}"
    );
    assert!(system.contains("Some are listed in brief for room"));
    // The newest facts and threads, saying what was left out.
    assert!(system.contains("earlier facts are left out here for room"));
    assert!(system.contains("Thread 39:") && !system.contains("Thread 0:"));
    assert!(system.contains(" (and 28 older ones)\n"));
    // Older chapters in brief only.
    assert!(system.contains("In brief:\nChapter 1, Part 1:") && !system.contains("In full:"));

    // The same story with plenty of room is sent whole.
    let roomy = assemble(
        &s,
        &f,
        &history,
        Some(&summary_at(end, 292, &summary_text)),
        None,
        roomy(),
    )
    .unwrap();
    let whole = &roomy.messages[0].content;
    assert!(!whole.contains("listed in brief") && !whole.contains("left out here"));
    assert!(whole.contains("In full:") && !whole.contains("older ones)"));
}

/// Chapter 1 with `turns` exchanges, chapter 2's start (with `recap`, if
/// any), then `after` more exchanges and one unanswered action.
fn two_chapters(turns: usize, recap: Option<&str>, after: usize) -> Vec<EventRow> {
    let chapter = |ordinal: u32, title: &str, recap: Option<&str>| {
        EventBody::ChapterStart(ChapterStartPayload {
            chapter_instance_id: format!("c{ordinal}"),
            title: title.into(),
            ordinal,
            source_outline_id: None,
            previous_chapter_recap: recap.map(Into::into),
        })
    };
    let reply = |text: String| {
        EventBody::Assistant(AssistantPayload {
            text,
            finish_reason: None,
            provider_label: None,
            model_id: None,
        })
    };
    let mut bodies = vec![chapter(1, "The Lamp Room", None)];
    for t in 0..turns {
        bodies.push(EventBody::Player(PlayerPayload::new(format!("action {t}"))));
        bodies.push(reply(format!("reply {t}")));
    }
    bodies.push(chapter(2, "The Pier", recap));
    for t in 0..after {
        bodies.push(EventBody::Player(PlayerPayload::new(format!("next {t}"))));
        bodies.push(reply(format!("answer {t}")));
    }
    bodies.push(EventBody::Player(PlayerPayload::new("the latest action")));
    bodies
        .into_iter()
        .enumerate()
        .map(|(i, b)| event(i, b))
        .collect()
}

/// Ending a chapter with a recap frees its room at once: the recap stands
/// in for its turns, all but the last exchange, which keeps the seam.
#[test]
fn an_ended_chapters_recap_takes_the_place_of_its_turns() {
    let h = two_chapters(12, Some("Sam found the letter and kept it."), 2);
    let a = assemble(&state(), &frame(), &h, None, None, roomy()).unwrap();
    let text = all_text(&a);
    assert!(a.messages[0].content.contains("EARLIER CHAPTERS"));
    assert!(text.contains("Sam found the letter and kept it."));
    assert!(!text.contains("action 0") && !text.contains("reply 10"));
    // The last exchange of chapter 1, then chapter 2 word for word.
    assert!(text.contains("action 11") && text.contains("reply 11"));
    assert!(text.contains("next 0") && text.contains("answer 1"));
    assert_eq!(a.verbatim_messages, 2 + 4 + 1);
    assert_eq!(a.omitted_messages, 0, "covered by the recap, not left out");

    // A chapter ended without a recap keeps all its turns.
    let bare = assemble(
        &state(),
        &frame(),
        &two_chapters(12, Some("  "), 2),
        None,
        None,
        roomy(),
    )
    .unwrap();
    assert!(all_text(&bare).contains("action 0"));

    // A summary newer than the chapter start still decides where turns start.
    // e0 is chapter 1, e25 chapter 2, e29 its second answer.
    let s = summary_at(29, 14, "The ferry left without them.");
    let later = assemble(&state(), &frame(), &h, Some(&s), None, roomy()).unwrap();
    let text = all_text(&later);
    assert!(!text.contains("reply 11") && !text.contains("answer 1"));
    assert!(later.messages[0]
        .content
        .contains("later turns follow as messages"));

    // An older summary is kept, and says the recaps cover what came after it.
    let s = summary_at(6, 3, "The bell rang.");
    let older = assemble(&state(), &frame(), &h, Some(&s), None, roomy()).unwrap();
    assert!(older.messages[0].content.contains("The bell rang."));
    assert!(older.messages[0]
        .content
        .contains("the chapter recaps above cover"));
    assert!(!all_text(&older).contains("action 3"));
}

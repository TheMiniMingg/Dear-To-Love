use super::banks::*;
use super::*;
use crate::domain::story_state::{sample_lighthouse, DiceRules, StoryStateV1};
use crate::domain::tracking::{Item, Tracking};

fn with(f: impl FnOnce(&mut StoryStateV1)) -> EffectiveState {
    let mut s = sample_lighthouse();
    f(&mut s);
    EffectiveState::new(s)
}

/// Replies to the same action over many turns.
fn replies(s: &EffectiveState, action: &str) -> Vec<String> {
    (1..60).map(|turn| reply(s, action, turn, false)).collect()
}

fn all_lines() -> Vec<&'static str> {
    let mut out: Vec<&str> = Vec::new();
    for f in [
        Flavor::Fantasy,
        Flavor::Future,
        Flavor::Dark,
        Flavor::Heart,
        Flavor::Wild,
        Flavor::Plain,
    ] {
        let b = bank(f);
        for list in [
            b.beats, b.look, b.moves, b.handle, b.fight, b.twists, b.details, b.ways,
        ] {
            out.extend(list);
        }
    }
    for list in [
        OTHER,
        WIT,
        TALK_ALONE,
        CLOSERS,
        ROLL_SUCCESS,
        ROLL_FAILURE,
        CRIT_SUCCESS,
        CRIT_FAILURE,
        STAKES,
        MAGIC,
        HURT,
        WIN,
        FOUND,
        REST,
        AFTER_TEXT,
        BUZZ,
    ] {
        out.extend(list);
    }
    for v in [
        Voice::Bright,
        Voice::Wry,
        Voice::Soft,
        Voice::Gruff,
        Voice::Plain,
    ] {
        out.extend(voices(v).talk.iter().map(|(doing, _)| *doing));
    }
    out
}

#[test]
fn deterministic_and_reacts_to_the_action() {
    let s = EffectiveState::new(sample_lighthouse());
    let a = reply(&s, "Open the letter", 3, false);
    assert_eq!(a, reply(&s, "Open the letter", 3, false));
    assert_ne!(a, reply(&s, "Close the door", 4, false));
    assert!(
        !a.contains("Open the letter"),
        "the action is shown already"
    );
}

#[test]
fn sets_the_scene_only_when_a_chapter_opens() {
    let s = EffectiveState::new(sample_lighthouse());
    let location = s.state.scene.location.clone();
    assert!(reply(&s, "Look around", 1, true).starts_with(location.trim_end_matches('.')));
    assert!(!reply(&s, "Look around", 2, false).contains(&location));

    let s = with(|s| s.narration.scene_headings = true);
    let r = reply(&s, "Look around", 1, true);
    assert!(
        r.starts_with(&format!(
            "<scene place=\"{}\"/>",
            location.trim_end_matches('.')
        )),
        "{r}"
    );
    assert!(reply(&s, "Drive back to town", 4, false).starts_with("<scene time=\"Later\"/>"));
    assert!(!reply(&s, "Look around", 4, false).contains("<scene"));
}

#[test]
fn never_mentions_a_particular_world() {
    let s = EffectiveState::new(sample_lighthouse());
    for (i, action) in [
        "Look around",
        "Ask about the ship",
        "Go outside",
        "Take the key",
        "Wait",
    ]
    .iter()
    .enumerate()
    {
        let r = reply(&s, action, i, false).to_lowercase();
        for word in ["harbor", "gull", "letter", "salt", "lighthouse"] {
            assert!(!r.contains(word), "{action}: {r}");
        }
    }
}

#[test]
fn every_line_fits_every_point_of_view() {
    for view in [Perspective::First, Perspective::Second, Perspective::Third] {
        for pronoun in [Pronoun::She, Pronoun::He, Pronoun::They] {
            let p = Person {
                view,
                name: "Wren".into(),
                pronoun,
            };
            for line in all_lines() {
                let out = p.say(line);
                assert!(!out.contains('{'), "{view:?}: {out}");
                if view != Perspective::Second {
                    let words = Words::of(&out);
                    assert!(!words.any(&["you", "your", "yourself"]), "{view:?}: {out}");
                }
            }
        }
    }
    let third = Person {
        view: Perspective::Third,
        name: "Wren".into(),
        pronoun: Pronoun::They,
    };
    assert_eq!(
        third.say("{You} take{s} a hit that knocks the breath out of {you!}."),
        "Wren takes a hit that knocks the breath out of them."
    );
    let first = Person {
        view: Perspective::First,
        name: "Wren".into(),
        pronoun: Pronoun::They,
    };
    assert_eq!(
        first.say("{You} {are} still standing, and {your} hands shake."),
        "I am still standing, and my hands shake."
    );
}

#[test]
fn writes_for_the_kind_of_story() {
    let cases = [
        (vec!["Romance", "Fantasy"], Flavor::Fantasy),
        (vec!["Cyberpunk"], Flavor::Future),
        (vec!["Mystery", "Romance"], Flavor::Dark),
        (vec!["Slice of life"], Flavor::Heart),
        (vec!["Western"], Flavor::Wild),
        (vec![], Flavor::Plain),
    ];
    for (genres, want) in cases {
        let s = with(|s| s.narration.genres = genres.iter().map(|g| g.to_string()).collect());
        assert_eq!(flavor(&s), want, "{genres:?}");
        let beats = bank(want).beats;
        let r = reply(&s, "Wait", 3, false);
        let p = Person {
            view: Perspective::Second,
            name: "Wren".into(),
            pronoun: Pronoun::They,
        };
        assert!(
            beats.iter().any(|b| r.contains(&p.say(b))),
            "{genres:?}: {r}"
        );
    }
    let s = with(|s| s.world.era = "Medieval".into());
    assert_eq!(flavor(&s), Flavor::Fantasy);
}

#[test]
fn talks_through_a_character_who_is_present_in_their_own_voice() {
    let s = EffectiveState::new(sample_lighthouse());
    let mara = present_npc(&s, &Seed(vec![1])).unwrap();
    assert_eq!(voice_of(mara), Voice::Wry);
    let r = reply(&s, "\"Who wrote this?\" I ask.", 5, false);
    assert!(r.contains(&mara.name), "{r}");
    assert!(
        voices(Voice::Wry)
            .talk
            .iter()
            .any(|(_, said)| r.contains(said)),
        "{r}"
    );
    assert_eq!(classify("Ask Mara about the storm"), ActionKind::Talk);
    assert_eq!(classify("I look out of the window"), ActionKind::Look);
    assert_eq!(classify("Walk to the door"), ActionKind::Move);
    assert_eq!(classify("Picks up the lamp"), ActionKind::Handle);
    assert_eq!(classify("Sigh"), ActionKind::Other);
}

#[test]
fn answers_texts_and_calls_like_people_do() {
    let mut state = sample_lighthouse();
    let s = EffectiveState::new(state.clone());
    let r = reply(
        &s,
        "<text to=\"Mara Quill\">Are you awake?</text>",
        2,
        false,
    );
    assert!(r.starts_with("<text from=\"Mara Quill\">"), "{r}");
    // Several short texts in her voice, not one long one.
    assert!(
        voices(Voice::Wry)
            .texts
            .iter()
            .any(|burst| burst.iter().all(|m| r.contains(m))),
        "{r}"
    );
    let r = reply(&s, "<call with=\"Mara\" status=\"ringing\"/>", 2, false);
    assert!(
        r.starts_with("<call with=\"Mara\" status=\"connected\"/>\n\nMara: \""),
        "{r}"
    );
    assert!(r.matches("Mara: \"").count() >= 2, "{r}");
    assert!(!reply(&s, "Wave", 3, false).contains("<thought"));
    state.narration.inner_thoughts = true;
    let r = reply(&EffectiveState::new(state), "Wave", 3, false);
    assert!(r.contains("<thought who=\"Mara\">"), "{r}");
    assert_eq!(first_tag_attr("<text to=\"\">x</text>", "text", "to"), None);
}

#[test]
fn characters_text_first_now_and_then_unless_asked_not_to() {
    let s = with(|s| {
        s.narration.message_cards = true;
        s.narration.genres = vec!["Slice of life".into()];
    });
    let all = replies(&s, "Wait for the rain to stop");
    assert!(
        all.iter().any(|r| r.contains("<text from=\"")),
        "someone texts first sometimes"
    );
    assert!(all.iter().filter(|r| r.contains("<text from=\"")).count() < all.len() / 2);

    let quiet = with(|s| {
        s.narration.message_cards = true;
        s.narration.quiet_phones = true;
        s.narration.genres = vec!["Slice of life".into()];
    });
    assert!(replies(&quiet, "Wait for the rain to stop")
        .iter()
        .all(|r| !r.contains("<text")));
    // No phones in a fantasy world.
    let fantasy = with(|s| {
        s.narration.message_cards = true;
        s.narration.genres = vec!["Fantasy".into()];
    });
    assert!(replies(&fantasy, "Wait for the rain to stop")
        .iter()
        .all(|r| !r.contains("<text")));
}

#[test]
fn follows_the_style() {
    let script = with(|s| s.narration.style = Some(NarrationStyle::Script));
    let r = reply(&script, "\"Who wrote this?\" I ask.", 5, false);
    assert!(r.contains("\nMara: \"") || r.starts_with("Mara: \""), "{r}");
    for para in r.split("\n\n") {
        assert!(
            para.starts_with('*') || para.starts_with("Mara: \"") || para.starts_with('<'),
            "a script has only lines and stage directions: {para}"
        );
    }
    let r = reply(&script, "Open the window", 6, false);
    for direction in r.split("\n\n").filter(|p| p.starts_with('*')) {
        assert!(!Words::of(direction).any(&["you", "your"]), "{direction}");
    }
    assert!(
        r.contains("Mara: \""),
        "the others are in the scene too: {r}"
    );

    let roleplay = with(|s| s.narration.style = Some(NarrationStyle::Roleplay));
    let r = reply(&roleplay, "Open the window", 6, false);
    assert!(r.starts_with('*'), "{r}");

    let thoughts = with(|s| s.narration.style = Some(NarrationStyle::Thoughts));
    let r = reply(&thoughts, "Open the window", 6, false);
    assert!(r.contains("<thought who=\"Mara\">"), "{r}");

    let adventure = with(|s| s.narration.style = Some(NarrationStyle::Adventure));
    let r = reply(&adventure, "Look around", 1, true);
    assert!(r.starts_with("**"), "{r}");
    let p = Person {
        view: Perspective::Second,
        name: "Wren".into(),
        pronoun: Pronoun::They,
    };
    assert!(
        bank(Flavor::Plain)
            .ways
            .iter()
            .any(|w| r.ends_with(&p.say(w))),
        "{r}"
    );

    let messages = with(|s| {
        s.narration.style = Some(NarrationStyle::Messages);
        s.narration.genres = vec!["Romance".into()];
    });
    let r = reply(&messages, "\"Are you still up?\"", 4, false);
    assert!(r.contains("<text from=\"Mara\">"), "{r}");

    let brief = with(|s| s.narration.detail = Detail::Brief);
    let detailed = with(|s| s.narration.detail = Detail::Cinematic);
    assert!(
        reply(&brief, "Open the window", 6, false).len()
            < reply(&detailed, "Open the window", 6, false).len()
    );
}

#[test]
fn asks_for_rolls_when_dice_are_on_and_follows_the_result() {
    let mut state = sample_lighthouse();
    let s = EffectiveState::new(state.clone());
    assert!(!reply(&s, "Try to pick the lock", 2, false).contains("<roll"));
    state.narration.dice = true;
    let s = EffectiveState::new(state);
    let r = reply(&s, "try to pick the lock. Carefully.", 2, false);
    assert!(
        r.contains("<roll for=\"Try to pick the lock\" dice=\"1d20\" target=\""),
        "{r}"
    );
    assert!(r.ends_with("\"/>"), "the roll is the last thing: {r}");
    assert!(!reply(&s, "Look around", 3, false).contains("<roll"));

    let p = Person {
        view: Perspective::Second,
        name: "Wren".into(),
        pronoun: Pronoun::They,
    };
    let said = |lines: &[&str], r: &str| lines.iter().any(|l| r.contains(&p.say(l)));
    let won = reply(
        &s,
        "<roll for=\"Pick the lock\" dice=\"1d20\" target=\"10\" result=\"14\" \
         outcome=\"success\"/>",
        3,
        false,
    );
    assert!(said(ROLL_SUCCESS, &won), "{won}");
    assert!(!won.contains("<roll"), "no second roll for the same moment");
    let lost = reply(
        &s,
        "<roll for=\"Pick the lock\" dice=\"1d20\" target=\"10\" result=\"4\" \
         outcome=\"failure\"/>",
        3,
        false,
    );
    assert!(said(ROLL_FAILURE, &lost), "{lost}");
    let crit = reply(
        &s,
        "<roll for=\"Pick the lock\" dice=\"1d20\" target=\"10\" result=\"20\" \
         critical=\"success\" outcome=\"success\"/>",
        3,
        false,
    );
    assert!(said(CRIT_SUCCESS, &crit), "{crit}");
    let score = reply(
        &s,
        "<roll for=\"Exam score\" dice=\"40-100\" result=\"73\"/>",
        3,
        false,
    );
    assert!(score.contains("73"), "{score}");
}

fn target_of(r: &str) -> i32 {
    first_tag_attr(r, "roll", "target")
        .unwrap()
        .parse()
        .unwrap()
}

#[test]
fn follows_the_dice_settings() {
    let rules = |r: DiceRules| {
        with(move |s| {
            s.narration.dice = true;
            s.narration.dice_rules = Some(r);
        })
    };
    let only_me = rules(DiceRules {
        player_only: true,
        ..Default::default()
    });
    assert!(!reply(&only_me, "Try to pick the lock", 2, false).contains("<roll"));

    let own = rules(DiceRules {
        dice: Some("2d6".into()),
        ..Default::default()
    });
    let r = reply(&own, "Try to pick the lock", 2, false);
    assert!(r.contains("dice=\"2d6\""), "{r}");
    assert!((3..=12).contains(&target_of(&r)), "{r}");

    let rare = rules(DiceRules {
        frequency: Some(RollFrequency::Rare),
        ..Default::default()
    });
    assert!(!reply(&rare, "Try to pick the lock", 2, false).contains("<roll"));
    assert!(reply(&rare, "Attack the guard", 2, false).contains("<roll"));

    let often = rules(DiceRules {
        frequency: Some(RollFrequency::Often),
        ..Default::default()
    });
    assert!(replies(&often, "Open the door")
        .iter()
        .any(|r| r.contains("<roll")));

    let odds = |o: RollOdds| {
        let s = rules(DiceRules {
            odds: Some(o),
            ..Default::default()
        });
        target_of(&reply(&s, "Try to pick the lock", 2, false))
    };
    assert!(odds(RollOdds::Generous) < odds(RollOdds::Fair));
    assert!(odds(RollOdds::Fair) < odds(RollOdds::Tough));
}

#[test]
fn surprises_come_as_often_as_asked() {
    let twists = |s: &EffectiveState| {
        let p = Person {
            view: Perspective::Second,
            name: "Wren".into(),
            pronoun: Pronoun::They,
        };
        replies(s, "Wait")
            .iter()
            .filter(|r| {
                bank(Flavor::Plain)
                    .twists
                    .iter()
                    .any(|t| r.contains(&p.say(t)))
            })
            .count()
    };
    let off = with(|s| s.narration.surprises = Some(Surprises::Off));
    let often = with(|s| s.narration.surprises = Some(Surprises::Often));
    let usual = EffectiveState::new(sample_lighthouse());
    assert_eq!(twists(&off), 0);
    assert!(twists(&usual) > 0);
    assert!(twists(&often) > twists(&usual));
}

fn rpg() -> EffectiveState {
    with(|s| {
        s.narration.genres = vec!["Fantasy".into()];
        s.tracking = Some(Tracking {
            meters: vec![
                Meter {
                    name: "Health".into(),
                    value: 80,
                    max: Some(100),
                    who: None,
                },
                Meter {
                    name: "Mana".into(),
                    value: 30,
                    max: Some(50),
                    who: None,
                },
                Meter {
                    name: "Gold".into(),
                    value: 10,
                    max: None,
                    who: None,
                },
                Meter {
                    name: "Affection".into(),
                    value: 20,
                    max: Some(100),
                    who: Some("Mara".into()),
                },
            ],
            inventory: true,
            items: vec![Item {
                name: "Healing Potion".into(),
                qty: 2,
                description: String::new(),
            }],
        });
    })
}

/// The tracking after the app applies a reply's tags.
fn after(s: &EffectiveState, r: &str) -> Tracking {
    let mut t = s.state.tracking.clone().unwrap();
    t.apply_reply(r, "Wren");
    t
}

fn value(t: &Tracking, name: &str) -> i32 {
    t.meters.iter().find(|m| m.name == name).unwrap().value
}

#[test]
fn keeps_track_of_fights_spells_rest_money_items_and_feelings() {
    let s = rpg();
    let fights = replies(&s, "Attack the goblin with my sword");
    assert!(fights.iter().any(|r| value(&after(&s, r), "Health") < 80));
    assert!(fights.iter().any(|r| value(&after(&s, r), "Gold") > 10));
    for r in &fights {
        let t = after(&s, r);
        assert!(
            value(&t, "Health") <= 100 && value(&t, "Health") >= 0,
            "{r}"
        );
    }

    let r = reply(&s, "Cast a spell of light", 3, false);
    assert!(value(&after(&s, &r), "Mana") < 30, "{r}");

    let r = reply(&s, "Drink the healing potion", 3, false);
    let t = after(&s, &r);
    assert_eq!(t.items[0].qty, 1, "{r}");
    assert!(value(&t, "Health") > 80, "{r}");

    let r = reply(&s, "Rest by the fire", 3, false);
    assert!(value(&after(&s, &r), "Health") > 80, "{r}");

    let r = reply(&s, "Buy a map from the merchant", 3, false);
    assert!(value(&after(&s, &r), "Gold") < 10, "{r}");

    let found = replies(&s, "Search the old chest");
    assert!(
        found.iter().any(|r| after(&s, r).items.len() == 2),
        "searching turns things up sometimes"
    );
    assert!(found.iter().any(|r| after(&s, r).items.len() == 1));

    let talks = replies(&s, "\"You were brave today,\" I tell Mara.");
    assert!(talks.iter().any(|r| value(&after(&s, r), "Affection") > 20));

    let lost = reply(
        &s,
        "<roll for=\"Fight the troll\" dice=\"1d20\" target=\"12\" result=\"3\" \
         outcome=\"failure\"/> Fight the troll",
        3,
        false,
    );
    assert!(value(&after(&s, &lost), "Health") < 80, "{lost}");

    // Without tracking, no tags at all.
    let plain = EffectiveState::new(sample_lighthouse());
    for r in replies(&plain, "Attack the goblin and search its pockets") {
        assert!(!r.contains("<meter") && !r.contains("<item"), "{r}");
    }
}

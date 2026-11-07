use super::*;
use crate::domain::story_state::{Detail, Perspective};
use crate::domain::templates::{QuickStartInput, TemplateCatalog};

fn starter() -> CreateStoryDraft {
    TemplateCatalog::bundled()
        .compose_draft(&QuickStartInput {
            world_id: "starter:glass-orchard".into(),
            scenario_id: "starter:memory-harvest".into(),
            character_id: "starter:botanist".into(),
            perspective: Some(Perspective::First),
            detail: None,
            story_type: None,
            language: None,
        })
        .unwrap()
}

fn messages(d: &CreateStoryDraft) -> Vec<(DraftStep, String)> {
    d.check().into_iter().map(|p| (p.step, p.message)).collect()
}

/// Quick Start, Guided and Custom all end in the same validated input.
#[test]
fn template_draft_is_complete_and_keeps_choices() {
    let d = starter();
    assert!(d.check().is_empty(), "{:?}", d.check());
    assert_eq!(
        d.world_template_id.as_deref(),
        Some("starter:glass-orchard")
    );
    assert_eq!(d.narration.perspective, Perspective::First);
    assert_eq!(d.narration.detail, Detail::Detailed, "world default kept");
    let input = d.into_story_input().unwrap();
    assert_eq!(input.base_state.player_character_id, "starter:botanist");
    assert_eq!(
        input.base_state.relationships[0].to_id, "starter:botanist",
        "@player replaced"
    );
    assert_eq!(input.chapter_outlines.len(), 3);
}

/// M6 exit gate: a story made only of typed values, and every preset can
/// be overridden.
#[test]
fn custom_draft_from_scratch() {
    let mut d = CreateStoryDraft::default();
    let empty = messages(&d);
    assert_eq!(
        empty.iter().map(|(s, _)| *s).collect::<Vec<_>>(),
        [
            DraftStep::World,
            DraftStep::Character,
            DraftStep::Story,
            DraftStep::Story,
            DraftStep::Story
        ]
    );
    d.world.setting = "  A night market on a river barge ".into();
    d.world.rules = vec!["No magic".into(), "   ".into()];
    d.player.name = "Ada".into();
    d.player.pronouns = Some("  ".into());
    d.player.personality = vec!["bold".into(), String::new()];
    d.title = "Lanterns".into();
    d.scene.location = "The barge's stern".into();
    d.first_chapter_title = "Opening Night".into();
    d.npcs.push(Character {
        id: "custom:npc-1".into(),
        name: "Bo".into(),
        control: Control::Player,
        ..Character::default()
    });
    d.relationships.push(Relationship {
        from_id: "custom:npc-1".into(),
        to_id: PLAYER_PLACEHOLDER.into(),
        label: "Rival".into(),
        status: "Friendly".into(),
        source_event_id: None,
    });
    d.chapter_outlines = vec![
        ChapterOutlineInput {
            title: "Opening Night".into(),
            outline: String::new(),
        },
        ChapterOutlineInput::default(),
    ];
    assert!(d.check().is_empty(), "{:?}", d.check());
    let input = d.into_story_input().unwrap();
    let s = &input.base_state;
    assert_eq!(s.player_character_id, CUSTOM_PLAYER_ID);
    assert_eq!(s.world.setting, "A night market on a river barge");
    assert_eq!(s.world.rules, ["No magic"]);
    let pc = &s.characters[CUSTOM_PLAYER_ID];
    assert_eq!((pc.pronouns.as_deref(), pc.personality.len()), (None, 1));
    assert_eq!(
        s.characters["custom:npc-1"].control,
        Control::Npc,
        "others are never player-controlled"
    );
    assert_eq!(s.relationships[0].to_id, CUSTOM_PLAYER_ID);
    assert_eq!(input.chapter_outlines.len(), 1, "blank outlines dropped");
}

/// Conflicting character ids are refused with a fix, never merged.
#[test]
fn conflicts_are_reported_not_merged() {
    let mut d = starter();
    let mut twin = d.player.clone();
    twin.control = Control::Npc;
    d.npcs.push(twin);
    let npc = d.npcs[0].clone();
    d.npcs.push(npc);
    let m = messages(&d);
    assert!(
        m.iter().any(|(_, t)| t.contains("also your character")),
        "{m:?}"
    );
    assert!(
        m.iter().any(|(_, t)| t.contains("in the story twice")),
        "{m:?}"
    );
    assert_eq!(
        d.clone().into_story_input().unwrap_err().code,
        crate::errors::ErrorCode::InvalidInput
    );

    // Removing an NPC without its relationships is caught too.
    let mut d = starter();
    d.npcs.clear();
    let m = messages(&d);
    assert!(m[0].1.contains("no longer in the story"), "{m:?}");
}

#[test]
fn state_limits_surface_as_review_problems() {
    let mut d = starter();
    d.world.description = "x".repeat(20_001);
    let m = messages(&d);
    assert_eq!(m.len(), 1);
    assert_eq!(m[0].0, DraftStep::Review);
    assert!(m[0].1.starts_with("Text field is longer"), "{m:?}");
}

#[test]
fn incomplete_json_still_loads() {
    let d: CreateStoryDraft = serde_json::from_str(r#"{"title":"Half"}"#).unwrap();
    assert_eq!(d.title, "Half");
    assert_eq!(d.draft_schema_version, DRAFT_SCHEMA_VERSION);
    assert_eq!(d.player.id, CUSTOM_PLAYER_ID);
    let newer: CreateStoryDraft = serde_json::from_str(r#"{"draftSchemaVersion":2}"#).unwrap();
    assert_eq!(messages(&newer)[0].0, DraftStep::Review);
}

#[test]
fn content_settings_are_cleaned_and_minors_refused_in_adult_stories() {
    let mut d = starter();
    d.narration.genres = vec![" Romance ".into(), "".into(), "Fantasy".into()];
    d.narration.themes = vec!["slow burn".into(), "  ".into()];
    d.narration.limits = vec![" gore ".into()];
    d.narration.rating = Some(ContentRating::Explicit);
    assert!(d.check().is_empty(), "{:?}", d.check());
    let n = d.clone().into_story_input().unwrap().base_state.narration;
    assert_eq!(n.genres, ["Romance", "Fantasy"]);
    assert_eq!(n.themes, ["slow burn"]);
    assert_eq!(n.limits, ["gore"]);

    d.player.age = Some("17".into());
    d.npcs[0].age = Some("a teenager".into());
    let m = messages(&d);
    assert_eq!(m.len(), 2, "{m:?}");
    assert_eq!(m[0].0, DraftStep::Character);
    assert!(m[0].1.contains("18 or older"));
    assert_eq!(m[1].0, DraftStep::Story);
    assert!(d.into_story_input().is_err());
}

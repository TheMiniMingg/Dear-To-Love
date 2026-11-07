use super::*;
use crate::db::providers::{save_profile, set_storyteller};
use crate::db::test_support::test_db;
use crate::domain::provider::{AdapterKind, Billing, GenerationSettings, ProviderProfileInput};
use crate::services::adapters::test_server::{serve, Reply, TestServer};
use crate::services::memory::MemoryJobs;
use crate::services::secrets::MemoryStore;

fn blank() -> CreateStoryDraft {
    CreateStoryDraft::default()
}

fn catalog() -> TemplateCatalog {
    TemplateCatalog::bundled()
}

#[test]
fn each_step_fills_only_its_own_empty_fields() {
    let mut d = blank();
    assert_eq!(
        empty_fields(&d, Some(DraftStep::World)),
        vec![F::Setting, F::Era, F::WorldDescription, F::WorldRules]
    );
    d.world.setting = "A lighthouse island".into();
    d.player.name = "Robin".into();
    assert_eq!(
        empty_fields(&d, Some(DraftStep::World)),
        vec![F::Era, F::WorldDescription, F::WorldRules]
    );
    assert!(!empty_fields(&d, Some(DraftStep::Character)).contains(&F::Name));
    assert_eq!(empty_fields(&d, Some(DraftStep::Narration)), vec![F::Tone]);
    assert!(empty_fields(&d, Some(DraftStep::Pictures)).is_empty());
    // Review (or no step) covers everything still empty.
    let all = empty_fields(&d, Some(DraftStep::Review));
    assert_eq!(all, empty_fields(&d, None));
    assert!(all.contains(&F::Cast) && all.contains(&F::Era) && !all.contains(&F::Setting));
}

#[test]
fn the_request_builds_on_what_the_player_wrote() {
    let mut d = blank();
    d.story_type = Some("Romance".into());
    d.world.setting = "A lighthouse island".into();
    d.player.name = "Robin Vale".into();
    d.narration.language = Some("Japanese".into());
    let m = fill_messages(&d, &[F::Era, F::Title, F::Cast]);
    let system = &m[0].content;
    assert!(system.contains("\"era\": string"), "{system}");
    assert!(
        system.contains("\"cast\": array of 2 or 3 people"),
        "{system}"
    );
    assert!(system.contains("adult, 18 or older"));
    assert!(system.contains("Write it in Japanese."));
    assert!(
        !system.contains("\"setting\""),
        "only the empty fields are asked for"
    );
    let user = &m[1].content;
    assert!(
        user.contains("\"setting\": \"A lighthouse island\""),
        "{user}"
    );
    assert!(user.contains("\"typeOfStory\": \"Romance\""));
    assert!(user.contains("\"name\": \"Robin Vale\""));

    // With nothing written, the storyteller makes it all up.
    let m = fill_messages(&blank(), &[F::Setting]);
    assert!(m[1].content.contains("has not written anything yet"));
}

#[test]
fn an_answer_fills_empty_fields_and_keeps_the_players_words() {
    let mut d = blank();
    d.world.setting = "A lighthouse island".into();
    let empty = empty_fields(&d, None);
    let reply = r#"Here you go:
```json
{"setting": "Somewhere else", "era": "Present day",
 "worldRules": "Fog rolls in at dusk\n- The ferry runs twice a day",
 "name": "Robin Vale", "age": 16, "personality": ["Curious", "curious", "Stubborn"],
 "title": "  The   Keeper's Light ", "openingScene": "The lamp goes out.\n\nSomeone knocks.",
 "tone": "Quiet and warm",
 "cast": [
   {"name": "Mara Quill", "role": "Ferry captain", "age": "34", "howTheyKnowYou": "Your landlady",
    "personality": ["Gruff"], "appearance": "Salt in her hair."},
   {"name": "Pip", "age": "fifteen", "role": "Deckhand"},
   {"name": "Robin Vale", "role": "Duplicate of the player"}
 ]}
```"#;
    let filled = merge_reply(&mut d, reply, &empty).unwrap();
    assert_eq!(d.world.setting, "A lighthouse island", "typed words stay");
    assert!(!filled.contains(&F::Setting));
    assert_eq!(d.world.era, "Present day");
    assert_eq!(
        d.world.rules,
        vec!["Fog rolls in at dusk", "The ferry runs twice a day"]
    );
    assert_eq!(d.player.name, "Robin Vale");
    assert_eq!(
        d.player.age, None,
        "an age that reads as a minor is dropped"
    );
    assert!(!filled.contains(&F::Age));
    assert_eq!(d.player.personality, vec!["Curious", "Stubborn"]);
    assert_eq!(d.title, "The Keeper's Light");
    assert_eq!(d.scene.summary, "The lamp goes out.\n\nSomeone knocks.");
    assert_eq!(d.narration.tone, "Quiet and warm");
    // Only the adult who isn't the player joins the cast, and how they know
    // you becomes a relationship.
    assert_eq!(d.npcs.len(), 1);
    let mara = &d.npcs[0];
    assert_eq!(
        (mara.id.as_str(), mara.name.as_str()),
        ("custom:npc-1", "Mara Quill")
    );
    assert_eq!(mara.role.as_deref(), Some("Ferry captain"));
    assert_eq!(mara.age.as_deref(), Some("34"));
    assert_eq!(d.relationships.len(), 1);
    assert_eq!(d.relationships[0].label, "Your landlady");
    assert_eq!(d.relationships[0].to_id, PLAYER_PLACEHOLDER);
    assert!(filled.contains(&F::Cast));
    // What the answer left out stays empty, and the draft still checks out.
    assert!(d.first_chapter_title.is_empty());
    assert!(
        d.check().is_empty(),
        "{:?}",
        d.check().iter().map(|p| &p.message).collect::<Vec<_>>()
    );
}

#[test]
fn people_the_player_added_only_get_their_missing_details() {
    let mut d = blank();
    d.npcs.push(Character {
        id: "custom:npc-1".into(),
        name: "Mara".into(),
        role: Some("Ferry captain".into()),
        ..Character::default()
    });
    let cast = fill_messages(&d, &[F::Cast]);
    assert!(cast[0].content.contains("for each of these people"));
    assert!(cast[0].content.contains("Mara"));
    let reply = r#"{"cast": [
        {"name": "mara", "role": "Smuggler", "appearance": "Tall.", "personality": ["Dry"]},
        {"name": "Someone New", "role": "Stranger"}
    ]}"#;
    let filled = merge_reply(&mut d, reply, &[F::Cast]).unwrap();
    assert_eq!(filled, vec![F::Cast]);
    assert_eq!(d.npcs.len(), 1, "nobody new joins a cast the player made");
    assert_eq!(d.npcs[0].role.as_deref(), Some("Ferry captain"));
    assert_eq!(d.npcs[0].appearance.as_deref(), Some("Tall."));
    assert_eq!(d.npcs[0].personality, vec!["Dry"]);
}

#[test]
fn an_answer_without_json_is_an_error() {
    let mut d = blank();
    let e = merge_reply(&mut d, "Sorry, I can't help with that.", &[F::Era]).unwrap_err();
    assert_eq!(e.code, ErrorCode::ProviderError);
    assert_eq!(d, blank());
}

#[test]
fn offline_fills_a_blank_story_from_a_preset() {
    let mut d = blank();
    let empty = empty_fields(&d, None);
    let filled = fill_offline(&catalog(), &mut d, &empty, 0).unwrap();
    assert!(filled.contains(&F::Setting) && filled.contains(&F::Name));
    assert!(filled.contains(&F::Title) && filled.contains(&F::Cast));
    assert!(!d.world.setting.is_empty() && !d.title.is_empty() && !d.npcs.is_empty());
    assert!(d.check().is_empty());
    // Another press may offer another preset.
    let mut other = blank();
    fill_offline(&catalog(), &mut other, &empty, 7).unwrap();
    assert_ne!(other.world.setting, d.world.setting);
}

#[test]
fn offline_follows_the_type_of_story_and_the_words_typed() {
    let mut d = blank();
    d.story_type = Some("Horror".into());
    d.player.name = "Robin".into();
    let empty = empty_fields(&d, None);
    fill_offline(&catalog(), &mut d, &empty, 0).unwrap();
    let world = catalog()
        .worlds
        .into_iter()
        .find(|w| w.world.setting == d.world.setting)
        .unwrap();
    assert!(world.narration.genres.iter().any(|g| g == "Horror"));
    assert_eq!(d.player.name, "Robin", "a typed name stays");

    let mut d = blank();
    d.world.setting = "A café and bookshop in the mountains".into();
    fill_offline(&catalog(), &mut d, &[F::Era, F::Title], 0).unwrap();
    assert_eq!(d.world.setting, "A café and bookshop in the mountains");
    assert_eq!(d.title, "First Week at the Café");
}

#[test]
fn offline_leaves_a_world_no_preset_fits_alone() {
    let mut d = blank();
    d.world.setting = "Zorbulon Prime".into();
    let empty = empty_fields(&d, None);
    let filled = fill_offline(&catalog(), &mut d, &empty, 0).unwrap();
    assert!(filled.is_empty());
    assert!(d.world.era.is_empty() && d.title.is_empty());
}

async fn connect(db: &crate::db::Database, secrets: &MemoryStore, server: &TestServer) -> String {
    let p = save_profile(
        db,
        secrets,
        ProviderProfileInput {
            id: None,
            label: "Test cloud".into(),
            adapter: AdapterKind::OpenaiCompatible,
            base_url: server.base_url.clone(),
            model_id: "story-model".into(),
            billing: Billing::Paid,
            api_key: Some("sk-test".into()),
            settings: GenerationSettings::default(),
        },
    )
    .await
    .unwrap();
    set_storyteller(db, Some(&p.id)).await.unwrap();
    p.id
}

#[tokio::test]
async fn the_storyteller_fills_a_step_in_one_request() {
    let t = test_db().await;
    let secrets = MemoryStore::default();
    let jobs = MemoryJobs::default();
    let env = SummaryEnv {
        db: &t.db,
        secrets: &secrets,
        jobs: &jobs,
        session_id: "session-1",
    };
    let server = serve(vec![Reply::sse_text(
        &[
            r#"{"era": "Present day", "worldDescription": "Fog and ferries.", "#,
            r#""worldRules": ["The lamp must stay lit"]}"#,
        ],
        Some(r#"{"prompt_tokens":200,"completion_tokens":40}"#),
    )])
    .await;
    connect(&t.db, &secrets, &server).await;
    let mut d = blank();
    d.world.setting = "A lighthouse island".into();
    let out = fill_draft(&env, d.clone(), Some(DraftStep::World), false)
        .await
        .unwrap();
    assert_eq!(out.written_by, "Test cloud");
    assert_eq!(out.filled, vec![F::Era, F::WorldDescription, F::WorldRules]);
    assert_eq!(out.draft.world.era, "Present day");
    assert_eq!(out.draft.world.setting, "A lighthouse island");
    let body = &server.requests()[0].body;
    assert!(body.contains("A lighthouse island"), "{body}");
    let purpose: String = sqlx::query_scalar("SELECT purpose FROM api_requests")
        .fetch_one(t.db.reader())
        .await
        .unwrap();
    assert_eq!(purpose, "character_suggestion");

    // A story set to the offline storyteller, or the offline choice, sends nothing.
    d.storyteller = Some(StorytellerChoice::Offline);
    d.world.setting = "A café and bookshop in the mountains".into();
    let out = fill_draft(&env, d.clone(), Some(DraftStep::World), false)
        .await
        .unwrap();
    assert_eq!(out.written_by, OFFLINE_FILL_BY);
    assert!(!out.draft.world.era.is_empty());
    d.storyteller = None;
    fill_draft(&env, d, Some(DraftStep::World), true)
        .await
        .unwrap();
    assert_eq!(server.requests().len(), 1);

    // Nothing empty: nothing is asked.
    let mut full = blank();
    full.narration.tone = "Warm".into();
    let out = fill_draft(&env, full, Some(DraftStep::Narration), false)
        .await
        .unwrap();
    assert!(out.filled.is_empty());
    assert_eq!(server.requests().len(), 1);
}

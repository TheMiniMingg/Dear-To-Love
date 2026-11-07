use std::io::Cursor;

use base64::Engine;
use image::{ImageFormat, Rgb, RgbImage};

use super::*;
use crate::db::assets as rows;
use crate::db::providers::{
    delete_profile, save_profile, set_picture_maker, set_story_choice, set_storyteller, storyteller,
};
use crate::db::stories::create_story;
use crate::db::test_support::{test_db, TestDb};
use crate::domain::provider::{
    Billing, GenerationSettings, ProviderProfileInput, StorytellerChoice,
};
use crate::domain::story::StoryCreated;
use crate::domain::templates::{QuickStartInput, TemplateCatalog};
use crate::services::adapters::test_server::{serve, Reply};
use crate::services::adapters::{Adapter, Charge};
use crate::services::secrets::MemoryStore;

fn png() -> Vec<u8> {
    let img = RgbImage::from_pixel(64, 80, Rgb([120, 90, 60]));
    let mut out = Vec::new();
    img.write_to(&mut Cursor::new(&mut out), ImageFormat::Png)
        .unwrap();
    out
}

fn b64(bytes: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

fn mara() -> Character {
    Character {
        id: "c1".into(),
        name: "Mara Venn".into(),
        species: Some("Lizardfolk".into()),
        gender: Some("Woman".into()),
        age: Some("30".into()),
        role: Some("Smuggler".into()),
        appearance: Some("green  scales,\namber eyes, a long coat".into()),
        personality: vec![
            "wry".into(),
            " ".into(),
            "brave".into(),
            "loyal".into(),
            "stubborn".into(),
        ],
        ..Character::default()
    }
}

fn harbor() -> World {
    World {
        era: "Age of sail".into(),
        setting: "a harbor town".into(),
        ..World::default()
    }
}

#[test]
fn portrait_prompts_describe_the_character_without_names_and_stay_safe() {
    let p = portrait_prompt(&mara(), &harbor(), PortraitStyle::Painted);
    assert_eq!(
        p.text,
        "Head-and-shoulders portrait of a lizardfolk (woman), age 30, a smuggler, a detailed \
         digital painting. Looks: green scales, amber eyes, a long coat. Expression that shows \
         they are wry, brave, loyal. Clothes and a softly blurred background that fit Age of \
         sail, a harbor town. One person, fully clothed, safe for work, no text."
    );
    assert!(!p.text.contains("Mara"), "names are left out");
    assert!(p.avoid.contains("nudity") && p.avoid.contains("sexual content"));

    let plain = Character {
        name: "Sam".into(),
        pronouns: Some("he/him".into()),
        age: Some("late forties".into()),
        ..Character::default()
    };
    let p = portrait_prompt(&plain, &World::default(), PortraitStyle::Anime);
    assert_eq!(
        p.text,
        "Head-and-shoulders portrait of a man, late forties, anime-style illustration, clean \
         line art, soft shading. One person, fully clothed, safe for work, no text."
    );
    let human = Character {
        species: Some("Human".into()),
        ..Character::default()
    };
    assert!(
        portrait_prompt(&human, &World::default(), PortraitStyle::Photo)
            .text
            .starts_with("Head-and-shoulders portrait of a person, a realistic photograph")
    );

    let long = Character {
        appearance: Some("tall ".repeat(1000)),
        ..Character::default()
    };
    let p = portrait_prompt(&long, &harbor(), PortraitStyle::Sketch);
    assert_eq!(p.text.chars().count(), 1500);
    assert!(
        p.text
            .ends_with(" One person, fully clothed, safe for work, no text."),
        "long looks never cut off the safe-for-work sentence"
    );

    let orc = Character {
        species: Some("Orc".into()),
        pronouns: Some("he/him".into()),
        role: Some("Engineer".into()),
        ..Character::default()
    };
    assert!(
        portrait_prompt(&orc, &World::default(), PortraitStyle::Painted)
            .text
            .starts_with("Head-and-shoulders portrait of an orc (man), an engineer,")
    );
}

#[test]
fn request_bodies_match_each_service() {
    let prompt = Prompt {
        text: "A portrait.".into(),
        avoid: "text".into(),
    };
    let sd =
        PictureMaker::new(AdapterKind::StableDiffusion, "http://127.0.0.1:7860/", None).unwrap();
    let body = sd.request_body("default", &prompt);
    assert_eq!(body["prompt"], "A portrait.");
    assert_eq!(body["negative_prompt"], "text");
    assert!(body.get("override_settings").is_none());
    let body = sd.request_body("dreamy-v5", &prompt);
    assert_eq!(
        body["override_settings"]["sd_model_checkpoint"],
        "dreamy-v5"
    );
    assert_eq!(sd.endpoint(), "http://127.0.0.1:7860/sdapi/v1/txt2img");

    let oa = PictureMaker::new(
        AdapterKind::OpenaiImages,
        "https://api.example.com/v1",
        None,
    )
    .unwrap();
    let body = oa.request_body("dall-e-3", &prompt);
    assert_eq!(body["prompt"], "A portrait. Avoid: text.");
    assert_eq!(body["response_format"], "b64_json");
    assert_eq!(body["n"], 1);
    let body = oa.request_body("gpt-image-1", &prompt);
    assert!(body.get("response_format").is_none());
    assert_eq!(
        oa.endpoint(),
        "https://api.example.com/v1/images/generations"
    );

    assert!(PictureMaker::new(AdapterKind::OpenaiCompatible, "https://x.example", None).is_err());
}

#[test]
fn base64_pictures_decode_with_or_without_a_data_prefix() {
    assert_eq!(decode_b64("aGk="), Some(b"hi".to_vec()));
    assert_eq!(
        decode_b64(" data:image/png;base64,aGk=\n"),
        Some(b"hi".to_vec())
    );
    assert_eq!(decode_b64("not base64!"), None);
    assert_eq!(decode_b64(""), None);
    assert_eq!(decode_b64("data:image/png"), None);
}

struct Env {
    t: TestDb,
    secrets: MemoryStore,
    store: AssetStore,
    story: StoryCreated,
}

impl Env {
    async fn new() -> Self {
        let t = test_db().await;
        let draft = TemplateCatalog::bundled()
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
        let story = create_story(&t.db, draft).await.unwrap();
        let store = AssetStore::new(t.dir.path());
        Self {
            t,
            secrets: MemoryStore::default(),
            store,
            story,
        }
    }

    async fn connect(&self, kind: AdapterKind, base_url: &str, model: &str) -> String {
        save_profile(
            &self.t.db,
            &self.secrets,
            ProviderProfileInput {
                id: None,
                label: "Pictures".into(),
                adapter: kind,
                base_url: base_url.into(),
                model_id: model.into(),
                billing: Billing::Paid,
                api_key: Some("sk-test".into()),
                settings: GenerationSettings::default(),
            },
        )
        .await
        .unwrap()
        .id
    }

    fn input(&self) -> PortraitInput {
        PortraitInput {
            character: mara(),
            world: harbor(),
            style: PortraitStyle::Painted,
            story_id: Some(self.story.story_id.clone()),
            new_story: false,
            budget_override: false,
        }
    }

    async fn ledger(&self) -> Vec<(String, String, Option<String>)> {
        sqlx::query_as("SELECT purpose, status, error_code FROM api_requests ORDER BY started_at")
            .fetch_all(self.t.db.reader())
            .await
            .unwrap()
    }
}

#[tokio::test]
async fn a_portrait_is_made_kept_for_its_story_and_recorded() {
    let env = Env::new().await;
    let body = serde_json::json!({ "data": [{ "b64_json": b64(&png()) }] }).to_string();
    let server = serve(vec![Reply::json(200, &body)]).await;
    let id = env
        .connect(AdapterKind::OpenaiImages, &server.base_url, "gpt-image-1")
        .await;
    set_picture_maker(&env.t.db, Some(&id)).await.unwrap();

    let made = make_portrait(&env.t.db, &env.store, &env.secrets, "s1", &env.input())
        .await
        .unwrap();
    assert!(!made.already_in_library);
    assert_eq!(made.asset.label, "Portrait of Mara Venn");
    assert_eq!(made.asset.tags, vec!["Portrait".to_string()]);
    assert!(!made.asset.shared, "made for one story");
    assert_eq!(
        made.asset
            .stories
            .iter()
            .map(|s| s.id.as_str())
            .collect::<Vec<_>>(),
        vec![env.story.story_id.as_str()]
    );
    assert_eq!(rows::list(&env.t.db).await.unwrap().len(), 1);

    let reqs = server.requests();
    assert_eq!(reqs.len(), 1);
    assert_eq!(reqs[0].path, "/v1/images/generations");
    assert_eq!(reqs[0].authorization.as_deref(), Some("Bearer sk-test"));
    let sent: Value = serde_json::from_str(&reqs[0].body).unwrap();
    assert_eq!(sent["model"], "gpt-image-1");
    assert!(sent["prompt"].as_str().unwrap().contains("lizardfolk"));
    assert!(!reqs[0].body.contains("Mara"));

    assert_eq!(
        env.ledger().await,
        vec![("character_suggestion".into(), "completed".into(), None)]
    );
}

#[tokio::test]
async fn stable_diffusion_portraits_for_a_new_story_wait_for_it() {
    let env = Env::new().await;
    let body = serde_json::json!({ "images": [b64(&png())] }).to_string();
    let models = serde_json::json!([{ "title": "dreamy-v5", "model_name": "dreamy" }]).to_string();
    let server = serve(vec![Reply::json(200, &models), Reply::json(200, &body)]).await;
    // The WebUI lives at the server root, not under /v1.
    let root = server.base_url.trim_end_matches("/v1").to_string();
    let id = env
        .connect(AdapterKind::StableDiffusion, &root, "default")
        .await;
    set_picture_maker(&env.t.db, Some(&id)).await.unwrap();

    // The free connection check works through the usual adapter.
    let adapter = Adapter::live(AdapterKind::StableDiffusion, &root, None).unwrap();
    assert_eq!(
        adapter.list_models().await.unwrap(),
        vec!["default".to_string(), "dreamy-v5".to_string()]
    );

    let input = PortraitInput {
        story_id: None,
        new_story: true,
        ..env.input()
    };
    let made = make_portrait(&env.t.db, &env.store, &env.secrets, "s1", &input)
        .await
        .unwrap();
    assert!(!made.asset.shared && made.asset.stories.is_empty());
    let reqs = server.requests();
    assert_eq!(reqs[0].path, "/sdapi/v1/sd-models");
    assert_eq!(reqs[1].path, "/sdapi/v1/txt2img");
    let sent: Value = serde_json::from_str(&reqs[1].body).unwrap();
    assert!(sent.get("override_settings").is_none());
}

#[tokio::test]
async fn portraits_need_a_picture_connection_and_a_real_picture() {
    let env = Env::new().await;
    let err = make_portrait(&env.t.db, &env.store, &env.secrets, "s1", &env.input())
        .await
        .unwrap_err();
    assert_eq!(err.code, ErrorCode::NoProvider);

    let link = serde_json::json!({ "data": [{ "url": "https://example.com/p.png" }] }).to_string();
    let refused = r#"{"error":{"message":"Your request was rejected by the safety system."}}"#;
    let junk = serde_json::json!({ "data": [{ "b64_json": b64(b"not a picture") }] }).to_string();
    let server = serve(vec![
        Reply::json(200, &link),
        Reply::json(400, refused),
        Reply::json(200, &junk),
    ])
    .await;
    let id = env
        .connect(AdapterKind::OpenaiImages, &server.base_url, "dall-e-3")
        .await;
    set_picture_maker(&env.t.db, Some(&id)).await.unwrap();

    let err = make_portrait(&env.t.db, &env.store, &env.secrets, "s1", &env.input())
        .await
        .unwrap_err();
    assert!(
        err.message.contains("link instead of the picture"),
        "{}",
        err.message
    );
    let err = make_portrait(&env.t.db, &env.store, &env.secrets, "s1", &env.input())
        .await
        .unwrap_err();
    assert!(err.message.contains("safety system"), "{}", err.message);
    let err = make_portrait(&env.t.db, &env.store, &env.secrets, "s1", &env.input())
        .await
        .unwrap_err();
    assert_eq!(err.code, ErrorCode::ProviderError);
    assert!(err.message.contains("isn't a picture"), "{}", err.message);
    assert!(rows::list(&env.t.db).await.unwrap().is_empty());

    let ledger = env.ledger().await;
    assert_eq!(ledger.len(), 3, "every attempt is recorded");
    assert_eq!(ledger[0].1, "failed");
    assert_eq!(ledger[1].1, "failed");
    assert_eq!(ledger[2].1, "completed", "the service did make something");

    let nameless = PortraitInput {
        character: Character::default(),
        ..env.input()
    };
    assert!(
        make_portrait(&env.t.db, &env.store, &env.secrets, "s1", &nameless)
            .await
            .is_err()
    );
    assert_eq!(env.ledger().await.len(), 3, "nothing sent without a name");
}

#[tokio::test]
async fn picture_connections_never_write_stories() {
    let env = Env::new().await;
    let pictures = env
        .connect(
            AdapterKind::OpenaiImages,
            "https://api.example.com/v1",
            "gpt-image-1",
        )
        .await;
    let writer = env
        .connect(
            AdapterKind::OpenaiCompatible,
            "https://api.example.com/v1",
            "story-model",
        )
        .await;

    assert!(set_storyteller(&env.t.db, Some(&pictures)).await.is_err());
    let story = env.story.story_id.as_str();
    let choice = StorytellerChoice::Connection {
        id: pictures.clone(),
    };
    assert!(set_story_choice(&env.t.db, story, Some(&choice))
        .await
        .is_err());
    assert!(set_picture_maker(&env.t.db, Some(&writer)).await.is_err());

    let adapter = Adapter::live(
        AdapterKind::OpenaiImages,
        "https://api.example.com/v1",
        None,
    )
    .unwrap();
    let Adapter::Pictures(_) = adapter else {
        panic!("picture connections get the picture adapter");
    };

    // Turning the story connection into a picture one stops it writing.
    set_storyteller(&env.t.db, Some(&writer)).await.unwrap();
    let writing = StorytellerChoice::Connection { id: writer.clone() };
    set_story_choice(&env.t.db, story, Some(&writing))
        .await
        .unwrap();
    save_profile(
        &env.t.db,
        &env.secrets,
        ProviderProfileInput {
            id: Some(writer.clone()),
            label: "Now pictures".into(),
            adapter: AdapterKind::StableDiffusion,
            base_url: "http://127.0.0.1:7860".into(),
            model_id: "default".into(),
            billing: Billing::Local,
            api_key: None,
            settings: GenerationSettings::default(),
        },
    )
    .await
    .unwrap();
    assert_eq!(storyteller(&env.t.db).await.unwrap(), None);
    let mut conn = env.t.db.reader().acquire().await.unwrap();
    assert_eq!(
        crate::db::providers::story_choice(&mut conn, story)
            .await
            .unwrap(),
        None
    );
    drop(conn);

    // Removing the picture connection turns portraits off.
    set_picture_maker(&env.t.db, Some(&pictures)).await.unwrap();
    delete_profile(&env.t.db, &env.secrets, &pictures)
        .await
        .unwrap();
    assert_eq!(providers::picture_maker(&env.t.db).await.unwrap(), None);
}

#[tokio::test]
async fn picture_connections_refuse_story_replies_without_sending() {
    let server = serve(vec![]).await;
    let adapter = Adapter::live(AdapterKind::StableDiffusion, &server.base_url, None).unwrap();
    let req = crate::domain::provider::GenerateRequest {
        model_id: "default".into(),
        messages: vec![],
        max_output_tokens: 64,
        temperature: None,
        timeout_ms: 5_000,
        context_tokens: None,
    };
    let err = adapter
        .generate(&req, &CancellationToken::new(), &mut |_| {})
        .await
        .unwrap_err();
    assert_eq!(err.charge, Charge::None);
    assert!(err.error.message.contains("makes pictures"));
    assert!(server.requests().is_empty());
}

#[tokio::test]
async fn a_portrait_for_a_missing_story_is_refused_before_anything_is_paid() {
    let env = Env::new().await;
    let body = serde_json::json!({ "data": [{ "b64_json": b64(&png()) }] }).to_string();
    let server = serve(vec![Reply::json(200, &body)]).await;
    let id = env
        .connect(AdapterKind::OpenaiImages, &server.base_url, "gpt-image-1")
        .await;
    set_picture_maker(&env.t.db, Some(&id)).await.unwrap();
    let input = PortraitInput {
        story_id: Some("no-such-story".into()),
        ..env.input()
    };
    let err = make_portrait(&env.t.db, &env.store, &env.secrets, "s1", &input)
        .await
        .unwrap_err();
    assert_eq!(err.code, ErrorCode::NotFound);
    assert!(server.requests().is_empty(), "nothing was sent");
    assert!(env.ledger().await.is_empty(), "nothing was recorded");
    assert!(rows::list(&env.t.db).await.unwrap().is_empty());
}

use std::time::Duration;

use super::*;
use crate::db::providers::{save_profile, set_story_choice, set_storyteller};
use crate::db::stories::create_story;
use crate::db::test_support::test_db;
use crate::domain::provider::{
    Billing, GenerationSettings, ProviderProfileInput, StorytellerChoice,
};
use crate::domain::story::CreateStoryInput;
use crate::domain::story_state::fixtures::lighthouse;
use crate::services::adapters::test_server::{serve, Reply};
use crate::services::adapters::Adapter;
use crate::services::secrets::MemoryStore;

fn audio(content_type: &'static str, bytes: Vec<u8>) -> Reply {
    Reply {
        status: 200,
        content_type,
        chunks: vec![(Duration::ZERO, bytes)],
        drop_mid_body: false,
    }
}

async fn connect(
    db: &Database,
    secrets: &MemoryStore,
    kind: AdapterKind,
    base_url: &str,
    model: &str,
    billing: Billing,
) -> String {
    save_profile(
        db,
        secrets,
        ProviderProfileInput {
            id: None,
            label: "Voices".into(),
            adapter: kind,
            base_url: base_url.into(),
            model_id: model.into(),
            billing,
            api_key: Some("xi-test-key".into()),
            settings: GenerationSettings::default(),
        },
    )
    .await
    .unwrap()
    .id
}

#[test]
fn pcm_becomes_a_wav_file() {
    let wav = wav_from_pcm16(&[1, 0, 2, 0, 3], 24_000);
    assert_eq!(&wav[0..4], b"RIFF");
    assert_eq!(&wav[8..16], b"WAVEfmt ");
    assert_eq!(u32::from_le_bytes(wav[24..28].try_into().unwrap()), 24_000);
    assert_eq!(&wav[36..40], b"data");
    // The odd byte is half a sample and is left out.
    assert_eq!(u32::from_le_bytes(wav[40..44].try_into().unwrap()), 4);
    assert_eq!(wav.len(), 48);
}

#[test]
fn voice_lists_from_either_kind_of_service() {
    let eleven = serde_json::json!({ "voices": [
        { "voice_id": "abc123", "name": "Rachel", "category": "premade",
          "labels": { "accent": "american", "gender": "female" } },
        { "voice_id": "mine9", "name": "My voice", "category": "cloned" },
    ]});
    let v = voices_from(&eleven);
    assert_eq!(v.len(), 2);
    assert_eq!((v[0].id.as_str(), v[0].name.as_str()), ("abc123", "Rachel"));
    assert_eq!(v[0].note.as_deref(), Some("american, female"));
    assert_eq!(v[1].note.as_deref(), Some("cloned"));

    let kokoro = serde_json::json!({ "voices": ["af_bella", "bm_george"] });
    let v = voices_from(&kokoro);
    assert_eq!(v[1].id, "bm_george");
    assert!(voices_from(&serde_json::json!({ "detail": "nope" })).is_empty());
}

#[test]
fn a_voice_id_cannot_change_the_path() {
    let s = VoiceService::new(
        AdapterKind::Elevenlabs,
        "https://api.elevenlabs.io/v1/",
        Some("k".into()),
    )
    .unwrap();
    let (url, body) = s.speech_request("eleven_flash_v2_5", "../voices?x=1", "Hello.");
    assert_eq!(
        url,
        "https://api.elevenlabs.io/v1/text-to-speech/..%2Fvoices%3Fx%3D1?output_format=pcm_24000"
    );
    assert_eq!(body["model_id"], "eleven_flash_v2_5");
    assert_eq!(body["text"], "Hello.");
}

#[tokio::test]
async fn elevenlabs_reads_with_its_key_header_and_comes_back_as_wav() {
    let t = test_db().await;
    let secrets = MemoryStore::default();
    let server = serve(vec![audio("audio/pcm", vec![0, 1, 0, 2])]).await;
    let id = connect(
        &t.db,
        &secrets,
        AdapterKind::Elevenlabs,
        &server.base_url,
        "eleven_flash_v2_5",
        Billing::Paid,
    )
    .await;
    let input = SpeakInput {
        connection_id: id,
        voice: "abc123".into(),
        text: "  \"You came back,\" Mina says.  ".into(),
        allow_unpriced: false,
    };
    let wav = speak(&t.db, &secrets, "s1", &input).await.unwrap();
    assert_eq!(&wav[0..4], b"RIFF");
    let req = &server.requests()[0];
    assert_eq!(
        req.path,
        "/v1/text-to-speech/abc123?output_format=pcm_24000"
    );
    assert_eq!(req.header("xi-api-key"), Some("xi-test-key"));
    assert_eq!(req.authorization, None, "ElevenLabs takes its own header");
    let body: Value = serde_json::from_str(&req.body).unwrap();
    assert_eq!(body["text"], "\"You came back,\" Mina says.");
    // One ledger row, for stories ideas, pictures and voices.
    let rows: Vec<(String, String)> = sqlx::query_as("SELECT purpose, status FROM api_requests")
        .fetch_all(t.db.reader())
        .await
        .unwrap();
    assert_eq!(rows, [("character_suggestion".into(), "completed".into())]);
}

#[tokio::test]
async fn a_voice_server_is_asked_for_wav_and_says_why_it_failed() {
    let t = test_db().await;
    let secrets = MemoryStore::default();
    let server = serve(vec![
        audio("audio/wav", b"RIFF....WAVE".to_vec()),
        Reply::json(400, r#"{"detail":"Voice not found: zz_nobody"}"#),
    ])
    .await;
    let id = connect(
        &t.db,
        &secrets,
        AdapterKind::OpenaiSpeech,
        &server.base_url,
        "kokoro",
        Billing::Local,
    )
    .await;
    let mut input = SpeakInput {
        connection_id: id,
        voice: "af_bella".into(),
        text: "The bell rings.".into(),
        allow_unpriced: false,
    };
    assert_eq!(
        speak(&t.db, &secrets, "s1", &input).await.unwrap(),
        b"RIFF....WAVE"
    );
    let req = &server.requests()[0];
    assert_eq!(req.path, "/v1/audio/speech");
    let body: Value = serde_json::from_str(&req.body).unwrap();
    assert_eq!(
        (body["voice"].as_str(), body["response_format"].as_str()),
        (Some("af_bella"), Some("wav"))
    );
    input.voice = "zz_nobody".into();
    let err = speak(&t.db, &secrets, "s1", &input).await.unwrap_err();
    assert!(err.message.contains("Voice not found"), "{}", err.message);
}

#[tokio::test]
async fn nothing_is_sent_for_empty_or_overlong_text_or_no_voice() {
    let server = serve(vec![]).await;
    let s = VoiceService::new(AdapterKind::OpenaiSpeech, &server.base_url, None).unwrap();
    let long = "a".repeat(MAX_SPEECH_CHARS + 1);
    for (voice, text) in [
        ("af_bella", "  "),
        ("af_bella", long.as_str()),
        (" ", "Hi."),
    ] {
        let err = s
            .speak("kokoro", voice, text, Duration::from_secs(5))
            .await
            .unwrap_err();
        assert_eq!(err.charge, Charge::None);
    }
    assert!(server.requests().is_empty());
}

#[tokio::test]
async fn voice_connections_never_write_stories() {
    let t = test_db().await;
    let secrets = MemoryStore::default();
    let voices = connect(
        &t.db,
        &secrets,
        AdapterKind::Elevenlabs,
        "https://api.elevenlabs.io/v1",
        "eleven_flash_v2_5",
        Billing::Paid,
    )
    .await;
    assert!(set_storyteller(&t.db, Some(&voices)).await.is_err());
    let story = create_story(
        &t.db,
        CreateStoryInput {
            title: "Lamp".into(),
            description: String::new(),
            base_state: lighthouse(),
            first_chapter_title: "One".into(),
            chapter_outlines: vec![],
        },
    )
    .await
    .unwrap();
    let choice = StorytellerChoice::Connection { id: voices };
    assert!(set_story_choice(&t.db, &story.story_id, Some(&choice))
        .await
        .is_err());
    let Adapter::Voices(_) =
        Adapter::live(AdapterKind::OpenaiSpeech, "http://127.0.0.1:8880/v1", None).unwrap()
    else {
        panic!("voice connections get the voice adapter");
    };
    assert!(VoiceService::new(AdapterKind::OpenaiCompatible, "http://x", None).is_err());
}

use super::*;
use crate::db::memory::{chain_hash, insert_summary, NewSummary};
use crate::db::providers::{save_profile, set_story_choice};
use crate::db::stories::create_story;
use crate::db::test_support::{test_db, TestDb};
use crate::db::timeline::{append_event, AppendEvent, EventRow};
use crate::domain::events::{AssistantPayload, EventBody, PlayerPayload};
use crate::domain::provider::{
    AdapterKind, Billing, GenerationSettings, ProviderProfileInput, StorytellerChoice,
};
use crate::domain::story::{CreateStoryInput, StoryCreated};
use crate::domain::story_state::fixtures::lighthouse;
use crate::services::chapters::end_chapter;
use crate::services::context::preview_context;
use crate::services::secrets::MemoryStore;

async fn story(t: &TestDb) -> StoryCreated {
    create_story(
        &t.db,
        CreateStoryInput {
            title: "Lighthouse".into(),
            description: String::new(),
            base_state: lighthouse(),
            first_chapter_title: "The Lamp".into(),
            chapter_outlines: vec![],
        },
    )
    .await
    .unwrap()
}

async fn head(t: &TestDb, route_id: &str) -> String {
    let mut conn = t.db.reader().acquire().await.unwrap();
    get_route(&mut conn, route_id)
        .await
        .unwrap()
        .head_event_id
        .unwrap()
}

async fn chain(t: &TestDb, s: &StoryCreated) -> Vec<EventRow> {
    let h = head(t, &s.main_route_id).await;
    let mut conn = t.db.reader().acquire().await.unwrap();
    ancestors(&mut conn, &s.story_id, &h).await.unwrap()
}

/// Append `n` exchanges ("action k" / "reply k") to the main route.
async fn play(t: &TestDb, s: &StoryCreated, from: u32, n: u32) {
    for k in from..from + n {
        for body in [
            EventBody::Player(PlayerPayload::new(format!("action {k}."))),
            EventBody::Assistant(AssistantPayload {
                text: format!("reply {k}."),
                finish_reason: None,
                provider_label: None,
                model_id: None,
            }),
        ] {
            let h = head(t, &s.main_route_id).await;
            append_event(
                &t.db,
                AppendEvent {
                    story_id: s.story_id.clone(),
                    route_id: s.main_route_id.clone(),
                    expected_head_id: h,
                    body,
                    generation_run_id: None,
                },
            )
            .await
            .unwrap();
        }
    }
}

/// Store a summary of the first `turns` replies, as if `generator` wrote it.
async fn summarize(
    t: &TestDb,
    s: &StoryCreated,
    turns: u32,
    generator: &str,
    api_request_id: Option<&str>,
) {
    let chain = chain(t, s).await;
    let end = chain
        .iter()
        .enumerate()
        .filter(|(_, e)| e.kind() == Some(EventKind::Assistant))
        .nth(turns as usize - 1)
        .map(|(i, _)| i)
        .unwrap();
    insert_summary(
        &t.db,
        NewSummary {
            story_id: &s.story_id,
            source_start_event_id: None,
            source_end_event_id: &chain[end].id,
            source_hash: &chain_hash(&chain[..=end]),
            text: "Mara climbed the tower and lit the lamp.",
            covered_turns: turns,
            generator,
            api_request_id,
        },
    )
    .await
    .unwrap();
}

#[tokio::test]
async fn a_short_story_has_only_its_turns() {
    let t = test_db().await;
    let s = story(&t).await;
    play(&t, &s, 1, 3).await;
    let m = story_memory(&t.db, &s.main_route_id).await.unwrap();
    assert_eq!(m.route_id, s.main_route_id);
    assert_eq!(m.turns, 3);
    assert_eq!(m.summary, None);
    assert!(m.recaps.is_empty());
    assert_eq!(m.recaps_read, 10);
    assert_eq!(m.recaps_briefed, 40);
    assert_eq!(m.first_summary_after, 16);
    assert_eq!(m.word_for_word_turns, 3);
}

#[tokio::test]
async fn the_summary_says_who_wrote_it_and_outlives_a_new_storyteller() {
    let t = test_db().await;
    let s = story(&t).await;
    play(&t, &s, 1, 17).await;
    summarize(&t, &s, 8, "model:Cloud/meta-llama/story-model", None).await;

    let m = story_memory(&t.db, &s.main_route_id).await.unwrap();
    assert_eq!(m.turns, 17);
    assert_eq!(m.word_for_word_turns, 9);
    let summary = m.summary.expect("summary");
    assert_eq!(summary.text, "Mara climbed the tower and lit the lamp.");
    assert_eq!(summary.covered_turns, 8);
    assert_eq!(
        summary.written_by,
        Some(SummaryWriter {
            label: "Cloud".into(),
            model_id: "meta-llama/story-model".into(),
        })
    );

    // Another connection, then the offline storyteller: the same summary
    // is shown and goes into the next reply's context.
    let secrets = MemoryStore::default();
    let other = save_profile(
        &t.db,
        &secrets,
        ProviderProfileInput {
            id: None,
            label: "Home model".into(),
            adapter: AdapterKind::OpenaiCompatible,
            base_url: "http://127.0.0.1:9/v1".into(),
            model_id: "other-model".into(),
            billing: Billing::Local,
            api_key: None,
            settings: GenerationSettings::default(),
        },
    )
    .await
    .unwrap();
    for choice in [
        StorytellerChoice::Connection {
            id: other.id.clone(),
        },
        StorytellerChoice::Offline,
    ] {
        set_story_choice(&t.db, &s.story_id, Some(&choice))
            .await
            .unwrap();
        let again = story_memory(&t.db, &s.main_route_id).await.unwrap();
        assert_eq!(again.summary.as_ref().map(|x| x.covered_turns), Some(8));
        let preview = preview_context(&t.db, &s.main_route_id).await.unwrap();
        assert_eq!(preview.summary.map(|u| u.covered_turns), Some(8));
        assert!(preview.messages[0]
            .content
            .contains("Mara climbed the tower and lit the lamp."));
    }
}

#[tokio::test]
async fn offline_summaries_have_no_writer() {
    let t = test_db().await;
    let s = story(&t).await;
    play(&t, &s, 1, 16).await;
    summarize(&t, &s, 8, OFFLINE_GENERATOR, None).await;
    let m = story_memory(&t.db, &s.main_route_id).await.unwrap();
    let summary = m.summary.expect("summary");
    assert_eq!(summary.written_by, None);
}

#[tokio::test]
async fn the_ledger_names_the_writer_when_it_can() {
    let t = test_db().await;
    let s = story(&t).await;
    play(&t, &s, 1, 16).await;
    sqlx::query(
        "INSERT INTO api_requests (id, provider_label, model_id, session_id, purpose, status, \
         started_at) VALUES ('req-1', 'Work / Cloud', 'big-model', 'session-1', \
         'memory_summary', 'completed', '2026-11-06T10:00:00Z')",
    )
    .execute(t.db.writer())
    .await
    .unwrap();
    summarize(&t, &s, 8, "model:Work / Cloud/big-model", Some("req-1")).await;
    let m = story_memory(&t.db, &s.main_route_id).await.unwrap();
    assert_eq!(
        m.summary.and_then(|x| x.written_by),
        Some(SummaryWriter {
            label: "Work / Cloud".into(),
            model_id: "big-model".into(),
        })
    );
}

#[tokio::test]
async fn ended_chapters_keep_their_recaps() {
    let t = test_db().await;
    let s = story(&t).await;
    play(&t, &s, 1, 2).await;
    let h = head(&t, &s.main_route_id).await;
    end_chapter(
        &t.db,
        &s.story_id,
        &s.main_route_id,
        &h,
        "Mara lit the lamp and saw a ship.",
        Some("The Storm".into()),
    )
    .await
    .unwrap();
    play(&t, &s, 3, 1).await;
    let m = story_memory(&t.db, &s.main_route_id).await.unwrap();
    assert_eq!(m.turns, 3);
    assert_eq!(
        m.recaps,
        vec![MemoryRecap {
            ordinal: 1,
            title: "The Lamp".into(),
            text: "Mara lit the lamp and saw a ship.".into(),
        }]
    );
    // The recap stands in for Chapter 1; its last exchange is kept.
    assert_eq!(m.word_for_word_turns, 2);
    let preview = preview_context(&t.db, &s.main_route_id).await.unwrap();
    let sent: Vec<&str> = preview
        .messages
        .iter()
        .map(|m| m.content.as_str())
        .collect();
    assert!(sent[0].contains("Mara lit the lamp and saw a ship."));
    assert!(!sent.iter().any(|c| c.contains("reply 1.")));
    assert!(sent.iter().any(|c| c.contains("reply 2.")));
    assert!(sent.iter().any(|c| c.contains("reply 3.")));
    assert_eq!(preview.omitted_messages, 0);
}

#[tokio::test]
async fn an_unknown_route_is_not_found() {
    let t = test_db().await;
    let err = story_memory(&t.db, "nope").await.unwrap_err();
    assert_eq!(err.code, crate::errors::ErrorCode::NotFound);
}

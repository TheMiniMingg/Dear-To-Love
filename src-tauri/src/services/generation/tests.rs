use std::time::Duration;

use super::*;
use crate::db::stories::{create_story, list_stories};
use crate::db::test_support::{test_db, TestDb};
use crate::db::timeline::{fork_route, route_history};
use crate::domain::provider::{AdapterKind, ProviderProfileInput, StreamMessage};
use crate::domain::story::StoryCreated;
use crate::domain::templates::{QuickStartInput, TemplateCatalog};
use crate::services::adapters::test_server::{serve, short_pause, Reply, TestServer};
use crate::services::secrets::MemoryStore;

struct Env {
    t: TestDb,
    secrets: MemoryStore,
    registry: RunRegistry,
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
            })
            .unwrap();
        let story = create_story(&t.db, draft).await.unwrap();
        Self {
            t,
            secrets: MemoryStore::default(),
            registry: RunRegistry::default(),
            story,
        }
    }

    fn ctx(&self) -> Ctx<'_> {
        Ctx {
            db: &self.t.db,
            secrets: &self.secrets,
            registry: &self.registry,
            session_id: "session-1",
            offline_delay: Duration::ZERO,
            budget_override: false,
        }
    }

    fn db(&self) -> &Database {
        &self.t.db
    }

    fn route(&self) -> &str {
        &self.story.main_route_id
    }

    async fn head(&self, route_id: &str) -> String {
        route_view(self.db(), route_id)
            .await
            .unwrap()
            .route
            .head_event_id
            .unwrap()
    }

    async fn submit(&self, route_id: &str, text: &str) -> AppResult<Submitted> {
        let head = self.head(route_id).await;
        submit_action(self.db(), &self.story.story_id, route_id, &head, text).await
    }

    async fn gen(&self, run_id: &str) -> (AppResult<RouteView>, Vec<StreamMessage>) {
        let mut msgs = Vec::new();
        let out = generate(&self.ctx(), run_id, &mut |m| msgs.push(m)).await;
        (out, msgs)
    }

    async fn connect(&self, server: &TestServer, billing: Billing) -> String {
        let p = providers::save_profile(
            self.db(),
            &self.secrets,
            ProviderProfileInput {
                id: None,
                label: "Test cloud".into(),
                adapter: AdapterKind::OpenaiCompatible,
                base_url: server.base_url.clone(),
                model_id: "story-model".into(),
                billing,
                api_key: Some("sk-test".into()),
                settings: GenerationSettings::default(),
            },
        )
        .await
        .unwrap();
        providers::set_storyteller(self.db(), Some(&p.id))
            .await
            .unwrap();
        p.id
    }

    async fn ledger(
        &self,
    ) -> Vec<(
        String,
        String,
        Option<i64>,
        Option<i64>,
        Option<i64>,
        String,
    )> {
        sqlx::query_as(
            "SELECT purpose, status, input_tokens, output_tokens, cost_micro_usd, usage_source \
             FROM api_requests ORDER BY started_at, id",
        )
        .fetch_all(self.db().reader())
        .await
        .unwrap()
    }

    async fn assistant_count(&self, route_id: &str) -> usize {
        route_history(self.db(), route_id)
            .await
            .unwrap()
            .iter()
            .filter(|e| matches!(e.body, EventBody::Assistant(_)))
            .count()
    }
}

/// The player's action that the route's last reply answered.
fn answered(v: &RouteView) -> String {
    let reply = v.history.last().unwrap();
    assert!(
        matches!(reply.body, EventBody::Assistant(_)),
        "expected a reply"
    );
    let parent = reply.parent_event_id.as_deref().unwrap();
    match &v.history.iter().find(|e| e.id == parent).unwrap().body {
        EventBody::Player(p) => p.text.clone(),
        other => panic!("expected an action, got {other:?}"),
    }
}

fn assistant_text(v: &RouteView) -> String {
    match &v.history.last().unwrap().body {
        EventBody::Assistant(p) => p.text.clone(),
        other => panic!("expected a reply, got {other:?}"),
    }
}

/// T01 + T52: offline Quick Start, play, reopen.
#[tokio::test]
async fn offline_turn_streams_then_commits_once() {
    let env = Env::new().await;
    let sub = env.submit(env.route(), "Read the letter").await.unwrap();
    let waiting = sub.view.awaiting_reply.as_ref().unwrap();
    assert_eq!(waiting.active_run.as_ref().unwrap().id, sub.run_id);
    assert_eq!(sub.view.storyteller.label, "Offline storyteller");

    let (out, msgs) = env.gen(&sub.run_id).await;
    let v = out.unwrap();
    assert_eq!(v.history.len(), 3);
    assert!(v.awaiting_reply.is_none());
    let streamed: String = msgs
        .iter()
        .filter_map(|m| match m {
            StreamMessage::Delta { text, .. } => Some(text.as_str()),
            _ => None,
        })
        .collect();
    assert_eq!(streamed.trim(), assistant_text(&v));
    assert!(matches!(msgs.first(), Some(StreamMessage::Started { .. })));
    assert!(matches!(msgs.last(), Some(StreamMessage::Done { .. })));
    // Offline replies are not API calls.
    assert!(env.ledger().await.is_empty());

    // A finished run cannot commit again.
    assert_eq!(
        env.gen(&sub.run_id).await.0.unwrap_err().code,
        ErrorCode::RunNotActive
    );
    assert_eq!(env.assistant_count(env.route()).await, 1);

    // Stale head refused, nothing written.
    let e = submit_action(
        env.db(),
        &env.story.story_id,
        env.route(),
        &env.story.head_event_id,
        "again",
    )
    .await
    .unwrap_err();
    assert_eq!(e.code, ErrorCode::HeadChanged);
    assert_eq!(
        list_stories(env.db()).await.unwrap()[0].last_route_id,
        env.story.main_route_id
    );
}

/// T53: provider usage normalized into one ledger row with a cost.
#[tokio::test]
async fn live_reply_records_one_ledger_row_with_cost() {
    let env = Env::new().await;
    let server = serve(vec![Reply::sse_text(
        &["The lamp ", "flickers."],
        Some(r#"{"prompt_tokens":1000,"completion_tokens":100,"prompt_tokens_details":{"cached_tokens":800}}"#),
    )])
    .await;
    let pid = env.connect(&server, Billing::Paid).await;
    usage::set_rate_card(env.db(), &pid, "story-model", "2.50", "10", Some("0.25"))
        .await
        .unwrap();
    let sub = env.submit(env.route(), "Read the letter").await.unwrap();
    assert_eq!(sub.view.storyteller.label, "Test cloud");
    let (out, msgs) = env.gen(&sub.run_id).await;
    let v = out.unwrap();
    assert_eq!(assistant_text(&v), "The lamp flickers.");
    match &v.history.last().unwrap().body {
        EventBody::Assistant(p) => {
            assert_eq!(p.provider_label.as_deref(), Some("Test cloud"));
            assert_eq!(p.model_id.as_deref(), Some("story-model"));
        }
        _ => unreachable!(),
    }
    assert!(msgs
        .iter()
        .any(|m| matches!(m, StreamMessage::Usage { .. })));
    assert_eq!(
        env.ledger().await,
        vec![(
            "story_reply".into(),
            "completed".into(),
            Some(1000),
            Some(100),
            Some(1700),
            "provider".into()
        )]
    );
    let run_link: Option<String> = sqlx::query_scalar("SELECT generation_run_id FROM api_requests")
        .fetch_one(env.db().reader())
        .await
        .unwrap();
    assert_eq!(run_link.as_deref(), Some(sub.run_id.as_str()));

    // T57: new rates only affect later calls.
    usage::set_rate_card(env.db(), &pid, "story-model", "100", "100", None)
        .await
        .unwrap();
    assert_eq!(env.ledger().await[0].4, Some(1700));
}

/// T09 + T10 + T58: drop mid-reply, then retry the same action.
#[tokio::test]
async fn dropped_reply_keeps_action_and_retry_adds_one_reply() {
    let env = Env::new().await;
    let server = serve(vec![
        Reply::sse_text(&["a ", "b ", "c ", "d ", "e"], None).dropped(),
        Reply::sse_text(
            &["Second try."],
            Some(r#"{"prompt_tokens":10,"completion_tokens":3}"#),
        ),
    ])
    .await;
    env.connect(&server, Billing::Paid).await;
    let sub = env.submit(env.route(), "Climb the stairs").await.unwrap();
    let player_id = sub.view.route.head_event_id.clone().unwrap();
    let (out, msgs) = env.gen(&sub.run_id).await;
    assert_eq!(out.unwrap_err().code, ErrorCode::ProviderUnreachable);
    assert!(matches!(msgs.last(), Some(StreamMessage::Error { .. })));

    let v = route_view(env.db(), env.route()).await.unwrap();
    assert_eq!(v.route.head_event_id.as_deref(), Some(player_id.as_str()));
    let waiting = v.awaiting_reply.unwrap();
    assert!(waiting.active_run.is_none());
    let last = waiting.last_run.unwrap();
    assert_eq!(last.status, RunStatus::Failed);
    assert_eq!(last.error_code, Some(ErrorCode::ProviderUnreachable));

    let retry = retry_reply(env.db(), &env.story.story_id, env.route(), &player_id)
        .await
        .unwrap();
    assert_ne!(retry.run_id, sub.run_id);
    let v = env.gen(&retry.run_id).await.0.unwrap();
    assert_eq!(assistant_text(&v), "Second try.");
    // One player event, one reply.
    let players = v
        .history
        .iter()
        .filter(|e| matches!(e.body, EventBody::Player(_)))
        .count();
    assert_eq!(players, 1);
    assert_eq!(env.assistant_count(env.route()).await, 1);
    // Two attempts, two ledger rows; the failed one's cost is unknown.
    let ledger = env.ledger().await;
    assert_eq!(ledger.len(), 2);
    assert_eq!(ledger[0].1, "failed");
    assert_eq!(ledger[0].4, None);
    assert_eq!(ledger[1].1, "completed");
}

/// T11: two sends on the same head; retry while a run is active.
#[tokio::test]
async fn concurrent_sends_and_active_run_guard() {
    let env = Env::new().await;
    let head = env.story.head_event_id.clone();
    let a = submit_action(env.db(), &env.story.story_id, env.route(), &head, "first");
    let b = submit_action(env.db(), &env.story.story_id, env.route(), &head, "second");
    let (a, b) = tokio::join!(a, b);
    let codes: Vec<_> = [&a, &b]
        .iter()
        .map(|r| r.as_ref().err().map(|e| e.code))
        .collect();
    assert!(codes.contains(&None));
    assert!(codes.contains(&Some(ErrorCode::HeadChanged)));

    let sub = a.or(b).unwrap();
    let head = sub.view.route.head_event_id.clone().unwrap();
    let e = retry_reply(env.db(), &env.story.story_id, env.route(), &head)
        .await
        .unwrap_err();
    assert_eq!(e.code, ErrorCode::RunActive);
}

/// T12: cancel during streaming; no reply, one terminal state.
#[tokio::test]
async fn cancel_while_streaming() {
    let env = Env::new().await;
    let server = serve(vec![Reply::sse_text(
        &["one ", "two ", "three ", "four"],
        None,
    )
    .with_delay(Duration::from_millis(60))])
    .await;
    env.connect(&server, Billing::Paid).await;
    let sub = env.submit(env.route(), "Wait").await.unwrap();
    let run_id = sub.run_id.clone();
    let db = env.db().clone();
    let registry = &env.registry;
    let (gen, _) = tokio::join!(env.gen(&run_id), async {
        short_pause().await;
        short_pause().await;
        cancel(&db, registry, &run_id).await.unwrap();
    });
    assert_eq!(gen.0.unwrap_err().code, ErrorCode::Cancelled);
    assert_eq!(env.assistant_count(env.route()).await, 0);
    let mut conn = env.db().reader().acquire().await.unwrap();
    assert_eq!(
        runs::get_run(&mut conn, &run_id).await.unwrap().status,
        RunStatus::Cancelled
    );
    // Cancelled after sending: may have been billed, so cost is unknown (T55).
    let ledger = env.ledger().await;
    assert_eq!((ledger[0].1.as_str(), ledger[0].4), ("cancelled", None));
    // Cancelling again is harmless; the run can't be generated again.
    cancel(env.db(), &env.registry, &run_id).await.unwrap();
    assert_eq!(
        env.gen(&run_id).await.0.unwrap_err().code,
        ErrorCode::RunNotActive
    );
}

#[tokio::test]
async fn cancel_before_start_closes_the_run() {
    let env = Env::new().await;
    let sub = env.submit(env.route(), "Wait").await.unwrap();
    cancel(env.db(), &env.registry, &sub.run_id).await.unwrap();
    assert_eq!(
        env.gen(&sub.run_id).await.0.unwrap_err().code,
        ErrorCode::RunNotActive
    );
    let v = route_view(env.db(), env.route()).await.unwrap();
    assert_eq!(
        v.awaiting_reply.unwrap().last_run.unwrap().status,
        RunStatus::Cancelled
    );
}

/// T13: the reply attaches to the run's route even if the reader moved to
/// another route, and never to a route whose head moved.
#[tokio::test]
async fn reply_stays_on_its_route() {
    let env = Env::new().await;
    let server = serve(vec![
        Reply::sse_text(&["Slow ", "reply."], None).with_delay(Duration::from_millis(40)),
        Reply::sse_text(&["Late ", "reply."], None).with_delay(Duration::from_millis(40)),
    ])
    .await;
    env.connect(&server, Billing::Local).await;
    let sub = env.submit(env.route(), "Look around").await.unwrap();
    let other = fork_route(
        env.db(),
        &env.story.story_id,
        env.route(),
        &env.story.head_event_id,
        None,
    );
    let (gen, other) = tokio::join!(env.gen(&sub.run_id), other);
    let other = other.unwrap();
    gen.0.unwrap();
    assert_eq!(env.assistant_count(env.route()).await, 1);
    assert_eq!(env.assistant_count(&other.id).await, 0);

    // Head moved under a streaming run: the reply is dropped, the run is
    // interrupted, nothing attaches anywhere.
    let sub = env.submit(&other.id, "Second").await.unwrap();
    let route_id = other.id.clone();
    let db = env.db().clone();
    let story_head = env.story.head_event_id.clone();
    let (gen, _) = tokio::join!(env.gen(&sub.run_id), async move {
        short_pause().await;
        let mut tx = db.write_txn().await.unwrap();
        sqlx::query("UPDATE routes SET head_event_id = ?, version = version + 1 WHERE id = ?")
            .bind(&story_head)
            .bind(&route_id)
            .execute(&mut *tx)
            .await
            .unwrap();
        tx.commit().await.unwrap();
    });
    assert_eq!(gen.0.unwrap_err().code, ErrorCode::HeadChanged);
    let mut conn = env.db().reader().acquire().await.unwrap();
    let run = runs::get_run(&mut conn, &sub.run_id).await.unwrap();
    assert_eq!(run.status, RunStatus::Interrupted);
    assert_eq!(env.assistant_count(&other.id).await, 0);
    let orphan: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM events WHERE generation_run_id = ?")
        .bind(&sub.run_id)
        .fetch_one(env.db().reader())
        .await
        .unwrap();
    assert_eq!(orphan, 0);
}

/// T22: a refused key is typed, retryable and not charged.
#[tokio::test]
async fn auth_failure_is_typed_and_not_charged() {
    let env = Env::new().await;
    let server = serve(vec![Reply::json(401, r#"{"error":{"message":"bad key"}}"#)]).await;
    env.connect(&server, Billing::Paid).await;
    let sub = env.submit(env.route(), "Hello").await.unwrap();
    let e = env.gen(&sub.run_id).await.0.unwrap_err();
    assert_eq!(e.code, ErrorCode::AuthFailed);
    let ledger = env.ledger().await;
    assert_eq!((ledger[0].1.as_str(), ledger[0].4), ("failed", Some(0)));
    let v = route_view(env.db(), env.route()).await.unwrap();
    assert_eq!(
        v.awaiting_reply.unwrap().last_run.unwrap().error_code,
        Some(ErrorCode::AuthFailed)
    );
}

/// A hosted service that filters the reply away, or sends nothing, fails the
/// run with a plain reason; the action waits for another try.
#[tokio::test]
async fn filtered_or_empty_replies_fail_plainly() {
    let env = Env::new().await;
    let filtered = concat!(
        "data: {\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"content_filter\"}]}\n\n",
        "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":900,\"completion_tokens\":0}}\n\n",
        "data: [DONE]\n\n",
    );
    let server = serve(vec![
        Reply::sse_raw(filtered),
        Reply::sse_text(&["  "], None),
    ])
    .await;
    env.connect(&server, Billing::Paid).await;
    let sub = env.submit(env.route(), "Kiss them").await.unwrap();
    let (out, msgs) = env.gen(&sub.run_id).await;
    let e = out.unwrap_err();
    assert_eq!(e.code, ErrorCode::ContentFiltered);
    assert!(e.message.contains("content filter"), "{}", e.message);
    assert!(msgs.iter().any(|m| matches!(
        m,
        StreamMessage::Error {
            code: ErrorCode::ContentFiltered,
            ..
        }
    )));
    assert_eq!(env.ledger().await[0].1, "failed");
    let v = route_view(env.db(), env.route()).await.unwrap();
    let waiting = v.awaiting_reply.unwrap();
    assert_eq!(
        waiting.last_run.unwrap().error_code,
        Some(ErrorCode::ContentFiltered)
    );
    assert_eq!(env.assistant_count(env.route()).await, 0);

    let retry = retry_reply(
        env.db(),
        &env.story.story_id,
        env.route(),
        &waiting.input_event_id,
    )
    .await
    .unwrap();
    let e = env.gen(&retry.run_id).await.0.unwrap_err();
    assert_eq!(e.code, ErrorCode::ProviderError);
    assert!(e.message.contains("empty reply"), "{}", e.message);
}

/// T20: switching storyteller changes only new replies.
#[tokio::test]
async fn switching_storyteller_affects_only_new_runs() {
    let env = Env::new().await;
    let sub = env.submit(env.route(), "First").await.unwrap();
    let v1 = env.gen(&sub.run_id).await.0.unwrap();
    let before = v1.history.clone();

    let server = serve(vec![Reply::sse_text(&["From the cloud."], None)]).await;
    env.connect(&server, Billing::Local).await;
    let sub = env.submit(env.route(), "Second").await.unwrap();
    let v2 = env.gen(&sub.run_id).await.0.unwrap();
    assert_eq!(&v2.history[..before.len()], &before[..]);
    assert_eq!(assistant_text(&v2), "From the cloud.");
    // Local billing: tokens optional, charge $0 (T60).
    assert_eq!(env.ledger().await[0].4, Some(0));
}

/// T17 + T18: prompts hold only this branch, latest action exactly once.
#[tokio::test]
async fn prompt_is_branch_scoped_and_has_the_action_once() {
    let env = Env::new().await;
    // Main route: one offline turn with a distinctive action.
    let sub = env.submit(env.route(), "Burn the letter").await.unwrap();
    env.gen(&sub.run_id).await.0.unwrap();
    // Branch from before that turn.
    let branch = fork_route(
        env.db(),
        &env.story.story_id,
        env.route(),
        &env.story.head_event_id,
        None,
    )
    .await
    .unwrap();
    let server = serve(vec![Reply::sse_text(&["Ok."], None)]).await;
    env.connect(&server, Billing::Local).await;
    let sub = env.submit(&branch.id, "Hide the letter").await.unwrap();
    env.gen(&sub.run_id).await.0.unwrap();

    let body: serde_json::Value = serde_json::from_str(&server.requests()[0].body).unwrap();
    let messages = body["messages"].as_array().unwrap();
    let all = serde_json::to_string(messages).unwrap();
    assert!(!all.contains("Burn the letter"), "other branch leaked");
    assert_eq!(all.matches("Hide the letter").count(), 1);
    assert_eq!(messages.last().unwrap()["role"], "user");
    assert_eq!(messages[0]["role"], "system");
    assert!(messages[0]["content"]
        .as_str()
        .unwrap()
        .contains("Mara Quill"));
}

/// Startup: stranded runs are interrupted and their calls marked unknown.
#[tokio::test]
async fn startup_recovery_interrupts_stranded_runs() {
    let env = Env::new().await;
    let sub = env.submit(env.route(), "Hello").await.unwrap();
    usage::open_request(
        env.db(),
        NewRequest {
            generation_run_id: Some(&sub.run_id),
            provider_profile_id: None,
            provider_label: "x",
            model_id: "m",
            billing: Billing::Paid,
            session_id: "old-session",
            route_id: Some(env.route()),
            purpose: RequestPurpose::StoryReply,
            prompt_tokens: 100,
            max_output_tokens: 100,
            allow_unpriced: false,
        },
    )
    .await
    .unwrap();
    assert_eq!(recover_on_startup(env.db()).await.unwrap(), (1, 1));
    assert_eq!(
        env.gen(&sub.run_id).await.0.unwrap_err().code,
        ErrorCode::RunInterrupted
    );
    assert_eq!(env.ledger().await[0].1, "unknown");
    // The action is still there and can be retried.
    let head = env.head(env.route()).await;
    let retry = retry_reply(env.db(), &env.story.story_id, env.route(), &head)
        .await
        .unwrap();
    env.gen(&retry.run_id).await.0.unwrap();
}

/// Editing an unanswered action branches; the original stays.
#[tokio::test]
async fn edit_unanswered_action_branches() {
    let env = Env::new().await;
    let sub = env.submit(env.route(), "Typo actoin").await.unwrap();
    cancel(env.db(), &env.registry, &sub.run_id).await.unwrap();
    let player = sub.view.route.head_event_id.unwrap();
    let edited = edit_action(
        env.db(),
        &env.story.story_id,
        env.route(),
        &player,
        "Fixed action",
    )
    .await
    .unwrap();
    assert_ne!(edited.view.route.id, env.story.main_route_id);
    let v = env.gen(&edited.run_id).await.0.unwrap();
    assert_eq!(answered(&v), "Fixed action");
    let main = route_view(env.db(), env.route()).await.unwrap();
    assert_eq!(main.route.head_event_id.as_deref(), Some(player.as_str()));
}

/// M7: another reply is a new branch from the same action; the original
/// reply and route are unchanged, and earlier answered actions can change.
#[tokio::test]
async fn regenerate_and_edit_earlier_action_branch() {
    let env = Env::new().await;
    let first = env.submit(env.route(), "Read the letter").await.unwrap();
    env.gen(&first.run_id).await.0.unwrap();
    let second = env.submit(env.route(), "Light the lamp").await.unwrap();
    let main = env.gen(&second.run_id).await.0.unwrap();
    let main_head = main.route.head_event_id.clone().unwrap();
    let reply = main.history[main.history.len() - 3].id.clone();
    let action = main.history[main.history.len() - 4].id.clone();

    let regen = regenerate_reply(env.db(), &env.story.story_id, env.route(), &reply)
        .await
        .unwrap();
    assert_ne!(regen.view.route.id, env.story.main_route_id);
    assert_eq!(
        regen.view.route.head_event_id.as_deref(),
        Some(action.as_str()),
        "forks at the action the reply answered"
    );
    assert!(regen.view.awaiting_reply.is_some());
    let alt = env.gen(&regen.run_id).await.0.unwrap();
    assert_eq!(answered(&alt), "Read the letter");
    assert_eq!(env.assistant_count(&alt.route.id).await, 1);

    // Only replies can be regenerated.
    let err = regenerate_reply(env.db(), &env.story.story_id, env.route(), &action)
        .await
        .unwrap_err();
    assert_eq!(err.code, ErrorCode::InvalidInput);

    // An earlier, answered action can change too: a new branch before it.
    let edited = edit_action(
        env.db(),
        &env.story.story_id,
        env.route(),
        &action,
        "Burn the letter",
    )
    .await
    .unwrap();
    let v = env.gen(&edited.run_id).await.0.unwrap();
    assert_eq!(answered(&v), "Burn the letter");

    let after = route_view(env.db(), env.route()).await.unwrap();
    assert_eq!(
        after.route.head_event_id.as_deref(),
        Some(main_head.as_str())
    );
    assert_eq!(
        env.assistant_count(env.route()).await,
        2,
        "original untouched"
    );
}

/// T59: a manual paid test is a ledger row with no story event.
#[tokio::test]
async fn test_message_is_recorded_as_manual_test() {
    let env = Env::new().await;
    let server = serve(vec![Reply::sse_text(
        &["I am working."],
        Some(r#"{"prompt_tokens":12,"completion_tokens":4}"#),
    )])
    .await;
    let pid = env.connect(&server, Billing::Paid).await;
    let text = send_test_message(env.db(), &env.secrets, "s", &pid)
        .await
        .unwrap();
    assert_eq!(text, "I am working.");
    let ledger = env.ledger().await;
    assert_eq!(ledger.len(), 1);
    assert_eq!(ledger[0].0, "manual_test");
    assert_eq!(ledger[0].4, None, "no rate card: cost unknown (T56)");
    assert!(
        !server.requests()[0].body.contains("letter"),
        "no story text"
    );
}

/// Deleting a connection interrupts runs waiting on it.
#[tokio::test]
async fn deleting_a_connection_interrupts_waiting_runs() {
    let env = Env::new().await;
    let server = serve(vec![]).await;
    let pid = env.connect(&server, Billing::Paid).await;
    let sub = env.submit(env.route(), "Hello").await.unwrap();
    providers::delete_profile(env.db(), &env.secrets, &pid)
        .await
        .unwrap();
    assert_eq!(
        env.gen(&sub.run_id).await.0.unwrap_err().code,
        ErrorCode::RunInterrupted
    );
    assert_eq!(
        route_view(env.db(), env.route())
            .await
            .unwrap()
            .storyteller
            .profile_id,
        None
    );
}

/// T20 + T60: switching from a cloud connection to local Ollama leaves the
/// story untouched; the next reply comes from Ollama at $0 API charge.
#[tokio::test]
async fn switching_cloud_to_local_ollama() {
    let env = Env::new().await;
    let cloud = serve(vec![Reply::sse_text(
        &["Cloud reply."],
        Some(r#"{"prompt_tokens":100,"completion_tokens":10}"#),
    )])
    .await;
    let pid = env.connect(&cloud, Billing::Paid).await;
    usage::set_rate_card(env.db(), &pid, "story-model", "1", "1", None)
        .await
        .unwrap();
    let sub = env.submit(env.route(), "Ask the cloud").await.unwrap();
    env.gen(&sub.run_id).await.0.unwrap();
    let before = route_history(env.db(), env.route()).await.unwrap();

    let local = serve(vec![Reply::ndjson(&[
        serde_json::json!({"message":{"role":"assistant","content":"Local reply."},"done":false}),
        serde_json::json!({"done":true,"done_reason":"stop","prompt_eval_count":90,"eval_count":8}),
    ])])
    .await;
    let ollama = providers::save_profile(
        env.db(),
        &env.secrets,
        ProviderProfileInput {
            id: None,
            label: "Ollama".into(),
            adapter: AdapterKind::Ollama,
            base_url: local.base_url.trim_end_matches("/v1").into(),
            model_id: "llama3.2".into(),
            billing: Billing::Local,
            api_key: None,
            settings: GenerationSettings::default(),
        },
    )
    .await
    .unwrap();
    providers::set_storyteller(env.db(), Some(&ollama.id))
        .await
        .unwrap();
    let sub = env
        .submit(env.route(), "Ask the local model")
        .await
        .unwrap();
    let v = env.gen(&sub.run_id).await.0.unwrap();
    assert_eq!(assistant_text(&v), "Local reply.");
    match &v.history.last().unwrap().body {
        EventBody::Assistant(p) => {
            assert_eq!(p.provider_label.as_deref(), Some("Ollama"));
            assert_eq!(p.model_id.as_deref(), Some("llama3.2"));
        }
        _ => unreachable!(),
    }
    let after = route_history(env.db(), env.route()).await.unwrap();
    assert_eq!(&after[..before.len()], &before[..], "history unchanged");
    assert_eq!(local.requests()[0].path, "/api/chat");
    assert_eq!(cloud.requests().len(), 1);
    assert_eq!(
        env.ledger().await,
        vec![
            (
                "story_reply".into(),
                "completed".into(),
                Some(100),
                Some(10),
                Some(110),
                "provider".into()
            ),
            (
                "story_reply".into(),
                "completed".into(),
                Some(90),
                Some(8),
                Some(0),
                "provider".into()
            ),
        ]
    );
}

/// T63 + T64 through the reply path: a paused budget refuses the paid reply
/// before sending (the action stays, offline play still works), and an
/// unpriced model needs the player's one-time go-ahead.
#[tokio::test]
async fn budget_gate_on_replies() {
    use crate::db::budget::{set_policy, BudgetMode, BudgetPolicy};
    let env = Env::new().await;
    let server = serve(vec![Reply::sse_text(&["Allowed once."], None)]).await;
    let pid = env.connect(&server, Billing::Paid).await;
    set_policy(
        env.db(),
        BudgetPolicy {
            enabled: true,
            monthly_limit_usd: Some("0.001".into()),
            mode: BudgetMode::PauseNewRequests,
            ..Default::default()
        },
    )
    .await
    .unwrap();

    // No prices yet: ask first.
    let sub = env.submit(env.route(), "Knock").await.unwrap();
    let (out, msgs) = env.gen(&sub.run_id).await;
    assert_eq!(out.unwrap_err().code, ErrorCode::BudgetOverrideRequired);
    assert!(matches!(
        msgs.last(),
        Some(StreamMessage::Error {
            code: ErrorCode::BudgetOverrideRequired,
            ..
        })
    ));
    assert!(env.ledger().await.is_empty(), "nothing was sent");
    let head = env.head(env.route()).await;
    let retry = retry_reply(env.db(), &env.story.story_id, env.route(), &head)
        .await
        .unwrap();
    let ctx = Ctx {
        budget_override: true,
        ..env.ctx()
    };
    let v = generate(&ctx, &retry.run_id, &mut |_| {}).await.unwrap();
    assert_eq!(assistant_text(&v), "Allowed once.");
    assert_eq!(env.ledger().await.len(), 1);

    // With prices, a reply that could pass $0.001 is paused.
    usage::set_rate_card(env.db(), &pid, "story-model", "10", "10", None)
        .await
        .unwrap();
    let sub = env.submit(env.route(), "Knock again").await.unwrap();
    let err = env.gen(&sub.run_id).await.0.unwrap_err();
    assert_eq!(err.code, ErrorCode::BudgetPaused);
    assert_eq!(env.ledger().await.len(), 1, "refused before any call");
    let view = route_view(env.db(), env.route()).await.unwrap();
    let last = view.awaiting_reply.unwrap().last_run.unwrap();
    assert_eq!(last.error_code, Some(ErrorCode::BudgetPaused));

    // Local story operations stay usable: the offline storyteller answers.
    providers::set_storyteller(env.db(), None).await.unwrap();
    let head = env.head(env.route()).await;
    let retry = retry_reply(env.db(), &env.story.story_id, env.route(), &head)
        .await
        .unwrap();
    env.gen(&retry.run_id).await.0.unwrap();
    assert_eq!(server.requests().len(), 1);
}

use std::time::Duration;

use super::*;
use crate::db::providers::{save_profile, set_storyteller};
use crate::db::stories::create_story;
use crate::db::test_support::{test_db, TestDb};
use crate::db::timeline::{append_event, fork_route, AppendEvent};
use crate::domain::events::{AssistantPayload, PlayerPayload};
use crate::domain::provider::{AdapterKind, Billing, GenerationSettings, ProviderProfileInput};
use crate::domain::reply_options::ReplyOptions;
use crate::domain::story::StoryCreated;
use crate::domain::templates::{QuickStartInput, TemplateCatalog};
use crate::services::adapters::test_server::{serve, Reply, TestServer};
use crate::services::context::preview_context;
use crate::services::generation::{generate, submit_action, Ctx, RunRegistry};
use crate::services::secrets::MemoryStore;

struct Env {
    t: TestDb,
    secrets: MemoryStore,
    jobs: MemoryJobs,
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
                next_move: None,
            })
            .unwrap();
        let story = create_story(&t.db, draft).await.unwrap();
        Self {
            t,
            secrets: MemoryStore::default(),
            jobs: MemoryJobs::default(),
            story,
        }
    }

    fn db(&self) -> &Database {
        &self.t.db
    }

    fn env(&self) -> SummaryEnv<'_> {
        SummaryEnv {
            db: self.db(),
            secrets: &self.secrets,
            jobs: &self.jobs,
            session_id: "session-1",
        }
    }

    async fn head(&self, route_id: &str) -> String {
        let mut conn = self.db().reader().acquire().await.unwrap();
        get_route(&mut conn, route_id)
            .await
            .unwrap()
            .head_event_id
            .unwrap()
    }

    /// Append `n` exchanges ("action k" / "reply k") to a route.
    async fn play(&self, route_id: &str, from: u32, n: u32) {
        for k in from..from + n {
            let head = self.head(route_id).await;
            let p = append_event(
                self.db(),
                AppendEvent {
                    story_id: self.story.story_id.clone(),
                    route_id: route_id.into(),
                    expected_head_id: head,
                    body: EventBody::Player(PlayerPayload::new(format!(
                        "action {k}. More detail."
                    ))),
                    generation_run_id: None,
                },
            )
            .await
            .unwrap();
            append_event(
                self.db(),
                AppendEvent {
                    story_id: self.story.story_id.clone(),
                    route_id: route_id.into(),
                    expected_head_id: p.event_id,
                    body: EventBody::Assistant(AssistantPayload {
                        text: format!("reply {k}. The gulls cry."),
                        finish_reason: None,
                        provider_label: None,
                        model_id: None,
                    }),
                    generation_run_id: None,
                },
            )
            .await
            .unwrap();
        }
    }

    async fn chain(&self, route_id: &str) -> Vec<EventRow> {
        let head = self.head(route_id).await;
        let mut conn = self.db().reader().acquire().await.unwrap();
        ancestors(&mut conn, &self.story.story_id, &head)
            .await
            .unwrap()
    }

    async fn connect(&self, server: &TestServer) -> String {
        let p = save_profile(
            self.db(),
            &self.secrets,
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
        set_storyteller(self.db(), Some(&p.id)).await.unwrap();
        p.id
    }

    async fn summaries(&self) -> Vec<(i64, String, Option<String>)> {
        sqlx::query_as(
            "SELECT covered_turns, generator, api_request_id FROM memory_caches \
             ORDER BY covered_turns",
        )
        .fetch_all(self.db().reader())
        .await
        .unwrap()
    }
}

fn main_route(env: &Env) -> String {
    env.story.main_route_id.clone()
}

#[test]
fn first_sentence_and_clip() {
    assert_eq!(first_sentence("One. Two.", 50), "One.");
    assert_eq!(first_sentence("No stop at all", 50), "No stop at all");
    assert_eq!(first_sentence("abcdefghij", 4), "abcd…");
    assert_eq!(first_sentence("v1.2 is out! Yes.", 50), "v1.2 is out!");
}

/// A summary or a recap is asked about the story's words: message tags
/// become plain labels, and the asides beside a reply are left out.
#[test]
fn transcript_reads_tags_as_words_and_leaves_the_asides_out() {
    let row = |i: usize, body: EventBody| crate::db::timeline::EventRow {
        id: format!("e{i}"),
        story_id: "s".into(),
        origin_route_id: "r".into(),
        parent_event_id: None,
        kind: body.kind().as_str().to_string(),
        payload_json: body.payload_json(),
        generation_run_id: None,
        created_at: String::new(),
    };
    let chunk = vec![
        row(
            0,
            EventBody::Player(PlayerPayload::new("<text to=\"Mara\">Are you up?</text>")),
        ),
        row(
            1,
            EventBody::Assistant(AssistantPayload {
                text: "<text from=\"Mara\">Always.</text>\n\nThe lamp flickers.\n\
                       <remember kind=\"place\" name=\"Lamp room\">Draughty</remember>\n\
                       <next>Climb down</next>"
                    .into(),
                finish_reason: None,
                provider_label: None,
                model_id: None,
            }),
        ),
    ];
    let text = transcript(&chunk, "Nell", 500).unwrap();
    assert_eq!(
        text,
        "Nell: [Text to Mara] Are you up?\n\nNarrator: [Text from Mara] Always.\n\nThe lamp flickers."
    );
}

#[tokio::test]
async fn boundaries_fall_every_eighth_turn_and_keep_eight_verbatim() {
    let env = Env::new().await;
    let route = main_route(&env);
    env.play(&route, 1, 15).await;
    assert_eq!(
        plan(&env.chain(&route).await, None),
        None,
        "15 turns: not yet"
    );
    env.play(&route, 16, 1).await;
    let chain = env.chain(&route).await;
    let p = plan(&chain, None).unwrap();
    assert_eq!((p.prev_end_index, p.covered_turns), (None, 8));
    assert!(chain[p.end_index].payload_json.contains("reply 8."));

    // With a summary of turns 1-8, the next is due at turn 24 and covers 9-16.
    let prev = EligibleSummary {
        row: crate::db::memory::MemoryRow {
            id: "m".into(),
            story_id: env.story.story_id.clone(),
            kind: "summary".into(),
            source_start_event_id: None,
            source_end_event_id: chain[p.end_index].id.clone(),
            source_hash: String::new(),
            schema_version: 1,
            summary_text: String::new(),
            covered_turns: 8,
            generator: "test".into(),
            api_request_id: None,
            created_at: String::new(),
        },
        end_index: p.end_index,
    };
    env.play(&route, 17, 7).await;
    assert_eq!(plan(&env.chain(&route).await, Some(&prev)), None);
    env.play(&route, 24, 1).await;
    let chain = env.chain(&route).await;
    let next = plan(&chain, Some(&prev)).unwrap();
    assert_eq!(
        (next.prev_end_index, next.covered_turns),
        (Some(p.end_index), 16)
    );

    // Far behind (no summary at 48 turns): catch up 16 turns at a time.
    env.play(&route, 25, 24).await;
    assert_eq!(
        plan(&env.chain(&route).await, None).unwrap().covered_turns,
        16
    );
}

/// Offline: an extractive summary appears at turn 16, is written once, and
/// later prompts use it in place of the turns it covers.
#[tokio::test]
async fn offline_summary_is_written_once_and_used() {
    let env = Env::new().await;
    let route = main_route(&env);
    env.play(&route, 1, 16).await;
    let end = maybe_summarize(&env.env(), &route, None).await.unwrap();
    assert!(end.is_some());
    assert_eq!(
        maybe_summarize(&env.env(), &route, None).await.unwrap(),
        None
    );
    let rows = env.summaries().await;
    assert_eq!(rows, vec![(8, OFFLINE_GENERATOR.to_string(), None)]);

    let preview = preview_context(env.db(), &route).await.unwrap();
    let used = preview.summary.expect("summary in prompt");
    assert_eq!((used.covered_turns, used.chunk_from_turn), (8, 1));
    let system = &preview.messages[0].content;
    assert!(system.contains("STORY SO FAR"));
    assert!(system.contains("action 1. → reply 1."));
    let verbatim: String = preview.messages[1..]
        .iter()
        .map(|m| m.content.as_str())
        .collect();
    assert!(
        !verbatim.contains("action 8."),
        "covered turns not repeated"
    );
    assert!(verbatim.contains("action 9."));
    assert!(!preview.for_waiting_action);
    assert_eq!(
        preview.messages.last().unwrap().content,
        crate::services::context::NEXT_ACTION_PLACEHOLDER
    );
}

/// T17 + T19 through the real reply path: a branch that forked before the
/// summary's end never sees it; one that forked after shares it.
#[tokio::test]
async fn branches_only_see_summaries_of_their_own_past() {
    let env = Env::new().await;
    let route = main_route(&env);
    env.play(&route, 1, 4).await;
    let early = env.head(&route).await;
    env.play(&route, 5, 6).await;
    let late = env.head(&route).await;
    env.play(&route, 11, 6).await;
    maybe_summarize(&env.env(), &route, None)
        .await
        .unwrap()
        .unwrap();

    let sid = env.story.story_id.clone();
    let before = fork_route(env.db(), &sid, &route, &early, None)
        .await
        .unwrap();
    let after = fork_route(env.db(), &sid, &route, &late, None)
        .await
        .unwrap();
    let server = serve(vec![
        Reply::sse_text(&["Ok."], None),
        Reply::sse_text(&["Ok."], None),
    ])
    .await;
    env.connect(&server).await;
    let registry = RunRegistry::default();
    let ctx = Ctx {
        db: env.db(),
        secrets: &env.secrets,
        registry: &registry,
        session_id: "session-1",
        offline_delay: Duration::ZERO,
        budget_override: false,
    };
    for branch in [&before.id, &after.id] {
        let head = env.head(branch).await;
        let sub = submit_action(
            env.db(),
            &sid,
            branch,
            &head,
            "Open the door",
            None,
            &ReplyOptions::default(),
        )
        .await
        .unwrap();
        generate(&ctx, &sub.run_id, &mut |_| {}).await.unwrap();
    }
    let reqs = server.requests();
    let early_prompt = &reqs[0].body;
    assert!(!early_prompt.contains("STORY SO FAR"));
    assert!(
        !early_prompt.contains("action 5."),
        "future of the fork leaked"
    );
    let late_prompt = &reqs[1].body;
    assert!(late_prompt.contains("STORY SO FAR"));
    assert!(late_prompt.contains("action 9."));
    assert!(!late_prompt.contains("action 11."));
}

/// T59: a live summary is a real, ledgered API call even though no story
/// event is added; a failed boundary is not retried every turn.
#[tokio::test]
async fn live_summary_is_ledgered_and_failures_do_not_repeat() {
    let env = Env::new().await;
    let route = main_route(&env);
    env.play(&route, 1, 16).await;
    let server = serve(vec![
        Reply::json(500, r#"{"error":{"message":"overloaded"}}"#),
        Reply::sse_text(
            &["Mara read the letter and kept the ticket."],
            Some(r#"{"prompt_tokens":900,"completion_tokens":40}"#),
        ),
    ])
    .await;
    let pid = env.connect(&server).await;

    assert!(maybe_summarize(&env.env(), &route, Some(&pid))
        .await
        .is_err());
    // Same boundary, same session: skipped without calling again.
    assert_eq!(
        maybe_summarize(&env.env(), &route, Some(&pid))
            .await
            .unwrap(),
        None
    );
    assert_eq!(server.requests().len(), 1);

    // A new session (fresh job list) tries again and succeeds.
    let jobs = MemoryJobs::default();
    let fresh = SummaryEnv {
        jobs: &jobs,
        ..env.env()
    };
    maybe_summarize(&fresh, &route, Some(&pid))
        .await
        .unwrap()
        .unwrap();
    let body = &server.requests()[1].body;
    assert!(body.contains("NEW EVENTS"));
    assert!(body.contains("action 8."));
    assert!(!body.contains("action 9."));

    let ledger: Vec<(String, String, Option<i64>, Option<String>)> = sqlx::query_as(
        "SELECT purpose, status, input_tokens, generation_run_id FROM api_requests \
         ORDER BY started_at, id",
    )
    .fetch_all(env.db().reader())
    .await
    .unwrap();
    assert_eq!(
        ledger,
        vec![
            ("memory_summary".into(), "failed".into(), None, None),
            ("memory_summary".into(), "completed".into(), Some(900), None),
        ]
    );
    let rows = env.summaries().await;
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].1, "model:Test cloud/story-model");
    assert!(rows[0].2.is_some(), "summary links its ledger row");
    let preview = preview_context(env.db(), &route).await.unwrap();
    assert!(preview.messages[0]
        .content
        .contains("Mara read the letter and kept the ticket."));
}

/// A long route, summarized after each reply as the app does: the summary
/// keeps its size, the next prompt fits the default context, the route
/// opens quickly, and all of it is still there after the app restarts.
#[tokio::test]
async fn a_long_route_stays_bounded_fast_and_saved() {
    use crate::db::DB_FILE_NAME;
    use crate::services::reader::route_view;
    use std::time::Instant;

    const TURNS: u32 = 240;
    let env = Env::new().await;
    let route = main_route(&env);
    let filler = " The tide turns and the lamps along the quay come on one by one.".repeat(20);
    for k in 1..=TURNS {
        let head = env.head(&route).await;
        let p = append_event(
            env.db(),
            AppendEvent {
                story_id: env.story.story_id.clone(),
                route_id: route.clone(),
                expected_head_id: head,
                body: EventBody::Player(PlayerPayload::new(format!(
                    "action {k}. I walk on and look around."
                ))),
                generation_run_id: None,
            },
        )
        .await
        .unwrap();
        append_event(
            env.db(),
            AppendEvent {
                story_id: env.story.story_id.clone(),
                route_id: route.clone(),
                expected_head_id: p.event_id,
                body: EventBody::Assistant(AssistantPayload {
                    text: format!("reply {k}.{filler}"),
                    finish_reason: None,
                    provider_label: None,
                    model_id: None,
                }),
                generation_run_id: None,
            },
        )
        .await
        .unwrap();
        maybe_summarize(&env.env(), &route, None).await.unwrap();
    }

    // One summary every eight turns, leaving the newest eight out.
    let rows = env.summaries().await;
    assert_eq!(rows.len(), usize::try_from((TURNS - 8) / 8).unwrap());
    assert_eq!(rows.last().unwrap().0, i64::from(TURNS - 8));
    let newest: String = sqlx::query_scalar(
        "SELECT summary_text FROM memory_caches ORDER BY covered_turns DESC LIMIT 1",
    )
    .fetch_one(env.db().reader())
    .await
    .unwrap();
    assert!(newest.lines().count() <= 40, "the summary keeps its size");
    assert!(newest.contains(&format!("action {}.", TURNS - 8)));

    let preview = preview_context(env.db(), &route).await.unwrap();
    assert!(preview.summary.is_some());
    assert!(preview.estimated_input_tokens <= preview.max_context_tokens);

    let started = Instant::now();
    let view = route_view(env.db(), &route).await.unwrap();
    let took = started.elapsed();
    assert_eq!(view.history.len(), 1 + 2 * usize::try_from(TURNS).unwrap());
    assert!(took < Duration::from_secs(5), "opening took {took:?}");

    // Close and open again, as when the app restarts.
    let head = env.head(&route).await;
    env.db().close().await;
    let dir = env.t.dir.path();
    let (db, _) = Database::open(&dir.join(DB_FILE_NAME), &dir.join("backups"))
        .await
        .unwrap();
    let again = route_view(&db, &route).await.unwrap();
    assert_eq!(again.route.head_event_id.as_deref(), Some(head.as_str()));
    assert_eq!(again.history.len(), view.history.len());
    assert_eq!(
        serde_json::to_value(&again.state).unwrap(),
        serde_json::to_value(&view.state).unwrap()
    );
    let kept: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM memory_caches")
        .fetch_one(db.reader())
        .await
        .unwrap();
    assert_eq!(kept, i64::try_from(rows.len()).unwrap());
    db.close().await;
}

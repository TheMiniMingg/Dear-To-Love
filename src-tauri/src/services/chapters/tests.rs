use super::*;
use crate::db::providers::{save_profile, set_storyteller};
use crate::db::saves::list_saves;
use crate::db::stories::create_story;
use crate::db::test_support::{test_db, TestDb};
use crate::db::timeline::{append_event, AppendEvent};
use crate::domain::events::{AssistantPayload, PlayerPayload};
use crate::domain::provider::{AdapterKind, Billing, GenerationSettings, ProviderProfileInput};
use crate::domain::story::StoryCreated;
use crate::domain::templates::{QuickStartInput, TemplateCatalog};
use crate::services::adapters::test_server::{serve, Reply, TestServer};
use crate::services::context::preview_context;
use crate::services::memory::MemoryJobs;
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

    fn route(&self) -> String {
        self.story.main_route_id.clone()
    }

    async fn head(&self) -> String {
        let mut conn = self.db().reader().acquire().await.unwrap();
        get_route(&mut conn, &self.route())
            .await
            .unwrap()
            .head_event_id
            .unwrap()
    }

    async fn push(&self, body: EventBody) -> String {
        append_event(
            self.db(),
            AppendEvent {
                story_id: self.story.story_id.clone(),
                route_id: self.route(),
                expected_head_id: self.head().await,
                body,
                generation_run_id: None,
            },
        )
        .await
        .unwrap()
        .event_id
    }

    async fn act(&self, text: &str) {
        self.push(EventBody::Player(PlayerPayload::new(text))).await;
    }

    async fn reply(&self, text: &str) {
        self.push(EventBody::Assistant(AssistantPayload {
            text: text.into(),
            finish_reason: None,
            provider_label: None,
            model_id: None,
        }))
        .await;
    }

    async fn connect(&self, server: &TestServer) {
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
    }

    async fn end(&self, recap: &str) -> AppResult<()> {
        end_chapter(
            self.db(),
            &self.story.story_id,
            &self.route(),
            &self.head().await,
            recap,
            None,
        )
        .await
    }

    async fn system_prompt(&self) -> String {
        preview_context(self.db(), &self.route())
            .await
            .unwrap()
            .messages
            .into_iter()
            .next()
            .unwrap()
            .content
    }
}

#[tokio::test]
async fn a_chapter_needs_a_finished_turn_before_it_can_end() {
    let env = Env::new().await;
    let err = draft_recap(&env.env(), &env.route()).await.unwrap_err();
    assert!(
        err.message.contains("nothing has happened"),
        "{}",
        err.message
    );
    env.act("Read the letter.").await;
    let err = draft_recap(&env.env(), &env.route()).await.unwrap_err();
    assert!(err.message.contains("no reply yet"), "{}", err.message);
    assert!(env.end("Recap.").await.is_err());
}

/// The offline recap needs no connection, and the next chapter, the save
/// and every later prompt carry the version the player kept.
#[tokio::test]
async fn ending_a_chapter_saves_it_and_later_chapters_remember_it() {
    let env = Env::new().await;
    env.act("Hold the letter up to the lamp.").await;
    env.reply("A gull crest shows in the paper. It matches the ferry office door.")
        .await;

    let draft = draft_recap(&env.env(), &env.route()).await.unwrap();
    assert_eq!(draft.chapter_ordinal, 1);
    assert_eq!(draft.chapter_title, "The Lamp Room");
    assert_eq!(draft.next_ordinal, 2);
    assert_eq!(
        draft.next_title, "Low Tide",
        "the scenario's plan names chapter 2"
    );
    assert_eq!(draft.written_by, OFFLINE_RECAP_BY);
    assert!(
        draft.recap.contains("Hold the letter up to the lamp."),
        "{}",
        draft.recap
    );
    assert_eq!(draft.head_event_id, env.head().await);

    env.end("Sam found a gull crest in the letter, the same as on the ferry office door.")
        .await
        .unwrap();

    let saves = list_saves(env.db(), &env.story.story_id).await.unwrap();
    let save = saves
        .iter()
        .find(|s| s.label == "End of Chapter 1: The Lamp Room")
        .expect("a save named after the chapter");
    assert_eq!(save.save_type, "manual");
    assert_eq!(
        save.event_id,
        env.head().await,
        "the save opens the next chapter"
    );

    let prompt = env.system_prompt().await;
    assert!(
        prompt.contains(
            "\nEARLIER CHAPTERS\nChapter 1, The Lamp Room: Sam found a gull crest in the \
             letter, the same as on the ferry office door.\n\nNOW\nChapter 2: Low Tide\n"
        ),
        "{prompt}"
    );
}

#[tokio::test]
async fn a_live_storyteller_writes_the_recap_from_this_chapter_only() {
    let env = Env::new().await;
    env.act("Hold the letter up to the lamp.").await;
    env.reply("A gull crest shows in the paper.").await;
    env.end("Chapter one recap.").await.unwrap();
    env.act("Walk down to the ferry.").await;
    env.reply("Mara is coiling rope and pretends not to see you.")
        .await;

    let server = serve(vec![Reply::sse_text(
        &["Sam went to the ferry; Mara avoided them."],
        Some(r#"{"prompt_tokens":300,"completion_tokens":12}"#),
    )])
    .await;
    env.connect(&server).await;
    let draft = draft_recap(&env.env(), &env.route()).await.unwrap();
    assert_eq!(draft.recap, "Sam went to the ferry; Mara avoided them.");
    assert_eq!(draft.written_by, "Test cloud");
    assert_eq!((draft.chapter_ordinal, draft.next_ordinal), (2, 3));

    let body = &server.requests()[0].body;
    assert!(body.contains("CHAPTER 2: Low Tide"), "{body}");
    assert!(body.contains("Walk down to the ferry."));
    assert!(
        !body.contains("Hold the letter"),
        "earlier chapters stay out"
    );

    let purpose: String = sqlx::query_scalar("SELECT purpose FROM api_requests")
        .fetch_one(env.db().reader())
        .await
        .unwrap();
    assert_eq!(purpose, "memory_summary");

    // Both recaps reach the storyteller once chapter 2 ends too.
    env.end(&draft.recap).await.unwrap();
    let prompt = env.system_prompt().await;
    assert!(prompt.contains("Chapter 1, The Lamp Room: Chapter one recap.\n"));
    assert!(prompt.contains("Chapter 2, Low Tide: Sam went to the ferry; Mara avoided them.\n"));
}

#[tokio::test]
async fn an_empty_recap_still_ends_the_chapter_and_a_moved_route_is_refused() {
    let env = Env::new().await;
    env.act("Look around.").await;
    env.reply("The lamp hums.").await;
    let stale = env.head().await;
    env.end("   ").await.unwrap();
    assert!(!env.system_prompt().await.contains("EARLIER CHAPTERS"));
    let err = end_chapter(
        env.db(),
        &env.story.story_id,
        &env.route(),
        &stale,
        "Late recap.",
        None,
    )
    .await
    .unwrap_err();
    assert_eq!(err.code, ErrorCode::HeadChanged);
}

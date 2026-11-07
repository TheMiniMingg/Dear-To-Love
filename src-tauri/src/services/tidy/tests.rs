use super::*;
use crate::db::providers::{save_profile, set_storyteller};
use crate::db::stories::create_story;
use crate::db::test_support::{test_db, TestDb};
use crate::db::timeline::{append_event, AppendEvent};
use crate::domain::events::{AssistantPayload, EditPayload, EventBody, PlayerPayload, StateEdit};
use crate::domain::provider::{AdapterKind, Billing, GenerationSettings, ProviderProfileInput};
use crate::domain::story::StoryCreated;
use crate::domain::templates::{QuickStartInput, TemplateCatalog};
use crate::services::adapters::test_server::{serve, Reply};
use crate::services::memory::MemoryJobs;
use crate::services::secrets::MemoryStore;

fn note(kind: NoteKind, name: &str, text: &str) -> MemoryNote {
    MemoryNote {
        kind,
        name: name.into(),
        text: text.into(),
        chapter: Some(1),
        source_event_id: Some("e1".into()),
    }
}

fn notebook() -> Vec<MemoryNote> {
    vec![
        note(
            NoteKind::Person,
            "Mara",
            "Runs the ferry. Owes Sam a favour.",
        ),
        note(NoteKind::Place, "The lamp room", "Top of the lighthouse."),
        note(
            NoteKind::Person,
            "Mara Quill",
            "Runs the ferry. Hates the harbour master.",
        ),
        note(
            NoteKind::Item,
            "The letter",
            "Unsigned. Unsigned. Sealed with a gull.",
        ),
        note(NoteKind::Fact, "Storm", "A storm is coming on Friday."),
    ]
}

#[test]
fn a_short_notebook_is_left_alone() {
    let mut notes = notebook();
    assert!(!worth_tidying(&notes));
    notes.push(note(NoteKind::Event, "Fire", "The boathouse burned."));
    assert!(worth_tidying(&notes));
    let long = note(NoteKind::Fact, "History", &"Long ago. ".repeat(50));
    assert!(worth_tidying(&[long]));
}

#[test]
fn offline_merges_a_first_name_into_the_whole_name_and_drops_repeats() {
    let changes = offline_changes(&notebook());
    assert_eq!(changes.len(), 2, "{changes:#?}");
    let merge = &changes[0];
    assert_eq!(
        merge
            .replaces
            .iter()
            .map(|n| n.name.as_str())
            .collect::<Vec<_>>(),
        ["Mara", "Mara Quill"]
    );
    assert_eq!(merge.note.name, "Mara Quill");
    assert_eq!(merge.note.kind, NoteKind::Person);
    assert_eq!(
        merge.note.text,
        "Runs the ferry. Owes Sam a favour. Hates the harbour master."
    );
    assert_eq!(merge.note.chapter, Some(1));
    assert_eq!(merge.note.source_event_id, None);
    let short = &changes[1];
    assert_eq!(short.replaces[0].name, "The letter");
    assert_eq!(short.note.text, "Unsigned. Sealed with a gull.");

    // Two people with the same first name: which one is meant is unclear.
    let mut two = notebook();
    two.push(note(NoteKind::Person, "Mara Lin", "The baker."));
    assert!(offline_changes(&two).iter().all(|c| c.replaces.len() == 1));
    // Japanese sentences run on without spaces.
    let ja = [note(
        NoteKind::Fact,
        "嵐",
        "嵐が来る。嵐が来る。灯台は暗い。",
    )];
    assert_eq!(offline_changes(&ja)[0].note.text, "嵐が来る。灯台は暗い。");
}

#[test]
fn reads_the_storytellers_changes_and_leaves_out_what_does_not_fit() {
    let notes = notebook();
    let reply = r#"Here you go:
```json
{"changes": [
  {"replace": [1, 3], "kind": "person", "name": "Mara  Quill",
   "text": "Runs the ferry, owes Sam a favour, hates the harbour master."},
  {"replace": [4], "text": "Unsigned, sealed with a gull."},
  {"replace": [3, 5], "kind": "fact", "name": "Again", "text": "Used twice."},
  {"replace": [2], "text": "Top of the lighthouse, where the lamp is kept and polished."},
  {"replace": [9], "text": "No such note."},
  {"replace": ["5"], "kind": "place", "name": "The lamp room", "text": "Storm."},
  {"replace": [5], "kind": "spell", "text": "Storm Friday."}
]}
```"#;
    let changes = read_changes(reply, &notes).unwrap();
    let got: Vec<(Vec<&str>, &str, NoteKind, &str)> = changes
        .iter()
        .map(|c| {
            (
                c.replaces.iter().map(|n| n.name.as_str()).collect(),
                c.note.name.as_str(),
                c.note.kind,
                c.note.text.as_str(),
            )
        })
        .collect();
    assert_eq!(
        got,
        vec![
            (
                vec!["Mara", "Mara Quill"],
                "Mara Quill",
                NoteKind::Person,
                "Runs the ferry, owes Sam a favour, hates the harbour master."
            ),
            (
                vec!["The letter"],
                "The letter",
                NoteKind::Item,
                "Unsigned, sealed with a gull."
            ),
            // An unknown kind keeps the note's own.
            (vec!["Storm"], "Storm", NoteKind::Fact, "Storm Friday."),
        ]
    );
    assert_eq!(read_changes(r#"{"changes": []}"#, &notes).unwrap(), vec![]);
    let e = read_changes("I merged Mara's notes.", &notes).unwrap_err();
    assert_eq!(e.code, ErrorCode::ProviderError);
}

#[test]
fn the_request_lists_every_note_by_number() {
    let m = tidy_messages(&notebook(), "Sam", Some("French"));
    assert!(m[0].content.contains("The player character is Sam."));
    assert!(m[0].content.contains("Write it in French."));
    assert!(m[1]
        .content
        .contains("3. [person] Mara Quill: Runs the ferry. Hates the harbour master."));
}

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

    fn env(&self) -> SummaryEnv<'_> {
        SummaryEnv {
            db: &self.t.db,
            secrets: &self.secrets,
            jobs: &self.jobs,
            session_id: "session-1",
        }
    }

    async fn head(&self) -> String {
        let mut conn = self.t.db.reader().acquire().await.unwrap();
        get_route(&mut conn, &self.story.main_route_id)
            .await
            .unwrap()
            .head_event_id
            .unwrap()
    }

    async fn push(&self, body: EventBody) {
        append_event(
            &self.t.db,
            AppendEvent {
                story_id: self.story.story_id.clone(),
                route_id: self.story.main_route_id.clone(),
                expected_head_id: self.head().await,
                body,
                generation_run_id: None,
            },
        )
        .await
        .unwrap();
    }

    async fn turn(&self) {
        self.push(EventBody::Player(PlayerPayload::new("Walk to the ferry.")))
            .await;
        self.push(EventBody::Assistant(AssistantPayload {
            text: "Mara looks up.".into(),
            finish_reason: None,
            provider_label: None,
            model_id: None,
        }))
        .await;
    }

    async fn write(&self, notes: Vec<MemoryNote>) {
        append_event(
            &self.t.db,
            AppendEvent {
                story_id: self.story.story_id.clone(),
                route_id: self.story.main_route_id.clone(),
                expected_head_id: self.head().await,
                body: EventBody::Edit(EditPayload {
                    changes: notes
                        .into_iter()
                        .map(|note| StateEdit::UpsertNote { note })
                        .collect(),
                    note: None,
                }),
                generation_run_id: None,
            },
        )
        .await
        .unwrap();
    }
}

#[tokio::test]
async fn offline_or_live_the_suggestions_are_only_suggestions() {
    let env = Env::new().await;
    let route = env.story.main_route_id.clone();
    env.write(notebook()).await;
    // Nothing is suggested for a chapter that cannot end yet.
    let e = draft_tidy(&env.env(), &route).await.unwrap_err();
    assert_eq!(e.code, ErrorCode::InvalidInput);
    env.turn().await;
    // A short notebook asks nobody.
    let t = draft_tidy(&env.env(), &route).await.unwrap();
    assert_eq!((t.changes.len(), t.written_by.as_str()), (0, ""));

    env.write(vec![note(NoteKind::Event, "Fire", "The boathouse burned.")])
        .await;
    let t = draft_tidy(&env.env(), &route).await.unwrap();
    assert_eq!(t.written_by, OFFLINE_RECAP_BY);
    assert_eq!(t.changes.len(), 2);
    assert_eq!(t.head_event_id, env.head().await);

    let server = serve(vec![Reply::sse_text(
        &[r#"{"changes":[{"replace":[1,3],"name":"Mara Quill","text":"Runs the ferry."}]}"#],
        Some(r#"{"prompt_tokens":300,"completion_tokens":30}"#),
    )])
    .await;
    let p = save_profile(
        &env.t.db,
        &env.secrets,
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
    set_storyteller(&env.t.db, Some(&p.id)).await.unwrap();
    let t = draft_tidy(&env.env(), &route).await.unwrap();
    assert_eq!(t.written_by, "Test cloud");
    assert_eq!(t.changes.len(), 1);
    assert_eq!(t.changes[0].note.text, "Runs the ferry.");
    let body = &server.requests()[0].body;
    assert!(body.contains("NOTEBOOK"), "{body}");
    let purpose: String = sqlx::query_scalar("SELECT purpose FROM api_requests")
        .fetch_one(env.t.db.reader())
        .await
        .unwrap();
    assert_eq!(purpose, "memory_summary");
    // Nothing changed in the story.
    let mut conn = env.t.db.reader().acquire().await.unwrap();
    let (state, _) = state_with_snapshots(&mut conn, &env.story.story_id, &env.head().await)
        .await
        .unwrap();
    assert_eq!(state.state.notes.len(), 6);
}

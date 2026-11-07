use std::collections::HashMap;

use super::*;
use crate::db::stories::create_story;
use crate::db::test_support::{test_db, TestDb};
use crate::db::{contract, Database};
use crate::domain::events::{AssistantPayload, PlayerPayload};
use crate::domain::story::{ChapterOutlineInput, CreateStoryInput, StoryCreated};
use crate::domain::story_state::fixtures::lighthouse;

async fn story(t: &TestDb) -> StoryCreated {
    create_story(
        &t.db,
        CreateStoryInput {
            title: "Lamp".into(),
            description: String::new(),
            base_state: lighthouse(),
            first_chapter_title: "One".into(),
            chapter_outlines: vec![
                ChapterOutlineInput {
                    title: "One".into(),
                    outline: String::new(),
                },
                ChapterOutlineInput {
                    title: "Two (outline)".into(),
                    outline: String::new(),
                },
            ],
        },
    )
    .await
    .unwrap()
}

fn player(text: &str) -> EventBody {
    EventBody::Player(PlayerPayload::new(text))
}

fn reply(text: &str) -> EventBody {
    EventBody::Assistant(AssistantPayload {
        text: text.into(),
        finish_reason: None,
        provider_label: None,
        model_id: None,
    })
}

async fn head(db: &Database, route_id: &str) -> String {
    let mut c = db.reader().acquire().await.unwrap();
    get_route(&mut c, route_id)
        .await
        .unwrap()
        .head_event_id
        .unwrap()
}

async fn append(
    db: &Database,
    s: &StoryCreated,
    route: &str,
    body: EventBody,
) -> AppResult<Appended> {
    let h = head(db, route).await;
    append_event(
        db,
        AppendEvent {
            story_id: s.story_id.clone(),
            route_id: route.into(),
            expected_head_id: h,
            body,
            generation_run_id: None,
        },
    )
    .await
}

/// Player + reply turn; returns (player_event, assistant_event).
async fn turn(db: &Database, s: &StoryCreated, route: &str, n: usize) -> (String, String) {
    let p = append(db, s, route, player(&format!("action {n}")))
        .await
        .unwrap();
    let a = append(db, s, route, reply(&format!("reply {n}")))
        .await
        .unwrap();
    (p.event_id, a.event_id)
}

async fn ids(db: &Database, route: &str) -> Vec<String> {
    route_history(db, route)
        .await
        .unwrap()
        .into_iter()
        .map(|e| e.id)
        .collect()
}

#[tokio::test]
async fn append_advances_head_and_version_with_cas() {
    let t = test_db().await;
    let s = story(&t).await;
    let first = append(&t.db, &s, &s.main_route_id, player("hello"))
        .await
        .unwrap();
    assert_eq!(first.route_version, 2);
    // Stale expected head is refused.
    let err = append_event(
        &t.db,
        AppendEvent {
            story_id: s.story_id.clone(),
            route_id: s.main_route_id.clone(),
            expected_head_id: s.head_event_id.clone(),
            body: player("again"),
            generation_run_id: None,
        },
    )
    .await
    .unwrap_err();
    assert_eq!(err.code, ErrorCode::HeadChanged);
    assert_eq!(ids(&t.db, &s.main_route_id).await.len(), 2);
}

#[tokio::test]
async fn reply_must_follow_action_and_actions_wait_for_replies() {
    let t = test_db().await;
    let s = story(&t).await;
    let e = append(&t.db, &s, &s.main_route_id, reply("too early"))
        .await
        .unwrap_err();
    assert_eq!(e.code, ErrorCode::InvalidInput);
    append(&t.db, &s, &s.main_route_id, player("go"))
        .await
        .unwrap();
    let e = append(&t.db, &s, &s.main_route_id, player("go again"))
        .await
        .unwrap_err();
    assert_eq!(e.code, ErrorCode::InvalidInput, "no duplicate player send");
    append(&t.db, &s, &s.main_route_id, reply("ok"))
        .await
        .unwrap();
}

/// T03: fork at a historical event; original unchanged; shared ancestors identical.
#[tokio::test]
async fn fork_at_historical_event() {
    let t = test_db().await;
    let s = story(&t).await;
    let (p1, _) = turn(&t.db, &s, &s.main_route_id, 1).await;
    turn(&t.db, &s, &s.main_route_id, 2).await;
    let main_before = ids(&t.db, &s.main_route_id).await;

    let alt = fork_route(&t.db, &s.story_id, &s.main_route_id, &p1, None)
        .await
        .unwrap();
    assert_eq!(alt.label, "Alt 1");
    assert_eq!(alt.head_event_id.as_deref(), Some(p1.as_str()));
    append(&t.db, &s, &alt.id, reply("different"))
        .await
        .unwrap();

    assert_eq!(ids(&t.db, &s.main_route_id).await, main_before);
    let alt_ids = ids(&t.db, &alt.id).await;
    assert_eq!(alt_ids[..2], main_before[..2]);
    assert_ne!(alt_ids[2], main_before[2]);
    assert!(contract::verify(&t.db).await.unwrap().is_empty());
}

#[tokio::test]
async fn fork_rejects_events_outside_route_and_other_stories() {
    let t = test_db().await;
    let s = story(&t).await;
    let other = story(&t).await;
    let (p1, _) = turn(&t.db, &s, &s.main_route_id, 1).await;
    let alt = fork_route(&t.db, &s.story_id, &s.main_route_id, &s.head_event_id, None)
        .await
        .unwrap();
    // p1 is on main only, not in alt's history.
    let e = fork_route(&t.db, &s.story_id, &alt.id, &p1, None)
        .await
        .unwrap_err();
    assert_eq!(e.code, ErrorCode::InvalidAncestor);
    let e = fork_route(&t.db, &other.story_id, &s.main_route_id, &p1, None)
        .await
        .unwrap_err();
    assert_eq!(e.code, ErrorCode::WrongStory);
}

/// T04 + T08: restart chapter 3 on a new route; chapter 4 diverges per route.
#[tokio::test]
async fn restart_chapter_and_divergent_chapter_four() {
    let t = test_db().await;
    let s = story(&t).await;
    let main = s.main_route_id.clone();
    turn(&t.db, &s, &main, 1).await;
    let c2 = next_chapter(&t.db, &s.story_id, &main, &head(&t.db, &main).await, None)
        .await
        .unwrap();
    turn(&t.db, &s, &main, 2).await;
    let c3 = next_chapter(&t.db, &s.story_id, &main, &head(&t.db, &main).await, None)
        .await
        .unwrap();
    turn(&t.db, &s, &main, 3).await;

    let chapters = route_chapters(&t.db, &main).await.unwrap();
    let titles: Vec<_> = chapters.iter().map(|c| c.title.as_str()).collect();
    assert_eq!(titles, ["One", "Two (outline)", "Chapter 3"]);
    assert_eq!(chapters[1].event_id, c2.event_id);

    let main_before = ids(&t.db, &main).await;
    let alt = restart_chapter(&t.db, &s.story_id, &main, &c3.event_id)
        .await
        .unwrap();
    assert_eq!(alt.head_event_id.as_deref(), Some(c3.event_id.as_str()));
    assert_eq!(
        ids(&t.db, &main).await,
        main_before,
        "original outcome kept"
    );
    assert_eq!(route_chapters(&t.db, &alt.id).await.unwrap().len(), 3);

    next_chapter(
        &t.db,
        &s.story_id,
        &main,
        &head(&t.db, &main).await,
        Some("Storm".into()),
    )
    .await
    .unwrap();
    turn(&t.db, &s, &alt.id, 4).await;
    next_chapter(
        &t.db,
        &s.story_id,
        &alt.id,
        &head(&t.db, &alt.id).await,
        Some("Calm".into()),
    )
    .await
    .unwrap();
    let m4 = route_chapters(&t.db, &main).await.unwrap().pop().unwrap();
    let a4 = route_chapters(&t.db, &alt.id).await.unwrap().pop().unwrap();
    assert_eq!((m4.ordinal, a4.ordinal), (4, 4));
    assert_eq!((m4.title.as_str(), a4.title.as_str()), ("Storm", "Calm"));

    let e = restart_chapter(&t.db, &s.story_id, &main, &main_before[2])
        .await
        .unwrap_err();
    assert_eq!(e.code, ErrorCode::InvalidInput, "not a chapter start");
}

#[tokio::test]
async fn chapter_ordinals_must_be_sequential() {
    let t = test_db().await;
    let s = story(&t).await;
    let e = append(
        &t.db,
        &s,
        &s.main_route_id,
        EventBody::ChapterStart(ChapterStartPayload {
            chapter_instance_id: "x".into(),
            title: "Skip".into(),
            ordinal: 5,
            source_outline_id: None,
            previous_chapter_recap: None,
        }),
    )
    .await
    .unwrap_err();
    assert_eq!(e.code, ErrorCode::InvalidInput);
}

/// T11: two simultaneous sends on the same head; exactly one wins.
#[tokio::test]
async fn concurrent_appends_one_wins() {
    let t = test_db().await;
    let s = story(&t).await;
    let mut tasks = Vec::new();
    for i in 0..2 {
        let db = t.db.clone();
        let input = AppendEvent {
            story_id: s.story_id.clone(),
            route_id: s.main_route_id.clone(),
            expected_head_id: s.head_event_id.clone(),
            body: player(&format!("send {i}")),
            generation_run_id: None,
        };
        tasks.push(tokio::spawn(async move { append_event(&db, input).await }));
    }
    let mut ok = 0;
    for task in tasks {
        match task.await.unwrap() {
            Ok(_) => ok += 1,
            Err(e) => assert_eq!(e.code, ErrorCode::HeadChanged),
        }
    }
    assert_eq!(ok, 1);
    assert_eq!(ids(&t.db, &s.main_route_id).await.len(), 2);
}

/// T14: regenerate forks at the player action; original reply preserved.
#[tokio::test]
async fn regenerate_creates_fork_at_player_action() {
    let t = test_db().await;
    let s = story(&t).await;
    let (p1, a1) = turn(&t.db, &s, &s.main_route_id, 1).await;
    let before = ids(&t.db, &s.main_route_id).await;
    let alt = regenerate_fork(&t.db, &s.story_id, &s.main_route_id, &a1)
        .await
        .unwrap();
    assert_eq!(alt.head_event_id.as_deref(), Some(p1.as_str()));
    append(&t.db, &s, &alt.id, reply("another take"))
        .await
        .unwrap();
    assert_eq!(ids(&t.db, &s.main_route_id).await, before);
    let e = regenerate_fork(&t.db, &s.story_id, &s.main_route_id, &p1)
        .await
        .unwrap_err();
    assert_eq!(e.code, ErrorCode::InvalidInput);
}

/// T15: editing a past action forks at its predecessor.
#[tokio::test]
async fn edit_prior_action_forks_at_predecessor() {
    let t = test_db().await;
    let s = story(&t).await;
    let (p1, a1) = turn(&t.db, &s, &s.main_route_id, 1).await;
    turn(&t.db, &s, &s.main_route_id, 2).await;
    let before = route_history(&t.db, &s.main_route_id).await.unwrap();

    let (fork, appended) =
        edit_prior_player_turn(&t.db, &s.story_id, &s.main_route_id, &p1, "edited".into())
            .await
            .unwrap();
    assert_eq!(
        fork.fork_event_id.as_deref(),
        Some(s.head_event_id.as_str())
    );
    assert_eq!(
        fork.head_event_id.as_deref(),
        Some(appended.event_id.as_str())
    );
    let hist = route_history(&t.db, &fork.id).await.unwrap();
    assert_eq!(hist.len(), 2);
    assert_eq!(hist[1].body, player("edited"));
    assert_eq!(
        route_history(&t.db, &s.main_route_id).await.unwrap(),
        before
    );
    let e = edit_prior_player_turn(&t.db, &s.story_id, &s.main_route_id, &a1, "x".into())
        .await
        .unwrap_err();
    assert_eq!(e.code, ErrorCode::InvalidInput);
}

#[tokio::test]
async fn hide_and_rename_routes() {
    let t = test_db().await;
    let s = story(&t).await;
    let e = set_route_hidden(&t.db, &s.story_id, &s.main_route_id, true)
        .await
        .unwrap_err();
    assert_eq!(e.code, ErrorCode::InvalidInput);
    let alt = fork_route(
        &t.db,
        &s.story_id,
        &s.main_route_id,
        &s.head_event_id,
        Some("Beach".into()),
    )
    .await
    .unwrap();
    assert_eq!(alt.label, "Beach");
    let alt = set_route_hidden(&t.db, &s.story_id, &alt.id, true)
        .await
        .unwrap();
    assert!(alt.hidden);
    let alt = rename_route(&t.db, &s.story_id, &alt.id, "Cove")
        .await
        .unwrap();
    assert_eq!(alt.label, "Cove");
    assert_eq!(list_routes(&t.db, &s.story_id).await.unwrap().len(), 2);
}

/// Deterministic PRNG so property runs are reproducible from the seed.
struct SplitMix(u64);
impl SplitMix {
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }
    fn below(&mut self, n: usize) -> usize {
        (self.next() % n as u64) as usize
    }
}

/// T06: 100 randomized operations per seed. After every operation each
/// route's history equals the model's, so no operation leaks into another
/// route, and the schema contract holds.
#[tokio::test]
async fn randomized_operations_keep_routes_isolated() {
    for seed in 1..=5u64 {
        let t = test_db().await;
        let s = story(&t).await;
        let mut rng = SplitMix(seed);
        // Model: route id -> expected history (event ids root..head).
        let mut model: HashMap<String, Vec<String>> = HashMap::new();
        model.insert(s.main_route_id.clone(), vec![s.head_event_id.clone()]);
        let mut kinds: HashMap<String, EventKind> = HashMap::new();
        kinds.insert(s.head_event_id.clone(), EventKind::ChapterStart);

        for step in 0..100 {
            let mut routes: Vec<String> = model.keys().cloned().collect();
            routes.sort();
            let route = routes[rng.below(routes.len())].clone();
            let hist = model[&route].clone();
            let head_id = hist.last().unwrap().clone();
            let head_kind = kinds[&head_id];
            let ctx = format!("seed {seed} step {step}");

            match rng.below(6) {
                0 | 1 => {
                    let body = if head_kind == EventKind::Player {
                        reply(&format!("r{step}"))
                    } else {
                        player(&format!("p{step}"))
                    };
                    let kind = body.kind();
                    let a = append(&t.db, &s, &route, body).await.expect(&ctx);
                    kinds.insert(a.event_id.clone(), kind);
                    model.get_mut(&route).unwrap().push(a.event_id);
                }
                2 => {
                    let at = rng.below(hist.len());
                    let r = fork_route(&t.db, &s.story_id, &route, &hist[at], None)
                        .await
                        .expect(&ctx);
                    model.insert(r.id, hist[..=at].to_vec());
                }
                3 => {
                    if head_kind == EventKind::Player {
                        continue;
                    }
                    let a = next_chapter(&t.db, &s.story_id, &route, &head_id, None)
                        .await
                        .expect(&ctx);
                    kinds.insert(a.event_id.clone(), EventKind::ChapterStart);
                    model.get_mut(&route).unwrap().push(a.event_id);
                }
                4 => {
                    let players: Vec<usize> = (0..hist.len())
                        .filter(|i| kinds[&hist[*i]] == EventKind::Player)
                        .collect();
                    if players.is_empty() {
                        continue;
                    }
                    let i = players[rng.below(players.len())];
                    let (fork, a) = edit_prior_player_turn(
                        &t.db,
                        &s.story_id,
                        &route,
                        &hist[i],
                        format!("edit {step}"),
                    )
                    .await
                    .expect(&ctx);
                    kinds.insert(a.event_id.clone(), EventKind::Player);
                    let mut h = hist[..i].to_vec();
                    h.push(a.event_id);
                    model.insert(fork.id, h);
                }
                _ => {
                    // A stale write from an older head must be refused.
                    if hist.len() < 2 {
                        continue;
                    }
                    let stale = hist[rng.below(hist.len() - 1)].clone();
                    let e = append_event(
                        &t.db,
                        AppendEvent {
                            story_id: s.story_id.clone(),
                            route_id: route.clone(),
                            expected_head_id: stale,
                            body: player("stale"),
                            generation_run_id: None,
                        },
                    )
                    .await
                    .unwrap_err();
                    assert_eq!(e.code, ErrorCode::HeadChanged, "{ctx}");
                }
            }

            for (r, expected) in &model {
                assert_eq!(&ids(&t.db, r).await, expected, "{ctx}: route {r}");
            }
        }
        let problems = contract::verify(&t.db).await.unwrap();
        assert!(problems.is_empty(), "seed {seed}: {problems:?}");
    }
}

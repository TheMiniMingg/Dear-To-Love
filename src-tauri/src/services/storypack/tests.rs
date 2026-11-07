use super::*;
use crate::domain::events::{
    AssistantPayload, ChapterStartPayload, EditPayload, FactConfirmPayload, PlayerPayload,
};
use crate::domain::story_state::fixtures::lighthouse;
use crate::domain::story_state::{Control, KnownFact};

fn event(id: &str, route: &str, parent: Option<&str>, body: EventBody) -> PackEvent {
    PackEvent {
        id: id.into(),
        origin_route_id: route.into(),
        parent_event_id: parent.map(Into::into),
        kind: body.kind().as_str().into(),
        payload: serde_json::from_str(&body.payload_json()).unwrap(),
        payload_version: EVENT_PAYLOAD_VERSION as i64,
        created_at: "2026-11-06T00:00:00Z".into(),
    }
}

fn route(id: &str, parent: Option<&str>, fork: Option<&str>, head: &str) -> PackRoute {
    PackRoute {
        id: id.into(),
        label: if parent.is_none() { "Main" } else { "Alt" }.into(),
        parent_route_id: parent.map(Into::into),
        fork_event_id: fork.map(Into::into),
        head_event_id: head.into(),
        is_main: parent.is_none(),
        hidden: false,
        version: 1,
        created_at: "2026-11-06T00:00:00Z".into(),
        updated_at: "2026-11-06T00:00:00Z".into(),
    }
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

fn fact(source: &str) -> KnownFact {
    KnownFact {
        id: "f1".into(),
        text: "The lamp was lit from inside.".into(),
        known_by: vec!["pc".into()],
        source_event_id: Some(source.into()),
        confirmed: true,
    }
}

const SHA: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

/// main: e0 chapter, e1 player, e2 reply, e3 fact edit + picture
/// alt (from e2): e4 player, e5 fact confirm
/// Listed children first, to show `check` orders them.
fn sample() -> PackStory {
    let mut base = lighthouse();
    base.visual_refs.insert("cover".into(), "img-old".into());
    PackStory {
        id: "story-old".into(),
        title: "  The Lamp Room ".into(),
        description: String::new(),
        base_state: base,
        created_at: "2026-11-06T00:00:00Z".into(),
        updated_at: "2026-11-06T00:00:00Z".into(),
        chapter_outlines: vec![PackOutline {
            id: "o1".into(),
            ordinal: 1,
            title: "One".into(),
            outline: "Climb.".into(),
        }],
        routes: vec![
            route("alt", Some("main"), Some("e2"), "e5"),
            route("main", None, None, "e3"),
        ],
        events: vec![
            event(
                "e5",
                "alt",
                Some("e4"),
                EventBody::FactConfirm(FactConfirmPayload { fact: fact("e4") }),
            ),
            event("e4", "alt", Some("e2"), player("I run.")),
            event(
                "e3",
                "main",
                Some("e2"),
                EventBody::Edit(EditPayload {
                    changes: vec![
                        StateEdit::UpsertFact { fact: fact("e2") },
                        StateEdit::SetVisualRef {
                            slot: "background".into(),
                            asset_id: Some("img-old".into()),
                        },
                        StateEdit::SetVisualRef {
                            slot: "portrait:npc-mara".into(),
                            asset_id: Some("not-in-pack".into()),
                        },
                    ],
                    note: None,
                }),
            ),
            event("e2", "main", Some("e1"), reply("The lamp hums.")),
            event("e1", "main", Some("e0"), player("I climb.")),
            event(
                "e0",
                "main",
                None,
                EventBody::ChapterStart(ChapterStartPayload {
                    chapter_instance_id: "c1".into(),
                    title: "One".into(),
                    ordinal: 1,
                    source_outline_id: Some("o1".into()),
                    previous_chapter_recap: None,
                }),
            ),
        ],
        saves: vec![PackSave {
            id: "s1".into(),
            route_id: "alt".into(),
            event_id: "e2".into(),
            label: "Shared start".into(),
            save_type: "manual".into(),
            slot: None,
            created_at: "2026-11-06T00:00:00Z".into(),
            updated_at: "2026-11-06T00:00:00Z".into(),
        }],
        bookmarks: vec![PackBookmark {
            id: "b1".into(),
            route_id: "main".into(),
            event_id: "e2".into(),
            label: "The hum".into(),
            created_at: "2026-11-06T00:00:00Z".into(),
            updated_at: "2026-11-06T00:00:00Z".into(),
        }],
        memory: vec![PackMemory {
            kind: "summary".into(),
            source_start_event_id: None,
            source_end_event_id: "e2".into(),
            schema_version: 1,
            summary_text: "Wren climbed.".into(),
            scene_hint_json: None,
            covered_turns: 1,
            generator: "test".into(),
            created_at: "2026-11-06T00:00:00Z".into(),
        }],
        pictures: vec![PackPicture {
            slot: "cover".into(),
            asset_id: "img-old".into(),
        }],
        images: vec![PackImage {
            id: "img-old".into(),
            sha256: SHA.into(),
            mime: "image/png".into(),
            width: 10,
            height: 10,
            byte_size: 100,
            label: "Harbor".into(),
            tags: vec![],
        }],
    }
}

fn counter() -> impl FnMut() -> String {
    let mut n = 0;
    move || {
        n += 1;
        format!("new-{n}")
    }
}

#[test]
fn check_orders_parents_first_and_remap_rewrites_every_reference() {
    let pack = sample();
    let checked = check(&pack).unwrap();
    let images = HashMap::from([("img-old".to_string(), "img-new".to_string())]);
    let r = remap(&pack, &checked, &images, counter());

    // Parents always come before children.
    let mut seen = HashSet::new();
    for e in &r.events {
        if let Some(p) = &e.parent_event_id {
            assert!(seen.contains(p.as_str()), "{} before its parent", e.id);
        }
        seen.insert(e.id.as_str());
    }
    assert!(r.routes[0].is_main && r.routes[1].parent_route_id.as_ref() == Some(&r.routes[0].id));
    assert_eq!(r.main_route_id, r.routes[0].id);

    // Nothing keeps an id from the pack.
    let everything = format!(
        "{} {:?} {:?} {:?} {:?} {:?} {:?} {:?}",
        r.base_state.to_canonical_json(),
        r.outlines,
        r.routes,
        r.events,
        r.saves,
        r.bookmarks,
        r.memory,
        r.pictures
    );
    for old in [
        "story-old",
        "\"main\"",
        "\"alt\"",
        "\"e0\"",
        "\"e2\"",
        "\"e4\"",
        "o1",
        "s1",
        "b1",
        "img-old",
    ] {
        assert!(!everything.contains(old), "{old} survived: {everything}");
    }

    let by_kind = |k: &str| r.events.iter().find(|e| e.kind == k).unwrap();
    let ev2 = &r.events.iter().find(|e| e.kind == "assistant").unwrap().id;
    // Chapter keeps its outline, the fact its source, pictures their images.
    let ch =
        EventBody::from_parts("chapter_start", &by_kind("chapter_start").payload_json).unwrap();
    match ch {
        EventBody::ChapterStart(p) => {
            assert_eq!(p.source_outline_id.as_ref(), Some(&r.outlines[0].id))
        }
        other => panic!("{other:?}"),
    }
    match EventBody::from_parts("edit", &by_kind("edit").payload_json).unwrap() {
        EventBody::Edit(p) => {
            assert_eq!(
                p.changes,
                vec![
                    StateEdit::UpsertFact {
                        fact: KnownFact {
                            source_event_id: Some(ev2.clone()),
                            ..fact("x")
                        }
                    },
                    StateEdit::SetVisualRef {
                        slot: "background".into(),
                        asset_id: Some("img-new".into()),
                    },
                    // An image the pack doesn't carry is dropped, not kept.
                    StateEdit::SetVisualRef {
                        slot: "portrait:npc-mara".into(),
                        asset_id: None,
                    },
                ]
            );
        }
        other => panic!("{other:?}"),
    }
    assert_eq!(r.base_state.visual_refs["cover"], "img-new");
    assert_eq!(
        r.pictures,
        [PackPicture {
            slot: "cover".into(),
            asset_id: "img-new".into()
        }]
    );
    assert_eq!(r.saves[0].event_id, *ev2);
    assert_eq!(r.saves[0].route_id, r.routes[1].id);
    assert_eq!(r.bookmarks[0].event_id, *ev2);
    assert_eq!(r.bookmarks[0].route_id, r.routes[0].id);
    assert_eq!(r.bookmarks[0].label, "The hum");
    assert_eq!(r.memory[0].memory.source_end_event_id, *ev2);
    assert_ne!(r.memory[0].source_hash, "", "summary hash recomputed");

    // A missing image's default and starting picture are dropped too.
    let r = remap(&pack, &checked, &HashMap::new(), counter());
    assert!(r.pictures.is_empty());
    assert!(r.base_state.visual_refs.is_empty());
}

#[test]
fn check_refuses_broken_graphs() {
    type Change = Box<dyn Fn(&mut PackStory)>;
    let cases: Vec<(&str, Change, &str)> = vec![
        (
            "no main",
            Box::new(|p| p.routes[1].is_main = false),
            "one main route",
        ),
        (
            "route loop",
            Box::new(|p| {
                p.routes.push(PackRoute {
                    id: "alt2".into(),
                    ..route("alt2", Some("alt"), Some("e2"), "e2")
                });
                p.routes[0].parent_route_id = Some("alt2".into());
            }),
            "loop",
        ),
        (
            "event loop",
            Box::new(|p| p.events[5].parent_event_id = Some("e5".into())),
            "exactly one chapter",
        ),
        (
            "cycle beside the root",
            Box::new(|p| p.events[4].parent_event_id = Some("e5".into())),
            "loop",
        ),
        (
            "duplicate event",
            Box::new(|p| p.events[1].id = "e5".into()),
            "share the id",
        ),
        (
            "unknown route",
            Box::new(|p| p.events[1].origin_route_id = "gone".into()),
            "unknown route",
        ),
        (
            "newer payload",
            Box::new(|p| p.events[1].payload_version = 99),
            "newer version",
        ),
        (
            "bad payload",
            Box::new(|p| p.events[1].payload = serde_json::json!({"words": 1})),
            "unreadable",
        ),
        (
            "invalid edit",
            Box::new(|p| {
                let mut pc = p.base_state.characters["pc"].clone();
                pc.control = Control::Npc;
                let bad = EventBody::Edit(EditPayload {
                    changes: vec![StateEdit::UpsertCharacter { character: pc }],
                    note: None,
                });
                p.events[2] = event("e3", "main", Some("e2"), bad);
            }),
            "can't be applied",
        ),
        (
            "save on another branch",
            Box::new(|p| {
                p.saves[0].route_id = "main".into();
                p.saves[0].event_id = "e4".into();
            }),
            "outside its route",
        ),
        (
            "bookmark on another branch",
            Box::new(|p| p.bookmarks[0].event_id = "e4".into()),
            "outside its route",
        ),
        (
            "bookmark twice",
            Box::new(|p| {
                let mut again = p.bookmarks[0].clone();
                again.id = "b2".into();
                p.bookmarks.push(again);
            }),
            "same place",
        ),
        (
            "unnamed bookmark",
            Box::new(|p| p.bookmarks[0].label = " ".into()),
            "no usable name",
        ),
        (
            "picture without image",
            Box::new(|p| p.images.clear()),
            "isn't included",
        ),
        (
            "bad image name",
            Box::new(|p| p.images[0].sha256 = "../../x".into()),
            "malformed checksum",
        ),
        (
            "blank title",
            Box::new(|p| p.title = "   ".into()),
            "no usable title",
        ),
        (
            "hidden main",
            Box::new(|p| p.routes[1].hidden = true),
            "can't be hidden",
        ),
    ];
    for (name, change, expect) in cases {
        let mut p = sample();
        change(&mut p);
        let err = check(&p).expect_err(name);
        assert_eq!(err.code, ErrorCode::ArchiveInvalid, "{name}");
        assert!(err.message.contains(expect), "{name}: {}", err.message);
    }
}

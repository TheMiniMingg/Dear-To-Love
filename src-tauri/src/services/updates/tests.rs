use super::*;
use crate::db::test_support::test_db;
use crate::services::adapters::test_server::{serve, Reply};

fn links() -> PublicLinks {
    PublicLinks {
        owner: "TheMiniMingg".into(),
        repo: "Dear-To-Love".into(),
        donation_url: None,
    }
}

fn release(tag: &str) -> serde_json::Value {
    serde_json::json!({
        "tag_name": tag,
        "html_url": format!("https://github.com/TheMiniMingg/Dear-To-Love/releases/tag/{tag}"),
        "draft": false,
        "prerelease": false,
        "name": format!("Dear to Love {tag}"),
        "published_at": "2026-11-01T00:00:00Z",
        "assets": [],
    })
}

fn releases(list: Vec<serde_json::Value>) -> Reply {
    Reply::json(200, &serde_json::Value::Array(list).to_string())
}

fn parsed(list: Vec<serde_json::Value>) -> Vec<GhRelease> {
    serde_json::from_value(serde_json::Value::Array(list)).unwrap()
}

#[test]
fn shipped_links_are_valid_and_have_no_donation_link_yet() {
    let l = public_links();
    assert_eq!(
        (l.owner.as_str(), l.repo.as_str()),
        ("TheMiniMingg", "Dear-To-Love")
    );
    // T47: no URL configured -> no link.
    assert_eq!(l.donation_url, None);
}

#[test]
fn donation_links_must_be_plain_https() {
    let with = |url: &str| {
        parse_links(&format!(
            r#"{{"repository":{{"owner":"a","repo":"b"}},"donationUrl":{}}}"#,
            serde_json::Value::String(url.into())
        ))
        .unwrap()
        .donation_url
    };
    assert_eq!(
        with("https://ko-fi.com/example").as_deref(),
        Some("https://ko-fi.com/example")
    );
    for bad in [
        "http://ko-fi.com/example",
        "javascript:alert(1)",
        "https://user:pass@ko-fi.com/x",
        "file:///etc/passwd",
        "ko-fi.com/example",
        "",
    ] {
        assert_eq!(with(bad), None, "{bad}");
    }
    for bad in [
        r#"{"repository":{"owner":"..","repo":"b"}}"#,
        r#"{"repository":{"owner":"a","repo":"b/c"}}"#,
        r#"{"repository":{"owner":"","repo":"b"}}"#,
        r#"{"donationUrl":null}"#,
    ] {
        assert!(parse_links(bad).is_err(), "{bad}");
    }
}

/// T45: the highest stable SemVer wins, whatever order GitHub lists them
/// in and however strings would sort. T46: anything that isn't a stable
/// release on this repository's release pages is ignored.
#[test]
fn picks_the_highest_stable_release_on_this_repository() {
    let mut list = vec![
        release("v1.9.0"),
        release("1.10.1"),
        release("v1.10.0"),
        release("v1.11.0-beta.1"),
        release("nightly"),
    ];
    let mut draft = release("v2.0.0");
    draft["draft"] = true.into();
    let mut pre = release("v3.0.0");
    pre["prerelease"] = true.into();
    let mut elsewhere = release("v4.0.0");
    elsewhere["html_url"] = "https://github.com/someone/else/releases/tag/v4.0.0".into();
    let mut lookalike = release("v5.0.0");
    lookalike["html_url"] =
        "https://github.com.evil.example/TheMiniMingg/Dear-To-Love/releases/tag/v5.0.0".into();
    let mut plain_http = release("v6.0.0");
    plain_http["html_url"] =
        "http://github.com/TheMiniMingg/Dear-To-Love/releases/tag/v6.0.0".into();
    list.extend([draft, pre, elsewhere, lookalike, plain_http]);

    let got = pick_release(&parsed(list), "TheMiniMingg", "Dear-To-Love").unwrap();
    assert_eq!(got.version, "1.10.1");
    assert_eq!(
        got.url,
        "https://github.com/TheMiniMingg/Dear-To-Love/releases/tag/1.10.1"
    );
    assert_eq!(got.name.as_deref(), Some("Dear to Love 1.10.1"));
    assert_eq!(
        pick_release(
            &parsed(vec![release("nightly")]),
            "TheMiniMingg",
            "Dear-To-Love"
        ),
        None
    );
}

#[test]
fn only_release_pages_of_the_repository_open() {
    let ok = |u: &str| is_release_page(u, "TheMiniMingg", "Dear-To-Love");
    assert!(ok(
        "https://github.com/TheMiniMingg/Dear-To-Love/releases/tag/v1.0.0"
    ));
    assert!(ok("https://github.com/theminimingg/dear-to-love/releases"));
    for bad in [
        "https://github.com/TheMiniMingg/Dear-To-Love/issues/1",
        "https://github.com/TheMiniMingg/Other/releases/tag/v1.0.0",
        "https://github.com:8443/TheMiniMingg/Dear-To-Love/releases/tag/v1",
        "https://x@github.com/TheMiniMingg/Dear-To-Love/releases/tag/v1",
        "https://github.com/TheMiniMingg/Dear-To-Love/../../evil/releases",
        "javascript:alert(1)",
        "",
    ] {
        assert!(!ok(bad), "{bad}");
    }
}

fn hours(h: i64) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339("2026-11-06T12:00:00Z")
        .unwrap()
        .with_timezone(&Utc)
        + chrono::Duration::hours(h)
}

/// T42-T44: nothing is fetched while checks are off; once on, a newer
/// release shows a notice until it is acknowledged, a later one shows
/// again, and a failed check changes nothing else.
#[tokio::test]
async fn opt_in_checks_notice_and_acknowledgement() {
    let t = test_db().await;
    let db = &t.db;
    let server = serve(vec![
        releases(vec![release("v1.9.0"), release("v1.10.0")]),
        releases(vec![release("v1.10.0"), release("v1.11.0")]),
        Reply::json(500, "{}"),
    ])
    .await;
    let api = server.base_url.trim_end_matches("/v1").to_string();
    let installed = "1.9.0";

    // Off by default: an automatic check sends nothing (T44).
    let st = check(db, installed, &api, &links(), false, hours(0))
        .await
        .unwrap();
    assert_eq!(
        (st.enabled, st.state, st.show_notice),
        (false, UpdateState::Off, false)
    );
    assert!(server.requests().is_empty());

    // Turned on: the daily check finds 1.10.0 (T42).
    let st = set_enabled(db, installed, true).await.unwrap();
    assert_eq!(st.state, UpdateState::NotChecked);
    let st = check(db, installed, &api, &links(), false, hours(0))
        .await
        .unwrap();
    assert_eq!(st.state, UpdateState::Available);
    assert_eq!(st.latest.as_ref().unwrap().version, "1.10.0");
    assert!(st.show_notice);
    let reqs = server.requests();
    assert_eq!(reqs.len(), 1);
    assert_eq!(
        reqs[0].path,
        "/repos/TheMiniMingg/Dear-To-Love/releases?per_page=100"
    );
    assert_eq!(reqs[0].authorization, None, "no credentials are sent");

    // Dismissed: hidden, and a recent result is reused without asking again.
    let st = acknowledge(db, installed, "1.10.0").await.unwrap();
    assert!(!st.show_notice);
    assert_eq!(st.state, UpdateState::Available, "Settings still says so");
    let st = check(db, installed, &api, &links(), false, hours(5))
        .await
        .unwrap();
    assert!(!st.show_notice);
    assert_eq!(server.requests().len(), 1);
    // Acknowledging an older version doesn't bring 1.10.0 back.
    let st = acknowledge(db, installed, "1.9.5").await.unwrap();
    assert_eq!(st.acknowledged.as_deref(), Some("1.10.0"));

    // A day later 1.11.0 is out: the notice is back (T43).
    let st = check(db, installed, &api, &links(), false, hours(25))
        .await
        .unwrap();
    assert_eq!(st.latest.as_ref().unwrap().version, "1.11.0");
    assert!(st.show_notice);

    // GitHub fails: reported, the last known release kept, nothing raised.
    let st = check(db, installed, &api, &links(), true, hours(26))
        .await
        .unwrap();
    assert_eq!(st.state, UpdateState::Unavailable);
    assert_eq!(st.message.as_deref(), Some("GitHub answered 500"));
    assert_eq!(st.latest.as_ref().unwrap().version, "1.11.0");
    assert_eq!(server.requests().len(), 3);
    // A failed check is retried after an hour, not a day.
    assert!(!fresh(
        &Cache {
            checked_at: hours(26).to_rfc3339(),
            latest: None,
            error: Some("x".into())
        },
        hours(27) + chrono::Duration::minutes(1)
    ));

    // Turned off again: no notice and no automatic requests.
    let st = set_enabled(db, installed, false).await.unwrap();
    assert!(!st.show_notice);
    check(db, installed, &api, &links(), false, hours(100))
        .await
        .unwrap();
    assert_eq!(server.requests().len(), 3);

    // The page to open is the release's, on this repository only (T46).
    assert_eq!(
        release_page(db, installed, &links()).await.unwrap(),
        "https://github.com/TheMiniMingg/Dear-To-Love/releases/tag/v1.11.0"
    );
    let other = PublicLinks {
        repo: "Elsewhere".into(),
        ..links()
    };
    assert!(release_page(db, installed, &other).await.is_err());

    assert!(acknowledge(db, installed, "soon").await.is_err());
}

/// T44: offline, a manual check reports it and nothing else changes.
#[tokio::test]
async fn offline_checks_fail_quietly() {
    let t = test_db().await;
    let closed = {
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        format!("http://{}", l.local_addr().unwrap())
    };
    let st = check(&t.db, "0.1.0", &closed, &links(), true, hours(0))
        .await
        .unwrap();
    assert_eq!(st.state, UpdateState::Unavailable);
    assert_eq!(st.message.as_deref(), Some("GitHub could not be reached"));
    assert_eq!(st.latest, None);
    assert!(!st.show_notice);

    // An installed version newer than every release is up to date.
    let server = serve(vec![releases(vec![release("v0.1.0")])]).await;
    let api = server.base_url.trim_end_matches("/v1").to_string();
    let st = check(&t.db, "0.2.0", &api, &links(), true, hours(1))
        .await
        .unwrap();
    assert_eq!(st.state, UpdateState::UpToDate);
}

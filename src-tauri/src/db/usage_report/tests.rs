use chrono::TimeZone;

use super::*;
use crate::db::test_support::test_db;

struct Row<'a> {
    session: &'a str,
    started_at: &'a str,
    model: &'a str,
    billing: &'a str,
    status: &'a str,
    tokens: Option<(i64, i64, i64)>,
    cost: Option<i64>,
    cached_rate_assumed: bool,
}

async fn insert(db: &Database, r: Row<'_>) {
    let (i, c, o) = match r.tokens {
        Some((i, c, o)) => (Some(i), Some(c), Some(o)),
        None => (None, None, None),
    };
    sqlx::query(
        "INSERT INTO api_requests (id, provider_label, model_id, billing, session_id, purpose, \
         status, usage_source, input_tokens, cached_input_tokens, output_tokens, cost_micro_usd, \
         rate_snapshot_json, started_at) VALUES (?, 'Cloud', ?, ?, ?, 'story_reply', ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(crate::db::new_id())
    .bind(r.model)
    .bind(r.billing)
    .bind(r.session)
    .bind(r.status)
    .bind(if r.tokens.is_some() { "provider" } else { "unknown" })
    .bind(i)
    .bind(c)
    .bind(o)
    .bind(r.cost)
    .bind(format!(
        r#"{{"rateCardId":"r","inputUsdPerMillion":"1","outputUsdPerMillion":"1","cachedInputUsdPerMillion":null,"cachedRateAssumed":{}}}"#,
        r.cached_rate_assumed
    ))
    .bind(r.started_at)
    .execute(db.writer())
    .await
    .unwrap();
}

fn base<'a>() -> Row<'a> {
    Row {
        session: "now",
        started_at: "2026-11-05T10:00:00.000Z",
        model: "big",
        billing: "paid",
        status: "completed",
        tokens: Some((1000, 0, 100)),
        cost: Some(1100),
        cached_rate_assumed: false,
    }
}

/// T61 + T55 + T60: session, UTC month and all-time totals; unknown and
/// local calls are counted, never priced.
#[tokio::test]
async fn scopes_and_totals() {
    let t = test_db().await;
    let db = &t.db;
    insert(db, base()).await;
    insert(
        db,
        Row {
            tokens: Some((1000, 800, 100)),
            cost: Some(900),
            cached_rate_assumed: true,
            ..base()
        },
    )
    .await;
    insert(
        db,
        Row {
            tokens: None,
            cost: None,
            status: "failed",
            ..base()
        },
    )
    .await;
    insert(
        db,
        Row {
            model: "llama",
            billing: "local",
            cost: Some(0),
            ..base()
        },
    )
    .await;
    insert(
        db,
        Row {
            status: "sent",
            tokens: None,
            cost: None,
            ..base()
        },
    )
    .await;
    // Last month, earlier session.
    insert(
        db,
        Row {
            session: "old",
            started_at: "2026-10-20T10:00:00.000Z",
            cost: Some(5000),
            ..base()
        },
    )
    .await;

    let now = Utc.with_ymd_and_hms(2026, 11, 6, 9, 0, 0).unwrap();
    let s = usage_summary_at(db, UsageScope::Session, "now", None, now)
        .await
        .unwrap();
    let tot = &s.totals;
    assert_eq!(tot.request_count, 5);
    assert_eq!(tot.estimated_cost_micro_usd, 2000);
    assert_eq!(tot.unknown_cost_request_count, 1);
    assert_eq!(tot.in_flight_request_count, 1);
    assert_eq!(tot.local_model_request_count, 1);
    assert_eq!(tot.approximate_cost_request_count, 1);
    assert_eq!(tot.input_tokens, Some(3000));
    assert_eq!(tot.cached_input_tokens, Some(800));
    assert_eq!(s.by_model.len(), 2);
    assert_eq!(s.by_model[0].model_id, "big");
    assert_eq!(s.by_model[1].billing, Billing::Local);
    assert_eq!(s.by_model[1].totals.estimated_cost_micro_usd, 0);

    let month = usage_summary_at(db, UsageScope::MonthUtc, "now", None, now)
        .await
        .unwrap();
    assert_eq!(month.totals.request_count, 5);
    assert_eq!(month.since.as_deref(), Some("2026-11-01T00:00:00.000Z"));
    let all = usage_summary_at(db, UsageScope::AllTime, "now", None, now)
        .await
        .unwrap();
    assert_eq!(
        (
            all.totals.request_count,
            all.totals.estimated_cost_micro_usd
        ),
        (6, 7000)
    );
    // A new session starts from zero; history is kept.
    let fresh = usage_summary_at(db, UsageScope::Session, "next", None, now)
        .await
        .unwrap();
    assert_eq!(fresh.totals, UsageTotals::default());

    let rows = list_requests(db, UsageScope::AllTime, "now", None, 10)
        .await
        .unwrap();
    assert_eq!(rows.len(), 6);
    assert_eq!(rows.iter().filter(|r| r.cost_approximate).count(), 1);
    assert_eq!(rows.last().unwrap().started_at, "2026-10-20T10:00:00.000Z");
}

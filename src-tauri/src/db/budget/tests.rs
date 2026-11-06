use chrono::TimeZone;

use super::*;
use crate::db::providers::save_profile;
use crate::db::test_support::{test_db, TestDb};
use crate::db::usage::{
    close_request, open_request, set_rate_card, NewRequest, RequestOutcome, RequestPurpose,
    RequestStatus,
};
use crate::domain::provider::{
    AdapterKind, Billing, GenerationSettings, NormalizedUsage, ProviderProfileInput,
};
use crate::services::secrets::MemoryStore;

fn at(y: i32, m: u32, d: u32) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(y, m, d, 12, 0, 0).unwrap()
}

/// A finished paid call costing `micro` at `started_at`.
async fn spent(db: &Database, started_at: &str, micro: Option<i64>) {
    sqlx::query(
        "INSERT INTO api_requests (id, provider_label, model_id, billing, session_id, purpose, \
         status, cost_micro_usd, started_at) \
         VALUES (?, 'Cloud', 'm', 'paid', 's', 'story_reply', 'completed', ?, ?)",
    )
    .bind(crate::db::new_id())
    .bind(micro)
    .bind(started_at)
    .execute(db.writer())
    .await
    .unwrap();
}

fn policy(limit: &str, mode: BudgetMode) -> BudgetPolicy {
    BudgetPolicy {
        enabled: true,
        monthly_limit_usd: Some(limit.into()),
        mode,
        ..Default::default()
    }
}

/// A paid connection whose model costs $1 per 1M tokens each way, so a
/// call reserves (prompt + reply) micro-USD.
async fn priced(t: &TestDb) -> String {
    let p = save_profile(
        &t.db,
        &MemoryStore::default(),
        ProviderProfileInput {
            id: None,
            label: "Cloud".into(),
            adapter: AdapterKind::OpenaiCompatible,
            base_url: "https://api.example.com/v1".into(),
            model_id: "m".into(),
            billing: Billing::Paid,
            api_key: None,
            settings: GenerationSettings::default(),
        },
    )
    .await
    .unwrap();
    set_rate_card(&t.db, &p.id, "m", "1", "1", None)
        .await
        .unwrap();
    p.id
}

fn request<'a>(pid: &'a str, prompt: u32, reply: u32, allow_unpriced: bool) -> NewRequest<'a> {
    NewRequest {
        generation_run_id: None,
        provider_profile_id: Some(pid),
        provider_label: "Cloud",
        model_id: "m",
        billing: Billing::Paid,
        session_id: "s",
        route_id: None,
        purpose: RequestPurpose::StoryReply,
        prompt_tokens: prompt,
        max_output_tokens: reply,
        allow_unpriced,
    }
}

async fn rows(db: &Database) -> i64 {
    sqlx::query_scalar("SELECT COUNT(*) FROM api_requests")
        .fetch_one(db.reader())
        .await
        .unwrap()
}

#[tokio::test]
async fn policy_validates_and_round_trips() {
    let t = test_db().await;
    assert_eq!(get_policy(&t.db).await.unwrap(), BudgetPolicy::default());
    for bad in [
        BudgetPolicy {
            enabled: true,
            ..Default::default()
        },
        policy("0", BudgetMode::Warn),
        policy("five", BudgetMode::Warn),
        BudgetPolicy {
            warning_threshold_percent: 0,
            ..policy("5", BudgetMode::Warn)
        },
        BudgetPolicy {
            currency: "EUR".into(),
            ..policy("5", BudgetMode::Warn)
        },
    ] {
        assert_eq!(
            set_policy(&t.db, bad).await.unwrap_err().code,
            ErrorCode::InvalidInput
        );
    }
    let saved = set_policy(&t.db, policy(" 5.00 ", BudgetMode::PauseNewRequests))
        .await
        .unwrap();
    assert_eq!(saved.monthly_limit_usd.as_deref(), Some("5.00"));
    assert_eq!(get_policy(&t.db).await.unwrap(), saved);
    assert_eq!(saved.limit_micro_usd(), Some(5_000_000));
}

/// T61: the month rolls over at the UTC boundary.
#[tokio::test]
async fn month_spend_uses_the_utc_month() {
    let t = test_db().await;
    assert_eq!(month_start(at(2026, 11, 6)), "2026-11-01T00:00:00.000Z");
    spent(&t.db, "2026-10-31T23:59:59.999Z", Some(4_000_000)).await;
    spent(&t.db, "2026-11-01T00:00:00.000Z", Some(1_000_000)).await;
    spent(&t.db, "2026-11-02T08:00:00.000Z", None).await;
    let mut conn = t.db.reader().acquire().await.unwrap();
    let nov = month_spend(&mut conn, at(2026, 11, 6)).await.unwrap();
    assert_eq!((nov.posted, nov.unknown), (1_000_000, 1));
    let dec = month_spend(&mut conn, at(2026, 12, 1)).await.unwrap();
    assert_eq!(dec, MonthSpend::default());
}

/// T62: one dismissible warning; a higher level, a new limit or a new
/// month shows it again.
#[tokio::test]
async fn warning_crossing_and_dismissal() {
    let t = test_db().await;
    let now = at(2026, 11, 6);
    set_policy(&t.db, policy("5", BudgetMode::Warn))
        .await
        .unwrap();
    spent(&t.db, "2026-11-02T00:00:00.000Z", Some(3_900_000)).await;
    let s = status_at(&t.db, now).await.unwrap();
    assert_eq!((s.level, s.percent), (BudgetLevel::None, Some(78)));

    spent(&t.db, "2026-11-03T00:00:00.000Z", Some(200_000)).await;
    let s = status_at(&t.db, now).await.unwrap();
    assert_eq!(
        (s.level, s.dismissed, s.paused),
        (BudgetLevel::Warning, false, false)
    );
    assert!(dismiss_at(&t.db, now).await.unwrap().dismissed);
    assert!(status_at(&t.db, now).await.unwrap().dismissed, "persists");

    // Crossing the limit is a higher severity: shown again.
    spent(&t.db, "2026-11-04T00:00:00.000Z", Some(1_000_000)).await;
    let s = status_at(&t.db, now).await.unwrap();
    assert_eq!((s.level, s.dismissed), (BudgetLevel::Reached, false));
    assert!(!s.paused, "warn-only never pauses");
    dismiss_at(&t.db, now).await.unwrap();

    // A new limit re-evaluates.
    set_policy(&t.db, policy("6", BudgetMode::Warn))
        .await
        .unwrap();
    let s = status_at(&t.db, now).await.unwrap();
    assert_eq!((s.level, s.dismissed), (BudgetLevel::Warning, false));
    dismiss_at(&t.db, now).await.unwrap();
    // Next month starts clean.
    let s = status_at(&t.db, at(2026, 12, 2)).await.unwrap();
    assert_eq!((s.level, s.spent_micro_usd), (BudgetLevel::None, 0));
}

/// T63: pause mode refuses a paid call that would pass the limit, before
/// any ledger row exists. Local calls are never gated.
#[tokio::test]
async fn pause_refuses_paid_requests_over_the_limit() {
    let t = test_db().await;
    let pid = priced(&t).await;
    set_policy(&t.db, policy("0.01", BudgetMode::PauseNewRequests))
        .await
        .unwrap();
    // 9,000 micro-USD spent; a 2,000 call would pass the 10,000 limit.
    spent(&t.db, &crate::db::now(), Some(9_000)).await;
    let before = rows(&t.db).await;
    let err = open_request(&t.db, request(&pid, 1000, 1000, false))
        .await
        .unwrap_err();
    assert_eq!(err.code, ErrorCode::BudgetPaused);
    assert!(err.message.contains("$0.0100"));
    assert_eq!(
        rows(&t.db).await,
        before,
        "no ledger row for a refused call"
    );
    // A small call that fits still goes.
    open_request(&t.db, request(&pid, 400, 400, false))
        .await
        .unwrap();
    // Local billing ignores the gate entirely.
    let local = NewRequest {
        billing: Billing::Local,
        ..request(&pid, 100_000, 100_000, false)
    };
    open_request(&t.db, local).await.unwrap();
}

/// T64: without prices the gate cannot promise anything, so it asks for
/// an explicit one-time override instead of guessing.
#[tokio::test]
async fn pause_without_prices_needs_an_override() {
    let t = test_db().await;
    let pid = priced(&t).await;
    set_policy(&t.db, policy("5", BudgetMode::PauseNewRequests))
        .await
        .unwrap();
    let unpriced = NewRequest {
        model_id: "other-model",
        ..request(&pid, 10, 10, false)
    };
    let err = open_request(&t.db, unpriced).await.unwrap_err();
    assert_eq!(err.code, ErrorCode::BudgetOverrideRequired);
    let allowed = NewRequest {
        model_id: "other-model",
        ..request(&pid, 10, 10, true)
    };
    let id = open_request(&t.db, allowed).await.unwrap();
    let reserved: i64 =
        sqlx::query_scalar("SELECT reserved_micro_usd FROM api_requests WHERE id = ?")
            .bind(&id)
            .fetch_one(t.db.reader())
            .await
            .unwrap();
    assert_eq!(reserved, 0);
}

/// T65: two routes asking at once cannot both use the same headroom; the
/// reservation is reconciled when the call closes.
#[tokio::test]
async fn concurrent_requests_share_headroom_through_reservations() {
    let t = test_db().await;
    let pid = priced(&t).await;
    set_policy(&t.db, policy("0.005", BudgetMode::PauseNewRequests))
        .await
        .unwrap();
    // Each call reserves 3,000 of the 5,000 limit.
    let (a, b) = tokio::join!(
        open_request(&t.db, request(&pid, 1500, 1500, false)),
        open_request(&t.db, request(&pid, 1500, 1500, false)),
    );
    let (ok, refused): (Vec<_>, Vec<_>) = [a, b].into_iter().partition(Result::is_ok);
    assert_eq!((ok.len(), refused.len()), (1, 1));
    assert_eq!(
        refused[0].as_ref().unwrap_err().code,
        ErrorCode::BudgetPaused
    );
    let id = ok.into_iter().next().unwrap().unwrap();
    {
        let mut conn = t.db.reader().acquire().await.unwrap();
        let s = month_spend(&mut conn, Utc::now()).await.unwrap();
        assert_eq!((s.posted, s.reserved), (0, 3000));
    }
    // It actually used 1,000 tokens: the reservation becomes a 1,000 cost.
    close_request(
        &t.db,
        &id,
        RequestOutcome {
            status: RequestStatus::Completed,
            usage: NormalizedUsage {
                input_tokens: Some(800),
                cached_input_tokens: None,
                output_tokens: Some(200),
            },
            may_be_charged: true,
            error_code: None,
        },
    )
    .await
    .unwrap();
    let mut conn = t.db.reader().acquire().await.unwrap();
    let s = month_spend(&mut conn, Utc::now()).await.unwrap();
    assert_eq!((s.posted, s.reserved), (1000, 0));
    drop(conn);
    // Now the second route's call fits.
    open_request(&t.db, request(&pid, 1500, 1500, false))
        .await
        .unwrap();
}

/// T55 meets the gate: a call that ends with unknown cost keeps its
/// reservation, so the gate stays conservative.
#[tokio::test]
async fn unknown_cost_keeps_the_reservation() {
    let t = test_db().await;
    let pid = priced(&t).await;
    let id = open_request(&t.db, request(&pid, 500, 500, false))
        .await
        .unwrap();
    close_request(
        &t.db,
        &id,
        RequestOutcome {
            status: RequestStatus::Failed,
            usage: NormalizedUsage::default(),
            may_be_charged: true,
            error_code: Some(ErrorCode::ProviderUnreachable),
        },
    )
    .await
    .unwrap();
    let mut conn = t.db.reader().acquire().await.unwrap();
    let s = month_spend(&mut conn, Utc::now()).await.unwrap();
    assert_eq!((s.posted, s.reserved, s.unknown), (0, 1000, 1));
}

#[test]
fn usd_formatting() {
    assert_eq!(usd(0), "$0.0000");
    assert_eq!(usd(1_234), "$0.0012");
    assert_eq!(usd(5_000_000), "$5.0000");
    assert_eq!(usd(123_456_789), "$123.45");
}

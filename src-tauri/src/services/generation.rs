//! Reply generation (roadmap section 06).
//!
//! 1. `submit_action`: one transaction appends the player's action, moves
//!    the route head and creates a pending run.
//! 2. `generate`: CAS pending -> streaming, write the ledger row, call the
//!    adapter, stream drafts. On success one transaction CASes the run to
//!    completed and appends the single assistant event (unique
//!    `generation_run_id`). The run is bound to its route and input event,
//!    so switching screens or routes never moves the reply.
//! 3. Failure or cancel leaves the player's action as the head; `retry`
//!    creates a new run for the same action. Nothing is retried silently.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tokio_util::sync::CancellationToken;
use ts_rs::TS;

use crate::db::memory::latest_eligible_summary;
use crate::db::providers::{self, ProfileRow};
use crate::db::runs::{self, RunDto, RunStatus};
use crate::db::state::{state_with_snapshots, store_snapshots};
use crate::db::timeline::{
    ancestors, append_event_tx, edit_prior_player_turn_tx, get_event, get_route, get_story_route,
    AppendEvent,
};
use crate::db::usage::{self, NewRequest, RequestOutcome, RequestPurpose, RequestStatus};
use crate::db::Database;
use crate::domain::events::{AssistantPayload, EventBody, EventKind, PlayerPayload};
use crate::domain::provider::{
    AdapterKind, Billing, GenerateRequest, GenerationSettings, ModelMessage, Role, StreamMessage,
};
use crate::errors::{AppError, AppResult, ErrorCode};
use crate::services::adapters::{
    offline::Offline, openai::OpenAiCompatible, Adapter, Charge, Completion,
};
use crate::services::mock_storyteller::{self, MOCK_PROVIDER_LABEL};
use crate::services::prompt::{self, Budget};
use crate::services::reader::{route_view, RouteView};
use crate::services::secrets::SecretStore;

/// Cancel handles for runs that are streaming in this process.
#[derive(Default)]
pub struct RunRegistry {
    tokens: Mutex<HashMap<String, CancellationToken>>,
}

impl RunRegistry {
    fn register(&self, run_id: &str) -> CancellationToken {
        let t = CancellationToken::new();
        self.tokens
            .lock()
            .expect("run registry")
            .insert(run_id.to_string(), t.clone());
        t
    }

    fn remove(&self, run_id: &str) {
        self.tokens.lock().expect("run registry").remove(run_id);
    }

    fn cancel(&self, run_id: &str) -> bool {
        match self.tokens.lock().expect("run registry").get(run_id) {
            Some(t) => {
                t.cancel();
                true
            }
            None => false,
        }
    }
}

/// Everything `generate` needs from the app.
pub struct Ctx<'a> {
    pub db: &'a Database,
    pub secrets: &'a dyn SecretStore,
    pub registry: &'a RunRegistry,
    pub session_id: &'a str,
    /// Pause between words of the offline storyteller (zero in tests).
    pub offline_delay: Duration,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Submitted {
    pub run_id: String,
    pub view: RouteView,
}

async fn create_run_for_head(
    conn: &mut sqlx::SqliteConnection,
    route_id: &str,
    input_event_id: &str,
    profile_id: Option<&str>,
) -> AppResult<String> {
    runs::create_pending_tx(conn, route_id, input_event_id, profile_id).await
}

/// Commit the player's action and a pending run for the chosen storyteller.
pub async fn submit_action(
    db: &Database,
    story_id: &str,
    route_id: &str,
    expected_head_id: &str,
    text: &str,
) -> AppResult<Submitted> {
    let profile = providers::storyteller(db).await?;
    let mut tx = db.write_txn().await?;
    let player = append_event_tx(
        &mut tx,
        AppendEvent {
            story_id: story_id.into(),
            route_id: route_id.into(),
            expected_head_id: expected_head_id.into(),
            body: EventBody::Player(PlayerPayload { text: text.into() }),
            generation_run_id: None,
        },
    )
    .await?;
    let run_id =
        create_run_for_head(&mut tx, route_id, &player.event_id, profile.as_deref()).await?;
    tx.commit().await?;
    Ok(Submitted {
        run_id,
        view: route_view(db, route_id).await?,
    })
}

/// New run for the unanswered action at the route head (same player event).
/// Uses the storyteller chosen now, which may differ from the failed run's.
pub async fn retry_reply(
    db: &Database,
    story_id: &str,
    route_id: &str,
    expected_head_id: &str,
) -> AppResult<Submitted> {
    let profile = providers::storyteller(db).await?;
    let mut tx = db.write_txn().await?;
    let route = get_story_route(&mut tx, story_id, route_id).await?;
    let head = route.head_event_id.clone().unwrap_or_default();
    if head != expected_head_id {
        return Err(AppError::new(
            ErrorCode::HeadChanged,
            "this route changed since you last saw it; reload and try again",
        ));
    }
    if get_event(&mut tx, &head).await?.kind() != Some(EventKind::Player) {
        return Err(AppError::invalid_input(
            "the last action already has a reply",
        ));
    }
    let run_id = create_run_for_head(&mut tx, route_id, &head, profile.as_deref()).await?;
    tx.commit().await?;
    Ok(Submitted {
        run_id,
        view: route_view(db, route_id).await?,
    })
}

/// Change an unanswered (or earlier) action: a new branch from just before
/// it, with the new text and a pending run. The original stays as it was.
pub async fn edit_action(
    db: &Database,
    story_id: &str,
    route_id: &str,
    player_event_id: &str,
    text: &str,
) -> AppResult<Submitted> {
    let profile = providers::storyteller(db).await?;
    let mut tx = db.write_txn().await?;
    let (fork, appended) = edit_prior_player_turn_tx(
        &mut tx,
        story_id,
        route_id,
        player_event_id,
        text.to_string(),
    )
    .await?;
    let run_id =
        create_run_for_head(&mut tx, &fork.id, &appended.event_id, profile.as_deref()).await?;
    tx.commit().await?;
    Ok(Submitted {
        run_id,
        view: route_view(db, &fork.id).await?,
    })
}

/// Cancel a run. A streaming run is signalled (the generating task records
/// the terminal state); a run that has not started is cancelled directly.
pub async fn cancel(db: &Database, registry: &RunRegistry, run_id: &str) -> AppResult<()> {
    if registry.cancel(run_id) {
        return Ok(());
    }
    if runs::transition(
        db,
        run_id,
        RunStatus::Pending,
        RunStatus::Cancelled,
        Some(ErrorCode::Cancelled),
    )
    .await?
    {
        return Ok(());
    }
    let mut conn = db.reader().acquire().await?;
    let run = runs::get_run(&mut conn, run_id).await?;
    if run.status.is_active() {
        // Streaming in another process instance is impossible; treat as stale.
        return Err(AppError::new(
            ErrorCode::RunNotActive,
            "that reply is not running here",
        ));
    }
    Ok(())
}

/// App start: no run can still be in flight.
pub async fn recover_on_startup(db: &Database) -> AppResult<(u64, u64)> {
    Ok((
        runs::interrupt_stranded(db).await?,
        usage::mark_stranded_unknown(db).await?,
    ))
}

struct Resolved {
    adapter: Adapter,
    label: String,
    model_id: String,
    billing: Billing,
    profile_id: Option<String>,
    settings: GenerationSettings,
    live: bool,
}

pub(crate) fn live_adapter(row: &ProfileRow, secrets: &dyn SecretStore) -> AppResult<Adapter> {
    let key = match &row.secret_ref {
        Some(r) => secrets.get(r)?,
        None => None,
    };
    match row.adapter()? {
        AdapterKind::OpenaiCompatible => Ok(Adapter::OpenAi(OpenAiCompatible::new(
            row.base_url.as_deref().unwrap_or_default(),
            key,
        )?)),
    }
}

/// Run one reply to completion, streaming drafts to `sink`. Returns the
/// route view with the committed reply.
pub async fn generate(
    ctx: &Ctx<'_>,
    run_id: &str,
    sink: &mut (dyn FnMut(StreamMessage) + Send),
) -> AppResult<RouteView> {
    let db = ctx.db;
    let run = {
        let mut conn = db.reader().acquire().await?;
        runs::get_run(&mut conn, run_id).await?
    };
    match run.status {
        RunStatus::Pending => {}
        RunStatus::Interrupted => {
            return Err(AppError::new(
                ErrorCode::RunInterrupted,
                "this reply was interrupted; use Retry to ask again",
            ))
        }
        _ => {
            return Err(AppError::new(
                ErrorCode::RunNotActive,
                "this reply has already finished or been cancelled",
            ))
        }
    }

    // The run only ever answers its own input event on its own route.
    let (route, history, state, snaps, summary) = {
        let mut conn = db.reader().acquire().await?;
        let route = get_route(&mut conn, &run.route_id).await?;
        let history = ancestors(&mut conn, &route.story_id, &run.input_event_id).await?;
        let (state, snaps) =
            state_with_snapshots(&mut conn, &route.story_id, &run.input_event_id).await?;
        let summary = latest_eligible_summary(&mut conn, &route.story_id, &history).await?;
        (route, history, state, snaps, summary)
    };
    let _ = store_snapshots(db, &snaps).await;
    if route.head_event_id.as_deref() != Some(run.input_event_id.as_str()) {
        runs::transition(
            db,
            run_id,
            RunStatus::Pending,
            RunStatus::Interrupted,
            Some(ErrorCode::HeadChanged),
        )
        .await?;
        return Err(AppError::new(
            ErrorCode::HeadChanged,
            "the route moved on before the reply started",
        ));
    }

    // The offline storyteller never reads a prompt; live runs must fit
    // their connection's context before anything is sent.
    let prepared = resolve(ctx, &run, &state, &history).await.and_then(|r| {
        let messages = if r.live {
            prompt::assemble(
                &state,
                &history,
                summary.as_ref(),
                None,
                Budget {
                    max_context_tokens: r.settings.max_context_tokens,
                    max_output_tokens: r.settings.max_output_tokens,
                },
            )?
            .messages
        } else {
            Vec::new()
        };
        Ok((r, messages))
    });
    let (resolved, messages) = match prepared {
        Ok(p) => p,
        Err(e) => {
            runs::transition(
                db,
                run_id,
                RunStatus::Pending,
                RunStatus::Failed,
                Some(e.code),
            )
            .await?;
            sink(StreamMessage::Error {
                run_id: run_id.into(),
                code: e.code,
                message: e.message.clone(),
            });
            return Err(e);
        }
    };
    let request = GenerateRequest {
        model_id: resolved.model_id.clone(),
        messages,
        max_output_tokens: resolved.settings.max_output_tokens,
        temperature: resolved.settings.temperature,
        timeout_ms: resolved.settings.timeout_ms,
    };

    // Register the cancel handle before going live so a cancel can't slip
    // between the status change and registration.
    let token = ctx.registry.register(run_id);
    let started =
        runs::transition(db, run_id, RunStatus::Pending, RunStatus::Streaming, None).await;
    if !matches!(started, Ok(true)) {
        ctx.registry.remove(run_id);
        started?;
        return Err(AppError::new(
            ErrorCode::RunNotActive,
            "this reply was cancelled before it started",
        ));
    }
    sink(StreamMessage::Started {
        run_id: run_id.into(),
        provider_label: resolved.label.clone(),
    });

    let ledger_id = if resolved.live {
        match usage::open_request(
            db,
            NewRequest {
                generation_run_id: Some(run_id),
                provider_profile_id: resolved.profile_id.as_deref(),
                provider_label: &resolved.label,
                model_id: &resolved.model_id,
                billing: resolved.billing,
                session_id: ctx.session_id,
                route_id: Some(&run.route_id),
                purpose: RequestPurpose::StoryReply,
            },
        )
        .await
        {
            Ok(id) => Some(id),
            Err(e) => {
                // No ledger row, no call.
                ctx.registry.remove(run_id);
                runs::transition(
                    db,
                    run_id,
                    RunStatus::Streaming,
                    RunStatus::Failed,
                    Some(e.code),
                )
                .await?;
                return Err(e);
            }
        }
    } else {
        None
    };

    let mut seq = 0u32;
    let rid = run_id.to_string();
    let result = resolved
        .adapter
        .generate(&request, &token, &mut |t: &str| {
            seq += 1;
            sink(StreamMessage::Delta {
                run_id: rid.clone(),
                seq,
                text: t.to_string(),
            });
        })
        .await;
    let was_cancelled = token.is_cancelled();
    ctx.registry.remove(run_id);

    match result {
        Ok(c) if !was_cancelled => {
            let commit = commit_reply(db, &run, &route.story_id, &resolved, &c).await;
            if let Some(id) = &ledger_id {
                usage::close_request(
                    db,
                    id,
                    RequestOutcome {
                        status: RequestStatus::Completed,
                        usage: c.usage.clone(),
                        may_be_charged: true,
                        error_code: None,
                    },
                )
                .await?;
            }
            match commit {
                Ok(()) => {
                    if !c.usage.is_empty() {
                        sink(StreamMessage::Usage {
                            run_id: run_id.into(),
                            usage: c.usage.clone(),
                        });
                    }
                    sink(StreamMessage::Done {
                        run_id: run_id.into(),
                        finish_reason: c.finish_reason.clone(),
                    });
                    route_view(db, &run.route_id).await
                }
                Err(e) => {
                    // The route moved (or the run was closed) meanwhile:
                    // never attach the reply anywhere else.
                    runs::transition(
                        db,
                        run_id,
                        RunStatus::Streaming,
                        RunStatus::Interrupted,
                        Some(e.code),
                    )
                    .await?;
                    sink(StreamMessage::Error {
                        run_id: run_id.into(),
                        code: e.code,
                        message: e.message.clone(),
                    });
                    Err(e)
                }
            }
        }
        other => {
            let (err, charge, usage_seen) = match other {
                Ok(c) => (
                    AppError::new(ErrorCode::Cancelled, "the reply was cancelled"),
                    Charge::Unknown,
                    c.usage,
                ),
                Err(ge) => (ge.error, ge.charge, Default::default()),
            };
            let cancelled = err.code == ErrorCode::Cancelled;
            let to = if cancelled {
                RunStatus::Cancelled
            } else {
                RunStatus::Failed
            };
            runs::transition(db, run_id, RunStatus::Streaming, to, Some(err.code)).await?;
            if let Some(id) = &ledger_id {
                usage::close_request(
                    db,
                    id,
                    RequestOutcome {
                        status: if cancelled {
                            RequestStatus::Cancelled
                        } else {
                            RequestStatus::Failed
                        },
                        usage: usage_seen,
                        may_be_charged: charge == Charge::Unknown,
                        error_code: Some(err.code),
                    },
                )
                .await?;
            }
            sink(StreamMessage::Error {
                run_id: run_id.into(),
                code: err.code,
                message: err.message.clone(),
            });
            Err(err)
        }
    }
}

async fn resolve(
    ctx: &Ctx<'_>,
    run: &RunDto,
    state: &crate::domain::replay::EffectiveState,
    history: &[crate::db::timeline::EventRow],
) -> AppResult<Resolved> {
    match &run.provider_profile_id {
        None => {
            let action = history
                .last()
                .and_then(|e| match EventBody::from_parts(&e.kind, &e.payload_json) {
                    Ok(EventBody::Player(p)) => Some(p.text),
                    _ => None,
                })
                .unwrap_or_default();
            let turn = history
                .iter()
                .filter(|e| e.kind() == Some(EventKind::Player))
                .count();
            Ok(Resolved {
                adapter: Adapter::Offline(Offline {
                    text: mock_storyteller::reply(state, &action, turn),
                    delay: ctx.offline_delay,
                }),
                label: MOCK_PROVIDER_LABEL.into(),
                model_id: "offline".into(),
                billing: Billing::Local,
                profile_id: None,
                settings: GenerationSettings::default(),
                live: false,
            })
        }
        Some(pid) => {
            let row = providers::get_profile_row(ctx.db, pid).await.map_err(|_| {
                AppError::new(
                    ErrorCode::NoProvider,
                    "the AI connection for this reply was removed; choose a storyteller and retry",
                )
            })?;
            Ok(Resolved {
                adapter: live_adapter(&row, ctx.secrets)?,
                label: row.label.clone(),
                model_id: row.model_id.clone(),
                billing: row.billing(),
                profile_id: Some(row.id.clone()),
                settings: row.settings(),
                live: true,
            })
        }
    }
}

/// CAS streaming -> completed and append the one assistant event, together.
async fn commit_reply(
    db: &Database,
    run: &RunDto,
    story_id: &str,
    resolved: &Resolved,
    c: &Completion,
) -> AppResult<()> {
    let mut tx = db.write_txn().await?;
    if !runs::transition_tx(
        &mut tx,
        &run.id,
        RunStatus::Streaming,
        RunStatus::Completed,
        None,
        Some(&c.usage),
    )
    .await?
    {
        return Err(AppError::new(
            ErrorCode::RunNotActive,
            "this reply was already closed",
        ));
    }
    append_event_tx(
        &mut tx,
        AppendEvent {
            story_id: story_id.into(),
            route_id: run.route_id.clone(),
            expected_head_id: run.input_event_id.clone(),
            body: EventBody::Assistant(AssistantPayload {
                text: c.text.trim().to_string(),
                finish_reason: Some(c.finish_reason.clone()),
                provider_label: Some(resolved.label.clone()),
                model_id: resolved.live.then(|| resolved.model_id.clone()),
            }),
            generation_run_id: Some(run.id.clone()),
        },
    )
    .await?;
    tx.commit().await?;
    Ok(())
}

/// One request outside the reply flow (a test message, a memory summary),
/// with its ledger row opened before dispatch and closed after.
pub(crate) async fn call_once(
    db: &Database,
    secrets: &dyn SecretStore,
    session_id: &str,
    row: &ProfileRow,
    req: &GenerateRequest,
    purpose: RequestPurpose,
    route_id: Option<&str>,
) -> AppResult<(Completion, String)> {
    let adapter = live_adapter(row, secrets)?;
    let ledger = usage::open_request(
        db,
        NewRequest {
            generation_run_id: None,
            provider_profile_id: Some(&row.id),
            provider_label: &row.label,
            model_id: &row.model_id,
            billing: row.billing(),
            session_id,
            route_id,
            purpose,
        },
    )
    .await?;
    let out = adapter
        .generate(req, &CancellationToken::new(), &mut |_: &str| {})
        .await;
    let (outcome, result) = match out {
        Ok(c) => (
            RequestOutcome {
                status: RequestStatus::Completed,
                usage: c.usage.clone(),
                may_be_charged: true,
                error_code: None,
            },
            Ok(c),
        ),
        Err(e) => (
            RequestOutcome {
                status: RequestStatus::Failed,
                usage: Default::default(),
                may_be_charged: e.charge == Charge::Unknown,
                error_code: Some(e.error.code),
            },
            Err(e.error),
        ),
    };
    usage::close_request(db, &ledger, outcome).await?;
    result.map(|c| (c, ledger))
}

/// One short paid request outside any story ("Send a test message").
/// Recorded in the ledger as `manual_test`.
pub async fn send_test_message(
    db: &Database,
    secrets: &dyn SecretStore,
    session_id: &str,
    profile_id: &str,
) -> AppResult<String> {
    let row = providers::get_profile_row(db, profile_id).await?;
    let settings = row.settings();
    let req = GenerateRequest {
        model_id: row.model_id.clone(),
        messages: vec![ModelMessage {
            role: Role::User,
            content: "Reply with one short friendly sentence to confirm you are working.".into(),
        }],
        max_output_tokens: 40,
        temperature: settings.temperature,
        timeout_ms: settings.timeout_ms,
    };
    let (c, _) = call_once(
        db,
        secrets,
        session_id,
        &row,
        &req,
        RequestPurpose::ManualTest,
        None,
    )
    .await?;
    Ok(c.text)
}

#[cfg(test)]
mod tests;

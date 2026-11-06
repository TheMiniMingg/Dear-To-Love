//! Health checks. Each check is a small function that performs real work
//! and reports PASS / WARN / FAIL / SKIPPED with remediation text.
//! Checks never mutate user stories and never make network calls unless
//! the user explicitly requests a connection test.

use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::db::{contract, latest_migration_version, Database};
use crate::domain::diagnostics::{CheckStatus, DiagnosticCheck};
use crate::errors::{AppError, AppResult};
use crate::services::assets::{AssetReport, AssetStore};
use crate::services::disk;
use crate::services::secrets::{self, SecretStore};

type Outcome = (CheckStatus, String, Option<String>);

/// Everything the checks need, gathered by the command layer so the checks
/// themselves stay testable without a running Tauri app.
pub struct DiagnosticsContext {
    pub version: String,
    /// `Err` holds the reason the app-data directory could not be resolved.
    pub data_dir: Result<PathBuf, String>,
    pub db: Result<Database, AppError>,
    pub secrets: Arc<dyn SecretStore>,
    /// Run slow checks (e.g. `PRAGMA quick_check`) that are skipped by default.
    pub deep: bool,
}

pub async fn run_all(ctx: DiagnosticsContext) -> Vec<DiagnosticCheck> {
    let version = ctx.version.clone();
    let data_dir = ctx.data_dir.clone();
    let secrets = ctx.secrets.clone();
    let sync_checks = tokio::task::spawn_blocking(move || {
        vec![
            check_app_version(&version),
            check_data_dir(&data_dir),
            check_secrets(secrets.as_ref()),
        ]
    })
    .await
    .unwrap_or_default();

    let mut checks = Vec::with_capacity(14);
    let mut sync_iter = sync_checks.into_iter();
    checks.extend(sync_iter.by_ref().take(2));
    checks.push(check_disk_space(&ctx.data_dir));
    checks.push(check_database(&ctx.db).await);
    checks.push(check_db_integrity(&ctx.db, ctx.deep).await);
    checks.push(check_usage_ledger(&ctx.db).await);
    checks.push(check_rate_config(&ctx.db).await);
    checks.push(check_timeline_replay(&ctx.data_dir).await);
    checks.push(check_assets(&ctx.db, &ctx.data_dir, ctx.deep).await);
    checks.push(check_backups(&ctx.db, &ctx.data_dir, ctx.deep).await);
    checks.extend(sync_iter);
    checks.push(check_ai_connection(&ctx.db, ctx.secrets.as_ref(), ctx.deep).await);
    checks.push(check_updates(&ctx.db, &ctx.version).await);
    checks
}

fn timed(id: &str, label: &str, f: impl FnOnce() -> Outcome) -> DiagnosticCheck {
    let start = Instant::now();
    finish(id, label, start, f())
}

fn finish(id: &str, label: &str, start: Instant, outcome: Outcome) -> DiagnosticCheck {
    let (status, summary, remediation) = outcome;
    DiagnosticCheck {
        id: id.to_string(),
        label: label.to_string(),
        status,
        summary,
        remediation,
        duration_ms: u32::try_from(start.elapsed().as_millis()).unwrap_or(u32::MAX),
        checked_at: chrono::Utc::now().to_rfc3339(),
    }
}

pub fn check_app_version(version: &str) -> DiagnosticCheck {
    timed(
        "APP_VERSION",
        "App version",
        || match semver::Version::parse(version) {
            Ok(v) => (
                CheckStatus::Pass,
                format!(
                    "v{v} ({} {}, {})",
                    std::env::consts::OS,
                    std::env::consts::ARCH,
                    if cfg!(debug_assertions) {
                        "development build"
                    } else {
                        "release build"
                    }
                ),
                None,
            ),
            Err(e) => (
                CheckStatus::Fail,
                format!("Packaged version is not valid SemVer: {e}"),
                Some("Reinstall the app from an official release.".into()),
            ),
        },
    )
}

pub fn check_data_dir(data_dir: &Result<PathBuf, String>) -> DiagnosticCheck {
    timed("DATA_DIR", "Data folder", || {
        match data_dir {
        Err(reason) => (
            CheckStatus::Fail,
            format!("The app data folder could not be located: {reason}"),
            Some("Check that your user profile folder exists and is writable.".into()),
        ),
        Ok(dir) => match write_read_delete(dir) {
            Ok(()) => (
                CheckStatus::Pass,
                "Data folder is writable.".into(),
                None,
            ),
            Err(e) => (
                CheckStatus::Fail,
                format!("Cannot write to the data folder: {e}"),
                Some(
                    "Make sure the app data folder is not read-only and that the disk has free space."
                        .into(),
                ),
            ),
        },
    }
    })
}

pub fn check_disk_space(data_dir: &Result<PathBuf, String>) -> DiagnosticCheck {
    timed("DISK_SPACE", "Free disk space", || match data_dir {
        Err(_) => (
            CheckStatus::Skipped,
            "The data folder could not be located.".into(),
            None,
        ),
        Ok(dir) => disk_space_outcome(disk::free_space(dir)),
    })
}

fn disk_space_outcome(free: Option<u64>) -> Outcome {
    let Some(n) = free else {
        return (
            CheckStatus::Skipped,
            "This system did not report how much space is free.".into(),
            None,
        );
    };
    let summary = format!(
        "{} free on the disk that holds your stories.",
        disk::format_bytes(n)
    );
    if n < disk::CRITICAL_SPACE_BYTES {
        (
            CheckStatus::Fail,
            summary,
            Some(
                "New turns can't be saved once the disk is full, and automatic backups are \
                 paused. Free up space: empty the trash, remove large files, or delete old \
                 backups you have copied elsewhere."
                    .into(),
            ),
        )
    } else if n < disk::LOW_SPACE_BYTES {
        (
            CheckStatus::Warn,
            summary,
            Some(
                "Free up some space soon. Automatic backups pause when less than 200 MB is left."
                    .into(),
            ),
        )
    } else {
        (CheckStatus::Pass, summary, None)
    }
}

const RESTORE_HINT: &str =
    "Restore a backup from Settings → Backups, or reinstall the app version that created this database.";

pub async fn check_database(db: &Result<Database, AppError>) -> DiagnosticCheck {
    let start = Instant::now();
    let outcome = match db {
        Err(e) => (
            CheckStatus::Fail,
            format!("The story database did not open: {}", e.message),
            Some(RESTORE_HINT.into()),
        ),
        Ok(db) => database_outcome(db).await,
    };
    finish("DATABASE", "Story database", start, outcome)
}

async fn database_outcome(db: &Database) -> Outcome {
    let fail = |msg: String| (CheckStatus::Fail, msg, Some(RESTORE_HINT.to_string()));
    if let Err(e) = sqlx::query("SELECT 1").execute(db.reader()).await {
        return fail(format!("Query failed: {e}"));
    }
    let version = match db.schema_version().await {
        Ok(v) => v,
        Err(e) => return fail(format!("Could not read schema version: {}", e.message)),
    };
    if version != latest_migration_version() {
        return fail(format!(
            "Schema version {version}, expected {}",
            latest_migration_version()
        ));
    }
    // Write, read back and roll back: proves writes work without changing data.
    let probe = async {
        let mut tx = db.write_txn().await?;
        sqlx::query(
            "INSERT INTO app_preferences (key, value_json) VALUES ('__diagnostics_probe', '1')",
        )
        .execute(&mut *tx)
        .await?;
        let v: String = sqlx::query_scalar(
            "SELECT value_json FROM app_preferences WHERE key = '__diagnostics_probe'",
        )
        .fetch_one(&mut *tx)
        .await?;
        tx.rollback().await?;
        Ok::<_, AppError>(v)
    };
    match probe.await {
        Ok(v) if v == "1" => {}
        Ok(_) => return fail("Write probe read back the wrong value".into()),
        Err(e) => return fail(format!("Write test failed: {}", e.message)),
    }
    match contract::verify(db).await {
        Ok(problems) if problems.is_empty() => (
            CheckStatus::Pass,
            format!("Schema version {version}; foreign keys on; write test passed."),
            None,
        ),
        Ok(problems) => fail(format!(
            "{} consistency problem(s): {}",
            problems.len(),
            problems
                .iter()
                .take(3)
                .cloned()
                .collect::<Vec<_>>()
                .join("; ")
        )),
        Err(e) => fail(format!("Consistency check failed: {}", e.message)),
    }
}

pub async fn check_db_integrity(db: &Result<Database, AppError>, deep: bool) -> DiagnosticCheck {
    let start = Instant::now();
    let outcome = match (db, deep) {
        (_, false) => (
            CheckStatus::Skipped,
            "Deep integrity check not run. Use \"Run deep check\" to verify every page.".into(),
            None,
        ),
        (Err(_), true) => (
            CheckStatus::Skipped,
            "Skipped because the database did not open.".into(),
            None,
        ),
        (Ok(db), true) => {
            let q = sqlx::query_scalar::<_, String>("PRAGMA quick_check").fetch_all(db.reader());
            match tokio::time::timeout(Duration::from_secs(30), q).await {
                Err(_) => (
                    CheckStatus::Warn,
                    "Integrity check did not finish within 30 seconds.".into(),
                    Some("Close other programs and run the deep check again.".into()),
                ),
                Ok(Err(e)) => (
                    CheckStatus::Fail,
                    format!("Integrity check could not run: {e}"),
                    Some(RESTORE_HINT.into()),
                ),
                Ok(Ok(rows)) if rows == ["ok"] => {
                    (CheckStatus::Pass, "No corruption found.".into(), None)
                }
                Ok(Ok(rows)) => (
                    CheckStatus::Fail,
                    format!("SQLite reported {} problem(s).", rows.len()),
                    Some(RESTORE_HINT.into()),
                ),
            }
        }
    };
    finish("DB_INTEGRITY", "Database integrity (deep)", start, outcome)
}

/// The chosen storyteller. Contacts the AI service only on the deep check
/// (an explicit user action), and then only to list models: no story text,
/// no paid request.
pub async fn check_ai_connection(
    db: &Result<Database, AppError>,
    secrets: &dyn SecretStore,
    deep: bool,
) -> DiagnosticCheck {
    let start = Instant::now();
    let label = "AI storyteller";
    let id = "AI_CONNECTION";
    let Ok(db) = db else {
        return finish(
            id,
            label,
            start,
            (
                CheckStatus::Skipped,
                "Needs the story database.".into(),
                None,
            ),
        );
    };
    let row = match crate::db::providers::storyteller(db).await {
        Ok(Some(pid)) => crate::db::providers::get_profile_row(db, &pid).await.ok(),
        _ => None,
    };
    let Some(row) = row else {
        return finish(
            id,
            label,
            start,
            (
                CheckStatus::Skipped,
                "Using the built-in offline storyteller; there is no AI service to check.".into(),
                None,
            ),
        );
    };
    if row.secret_ref.is_none() && row.billing() == crate::domain::provider::Billing::Paid {
        return finish(
            id,
            label,
            start,
            (
                CheckStatus::Warn,
                format!("\"{}\" has no API key saved.", row.label),
                Some("Open Settings, edit the connection and add its API key.".into()),
            ),
        );
    }
    if !deep {
        return finish(
            id,
            label,
            start,
            (
                CheckStatus::Skipped,
                format!(
                    "\"{}\" is set up; run the deep check to contact it.",
                    row.label
                ),
                None,
            ),
        );
    }
    let key = match &row.secret_ref {
        Some(r) => match secrets.get(r) {
            Ok(k) => k,
            Err(e) => {
                return finish(
                    id,
                    label,
                    start,
                    (
                        CheckStatus::Fail,
                        e.message,
                        Some("Check the system credential store.".into()),
                    ),
                )
            }
        },
        None => None,
    };
    let adapter = match row.adapter().and_then(|kind| {
        crate::services::adapters::Adapter::live(
            kind,
            row.base_url.as_deref().unwrap_or_default(),
            key,
        )
    }) {
        Ok(a) => a,
        Err(e) => return finish(id, label, start, (CheckStatus::Fail, e.message, None)),
    };
    let outcome = match adapter.list_models().await {
        Ok(models) if models.iter().any(|m| m == &row.model_id) => (
            CheckStatus::Pass,
            format!("Connected to \"{}\"; model {} is available.", row.label, row.model_id),
            None,
        ),
        Ok(_) => (
            CheckStatus::Warn,
            format!("Connected to \"{}\", but model {} is not listed.", row.label, row.model_id),
            Some("Check the model name in Settings.".into()),
        ),
        Err(e) => (
            CheckStatus::Fail,
            e.message,
            Some(match e.code {
                crate::errors::ErrorCode::AuthFailed => "Replace the API key in Settings.".into(),
                crate::errors::ErrorCode::ProviderUnreachable => {
                    "Check the address and your internet connection, or start your local model server.".into()
                }
                _ => "Check the connection settings, or switch to the offline storyteller.".into(),
            }),
        ),
    };
    finish(id, label, start, outcome)
}

/// Image library: files present (and, in the deep check, unchanged), and
/// no story points at an image the library no longer has. Problems are a
/// warning: stories stay readable and a missing picture shows as blank.
pub async fn check_assets(
    db: &Result<Database, AppError>,
    data_dir: &Result<PathBuf, String>,
    deep: bool,
) -> DiagnosticCheck {
    let start = Instant::now();
    let outcome = match (db, data_dir) {
        (Err(_), _) => (
            CheckStatus::Skipped,
            "Skipped because the database did not open.".into(),
            None,
        ),
        (_, Err(_)) => (
            CheckStatus::Skipped,
            "Skipped because the app data folder is unavailable.".into(),
            None,
        ),
        (Ok(db), Ok(dir)) => {
            match crate::services::assets::check(db, &AssetStore::new(dir), deep).await {
                Err(e) => (
                    CheckStatus::Warn,
                    format!("The image library could not be checked: {}", e.message),
                    None,
                ),
                Ok(r) => asset_outcome(&r, deep),
            }
        }
    };
    finish("ASSETS", "Image library", start, outcome)
}

/// Automatic backups exist and are recent; the deep check also opens the
/// newest one. Backups never block anything, so problems are warnings.
pub async fn check_backups(
    db: &Result<Database, AppError>,
    data_dir: &Result<PathBuf, String>,
    deep: bool,
) -> DiagnosticCheck {
    let start = Instant::now();
    let outcome = match (db, data_dir) {
        (Err(_), _) => (
            CheckStatus::Skipped,
            "Skipped because the database did not open.".into(),
            None,
        ),
        (_, Err(_)) => (
            CheckStatus::Skipped,
            "Skipped because the app data folder is unavailable.".into(),
            None,
        ),
        (Ok(db), Ok(dir)) => backup_outcome(db, dir, deep).await,
    };
    finish("BACKUPS", "Backups", start, outcome)
}

fn backup_date(iso: &str) -> String {
    chrono::DateTime::parse_from_rfc3339(iso)
        .map(|d| d.format("%Y-%m-%d %H:%M UTC").to_string())
        .unwrap_or_else(|_| iso.to_string())
}

async fn backup_outcome(db: &Database, dir: &Path, deep: bool) -> Outcome {
    use crate::services::backups::{self, BackupKind, AUTO_KEEP, BACKUPS_DIR};
    let remedy = "One is made shortly after the app starts when your stories changed. To keep a \
                  copy elsewhere, use Settings → Backups → Back up everything.";
    let list = match backups::list_backups(dir) {
        Ok(l) => l,
        Err(e) => {
            return (
                CheckStatus::Warn,
                format!("Backups could not be listed: {}", e.message),
                Some("Check that the app data folder can be read.".into()),
            )
        }
    };
    let changed = match backups::last_change(db).await {
        Ok(c) => c,
        Err(e) => {
            return (
                CheckStatus::Warn,
                format!("Backups could not be checked: {}", e.message),
                None,
            )
        }
    };
    let autos: Vec<_> = list
        .iter()
        .filter(|b| b.kind == BackupKind::Automatic)
        .collect();
    let Some(latest) = autos.first() else {
        return match changed {
            None => (CheckStatus::Pass, "Nothing to back up yet.".into(), None),
            Some(_) => (
                CheckStatus::Warn,
                "No automatic backup yet.".into(),
                Some(remedy.into()),
            ),
        };
    };
    let when = backup_date(&latest.created_at);
    if deep {
        let path = dir.join(BACKUPS_DIR).join(&latest.id);
        if let Err(e) = backups::check_backup_file(&path).await {
            return (
                CheckStatus::Warn,
                format!(
                    "The newest automatic backup ({when}) is damaged: {}",
                    e.message
                ),
                Some(remedy.into()),
            );
        }
    }
    let age = chrono::DateTime::parse_from_rfc3339(&latest.created_at)
        .map(|d| chrono::Utc::now() - d.with_timezone(&chrono::Utc))
        .unwrap_or_default();
    if age > chrono::Duration::days(7) && changed.is_some_and(|c| c > latest.created_at) {
        return (
            CheckStatus::Warn,
            format!(
                "The newest automatic backup is {} days old ({when}).",
                age.num_days()
            ),
            Some(remedy.into()),
        );
    }
    (
        CheckStatus::Pass,
        format!(
            "Newest automatic backup {when}; {} of {AUTO_KEEP} kept{}.",
            autos.len(),
            if deep { ", and it opens cleanly" } else { "" }
        ),
        None,
    )
}

fn short_ids(ids: &[String]) -> String {
    let shown: Vec<&str> = ids.iter().take(5).map(|i| &i[..i.len().min(8)]).collect();
    let more = ids.len().saturating_sub(5);
    if more > 0 {
        format!("{} and {more} more", shown.join(", "))
    } else {
        shown.join(", ")
    }
}

fn asset_outcome(r: &AssetReport, deep: bool) -> Outcome {
    let mut parts = Vec::new();
    if !r.missing.is_empty() {
        parts.push(format!(
            "{} image file(s) missing ({})",
            r.missing.len(),
            short_ids(&r.missing)
        ));
    }
    if !r.damaged.is_empty() {
        parts.push(format!(
            "{} image file(s) changed or damaged ({})",
            r.damaged.len(),
            short_ids(&r.damaged)
        ));
    }
    if !r.missing_thumbs.is_empty() {
        parts.push(format!(
            "{} thumbnail(s) missing ({})",
            r.missing_thumbs.len(),
            short_ids(&r.missing_thumbs)
        ));
    }
    if !r.dangling.is_empty() {
        parts.push(format!(
            "stories refer to {} image(s) that are not in the library ({})",
            r.dangling.len(),
            short_ids(&r.dangling)
        ));
    }
    if parts.is_empty() {
        let how = if deep {
            "files present and unchanged"
        } else {
            "files present (the deep check also verifies their contents)"
        };
        return (
            CheckStatus::Pass,
            format!("{} image(s); {how}.", r.images),
            None,
        );
    }
    (
        CheckStatus::Warn,
        format!("{}.", parts.join("; ")),
        Some(
            "Stories still open; a missing picture shows as blank. Add the same image again to \
             restore its file, or restore a backup."
                .into(),
        ),
    )
}

pub async fn check_usage_ledger(db: &Result<Database, AppError>) -> DiagnosticCheck {
    let start = Instant::now();
    let outcome = match db {
        Err(_) => (
            CheckStatus::Skipped,
            "Skipped because the database did not open.".into(),
            None,
        ),
        Ok(db) => {
            let q = sqlx::query_as::<_, (i64, i64)>(
                "SELECT COUNT(*), \
                   COALESCE(SUM(CASE WHEN COALESCE(cost_micro_usd, 0) < 0 \
                                       OR reserved_micro_usd < 0 \
                                       OR COALESCE(input_tokens, 0) < 0 \
                                       OR COALESCE(cached_input_tokens, 0) < 0 \
                                       OR COALESCE(output_tokens, 0) < 0 \
                                       OR (cached_input_tokens > input_tokens) \
                                     THEN 1 ELSE 0 END), 0) \
                 FROM api_requests",
            )
            .fetch_one(db.reader())
            .await;
            match q {
                Err(e) => (
                    CheckStatus::Fail,
                    format!("Usage ledger could not be read: {e}"),
                    Some(RESTORE_HINT.into()),
                ),
                Ok((_, bad)) if bad > 0 => (
                    CheckStatus::Fail,
                    format!("{bad} usage record(s) have impossible token or cost values."),
                    Some(RESTORE_HINT.into()),
                ),
                Ok((n, _)) => (
                    CheckStatus::Pass,
                    format!("{n} API request(s) recorded; values consistent."),
                    None,
                ),
            }
        }
    };
    finish("USAGE_LEDGER", "API usage ledger", start, outcome)
}

/// With a monthly budget on, every paid connection's model needs prices or
/// its cost stays unknown (and pause mode asks before each request).
pub async fn check_rate_config(db: &Result<Database, AppError>) -> DiagnosticCheck {
    let start = Instant::now();
    let outcome = match db {
        Err(_) => (
            CheckStatus::Skipped,
            "Skipped because the database did not open.".into(),
            None,
        ),
        Ok(db) => match rate_config(db).await {
            Err(e) => (
                CheckStatus::Fail,
                format!("Budget settings could not be read: {}", e.message),
                None,
            ),
            Ok(o) => o,
        },
    };
    finish("RATE_CONFIG", "API prices and budget", start, outcome)
}

async fn rate_config(db: &Database) -> AppResult<(CheckStatus, String, Option<String>)> {
    let policy = crate::db::budget::get_policy(db).await?;
    let rates = crate::db::usage_report::list_rates(db).await?;
    let paid: Vec<_> = rates
        .iter()
        .filter(|r| r.billing == crate::domain::provider::Billing::Paid)
        .collect();
    let missing: Vec<String> = paid
        .iter()
        .filter(|r| r.card.is_none())
        .map(|r| format!("{} ({})", r.provider_label, r.model_id))
        .collect();
    let Some(limit) = policy.limit_micro_usd() else {
        return Ok((
            CheckStatus::Pass,
            format!(
                "No monthly budget set; {} of {} paid connection(s) have prices.",
                paid.len() - missing.len(),
                paid.len()
            ),
            None,
        ));
    };
    let budget = format!(
        "Monthly budget {} ({}).",
        crate::db::budget::usd(limit),
        match policy.mode {
            crate::db::budget::BudgetMode::Warn => "warn only",
            crate::db::budget::BudgetMode::PauseNewRequests => "pauses new paid requests",
        }
    );
    if missing.is_empty() {
        return Ok((
            CheckStatus::Pass,
            format!("{budget} Prices are set for every paid connection."),
            None,
        ));
    }
    Ok((
        CheckStatus::Warn,
        format!(
            "{budget} No prices for {}, so their cost is unknown and the budget cannot count it.",
            missing.join(", ")
        ),
        Some("Open Settings, then Usage & budget, and add prices under Rates.".into()),
    ))
}

/// The update check's opt-in state and last result. Never contacts GitHub.
pub async fn check_updates(db: &Result<Database, AppError>, installed: &str) -> DiagnosticCheck {
    use crate::services::updates::{self, UpdateState};
    let start = Instant::now();
    let when = |at: &Option<String>| {
        at.as_deref()
            .and_then(|a| chrono::DateTime::parse_from_rfc3339(a).ok())
            .map(|d| d.format("%Y-%m-%d").to_string())
            .unwrap_or_else(|| "earlier".into())
    };
    let outcome = match db {
        Err(_) => (
            CheckStatus::Skipped,
            "Needs the story database.".into(),
            None,
        ),
        Ok(db) => match updates::status(db, installed).await {
            Err(e) => (CheckStatus::Warn, e.message, None),
            Ok(st) => match st.state {
                UpdateState::Off => (
                    CheckStatus::Skipped,
                    "Update checks are off.".into(),
                    Some("Settings → Updates can check now or once a day.".into()),
                ),
                UpdateState::NotChecked => (
                    CheckStatus::Skipped,
                    "Update checks are on but haven't run yet.".into(),
                    None,
                ),
                UpdateState::UpToDate => (
                    CheckStatus::Pass,
                    format!(
                        "v{installed} is the newest release (checked {}).",
                        when(&st.checked_at)
                    ),
                    None,
                ),
                UpdateState::Available => (
                    CheckStatus::Warn,
                    format!(
                        "v{} is available; this is v{installed} (checked {}).",
                        st.latest.map(|l| l.version).unwrap_or_default(),
                        when(&st.checked_at)
                    ),
                    Some("Settings → Updates → View release. Nothing installs by itself.".into()),
                ),
                UpdateState::Unavailable => (
                    CheckStatus::Warn,
                    format!(
                        "The last update check failed ({}, {}). Everything else works.",
                        st.message.unwrap_or_default(),
                        when(&st.checked_at)
                    ),
                    Some(
                        "Check your internet connection, then Settings → Updates → Check now."
                            .into(),
                    ),
                ),
            },
        },
    };
    finish("UPDATES", "Updates", start, outcome)
}

/// Runs the offline engine self-test on a throwaway database.
pub async fn check_timeline_replay(data_dir: &Result<PathBuf, String>) -> DiagnosticCheck {
    let start = Instant::now();
    let outcome = match data_dir {
        Err(_) => (
            CheckStatus::Skipped,
            "Skipped because the data folder is unavailable.".into(),
            None,
        ),
        Ok(dir) => match crate::services::selftest::run(&dir.join("tmp")).await {
            Ok(r) => (
                CheckStatus::Pass,
                format!(
                    "Story engine self-test passed ({} turns, {} routes, {} checks).",
                    r.turns,
                    r.routes,
                    r.checks_passed.len()
                ),
                None,
            ),
            Err(e) => (
                CheckStatus::Fail,
                format!("Story engine self-test failed: {}", e.message),
                Some("Please report this with a copied Diagnostics report.".into()),
            ),
        },
    };
    finish("TIMELINE_REPLAY", "Story engine self-test", start, outcome)
}

pub fn check_secrets(store: &dyn SecretStore) -> DiagnosticCheck {
    timed("SECRETS", "Secure key storage", || {
        match secrets::probe(store) {
        Ok(()) => (
            CheckStatus::Pass,
            "The system credential store is available for API keys.".into(),
            None,
        ),
        Err(e) => (
            CheckStatus::Warn,
            format!("API keys cannot be stored securely: {}", e.message),
            Some(
                "On Linux, install and unlock a Secret Service provider such as GNOME Keyring or KWallet. Local stories still work without it."
                    .into(),
            ),
        ),
    }
    })
}

/// Create, fsync, read back and delete a small probe file.
fn write_read_delete(dir: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dir)?;
    let probe = dir.join(format!(".diagnostics-probe-{}", std::process::id()));
    let payload = b"dear-to-love diagnostics probe";
    {
        let mut f = OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(&probe)?;
        f.write_all(payload)?;
        f.sync_all()?;
    }
    let mut buf = Vec::new();
    fs::File::open(&probe)?.read_to_end(&mut buf)?;
    let result = if buf == payload {
        Ok(())
    } else {
        Err(std::io::Error::other(
            "probe file read back different bytes",
        ))
    };
    fs::remove_file(&probe)?;
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::test_db;
    use crate::errors::ErrorCode;
    use crate::services::secrets::MemoryStore;

    #[tokio::test]
    async fn healthy_install_reports_pass_and_skips_deep_check() {
        let t = test_db().await;
        let checks = run_all(DiagnosticsContext {
            version: "0.1.0".into(),
            data_dir: Ok(t.dir.path().join("data")),
            db: Ok(t.db.clone()),
            secrets: Arc::new(MemoryStore::default()),
            deep: false,
        })
        .await;
        let ids: Vec<_> = checks.iter().map(|c| c.id.as_str()).collect();
        assert_eq!(
            ids,
            [
                "APP_VERSION",
                "DATA_DIR",
                "DISK_SPACE",
                "DATABASE",
                "DB_INTEGRITY",
                "USAGE_LEDGER",
                "RATE_CONFIG",
                "TIMELINE_REPLAY",
                "ASSETS",
                "BACKUPS",
                "SECRETS",
                "AI_CONNECTION",
                "UPDATES"
            ]
        );
        for c in checks.iter().filter(|c| c.id != "DISK_SPACE") {
            // T38: no AI connection -> model checks skipped, local checks
            // pass; update checks are off by default (T44). Free space
            // depends on the machine and has its own test.
            let expected = if matches!(c.id.as_str(), "DB_INTEGRITY" | "AI_CONNECTION" | "UPDATES")
            {
                CheckStatus::Skipped
            } else {
                CheckStatus::Pass
            };
            assert_eq!(c.status, expected, "{}: {}", c.id, c.summary);
        }
        // The write probe rolled back.
        let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM app_preferences")
            .fetch_one(t.db.reader())
            .await
            .unwrap();
        assert_eq!(n, 0);
    }

    #[test]
    fn disk_space_warns_then_fails_as_the_disk_fills() {
        let gb = 1024 * 1024 * 1024;
        let (status, summary, fix) = disk_space_outcome(Some(20 * gb));
        assert_eq!(status, CheckStatus::Pass);
        assert_eq!(summary, "20.0 GB free on the disk that holds your stories.");
        assert!(fix.is_none());
        assert_eq!(disk_space_outcome(Some(gb / 2)).0, CheckStatus::Warn);
        let (status, summary, fix) = disk_space_outcome(Some(50 * 1024 * 1024));
        assert_eq!(status, CheckStatus::Fail);
        assert!(summary.starts_with("50 MB free"));
        assert!(fix.unwrap().contains("Free up space"));
        assert_eq!(disk_space_outcome(None).0, CheckStatus::Skipped);
        let real = check_disk_space(&Ok(std::env::temp_dir()));
        assert_ne!(real.status, CheckStatus::Skipped, "{}", real.summary);
    }

    /// T40: a broken image reference warns with the image id; the story
    /// that shows it still opens.
    #[tokio::test]
    async fn broken_image_files_warn_with_ids_and_stories_still_open() {
        use crate::db::assets::set_story_visual;
        use crate::domain::visuals::VisualSlot;
        use crate::services::assets::import_bytes;
        let t = test_db().await;
        let data: Result<PathBuf, String> = Ok(t.dir.path().to_path_buf());
        let store = AssetStore::new(t.dir.path());
        let mut png = Vec::new();
        image::RgbImage::new(8, 8)
            .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
            .unwrap();
        let img = import_bytes(&t.db, &store, png, "x").await.unwrap().asset;
        let db = Ok(t.db.clone());
        assert_eq!(
            check_assets(&db, &data, true).await.status,
            CheckStatus::Pass
        );

        let story = crate::db::stories::create_story(
            &t.db,
            crate::domain::story::CreateStoryInput {
                title: "Lamp".into(),
                description: String::new(),
                base_state: crate::domain::story_state::fixtures::lighthouse(),
                first_chapter_title: "One".into(),
                chapter_outlines: vec![],
            },
        )
        .await
        .unwrap();
        set_story_visual(
            &t.db,
            &story.story_id,
            &VisualSlot::Background,
            Some(&img.id),
        )
        .await
        .unwrap();
        for dir in ["originals", "thumbs"] {
            for f in fs::read_dir(store.root().join(dir)).unwrap() {
                fs::remove_file(f.unwrap().path()).unwrap();
            }
        }
        let c = check_assets(&db, &data, false).await;
        assert_eq!(c.status, CheckStatus::Warn);
        assert!(c.summary.contains(&img.id[..8]), "{}", c.summary);
        assert!(c.remediation.unwrap().contains("Stories still open"));
        let view = crate::services::reader::route_view(&t.db, &story.main_route_id)
            .await
            .unwrap();
        assert_eq!(view.visuals.len(), 1);
    }

    #[tokio::test]
    async fn deep_check_runs_quick_check() {
        let t = test_db().await;
        let c = check_db_integrity(&Ok(t.db.clone()), true).await;
        assert_eq!(c.status, CheckStatus::Pass, "{}", c.summary);
    }

    #[tokio::test]
    async fn broken_database_fails_with_restore_hint_and_skips_dependents() {
        let err: Result<Database, AppError> =
            Err(AppError::new(ErrorCode::MigrationFailed, "newer schema"));
        let c = check_database(&err).await;
        assert_eq!(c.status, CheckStatus::Fail);
        assert!(c.remediation.unwrap().contains("backup"));
        assert_eq!(check_usage_ledger(&err).await.status, CheckStatus::Skipped);
        assert_eq!(
            check_db_integrity(&err, true).await.status,
            CheckStatus::Skipped
        );
    }

    struct BrokenStore;
    impl SecretStore for BrokenStore {
        fn set(&self, _: &str, _: &str) -> crate::errors::AppResult<()> {
            Err(AppError::new(
                ErrorCode::SecretStoreUnavailable,
                "no service",
            ))
        }
        fn get(&self, _: &str) -> crate::errors::AppResult<Option<String>> {
            Ok(None)
        }
        fn delete(&self, _: &str) -> crate::errors::AppResult<()> {
            Ok(())
        }
    }

    #[test]
    fn missing_credential_store_warns() {
        let c = check_secrets(&BrokenStore);
        assert_eq!(c.status, CheckStatus::Warn);
        assert!(c.remediation.is_some());
    }

    #[test]
    fn valid_version_passes() {
        assert_eq!(check_app_version("0.1.0").status, CheckStatus::Pass);
    }

    #[test]
    fn invalid_version_fails_with_remediation() {
        let check = check_app_version("not-a-version");
        assert_eq!(check.status, CheckStatus::Fail);
        assert!(check.remediation.is_some());
    }

    #[test]
    fn writable_data_dir_passes_and_leaves_no_probe() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("data");
        let check = check_data_dir(&Ok(dir.clone()));
        assert_eq!(check.status, CheckStatus::Pass, "{}", check.summary);
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 0);
    }

    #[test]
    fn unresolved_data_dir_fails() {
        let check = check_data_dir(&Err("no home".into()));
        assert_eq!(check.status, CheckStatus::Fail);
    }

    #[cfg(unix)]
    #[test]
    fn read_only_data_dir_fails() {
        use std::os::unix::fs::PermissionsExt;
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("ro");
        fs::create_dir(&dir).unwrap();
        fs::set_permissions(&dir, fs::Permissions::from_mode(0o555)).unwrap();
        // Root ignores permission bits, so only assert when the probe really fails.
        let check = check_data_dir(&Ok(dir.clone()));
        if fs::File::create(dir.join("x")).is_err() {
            assert_eq!(check.status, CheckStatus::Fail);
            assert!(check.remediation.is_some());
        }
        fs::set_permissions(&dir, fs::Permissions::from_mode(0o755)).unwrap();
    }

    /// T41: an explicit check lists models only; bad keys give typed results.
    #[tokio::test]
    async fn ai_connection_deep_check() {
        use crate::domain::provider::{
            AdapterKind, Billing, GenerationSettings, ProviderProfileInput,
        };
        use crate::services::adapters::test_server::{serve, Reply};
        let t = test_db().await;
        let secrets = MemoryStore::default();
        let server = serve(vec![
            Reply::json(200, r#"{"data":[{"id":"story-model"}]}"#),
            Reply::json(401, r#"{"error":{"message":"bad key"}}"#),
        ])
        .await;
        let p = crate::db::providers::save_profile(
            &t.db,
            &secrets,
            ProviderProfileInput {
                id: None,
                label: "Cloud".into(),
                adapter: AdapterKind::OpenaiCompatible,
                base_url: server.base_url.clone(),
                model_id: "story-model".into(),
                billing: Billing::Paid,
                api_key: Some("k".into()),
                settings: GenerationSettings::default(),
            },
        )
        .await
        .unwrap();
        crate::db::providers::set_storyteller(&t.db, Some(&p.id))
            .await
            .unwrap();
        let db = Ok(t.db.clone());
        let quick = check_ai_connection(&db, &secrets, false).await;
        assert_eq!(quick.status, CheckStatus::Skipped);
        assert!(
            server.requests().is_empty(),
            "no network without the deep check"
        );
        assert_eq!(
            check_ai_connection(&db, &secrets, true).await.status,
            CheckStatus::Pass
        );
        let bad = check_ai_connection(&db, &secrets, true).await;
        assert_eq!(bad.status, CheckStatus::Fail);
        assert!(bad.remediation.unwrap().contains("API key"));
        for r in server.requests() {
            assert_eq!((r.method.as_str(), r.body.as_str()), ("GET", ""));
        }
    }

    /// RATE_CONFIG: WARN when a budget is on but a paid model has no prices.
    #[tokio::test]
    async fn rate_config_warns_on_missing_prices() {
        use crate::db::budget::{set_policy, BudgetMode, BudgetPolicy};
        use crate::domain::provider::{
            AdapterKind, Billing, GenerationSettings, ProviderProfileInput,
        };
        let t = test_db().await;
        let p = crate::db::providers::save_profile(
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
        let db = Ok(t.db.clone());
        assert_eq!(check_rate_config(&db).await.status, CheckStatus::Pass);
        set_policy(
            &t.db,
            BudgetPolicy {
                enabled: true,
                monthly_limit_usd: Some("5".into()),
                mode: BudgetMode::PauseNewRequests,
                ..Default::default()
            },
        )
        .await
        .unwrap();
        let c = check_rate_config(&db).await;
        assert_eq!(c.status, CheckStatus::Warn);
        assert!(c.summary.contains("Cloud (m)"), "{}", c.summary);
        crate::db::usage::set_rate_card(&t.db, &p.id, "m", "1", "2", None)
            .await
            .unwrap();
        assert_eq!(check_rate_config(&db).await.status, CheckStatus::Pass);
    }

    #[tokio::test]
    async fn backups_warn_until_an_automatic_backup_exists() {
        use crate::services::backups::{auto_backup_if_due, BACKUPS_DIR};
        let t = test_db().await;
        let data: Result<PathBuf, String> = Ok(t.dir.path().to_path_buf());
        let db = Ok(t.db.clone());
        let c = check_backups(&db, &data, false).await;
        assert_eq!(c.status, CheckStatus::Pass, "{}", c.summary);
        assert_eq!(c.summary, "Nothing to back up yet.");

        crate::db::stories::create_story(
            &t.db,
            crate::domain::story::CreateStoryInput {
                title: "Lamp".into(),
                description: String::new(),
                base_state: crate::domain::story_state::fixtures::lighthouse(),
                first_chapter_title: "One".into(),
                chapter_outlines: vec![],
            },
        )
        .await
        .unwrap();
        let c = check_backups(&db, &data, false).await;
        assert_eq!(c.status, CheckStatus::Warn);
        assert!(c.remediation.unwrap().contains("Back up everything"));

        let b = auto_backup_if_due(&t.db, t.dir.path(), chrono::Utc::now())
            .await
            .unwrap()
            .unwrap();
        let c = check_backups(&db, &data, true).await;
        assert_eq!(c.status, CheckStatus::Pass, "{}", c.summary);
        assert!(
            c.summary.contains("1 of 5 kept, and it opens cleanly"),
            "{}",
            c.summary
        );

        fs::write(
            t.dir.path().join(BACKUPS_DIR).join(&b.id),
            b"not a database",
        )
        .unwrap();
        assert_eq!(
            check_backups(&db, &data, false).await.status,
            CheckStatus::Pass
        );
        let c = check_backups(&db, &data, true).await;
        assert_eq!(c.status, CheckStatus::Warn);
        assert!(c.summary.contains("is damaged"), "{}", c.summary);
    }
}

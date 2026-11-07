//! Installer smoke test (T49). The packaged app started with
//! `--smoke-test <report.json>` opens its real data folder as usual, waits
//! for the window to load the interface, checks itself, writes a report to
//! that file and quits. `--smoke-seed` first adds a Quick Start story with a
//! save, so a later run (after reinstalling or upgrading) can show they were
//! kept. The release workflow runs this on every installer; a normal start
//! never does any of it.

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::db::{saves, stories, Database};
use crate::domain::diagnostics::CheckStatus;
use crate::domain::templates::{QuickStartInput, TemplateCatalog};
use crate::errors::{AppError, AppResult};
use crate::services::backups::{self, Limits, RestoreSource};
use crate::services::diagnostics::{self, DiagnosticsContext};

pub const FLAG: &str = "--smoke-test";
pub const SEED_FLAG: &str = "--smoke-seed";
/// The save the seed run makes; later runs look for it.
pub const SEED_SAVE: &str = "Smoke test save";
/// How long to wait for the interface before reporting without it.
pub const FRONTEND_TIMEOUT_SECS: u64 = 120;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SmokeArgs {
    pub report: PathBuf,
    pub seed: bool,
}

/// `Some` only when the app was started with `--smoke-test <path>`.
pub fn parse_args<I: IntoIterator<Item = String>>(args: I) -> Option<SmokeArgs> {
    let args: Vec<String> = args.into_iter().collect();
    let i = args.iter().position(|a| a == FLAG)?;
    let report = args
        .get(i + 1)
        .filter(|p| !p.is_empty() && !p.starts_with("--"))?;
    Some(SmokeArgs {
        report: PathBuf::from(report),
        seed: args.iter().any(|a| a == SEED_FLAG),
    })
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckLine {
    pub id: String,
    pub status: CheckStatus,
    pub summary: String,
}

/// What a backup of the current data holds once it has been checked the
/// way a restore checks it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreCheck {
    pub stories: u32,
    pub routes: u32,
    pub images: u32,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SmokeReport {
    pub version: String,
    pub os: String,
    pub arch: String,
    /// The window loaded the interface and it called back.
    pub frontend: bool,
    pub data_dir: Option<String>,
    pub schema_version: Option<i64>,
    pub stories: Option<i64>,
    pub saves: Option<i64>,
    /// The story this run created (`--smoke-seed`).
    pub seeded_story: Option<String>,
    /// A story with the seed save is in the database.
    pub seed_kept: bool,
    pub restore_check: Option<RestoreCheck>,
    pub checks: Vec<CheckLine>,
    pub errors: Vec<String>,
}

/// A Quick Start story from the first bundled templates, plus a save.
async fn seed(db: &Database) -> AppResult<String> {
    let catalog = TemplateCatalog::bundled();
    let world = catalog
        .worlds
        .first()
        .ok_or_else(|| AppError::internal("no bundled worlds"))?;
    let scenario = catalog
        .scenarios
        .iter()
        .find(|s| s.worlds.is_empty() || s.worlds.contains(&world.id))
        .ok_or_else(|| AppError::internal("no scenario fits the first world"))?;
    let character = catalog
        .characters
        .first()
        .ok_or_else(|| AppError::internal("no bundled characters"))?;
    let input = catalog.resolve_quick_start(&QuickStartInput {
        world_id: world.id.clone(),
        scenario_id: scenario.id.clone(),
        character_id: character.id.clone(),
        perspective: None,
        detail: None,
        story_type: None,
        language: None,
    })?;
    let created = stories::create_story(db, input).await?;
    saves::create_save(db, &created.story_id, &created.main_route_id, SEED_SAVE).await?;
    Ok(created.story_id)
}

async fn counts(db: &Database) -> AppResult<(i64, i64, bool)> {
    let (stories, saves, kept): (i64, i64, i64) = sqlx::query_as(
        "SELECT (SELECT COUNT(*) FROM stories), (SELECT COUNT(*) FROM saves), \
                (SELECT COUNT(*) FROM saves WHERE label = ?)",
    )
    .bind(SEED_SAVE)
    .fetch_one(db.reader())
    .await?;
    Ok((stories, saves, kept > 0))
}

/// Backs up everything to `scratch`, checks the file the way Restore does,
/// then drops both. The data in use is never touched.
async fn restore_check(
    db: &Database,
    data_dir: &Path,
    version: &str,
    scratch: &Path,
) -> AppResult<RestoreCheck> {
    let file = scratch.join(format!("smoke-check-{}.dtlbackup", crate::db::new_id()));
    let result = async {
        backups::export_backup(db, data_dir, version, &file).await?;
        let plan = backups::prepare_restore(
            data_dir,
            &RestoreSource::File {
                path: file.display().to_string(),
            },
            &Limits::default(),
        )
        .await?;
        backups::cancel_restore(data_dir)?;
        Ok(RestoreCheck {
            stories: plan.stories,
            routes: plan.routes,
            images: plan.images,
        })
    }
    .await;
    let _ = std::fs::remove_file(&file);
    result
}

/// Seeds (if asked), counts, checks a backup and runs the standard
/// Diagnostics. Problems are recorded in the report, never raised.
pub async fn run(
    ctx: DiagnosticsContext,
    seed_first: bool,
    frontend: bool,
    scratch: &Path,
) -> SmokeReport {
    let mut r = SmokeReport {
        version: ctx.version.clone(),
        os: std::env::consts::OS.into(),
        arch: std::env::consts::ARCH.into(),
        frontend,
        data_dir: ctx.data_dir.as_ref().ok().map(|d| d.display().to_string()),
        ..Default::default()
    };
    if !frontend {
        r.errors.push(format!(
            "the interface did not load within {FRONTEND_TIMEOUT_SECS} s"
        ));
    }
    match &ctx.db {
        Err(e) => r.errors.push(format!("database: {}", e.message)),
        Ok(db) => {
            if seed_first {
                match seed(db).await {
                    Ok(id) => r.seeded_story = Some(id),
                    Err(e) => r.errors.push(format!("seed: {}", e.message)),
                }
            }
            r.schema_version = db.schema_version().await.ok();
            match counts(db).await {
                Ok((stories, saves, kept)) => {
                    r.stories = Some(stories);
                    r.saves = Some(saves);
                    r.seed_kept = kept;
                }
                Err(e) => r.errors.push(format!("counts: {}", e.message)),
            }
            if let Ok(dir) = &ctx.data_dir {
                match restore_check(db, dir, &ctx.version, scratch).await {
                    Ok(c) => r.restore_check = Some(c),
                    Err(e) => r
                        .errors
                        .push(format!("backup and restore check: {}", e.message)),
                }
            }
        }
    }
    r.checks = diagnostics::run_all(ctx)
        .await
        .into_iter()
        .map(|c| CheckLine {
            id: c.id,
            status: c.status,
            summary: c.summary,
        })
        .collect();
    r
}

/// Writes the report as JSON (temporary file, then rename).
pub fn write_report(path: &Path, report: &SmokeReport) -> std::io::Result<()> {
    let json = serde_json::to_vec_pretty(report).map_err(std::io::Error::other)?;
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, json)?;
    std::fs::rename(&tmp, path)
}

#[cfg(test)]
mod tests;

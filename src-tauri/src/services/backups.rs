//! Whole-app backups and restore (roadmap section 10).
//!
//! - **Automatic**: once a day when something changed, a WAL-safe copy of
//!   the database (`VACUUM INTO`) in `backups/auto/`, newest five kept.
//!   Images are content-addressed and never change, so they aren't copied.
//! - **Back up everything**: one `.dtlbackup` ZIP with a checksummed
//!   manifest, the database snapshot and every image file.
//! - **Restore** never touches live data while the app runs: the backup is
//!   unpacked and opened (upgraded if older, then checked) in
//!   `restore/<token>/`. Confirming saves the current data as a backup and
//!   leaves a marker; the swap happens at the next start, before the
//!   database opens, and can be repeated safely if it is interrupted.

use std::collections::{BTreeMap, HashMap};
use std::fs::{self, File};
use std::io::{BufReader, BufWriter, Write};
use std::path::{Path, PathBuf};

use chrono::{DateTime, NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::sqlite::SqliteConnectOptions;
use sqlx::{ConnectOptions, Connection, SqliteConnection};
use ts_rs::TS;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::db::backup::vacuum_into;
use crate::db::{contract, new_id, now, Database, DB_FILE_NAME};
use crate::errors::{AppError, AppResult, ErrorCode};
use crate::services::archive::{copy_limited, file_name, write_atomic_with};
use crate::services::disk;
use crate::services::storypack::PackFile;

pub const BACKUPS_DIR: &str = "backups";
pub const AUTO_DIR: &str = "auto";
pub const RESTORE_DIR: &str = "restore";
const MARKER: &str = "restore.json";
const RESULT: &str = "restore-result.json";
const MANIFEST: &str = "backup.json";
const READY: &str = "ready.db";
const PLAN: &str = "plan.json";
pub const BACKUP_EXTENSION: &str = "dtlbackup";
pub const FORMAT_VERSION: u32 = 1;
/// Automatic backups kept.
pub const AUTO_KEEP: usize = 5;
/// At most one automatic backup per this many hours.
pub const AUTO_EVERY_HOURS: i64 = 24;

const STAMP: &str = "%Y%m%dT%H%M%S%.3fZ";

fn stamp(t: DateTime<Utc>) -> String {
    t.format(STAMP).to_string()
}

fn parse_stamp(s: &str) -> Option<DateTime<Utc>> {
    ["%Y%m%dT%H%M%S%.3fZ", "%Y%m%dT%H%M%SZ"]
        .iter()
        .find_map(|f| NaiveDateTime::parse_from_str(s, f).ok())
        .map(|n| n.and_utc())
}

fn io(detail: impl std::fmt::Display) -> AppError {
    AppError::new(ErrorCode::Io, detail.to_string())
}

fn invalid(detail: impl Into<String>) -> AppError {
    AppError::new(
        ErrorCode::ArchiveInvalid,
        format!("this backup is damaged or incomplete: {}", detail.into()),
    )
}

fn join_err(e: tokio::task::JoinError) -> AppError {
    AppError::internal(e.to_string())
}

// ------------------------------------------------------------ listing

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum BackupKind {
    /// Made once a day when something changed.
    Automatic,
    /// Made before the app upgraded the database.
    BeforeUpgrade,
    /// Made just before a restore replaced everything.
    BeforeRestore,
}

/// A database copy kept in app data.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BackupInfo {
    /// Its path inside `backups/`, e.g. `auto/auto-20261106T120000.000Z.db`.
    pub id: String,
    pub kind: BackupKind,
    pub created_at: String,
    #[ts(type = "number")]
    pub bytes: u64,
}

fn classify(name: &str) -> Option<(BackupKind, &str)> {
    let stem = name.strip_suffix(".db")?;
    if let Some(ts) = stem.strip_prefix("auto-") {
        return Some((BackupKind::Automatic, ts));
    }
    if let Some(ts) = stem.strip_prefix("before-restore-") {
        return Some((BackupKind::BeforeRestore, ts));
    }
    let rest = stem.strip_prefix("pre-migration-v")?;
    let (_, ts) = rest.split_once('-')?;
    Some((BackupKind::BeforeUpgrade, ts))
}

/// Every kept database copy, newest first.
pub fn list_backups(data_dir: &Path) -> AppResult<Vec<BackupInfo>> {
    let root = data_dir.join(BACKUPS_DIR);
    let mut out = Vec::new();
    for (dir, prefix) in [
        (root.join(AUTO_DIR), format!("{AUTO_DIR}/")),
        (root, String::new()),
    ] {
        let entries = match fs::read_dir(&dir) {
            Ok(e) => e,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => continue,
            Err(e) => return Err(e.into()),
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            let Some((kind, ts)) = classify(&name) else {
                continue;
            };
            if prefix.is_empty() && kind == BackupKind::Automatic {
                continue;
            }
            let meta = entry.metadata()?;
            if !meta.is_file() {
                continue;
            }
            let created = parse_stamp(ts)
                .or_else(|| meta.modified().ok().map(DateTime::<Utc>::from))
                .unwrap_or_default();
            out.push(BackupInfo {
                id: format!("{prefix}{name}"),
                kind,
                created_at: created.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
                bytes: meta.len(),
            });
        }
    }
    out.sort_by(|a, b| b.created_at.cmp(&a.created_at).then(b.id.cmp(&a.id)));
    Ok(out)
}

/// The kept backup named `id`, if it is one `list_backups` shows.
fn kept_path(data_dir: &Path, id: &str) -> AppResult<PathBuf> {
    list_backups(data_dir)?
        .into_iter()
        .find(|b| b.id == id)
        .map(|b| data_dir.join(BACKUPS_DIR).join(b.id))
        .ok_or_else(|| AppError::not_found("that backup is no longer there"))
}

// ------------------------------------------------------------ automatic

/// The newest time anything in the stories or the library changed.
pub async fn last_change(db: &Database) -> AppResult<Option<String>> {
    Ok(sqlx::query_scalar(
        "SELECT MAX(t) FROM ( \
           SELECT MAX(updated_at) AS t FROM stories UNION ALL \
           SELECT MAX(updated_at) FROM routes UNION ALL \
           SELECT MAX(created_at) FROM events UNION ALL \
           SELECT MAX(updated_at) FROM saves UNION ALL \
           SELECT MAX(updated_at) FROM bookmarks UNION ALL \
           SELECT MAX(created_at) FROM assets)",
    )
    .fetch_one(db.reader())
    .await?)
}

/// Makes an automatic backup when the last one is a day old (or missing)
/// and something changed since, then keeps the newest five.
pub async fn auto_backup_if_due(
    db: &Database,
    data_dir: &Path,
    at: DateTime<Utc>,
) -> AppResult<Option<BackupInfo>> {
    let latest = list_backups(data_dir)?
        .into_iter()
        .find(|b| b.kind == BackupKind::Automatic);
    if let Some(l) = &latest {
        let made = DateTime::parse_from_rfc3339(&l.created_at)
            .map(|d| d.with_timezone(&Utc))
            .unwrap_or_default();
        if at - made < chrono::Duration::hours(AUTO_EVERY_HOURS) {
            return Ok(None);
        }
    }
    let Some(changed) = last_change(db).await? else {
        return Ok(None);
    };
    if latest.as_ref().is_some_and(|l| changed <= l.created_at) {
        return Ok(None);
    }
    // A copy needs about the database's size; never use up the last of
    // the disk, which the story itself needs.
    let db_size = fs::metadata(db.path()).map(|m| m.len()).unwrap_or(0);
    if disk::free_space(data_dir).is_some_and(|free| free < db_size + disk::CRITICAL_SPACE_BYTES) {
        eprintln!("automatic backup skipped: not enough free disk space");
        return Ok(None);
    }
    let dir = data_dir.join(BACKUPS_DIR).join(AUTO_DIR);
    fs::create_dir_all(&dir)?;
    let name = format!("auto-{}.db", stamp(at));
    let tmp = dir.join(format!(".{name}.{}.part", new_id()));
    if let Err(e) = vacuum_into(db.reader(), &tmp).await {
        let _ = fs::remove_file(&tmp);
        return Err(e);
    }
    fs::rename(&tmp, dir.join(&name))?;
    prune(data_dir)?;
    Ok(list_backups(data_dir)?
        .into_iter()
        .find(|b| b.id == format!("{AUTO_DIR}/{name}")))
}

/// Keeps the newest `AUTO_KEEP` automatic and "before restore" backups
/// and clears leftovers.
fn prune(data_dir: &Path) -> AppResult<()> {
    let all = list_backups(data_dir)?;
    for kind in [BackupKind::Automatic, BackupKind::BeforeRestore] {
        for old in all.iter().filter(|b| b.kind == kind).skip(AUTO_KEEP) {
            let _ = fs::remove_file(data_dir.join(BACKUPS_DIR).join(&old.id));
        }
    }
    let dir = data_dir.join(BACKUPS_DIR).join(AUTO_DIR);
    if let Ok(entries) = fs::read_dir(&dir) {
        for e in entries.flatten() {
            if e.file_name().to_string_lossy().ends_with(".part") {
                let _ = fs::remove_file(e.path());
            }
        }
    }
    Ok(())
}

// ------------------------------------------------------------ export

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupManifest {
    pub format_version: u32,
    pub app: String,
    pub app_version: String,
    pub schema_version: i64,
    pub created_at: String,
    pub stories: u32,
    pub images: u32,
    /// Every file except the manifest, by its name in the ZIP.
    pub files: BTreeMap<String, PackFile>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BackupExport {
    pub file_name: String,
    #[ts(type = "number")]
    pub bytes: u64,
    pub stories: u32,
    pub images: u32,
    /// Images the library lists whose files are missing; not included.
    pub missing_images: u32,
}

/// What a database copy holds.
struct Contents {
    schema_version: i64,
    stories: u32,
    routes: u32,
    /// `(original_rel, thumb_rel)` per image row.
    images: Vec<(String, Option<String>)>,
}

async fn read_only(path: &Path) -> AppResult<SqliteConnection> {
    Ok(SqliteConnectOptions::new()
        .filename(path)
        .read_only(true)
        .connect()
        .await?)
}

async fn contents(conn: &mut SqliteConnection) -> AppResult<Contents> {
    let schema_version: i64 =
        sqlx::query_scalar("SELECT COALESCE(MAX(version), 0) FROM _sqlx_migrations")
            .fetch_one(&mut *conn)
            .await?;
    let stories: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM stories")
        .fetch_one(&mut *conn)
        .await?;
    let routes: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM routes WHERE hidden = 0")
        .fetch_one(&mut *conn)
        .await?;
    let images = sqlx::query_as("SELECT original_rel, thumb_rel FROM assets ORDER BY id")
        .fetch_all(&mut *conn)
        .await?;
    Ok(Contents {
        schema_version,
        stories: stories as u32,
        routes: routes as u32,
        images,
    })
}

/// Everything: a consistent copy of the database and every image file, in
/// one `.dtlbackup` file at `dest` (temporary file, then rename).
pub async fn export_backup(
    db: &Database,
    data_dir: &Path,
    app_version: &str,
    dest: &Path,
) -> AppResult<BackupExport> {
    let snapshot = data_dir
        .join(BACKUPS_DIR)
        .join(format!(".export-{}.db", new_id()));
    vacuum_into(db.reader(), &snapshot).await?;
    let result = async {
        let mut conn = read_only(&snapshot).await?;
        let c = contents(&mut conn).await?;
        conn.close().await?;
        let (snapshot, data_dir, dest) =
            (snapshot.clone(), data_dir.to_path_buf(), dest.to_path_buf());
        let app_version = app_version.to_string();
        tokio::task::spawn_blocking(move || {
            write_backup(&snapshot, &data_dir, &app_version, c, &dest)
        })
        .await
        .map_err(join_err)?
    }
    .await;
    let _ = fs::remove_file(&snapshot);
    result
}

fn write_backup(
    snapshot: &Path,
    data_dir: &Path,
    app_version: &str,
    c: Contents,
    dest: &Path,
) -> AppResult<BackupExport> {
    let assets = data_dir.join("assets");
    // (name in the ZIP, path on disk, hash, size)
    let mut files: Vec<(String, PathBuf)> =
        vec![(DB_FILE_NAME.to_string(), snapshot.to_path_buf())];
    let mut missing = 0u32;
    let mut images = 0u32;
    for (original, thumb) in &c.images {
        let p = assets.join(original);
        if valid_rel(original, "originals") && p.is_file() {
            files.push((format!("assets/{original}"), p));
            images += 1;
        } else {
            missing += 1;
        }
        if let Some(t) = thumb {
            let p = assets.join(t);
            if valid_rel(t, "thumbs") && p.is_file() {
                files.push((format!("assets/{t}"), p));
            }
        }
    }
    let mut manifest = BackupManifest {
        format_version: FORMAT_VERSION,
        app: "Dear to Love".into(),
        app_version: app_version.to_string(),
        schema_version: c.schema_version,
        created_at: now(),
        stories: c.stories,
        images,
        files: BTreeMap::new(),
    };
    for (name, path) in &files {
        let (size, sha256) = hash_file(path)?;
        manifest
            .files
            .insert(name.clone(), PackFile { sha256, size });
    }
    let manifest_json = serde_json::to_vec_pretty(&manifest)
        .map_err(|e| AppError::internal(format!("could not write the manifest: {e}")))?;
    write_atomic_with(dest, |file| {
        let mut zip = ZipWriter::new(BufWriter::new(file));
        let deflated = SimpleFileOptions::default()
            .compression_method(CompressionMethod::Deflated)
            .large_file(true);
        let stored = SimpleFileOptions::default()
            .compression_method(CompressionMethod::Stored)
            .large_file(true);
        let zerr = |e: zip::result::ZipError| io(format!("could not write the backup: {e}"));
        zip.start_file(MANIFEST, deflated).map_err(zerr)?;
        zip.write_all(&manifest_json)?;
        for (name, path) in &files {
            let opts = if name == DB_FILE_NAME {
                deflated
            } else {
                stored
            };
            zip.start_file(name.as_str(), opts).map_err(zerr)?;
            std::io::copy(&mut BufReader::new(File::open(path)?), &mut zip)?;
        }
        let file = zip
            .finish()
            .map_err(zerr)?
            .into_inner()
            .map_err(|e| io(e.to_string()))?;
        file.sync_all()?;
        Ok(())
    })?;
    Ok(BackupExport {
        file_name: file_name(dest),
        bytes: fs::metadata(dest)?.len(),
        stories: c.stories,
        images,
        missing_images: missing,
    })
}

fn hash_file(path: &Path) -> AppResult<(u64, String)> {
    copy_limited(
        &mut BufReader::new(File::open(path)?),
        &mut std::io::sink(),
        u64::MAX,
    )
}

/// `originals/<sha256>.<ext>` or `thumbs/<sha256>.<ext>`.
fn valid_rel(rel: &str, dir: &str) -> bool {
    let Some(file) = rel.strip_prefix(dir).and_then(|r| r.strip_prefix('/')) else {
        return false;
    };
    let Some((hash, ext)) = file.split_once('.') else {
        return false;
    };
    hash.len() == 64
        && hash
            .chars()
            .all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c))
        && matches!(ext, "png" | "jpg" | "webp" | "gif")
}

// ------------------------------------------------------------ restore

/// Limits for a backup file being restored.
#[derive(Debug, Clone)]
pub struct Limits {
    pub max_entries: usize,
    pub max_db_bytes: u64,
    pub max_image_bytes: u64,
    pub max_total_bytes: u64,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            max_entries: 200_000,
            max_db_bytes: 16 * 1024 * 1024 * 1024,
            max_image_bytes: crate::services::assets::MAX_IMAGE_BYTES,
            max_total_bytes: 256 * 1024 * 1024 * 1024,
        }
    }
}

/// Where a restore comes from.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, TS)]
#[serde(tag = "from", rename_all = "camelCase")]
#[ts(export)]
pub enum RestoreSource {
    /// A `.dtlbackup` file.
    File { path: String },
    /// A database copy kept in app data, by `BackupInfo::id`.
    Kept { id: String },
}

/// A checked backup waiting to be confirmed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RestorePlan {
    pub token: String,
    /// The file name, or what kind of kept backup it is.
    pub source: String,
    pub created_at: String,
    pub app_version: Option<String>,
    pub stories: u32,
    pub routes: u32,
    pub images: u32,
    /// Images the backup's stories use that are in neither the backup nor
    /// this computer's library. They will show as missing pictures.
    pub missing_images: u32,
    /// The backup came from an older version and was upgraded to open it.
    pub upgraded: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Marker {
    token: String,
}

/// What the last restore did, shown once after the restart.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RestoreResult {
    pub ok: bool,
    pub source: String,
    pub backup_created_at: String,
    pub message: Option<String>,
}

fn restore_root(data_dir: &Path) -> PathBuf {
    data_dir.join(RESTORE_DIR)
}

fn staging(data_dir: &Path, token: &str) -> AppResult<PathBuf> {
    if token.is_empty() || !token.chars().all(|c| c.is_ascii_hexdigit() || c == '-') {
        return Err(AppError::invalid_input("unknown restore"));
    }
    Ok(restore_root(data_dir).join(token))
}

fn allowed(name: &str) -> Option<&'static str> {
    if name == MANIFEST || name == DB_FILE_NAME {
        return Some("file");
    }
    let rel = name.strip_prefix("assets/")?;
    if valid_rel(rel, "originals") {
        Some("originals")
    } else if valid_rel(rel, "thumbs") {
        Some("thumbs")
    } else {
        None
    }
}

/// Unpacks a `.dtlbackup` into `stage`: only the expected names, within
/// the limits, matching the manifest.
fn extract(src: &Path, stage: &Path, limits: &Limits) -> AppResult<BackupManifest> {
    let mut zip = ZipArchive::new(BufReader::new(
        File::open(src).map_err(|_| io("the backup file could not be opened"))?,
    ))
    .map_err(|_| invalid("it is not a Dear to Love backup (ZIP) file"))?;
    if zip.len() > limits.max_entries {
        return Err(invalid("it contains too many files"));
    }
    let mut seen: HashMap<String, PackFile> = HashMap::new();
    let mut manifest: Option<Vec<u8>> = None;
    let mut total = 0u64;
    for i in 0..zip.len() {
        let mut entry = zip
            .by_index(i)
            .map_err(|e| invalid(format!("an entry can't be read ({e})")))?;
        let name = entry
            .name()
            .map_err(|_| invalid("a file name inside is not readable"))?
            .to_string();
        let kind = allowed(&name);
        if entry.encrypted() || entry.is_dir() || entry.is_symlink() || kind.is_none() {
            return Err(invalid(format!("it contains an unexpected file {name:?}")));
        }
        if seen.contains_key(&name) {
            return Err(invalid(format!("it contains {name} twice")));
        }
        let limit = match name.as_str() {
            MANIFEST => 64 * 1024 * 1024,
            DB_FILE_NAME => limits.max_db_bytes,
            _ => limits.max_image_bytes,
        };
        if entry.size() > limit {
            return Err(invalid("a file inside is larger than allowed"));
        }
        let limit = limit.min(limits.max_total_bytes.saturating_sub(total));
        let (size, sha256) = if name == MANIFEST {
            let mut buf = Vec::new();
            let r = copy_limited(&mut entry, &mut buf, limit)?;
            manifest = Some(buf);
            r
        } else {
            let path = stage.join(&name);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent)?;
            }
            let mut out = BufWriter::new(File::create(&path)?);
            let r = copy_limited(&mut entry, &mut out, limit)?;
            out.flush()?;
            r
        };
        // An original's name is its own checksum.
        if kind == Some("originals") && !name.contains(&format!("/{sha256}.")) {
            return Err(invalid(format!("{name} doesn't match its checksum")));
        }
        total += size;
        seen.insert(name, PackFile { sha256, size });
    }
    let manifest: BackupManifest =
        serde_json::from_slice(&manifest.ok_or_else(|| invalid("it has no manifest"))?)
            .map_err(|e| invalid(format!("the manifest is unreadable ({e})")))?;
    if manifest.app != "Dear to Love" {
        return Err(invalid("it was not made by Dear to Love"));
    }
    if manifest.format_version > FORMAT_VERSION {
        return Err(AppError::new(
            ErrorCode::ArchiveInvalid,
            "this backup was made by a newer version of Dear to Love; update the app to restore it",
        ));
    }
    if manifest.format_version != FORMAT_VERSION {
        return Err(invalid("its format version is not supported"));
    }
    for (name, expected) in &manifest.files {
        match seen.get(name) {
            Some(got) if got == expected => {}
            Some(_) => return Err(invalid(format!("{name} doesn't match its checksum"))),
            None => return Err(invalid(format!("{name} is missing"))),
        }
    }
    if seen
        .keys()
        .any(|n| n != MANIFEST && !manifest.files.contains_key(n))
    {
        return Err(invalid("it contains files the manifest doesn't list"));
    }
    if !seen.contains_key(DB_FILE_NAME) {
        return Err(invalid("it has no story database"));
    }
    Ok(manifest)
}

/// Unpacks and checks a backup in its own staging folder. Nothing in the
/// app's data changes until `confirm_restore`.
pub async fn prepare_restore(
    data_dir: &Path,
    source: &RestoreSource,
    limits: &Limits,
) -> AppResult<RestorePlan> {
    if data_dir.join(MARKER).exists() {
        return Err(AppError::new(
            ErrorCode::Io,
            "a restore is already waiting for the app to restart",
        ));
    }
    let _ = fs::remove_dir_all(restore_root(data_dir));
    let token = new_id();
    let stage = staging(data_dir, &token)?;
    fs::create_dir_all(&stage)?;
    let result = stage_and_check(data_dir, &stage, &token, source, limits).await;
    if result.is_err() {
        let _ = fs::remove_dir_all(restore_root(data_dir));
    }
    result
}

async fn stage_and_check(
    data_dir: &Path,
    stage: &Path,
    token: &str,
    source: &RestoreSource,
    limits: &Limits,
) -> AppResult<RestorePlan> {
    let (label, created_at, app_version) = match source {
        RestoreSource::File { path } => {
            let src = PathBuf::from(path.trim());
            if !src.is_absolute() {
                return Err(AppError::invalid_input("choose a backup file to restore"));
            }
            let (stage2, limits) = (stage.to_path_buf(), limits.clone());
            let m = tokio::task::spawn_blocking(move || extract(&src, &stage2, &limits))
                .await
                .map_err(join_err)??;
            (
                file_name(Path::new(path.trim())),
                m.created_at,
                Some(m.app_version),
            )
        }
        RestoreSource::Kept { id } => {
            let src = kept_path(data_dir, id)?;
            let info = list_backups(data_dir)?
                .into_iter()
                .find(|b| &b.id == id)
                .ok_or_else(|| AppError::not_found("that backup is no longer there"))?;
            fs::copy(&src, stage.join(DB_FILE_NAME))?;
            let label = match info.kind {
                BackupKind::Automatic => "Automatic backup",
                BackupKind::BeforeUpgrade => "Backup from before an app upgrade",
                BackupKind::BeforeRestore => "Backup from before a restore",
            };
            (label.to_string(), info.created_at, None)
        }
    };

    // Open (upgrading an older copy), check, and write a clean single file.
    let db_path = stage.join(DB_FILE_NAME);
    let opened = Database::open(&db_path, &stage.join(BACKUPS_DIR)).await;
    let (db, report) = opened.map_err(|e| match e.code {
        ErrorCode::MigrationFailed if e.message.contains("newer version") => AppError::new(
            ErrorCode::ArchiveInvalid,
            "this backup was made by a newer version of Dear to Love; update the app to restore it",
        ),
        _ => invalid(format!(
            "its story database can't be opened ({})",
            e.message
        )),
    })?;
    let checked = async {
        let quick: String = sqlx::query_scalar("PRAGMA quick_check")
            .fetch_one(db.reader())
            .await?;
        if quick != "ok" {
            return Err(invalid("its story database is damaged"));
        }
        let problems = contract::verify(&db).await?;
        if !problems.is_empty() {
            return Err(invalid(format!(
                "its stories fail the consistency checks ({})",
                problems.join("; ")
            )));
        }
        vacuum_into(db.reader(), &stage.join(READY)).await
    }
    .await;
    db.close().await;
    checked?;
    for f in [DB_FILE_NAME, "story.db-wal", "story.db-shm"] {
        let _ = fs::remove_file(stage.join(f));
    }
    let _ = fs::remove_dir_all(stage.join(BACKUPS_DIR));

    let mut conn = read_only(&stage.join(READY)).await?;
    let c = contents(&mut conn).await?;
    conn.close().await?;
    let library = data_dir.join("assets");
    let staged = stage.join("assets");
    let missing = c
        .images
        .iter()
        .filter(|(o, _)| !staged.join(o).is_file() && !library.join(o).is_file())
        .count() as u32;
    let plan = RestorePlan {
        token: token.to_string(),
        source: label,
        created_at,
        app_version,
        stories: c.stories,
        routes: c.routes,
        images: c.images.len() as u32,
        missing_images: missing,
        upgraded: !report.applied_migrations.is_empty(),
    };
    fs::write(
        stage.join(PLAN),
        serde_json::to_vec(&plan).map_err(|e| AppError::internal(e.to_string()))?,
    )?;
    Ok(plan)
}

/// Drops a prepared restore.
pub fn cancel_restore(data_dir: &Path) -> AppResult<()> {
    if data_dir.join(MARKER).exists() {
        return Err(AppError::new(
            ErrorCode::Io,
            "the restore is already confirmed and finishes when the app restarts",
        ));
    }
    match fs::remove_dir_all(restore_root(data_dir)) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.into()),
    }
}

/// Saves the current data as a "before restore" backup and marks the
/// prepared restore to be applied at the next start.
pub async fn confirm_restore(db: &Database, data_dir: &Path, token: &str) -> AppResult<BackupInfo> {
    let stage = staging(data_dir, token)?;
    if !stage.join(PLAN).is_file() || !stage.join(READY).is_file() {
        return Err(AppError::not_found(
            "that restore is no longer prepared; choose the backup again",
        ));
    }
    let name = format!("before-restore-{}.db", stamp(Utc::now()));
    let dest = data_dir.join(BACKUPS_DIR).join(&name);
    vacuum_into(db.reader(), &dest).await?;
    let marker = serde_json::to_vec(&Marker {
        token: token.to_string(),
    })
    .map_err(|e| AppError::internal(e.to_string()))?;
    crate::services::archive::write_atomic(&data_dir.join(MARKER), &marker)?;
    prune(data_dir)?;
    list_backups(data_dir)?
        .into_iter()
        .find(|b| b.id == name)
        .ok_or_else(|| AppError::internal("the before-restore backup was not written"))
}

/// How far `apply_pending_restore` gets; tests stop there to simulate an
/// interruption.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Step {
    ImagesPlaced,
    OldLogRemoved,
}

/// At startup, before the database opens: finishes a confirmed restore.
/// Every step can run again after an interruption.
pub fn apply_pending_restore(data_dir: &Path) -> Option<RestoreResult> {
    apply_until(data_dir, None)
}

pub fn apply_until(data_dir: &Path, stop: Option<Step>) -> Option<RestoreResult> {
    let marker = match fs::read(data_dir.join(MARKER)) {
        Ok(m) => m,
        Err(_) => {
            // Prepared but never confirmed: nothing to apply.
            let _ = fs::remove_dir_all(restore_root(data_dir));
            return None;
        }
    };
    let marker: Option<Marker> = serde_json::from_slice(&marker).ok();
    let stage = marker
        .as_ref()
        .and_then(|m| staging(data_dir, &m.token).ok());
    let plan: Option<RestorePlan> = stage
        .as_ref()
        .and_then(|s| fs::read(s.join(PLAN)).ok())
        .and_then(|p| serde_json::from_slice(&p).ok());
    let (source, created) = plan
        .as_ref()
        .map(|p| (p.source.clone(), p.created_at.clone()))
        .unwrap_or_default();

    let outcome = match stage {
        None => Err(io("the restore marker is unreadable")),
        Some(stage) => swap(data_dir, &stage, stop),
    };
    if matches!(outcome, Ok(Swap::Stopped)) {
        return None;
    }
    let result = RestoreResult {
        ok: outcome.is_ok(),
        source,
        backup_created_at: created,
        message: outcome.err().map(|e| {
            format!(
                "the restore could not finish ({}); your stories were kept",
                e.message
            )
        }),
    };
    if let Ok(bytes) = serde_json::to_vec(&result) {
        let _ = crate::services::archive::write_atomic(&data_dir.join(RESULT), &bytes);
    }
    let _ = fs::remove_file(data_dir.join(MARKER));
    let _ = fs::remove_dir_all(restore_root(data_dir));
    Some(result)
}

enum Swap {
    Done,
    /// A test stopped it part way (a simulated crash).
    Stopped,
}

fn swap(data_dir: &Path, stage: &Path, stop: Option<Step>) -> AppResult<Swap> {
    let ready = stage.join(READY);
    let live = data_dir.join(DB_FILE_NAME);
    if !ready.is_file() {
        // Already moved into place by an earlier, interrupted start.
        return if live.is_file() {
            Ok(Swap::Done)
        } else {
            Err(io("the restored database is missing"))
        };
    }
    // 1. Images first: content-addressed, so adding them is always safe.
    for dir in ["originals", "thumbs"] {
        let from = stage.join("assets").join(dir);
        let Ok(entries) = fs::read_dir(&from) else {
            continue;
        };
        let to = data_dir.join("assets").join(dir);
        fs::create_dir_all(&to)?;
        for e in entries.flatten() {
            let target = to.join(e.file_name());
            let same = fs::metadata(&target)
                .ok()
                .zip(e.metadata().ok())
                .is_some_and(|(a, b)| a.is_file() && a.len() == b.len());
            if !same {
                fs::rename(e.path(), &target)?;
            }
        }
    }
    if stop == Some(Step::ImagesPlaced) {
        return Ok(Swap::Stopped);
    }
    // 2. The old database's write-ahead log must not be applied to the
    //    restored file. (The old data was saved before the restart.)
    for f in ["story.db-wal", "story.db-shm"] {
        match fs::remove_file(data_dir.join(f)) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.into()),
        }
    }
    if stop == Some(Step::OldLogRemoved) {
        return Ok(Swap::Stopped);
    }
    // 3. One rename puts the restored database in place.
    fs::rename(&ready, &live)?;
    Ok(Swap::Done)
}

/// The result of the last restore, once.
pub fn take_restore_result(data_dir: &Path) -> Option<RestoreResult> {
    let path = data_dir.join(RESULT);
    let bytes = fs::read(&path).ok()?;
    let _ = fs::remove_file(&path);
    serde_json::from_slice(&bytes).ok()
}

/// The newest automatic backup opens and passes SQLite's quick check.
pub async fn check_backup_file(path: &Path) -> AppResult<()> {
    let mut conn = read_only(path).await?;
    let quick: String = sqlx::query_scalar("PRAGMA quick_check")
        .fetch_one(&mut conn)
        .await?;
    conn.close().await?;
    if quick == "ok" {
        Ok(())
    } else {
        Err(AppError::new(ErrorCode::Database, quick))
    }
}

#[cfg(test)]
mod tests;

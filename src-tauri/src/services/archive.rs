//! Storypack export and import, and readable text export of one route
//! (roadmap section 10).
//!
//! Import follows the recovery protocol: unpack and check everything in
//! `imports/<operation id>` (nothing in the database changes, any problem
//! removes the folder), record the operation, place image files
//! (content-addressed, so an unused copy is harmless), write the whole story
//! in one transaction that also marks the operation committed, then remove
//! the staging folder. `recover_imports` runs at startup and finishes or
//! rolls back whatever an interruption left; at no point does a row point at
//! a file that isn't there.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs::{self, File};
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::Row;
use ts_rs::TS;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::db::assets::{self as asset_rows, AssetRow};
use crate::db::memory::{chain_hash, MEMORY_SCHEMA_VERSION};
use crate::db::timeline::EventRow;
use crate::db::{new_id, now, Database};
use crate::domain::events::{EventBody, StateEdit};
use crate::domain::story_state::{StoryStateV1, STORY_STATE_SCHEMA_VERSION};
use crate::domain::text::plain_message_tags;
use crate::domain::visuals::VisualSlot;
use crate::errors::{AppError, AppResult, ErrorCode};
use crate::services::assets::{decode, sha256_hex, AssetStore};
use crate::services::storypack::{
    self as pack, invalid, Checked, Manifest, PackBookmark, PackEvent, PackFile, PackImage,
    PackMemory, PackOutline, PackPicture, PackRoute, PackSave, PackStory, FORMAT_VERSION,
    IMAGES_DIR, MANIFEST, STORY,
};

/// Where imports are unpacked, inside app data.
pub const IMPORTS_DIR: &str = "imports";
const MAX_MANIFEST_BYTES: u64 = 4 * 1024 * 1024;

/// Size limits for a storypack being imported. Checked before anything
/// is written to the database.
#[derive(Debug, Clone)]
pub struct Limits {
    pub max_archive_bytes: u64,
    pub max_entries: usize,
    pub max_story_bytes: u64,
    pub max_image_bytes: u64,
    /// Everything unpacked together.
    pub max_total_bytes: u64,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            max_archive_bytes: 2 * 1024 * 1024 * 1024,
            max_entries: 5_000,
            max_story_bytes: 256 * 1024 * 1024,
            max_image_bytes: crate::services::assets::MAX_IMAGE_BYTES,
            max_total_bytes: 4 * 1024 * 1024 * 1024,
        }
    }
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct StorypackExport {
    pub file_name: String,
    #[ts(type = "number")]
    pub bytes: u64,
    pub routes: u32,
    pub images: u32,
    /// Pictures the story shows whose files were missing; not included.
    pub missing_images: u32,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct StorypackImport {
    pub story_id: String,
    pub title: String,
    pub main_route_id: String,
    pub routes: u32,
    pub images_added: u32,
    /// Images that were already in the library and are shared.
    pub images_reused: u32,
}

fn join_err(e: tokio::task::JoinError) -> AppError {
    AppError::internal(e.to_string())
}

fn write_err(e: zip::result::ZipError) -> AppError {
    AppError::new(ErrorCode::Io, format!("could not write the storypack: {e}"))
}

// ---------------------------------------------------------------- export

/// Writes the whole story (every route, saves, bookmarks, story memory,
/// pictures and the images it shows) to `dest`, through a temporary file
/// and a rename.
pub async fn export_storypack(
    db: &Database,
    store: &AssetStore,
    app_version: &str,
    story_id: &str,
    dest: &Path,
) -> AppResult<StorypackExport> {
    let (story, images) = collect(db, story_id).await?;
    let store = store.clone();
    let app_version = app_version.to_string();
    let dest = dest.to_path_buf();
    tokio::task::spawn_blocking(move || write_pack(&store, &app_version, story, images, &dest))
        .await
        .map_err(join_err)?
}

/// Reads one consistent copy of the story.
async fn collect(db: &Database, story_id: &str) -> AppResult<(PackStory, Vec<AssetRow>)> {
    let mut tx = db.reader().begin().await?;
    let row = sqlx::query(
        "SELECT title, description, base_state_json, created_at, updated_at FROM stories WHERE id = ?",
    )
    .bind(story_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::not_found(format!("story {story_id} not found")))?;
    let base_state = StoryStateV1::from_json(row.get::<&str, _>(2))?;

    let chapter_outlines: Vec<PackOutline> = sqlx::query_as::<_, (String, i64, String, String)>(
        "SELECT id, ordinal, title, outline FROM chapter_outlines WHERE story_id = ? ORDER BY ordinal",
    )
    .bind(story_id)
    .fetch_all(&mut *tx)
    .await?
    .into_iter()
    .map(|(id, ordinal, title, outline)| PackOutline {
        id,
        ordinal,
        title,
        outline,
    })
    .collect();

    type RouteTuple = (
        String,
        String,
        Option<String>,
        Option<String>,
        Option<String>,
        bool,
        bool,
        i64,
        String,
        String,
    );
    let routes = sqlx::query_as::<_, RouteTuple>(
        "SELECT id, label, parent_route_id, fork_event_id, head_event_id, is_main, hidden, version, \
                created_at, updated_at FROM routes WHERE story_id = ? ORDER BY created_at, id",
    )
    .bind(story_id)
    .fetch_all(&mut *tx)
    .await?
    .into_iter()
    .map(
        |(id, label, parent, fork, head, is_main, hidden, version, created_at, updated_at)| {
            Ok(PackRoute {
                head_event_id: head
                    .ok_or_else(|| AppError::internal(format!("route {id} has no head")))?,
                id,
                label,
                parent_route_id: parent,
                fork_event_id: fork,
                is_main,
                hidden,
                version,
                created_at,
                updated_at,
            })
        },
    )
    .collect::<AppResult<Vec<_>>>()?;

    let rows: Vec<(EventRow, i64)> = sqlx::query(
        "SELECT id, story_id, origin_route_id, parent_event_id, kind, payload_json, \
                generation_run_id, created_at, payload_version \
         FROM events WHERE story_id = ? ORDER BY created_at, id",
    )
    .bind(story_id)
    .fetch_all(&mut *tx)
    .await?
    .into_iter()
    .map(|r| {
        (
            EventRow {
                id: r.get(0),
                story_id: r.get(1),
                origin_route_id: r.get(2),
                parent_event_id: r.get(3),
                kind: r.get(4),
                payload_json: r.get(5),
                generation_run_id: r.get(6),
                created_at: r.get(7),
            },
            r.get::<i64, _>(8),
        )
    })
    .collect();

    let saves: Vec<PackSave> = sqlx::query_as::<
        _,
        (String, String, String, String, String, Option<i64>, String, String),
    >(
        "SELECT s.id, s.route_id, s.event_id, s.label, s.save_type, s.slot, s.created_at, s.updated_at \
         FROM saves s JOIN routes r ON r.id = s.route_id WHERE r.story_id = ? ORDER BY s.created_at, s.id",
    )
    .bind(story_id)
    .fetch_all(&mut *tx)
    .await?
    .into_iter()
    .map(
        |(id, route_id, event_id, label, save_type, slot, created_at, updated_at)| PackSave {
            id,
            route_id,
            event_id,
            label,
            save_type,
            slot,
            created_at,
            updated_at,
        },
    )
    .collect();

    let bookmarks: Vec<PackBookmark> =
        sqlx::query_as::<_, (String, String, String, String, String, String)>(
            "SELECT b.id, b.route_id, b.event_id, b.label, b.created_at, b.updated_at \
             FROM bookmarks b JOIN routes r ON r.id = b.route_id WHERE r.story_id = ? \
             ORDER BY b.created_at, b.id",
        )
        .bind(story_id)
        .fetch_all(&mut *tx)
        .await?
        .into_iter()
        .map(
            |(id, route_id, event_id, label, created_at, updated_at)| PackBookmark {
                id,
                route_id,
                event_id,
                label,
                created_at,
                updated_at,
            },
        )
        .collect();

    // Story memory that still matches its events (stale rows would be
    // ignored anyway).
    let by_id: HashMap<&str, &EventRow> = rows.iter().map(|(e, _)| (e.id.as_str(), e)).collect();
    let memory_rows = sqlx::query_as::<_, crate::db::memory::MemoryRow>(
        "SELECT id, story_id, kind, source_start_event_id, source_end_event_id, source_hash, \
                schema_version, summary_text, covered_turns, generator, api_request_id, created_at \
         FROM memory_caches WHERE story_id = ? AND schema_version = ? ORDER BY created_at, id",
    )
    .bind(story_id)
    .bind(MEMORY_SCHEMA_VERSION)
    .fetch_all(&mut *tx)
    .await?;
    let hints: HashMap<String, Option<String>> = sqlx::query_as::<_, (String, Option<String>)>(
        "SELECT id, scene_hint_json FROM memory_caches WHERE story_id = ?",
    )
    .bind(story_id)
    .fetch_all(&mut *tx)
    .await?
    .into_iter()
    .collect();
    let memory = memory_rows
        .into_iter()
        .filter(|m| chain_hash(&chain(&by_id, &m.source_end_event_id)) == m.source_hash)
        .map(|m| PackMemory {
            scene_hint_json: hints.get(&m.id).cloned().flatten(),
            kind: m.kind,
            source_start_event_id: m.source_start_event_id,
            source_end_event_id: m.source_end_event_id,
            schema_version: m.schema_version,
            summary_text: m.summary_text,
            covered_turns: m.covered_turns,
            generator: m.generator,
            created_at: m.created_at,
        })
        .collect();

    let pictures: Vec<PackPicture> = asset_rows::story_visuals(db, story_id)
        .await?
        .into_iter()
        .map(|v| PackPicture {
            slot: v.slot,
            asset_id: v.asset_id,
        })
        .collect();

    // Every image the story shows: defaults, starting state, any edit.
    let mut wanted: Vec<String> = pictures.iter().map(|p| p.asset_id.clone()).collect();
    wanted.extend(base_state.visual_refs.values().cloned());
    let mut events = Vec::with_capacity(rows.len());
    for (e, payload_version) in &rows {
        if let Ok(EventBody::Edit(p)) = EventBody::from_parts(&e.kind, &e.payload_json) {
            for c in p.changes {
                if let StateEdit::SetVisualRef {
                    asset_id: Some(a), ..
                } = c
                {
                    wanted.push(a);
                }
            }
        }
        events.push(PackEvent {
            id: e.id.clone(),
            origin_route_id: e.origin_route_id.clone(),
            parent_event_id: e.parent_event_id.clone(),
            kind: e.kind.clone(),
            payload: serde_json::from_str(&e.payload_json)
                .map_err(|err| AppError::internal(format!("event {}: {err}", e.id)))?,
            payload_version: *payload_version,
            created_at: e.created_at.clone(),
        });
    }
    let mut seen = HashSet::new();
    let mut images = Vec::new();
    for id in wanted {
        if seen.insert(id.clone()) {
            if let Some(a) = asset_rows::find(&mut tx, &id).await? {
                images.push(a);
            }
        }
    }
    tx.rollback().await?;

    let story = PackStory {
        id: story_id.to_string(),
        title: row.get(0),
        description: row.get(1),
        base_state,
        created_at: row.get(3),
        updated_at: row.get(4),
        chapter_outlines,
        routes,
        events,
        saves,
        bookmarks,
        memory,
        pictures,
        images: vec![],
    };
    Ok((story, images))
}

fn chain(by_id: &HashMap<&str, &EventRow>, end: &str) -> Vec<EventRow> {
    let mut out = Vec::new();
    let mut cur = Some(end);
    while let Some(id) = cur {
        let Some(e) = by_id.get(id) else { break };
        if out.len() > by_id.len() {
            break;
        }
        out.push((*e).clone());
        cur = e.parent_event_id.as_deref();
    }
    out.reverse();
    out
}

fn write_pack(
    store: &AssetStore,
    app_version: &str,
    mut story: PackStory,
    images: Vec<AssetRow>,
    dest: &Path,
) -> AppResult<StorypackExport> {
    // Read the image files first; a missing one is left out (and its story
    // default with it) rather than failing the whole export.
    let mut files: Vec<(String, Vec<u8>)> = Vec::new();
    let mut missing = 0u32;
    for a in images {
        let bytes = store
            .path(&a.original_rel)
            .ok()
            .and_then(|p| fs::read(p).ok());
        match bytes {
            Some(bytes) if sha256_hex(&bytes) == a.sha256 => {
                let name = pack::image_file(&a.sha256, &a.mime)?;
                story.images.push(PackImage {
                    id: a.id.clone(),
                    sha256: a.sha256.clone(),
                    mime: a.mime.clone(),
                    width: a.width.max(1) as u32,
                    height: a.height.max(1) as u32,
                    byte_size: bytes.len() as u64,
                    label: a.label.clone(),
                    tags: serde_json::from_str(&a.tags_json).unwrap_or_default(),
                });
                files.push((name, bytes));
            }
            _ => missing += 1,
        }
    }
    let included: HashSet<&str> = story.images.iter().map(|i| i.id.as_str()).collect();
    story
        .pictures
        .retain(|p| included.contains(p.asset_id.as_str()));
    let routes = story.routes.len() as u32;
    let image_count = story.images.len() as u32;

    let story_json = serde_json::to_vec(&story)
        .map_err(|e| AppError::internal(format!("could not write the story: {e}")))?;
    let mut manifest = Manifest {
        format_version: FORMAT_VERSION,
        app: "Dear to Love".into(),
        app_version: app_version.to_string(),
        exported_at: now(),
        title: story.title.clone(),
        files: BTreeMap::new(),
    };
    manifest.files.insert(
        STORY.into(),
        PackFile {
            sha256: sha256_hex(&story_json),
            size: story_json.len() as u64,
        },
    );
    for (name, bytes) in &files {
        manifest.files.insert(
            name.clone(),
            PackFile {
                sha256: sha256_hex(bytes),
                size: bytes.len() as u64,
            },
        );
    }
    let manifest_json = serde_json::to_vec_pretty(&manifest)
        .map_err(|e| AppError::internal(format!("could not write the manifest: {e}")))?;

    write_atomic_with(dest, |file| {
        let mut zip = ZipWriter::new(BufWriter::new(file));
        let deflated = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        zip.start_file(MANIFEST, deflated).map_err(write_err)?;
        zip.write_all(&manifest_json)?;
        zip.start_file(STORY, deflated).map_err(write_err)?;
        zip.write_all(&story_json)?;
        for (name, bytes) in &files {
            // Images are already compressed.
            zip.start_file(name.as_str(), stored).map_err(write_err)?;
            zip.write_all(bytes)?;
        }
        let writer = zip.finish().map_err(write_err)?;
        let file = writer
            .into_inner()
            .map_err(|e| AppError::new(ErrorCode::Io, e.to_string()))?;
        file.sync_all()?;
        Ok(())
    })?;
    Ok(StorypackExport {
        file_name: file_name(dest),
        bytes: fs::metadata(dest)?.len(),
        routes,
        images: image_count,
        missing_images: missing,
    })
}

pub(crate) fn file_name(p: &Path) -> String {
    p.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Writes through `<dest>.<id>.part` in the same folder, then renames, so
/// `dest` is either the old file or the complete new one.
pub(crate) fn write_atomic_with(
    dest: &Path,
    write: impl FnOnce(File) -> AppResult<()>,
) -> AppResult<()> {
    let dir = dest
        .parent()
        .filter(|d| !d.as_os_str().is_empty())
        .ok_or_else(|| AppError::invalid_input("choose a folder to save into"))?;
    let tmp = dir.join(format!(".{}.{}.part", file_name(dest), new_id()));
    let result = File::create(&tmp)
        .map_err(AppError::from)
        .and_then(write)
        .and_then(|_| fs::rename(&tmp, dest).map_err(AppError::from));
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

pub fn write_atomic(dest: &Path, bytes: &[u8]) -> AppResult<()> {
    write_atomic_with(dest, |mut f| {
        f.write_all(bytes)?;
        f.sync_all()?;
        Ok(())
    })
}

// ---------------------------------------------------------------- import

/// How far an import got; tests stop there to simulate an interruption.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Phase {
    Checked,
    Recorded,
    FilesPlaced,
    Committed,
}

struct Staged {
    manifest: Manifest,
    story: PathBuf,
    images: HashMap<String, PathBuf>,
}

struct PreparedImage {
    pack: PackImage,
    bytes: Vec<u8>,
    thumb: Vec<u8>,
    original_rel: String,
    thumb_rel: String,
    width: u32,
    height: u32,
}

struct Prepared {
    manifest: Manifest,
    story: PackStory,
    checked: Checked,
    images: Vec<PreparedImage>,
}

/// Imports a storypack as a new story (new ids throughout; the same pack
/// twice gives two independent stories; images already in the library are
/// shared).
pub async fn import_storypack(
    db: &Database,
    data_dir: &Path,
    src: &Path,
) -> AppResult<StorypackImport> {
    import_with(db, data_dir, src, &Limits::default(), None).await
}

/// A full copy of a story under `title`: every route, save, bookmark,
/// note and picture, and the story's own storyteller. It is written to a
/// storypack in the imports folder and read back in, so the copy passes the
/// same checks as any import; the file is removed afterwards (and at the
/// next start if the app stops first). The copy counts as just played.
pub async fn duplicate_story(
    db: &Database,
    store: &AssetStore,
    app_version: &str,
    data_dir: &Path,
    story_id: &str,
    title: &str,
) -> AppResult<StorypackImport> {
    let title = crate::db::stories::clean_title(title)?;
    let dir = data_dir.join(IMPORTS_DIR);
    fs::create_dir_all(&dir)
        .map_err(|e| AppError::new(ErrorCode::Io, format!("could not prepare the copy: {e}")))?;
    let file = dir.join(format!("copy-{}.storypack", new_id()));
    let copied = async {
        export_storypack(db, store, app_version, story_id, &file).await?;
        import_storypack(db, data_dir, &file).await
    }
    .await;
    let _ = fs::remove_file(&file);
    let mut done = copied?;

    let mut tx = db.write_txn().await?;
    let choice = crate::db::providers::story_choice(&mut tx, story_id).await?;
    let ts = now();
    sqlx::query("UPDATE stories SET title = ?, created_at = ?, updated_at = ? WHERE id = ?")
        .bind(&title)
        .bind(&ts)
        .bind(&ts)
        .bind(&done.story_id)
        .execute(&mut *tx)
        .await?;
    if choice.is_some() {
        crate::db::providers::set_story_choice_tx(&mut tx, &done.story_id, choice.as_ref()).await?;
    }
    tx.commit().await?;
    done.title = title;
    Ok(done)
}

fn interrupted() -> AppError {
    AppError::internal("import stopped (simulated interruption)")
}

pub async fn import_with(
    db: &Database,
    data_dir: &Path,
    src: &Path,
    limits: &Limits,
    stop_after: Option<Phase>,
) -> AppResult<StorypackImport> {
    let op_id = new_id();
    let stage_rel = format!("{IMPORTS_DIR}/{op_id}");
    let stage = data_dir.join(&stage_rel);
    let store = AssetStore::new(data_dir);

    // 1-2. Unpack and check everything. Nothing in the database changes yet.
    let prepared = {
        let (src, stage, limits) = (src.to_path_buf(), stage.clone(), limits.clone());
        tokio::task::spawn_blocking(move || prepare(&src, &stage, &limits))
            .await
            .map_err(join_err)?
    };
    let prepared = match prepared {
        Ok(p) => p,
        Err(e) => {
            let _ = fs::remove_dir_all(&stage);
            return Err(e);
        }
    };
    if stop_after == Some(Phase::Checked) {
        return Err(interrupted());
    }

    // 3. Journal the operation.
    let journal = serde_json::json!({
        "title": prepared.story.title,
        "files": prepared.manifest.files.keys().collect::<Vec<_>>(),
    });
    let ts = now();
    if let Err(e) = sqlx::query(
        "INSERT INTO archive_operations (id, kind, stage_rel, status, manifest_json, created_at, updated_at) \
         VALUES (?, 'import', ?, 'staged', ?, ?, ?)",
    )
    .bind(&op_id)
    .bind(&stage_rel)
    .bind(journal.to_string())
    .bind(&ts)
    .bind(&ts)
    .execute(db.writer())
    .await
    {
        let _ = fs::remove_dir_all(&stage);
        return Err(e.into());
    }
    if stop_after == Some(Phase::Recorded) {
        return Err(interrupted());
    }

    // 4. Place image files.
    if let Err(e) = place_files(&store, &prepared).await {
        fail(db, &op_id, &stage, &e).await;
        return Err(e);
    }
    if stop_after == Some(Phase::FilesPlaced) {
        return Err(interrupted());
    }

    // 5. The whole story in one transaction, marked committed with it.
    let done = match commit(db, &op_id, &prepared).await {
        Ok(d) => d,
        Err(e) => {
            fail(db, &op_id, &stage, &e).await;
            return Err(e);
        }
    };
    if stop_after == Some(Phase::Committed) {
        return Err(interrupted());
    }

    // 6. Finish: the story becomes visible, the staging folder goes.
    finish(db, &op_id, &stage).await?;
    Ok(done)
}

async fn fail(db: &Database, op_id: &str, stage: &Path, e: &AppError) {
    let _ = sqlx::query(
        "UPDATE archive_operations SET status = 'failed', error = ?, updated_at = ? WHERE id = ?",
    )
    .bind(&e.message)
    .bind(now())
    .bind(op_id)
    .execute(db.writer())
    .await;
    let _ = fs::remove_dir_all(stage);
}

async fn finish(db: &Database, op_id: &str, stage: &Path) -> AppResult<()> {
    sqlx::query(
        "UPDATE archive_operations SET status = 'complete', updated_at = ? WHERE id = ? AND status = 'committed'",
    )
    .bind(now())
    .bind(op_id)
    .execute(db.writer())
    .await?;
    let _ = fs::remove_dir_all(stage);
    Ok(())
}

fn allowed_name(name: &str) -> bool {
    if name == MANIFEST || name == STORY {
        return true;
    }
    let Some(file) = name.strip_prefix(IMAGES_DIR) else {
        return false;
    };
    let Some((hash, ext)) = file.split_once('.') else {
        return false;
    };
    hash.len() == 64
        && hash
            .chars()
            .all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c))
        && matches!(ext, "png" | "jpg" | "webp")
}

/// Copies at most `limit` bytes, hashing them on the way.
pub(crate) fn copy_limited(
    r: &mut impl Read,
    w: &mut impl Write,
    limit: u64,
) -> AppResult<(u64, String)> {
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024];
    let mut total = 0u64;
    loop {
        let n = r
            .read(&mut buf)
            .map_err(|e| invalid(format!("a file can't be read ({e})")))?;
        if n == 0 {
            break;
        }
        total += n as u64;
        if total > limit {
            return Err(invalid("a file inside is larger than allowed"));
        }
        h.update(&buf[..n]);
        w.write_all(&buf[..n])?;
    }
    Ok((total, hex::encode(h.finalize())))
}

/// Unpacks only the expected files, within the limits, and checks them
/// against the manifest.
fn extract(src: &Path, stage: &Path, limits: &Limits) -> AppResult<Staged> {
    let size = fs::metadata(src)
        .map_err(|_| AppError::new(ErrorCode::Io, "the storypack file could not be opened"))?
        .len();
    if size > limits.max_archive_bytes {
        return Err(invalid("the file is larger than this app accepts"));
    }
    let mut zip = ZipArchive::new(BufReader::new(File::open(src)?))
        .map_err(|_| invalid("it is not a storypack (ZIP) file"))?;
    if zip.len() > limits.max_entries {
        return Err(invalid("it contains too many files"));
    }
    fs::create_dir_all(stage.join("images"))?;

    let mut seen: HashMap<String, PackFile> = HashMap::new();
    let mut manifest_bytes: Option<Vec<u8>> = None;
    let mut images = HashMap::new();
    let mut declared_total = 0u64;
    let mut actual_total = 0u64;
    for i in 0..zip.len() {
        let mut entry = zip
            .by_index(i)
            .map_err(|e| invalid(format!("an entry can't be read ({e})")))?;
        let name = entry
            .name()
            .map_err(|_| invalid("a file name inside is not readable"))?
            .to_string();
        if entry.encrypted() || entry.is_dir() || entry.is_symlink() || !allowed_name(&name) {
            return Err(invalid(format!("it contains an unexpected file {name:?}")));
        }
        if seen.contains_key(&name) {
            return Err(invalid(format!("it contains {name} twice")));
        }
        let limit = if name == MANIFEST {
            MAX_MANIFEST_BYTES
        } else if name == STORY {
            limits.max_story_bytes
        } else {
            limits.max_image_bytes
        };
        declared_total = declared_total.saturating_add(entry.size());
        if entry.size() > limit || declared_total > limits.max_total_bytes {
            return Err(invalid("a file inside is larger than allowed"));
        }
        let limit = limit.min(limits.max_total_bytes - actual_total.min(limits.max_total_bytes));
        let (bytes, sha) = if name == MANIFEST {
            let mut buf = Vec::new();
            let r = copy_limited(&mut entry, &mut buf, limit)?;
            manifest_bytes = Some(buf);
            r
        } else {
            let path = stage.join(&name);
            let mut out = BufWriter::new(File::create(&path)?);
            let r = copy_limited(&mut entry, &mut out, limit)?;
            out.flush()?;
            if name != STORY {
                images.insert(name.clone(), path);
            }
            r
        };
        actual_total += bytes;
        seen.insert(
            name,
            PackFile {
                sha256: sha,
                size: bytes,
            },
        );
    }

    let manifest_bytes = manifest_bytes.ok_or_else(|| invalid("it has no manifest"))?;
    let manifest: Manifest = serde_json::from_slice(&manifest_bytes)
        .map_err(|e| invalid(format!("the manifest is unreadable ({e})")))?;
    if manifest.format_version > FORMAT_VERSION {
        return Err(AppError::new(
            ErrorCode::ArchiveInvalid,
            "this storypack was made by a newer version of Dear to Love; update the app to open it",
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
    if !seen.contains_key(STORY) {
        return Err(invalid("it has no story"));
    }
    Ok(Staged {
        manifest,
        story: stage.join(STORY),
        images,
    })
}

fn prepare(src: &Path, stage: &Path, limits: &Limits) -> AppResult<Prepared> {
    let staged = extract(src, stage, limits)?;
    let story: PackStory = serde_json::from_reader(BufReader::new(File::open(&staged.story)?))
        .map_err(|e| invalid(format!("the story is unreadable ({e})")))?;
    let checked = pack::check(&story)?;
    let mut images = Vec::with_capacity(story.images.len());
    for img in &story.images {
        let name = pack::image_file(&img.sha256, &img.mime)?;
        let path = staged
            .images
            .get(&name)
            .ok_or_else(|| invalid(format!("{name} is missing")))?;
        let bytes = fs::read(path)?;
        if sha256_hex(&bytes) != img.sha256 {
            return Err(invalid(format!("{name} doesn't match its checksum")));
        }
        let d = decode(&bytes).map_err(|e| invalid(format!("{name}: {}", e.message)))?;
        if d.mime != img.mime {
            return Err(invalid(format!("{name} is not the type it claims")));
        }
        images.push(PreparedImage {
            original_rel: format!("originals/{}.{}", img.sha256, d.ext),
            thumb_rel: format!("thumbs/{}.{}", img.sha256, d.thumb_ext),
            width: d.width,
            height: d.height,
            thumb: d.thumb,
            pack: img.clone(),
            bytes,
        });
    }
    Ok(Prepared {
        manifest: staged.manifest,
        story,
        checked,
        images,
    })
}

/// Every image's files, before any row can point at them. `put` skips a
/// file that is already there, and also restores one that went missing.
async fn place_files(store: &AssetStore, p: &Prepared) -> AppResult<()> {
    let files: Vec<(String, Vec<u8>, String, Vec<u8>)> = p
        .images
        .iter()
        .map(|img| {
            (
                img.original_rel.clone(),
                img.bytes.clone(),
                img.thumb_rel.clone(),
                img.thumb.clone(),
            )
        })
        .collect();
    let store = store.clone();
    tokio::task::spawn_blocking(move || -> AppResult<()> {
        for (o, ob, t, tb) in files {
            store.put(&o, &ob)?;
            store.put(&t, &tb)?;
        }
        Ok(())
    })
    .await
    .map_err(join_err)?
}

async fn commit(db: &Database, op_id: &str, p: &Prepared) -> AppResult<StorypackImport> {
    let mut tx = db.write_txn().await?;
    let mut images = HashMap::new();
    let (mut added, mut reused) = (0u32, 0u32);
    // Images this story keeps as its own: the new ones, and ones already
    // kept by other stories. Images shared with every story stay shared.
    let mut own = Vec::new();
    for img in &p.images {
        let existing: Option<(String, i64)> =
            sqlx::query_as("SELECT id, shared FROM assets WHERE sha256 = ?")
                .bind(&img.pack.sha256)
                .fetch_optional(&mut *tx)
                .await?;
        let id = match existing {
            Some((id, shared)) => {
                reused += 1;
                if shared == 0 {
                    own.push(id.clone());
                }
                id
            }
            None => {
                let id = new_id();
                let tags: Vec<String> = img
                    .pack
                    .tags
                    .iter()
                    .take(asset_rows::MAX_TAGS)
                    .cloned()
                    .collect();
                sqlx::query(
                    "INSERT INTO assets (id, sha256, original_rel, thumb_rel, mime, width, height, byte_size, label, tags_json, created_at, shared) \
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)",
                )
                .bind(&id)
                .bind(&img.pack.sha256)
                .bind(&img.original_rel)
                .bind(&img.thumb_rel)
                .bind(&img.pack.mime)
                .bind(img.width as i64)
                .bind(img.height as i64)
                .bind(img.bytes.len() as i64)
                .bind(img.pack.label.chars().take(asset_rows::MAX_LABEL).collect::<String>())
                .bind(serde_json::to_string(&tags).expect("tags serialize"))
                .bind(now())
                .execute(&mut *tx)
                .await?;
                added += 1;
                own.push(id.clone());
                id
            }
        };
        images.insert(img.pack.id.clone(), id);
    }

    let r = pack::remap(&p.story, &p.checked, &images, new_id);
    let ts = now();
    sqlx::query(
        "INSERT INTO stories (id, title, description, base_state_json, schema_version, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&r.story_id)
    .bind(p.story.title.trim())
    .bind(p.story.description.trim())
    .bind(r.base_state.to_canonical_json())
    .bind(STORY_STATE_SCHEMA_VERSION as i64)
    .bind(&p.story.created_at)
    .bind(&ts)
    .execute(&mut *tx)
    .await?;
    for id in &own {
        asset_rows::add_to_story(&mut tx, id, &r.story_id).await?;
    }
    for o in &r.outlines {
        sqlx::query(
            "INSERT INTO chapter_outlines (id, story_id, ordinal, title, outline) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(&o.id)
        .bind(&r.story_id)
        .bind(o.ordinal)
        .bind(&o.title)
        .bind(&o.outline)
        .execute(&mut *tx)
        .await?;
    }
    for route in &r.routes {
        sqlx::query(
            "INSERT INTO routes (id, story_id, label, parent_route_id, fork_event_id, head_event_id, \
                                 is_main, hidden, version, created_at, updated_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&route.id)
        .bind(&r.story_id)
        .bind(&route.label)
        .bind(&route.parent_route_id)
        .bind(&route.fork_event_id)
        .bind(&route.head_event_id)
        .bind(route.is_main)
        .bind(route.hidden)
        .bind(route.version)
        .bind(&route.created_at)
        .bind(&route.updated_at)
        .execute(&mut *tx)
        .await?;
    }
    for e in &r.events {
        sqlx::query(
            "INSERT INTO events (id, story_id, origin_route_id, parent_event_id, kind, payload_json, \
                                 payload_version, generation_run_id, created_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)",
        )
        .bind(&e.id)
        .bind(&r.story_id)
        .bind(&e.origin_route_id)
        .bind(&e.parent_event_id)
        .bind(&e.kind)
        .bind(&e.payload_json)
        .bind(e.payload_version)
        .bind(&e.created_at)
        .execute(&mut *tx)
        .await?;
    }
    for s in &r.saves {
        sqlx::query(
            "INSERT INTO saves (id, route_id, event_id, label, save_type, slot, created_at, updated_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&s.id)
        .bind(&s.route_id)
        .bind(&s.event_id)
        .bind(&s.label)
        .bind(&s.save_type)
        .bind(s.slot)
        .bind(&s.created_at)
        .bind(&s.updated_at)
        .execute(&mut *tx)
        .await?;
    }
    for b in &r.bookmarks {
        sqlx::query(
            "INSERT INTO bookmarks (id, route_id, event_id, label, created_at, updated_at) \
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(&b.id)
        .bind(&b.route_id)
        .bind(&b.event_id)
        .bind(b.label.trim())
        .bind(&b.created_at)
        .bind(&b.updated_at)
        .execute(&mut *tx)
        .await?;
    }
    for m in &r.memory {
        let mm = &m.memory;
        sqlx::query(
            "INSERT OR IGNORE INTO memory_caches (id, story_id, kind, source_start_event_id, \
                source_end_event_id, source_hash, schema_version, summary_text, scene_hint_json, \
                covered_turns, generator, api_request_id, created_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)",
        )
        .bind(new_id())
        .bind(&r.story_id)
        .bind(&mm.kind)
        .bind(&mm.source_start_event_id)
        .bind(&mm.source_end_event_id)
        .bind(&m.source_hash)
        .bind(mm.schema_version)
        .bind(&mm.summary_text)
        .bind(&mm.scene_hint_json)
        .bind(mm.covered_turns)
        .bind(&mm.generator)
        .bind(&mm.created_at)
        .execute(&mut *tx)
        .await?;
    }
    for pic in &r.pictures {
        let slot = VisualSlot::parse(&pic.slot)?;
        let (owner_type, owner_id, variant) = slot.link_owner(&r.story_id);
        sqlx::query(
            "INSERT OR IGNORE INTO asset_links (id, story_id, asset_id, owner_type, owner_id, variant, created_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(new_id())
        .bind(&r.story_id)
        .bind(&pic.asset_id)
        .bind(owner_type)
        .bind(owner_id)
        .bind(variant)
        .bind(&ts)
        .execute(&mut *tx)
        .await?;
    }
    sqlx::query(
        "UPDATE archive_operations SET status = 'committed', story_id = ?, updated_at = ? WHERE id = ?",
    )
    .bind(&r.story_id)
    .bind(&ts)
    .bind(op_id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(StorypackImport {
        story_id: r.story_id,
        title: p.story.title.trim().to_string(),
        main_route_id: r.main_route_id,
        routes: r.routes.len() as u32,
        images_added: added,
        images_reused: reused,
    })
}

/// What startup recovery did.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Recovered {
    pub rolled_back: u64,
    pub finished: u64,
}

/// Finishes imports whose story was written and rolls back the rest, then
/// clears leftover staging and temporary files. Runs at startup, when no
/// import can be in progress.
pub async fn recover_imports(db: &Database, data_dir: &Path) -> AppResult<Recovered> {
    let ts = now();
    let rolled_back = sqlx::query(
        "UPDATE archive_operations SET status = 'rolled_back', updated_at = ?, \
           error = 'interrupted before the story was written' WHERE status = 'staged'",
    )
    .bind(&ts)
    .execute(db.writer())
    .await?
    .rows_affected();
    let finished = sqlx::query(
        "UPDATE archive_operations SET status = 'complete', updated_at = ? WHERE status = 'committed'",
    )
    .bind(&ts)
    .execute(db.writer())
    .await?
    .rows_affected();
    for dir in [
        data_dir.join(IMPORTS_DIR),
        AssetStore::new(data_dir).root().join("tmp"),
    ] {
        match fs::remove_dir_all(&dir) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => eprintln!("could not clear {}: {e}", dir.display()),
        }
    }
    Ok(Recovered {
        rolled_back,
        finished,
    })
}

// ---------------------------------------------------------------- text

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum TextFormat {
    Markdown,
    Text,
}

impl TextFormat {
    pub fn extension(self) -> &'static str {
        match self {
            Self::Markdown => "md",
            Self::Text => "txt",
        }
    }
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TextExport {
    pub file_name: String,
    pub chapters: u32,
    pub turns: u32,
}

fn stamp(iso: &str) -> String {
    chrono::DateTime::parse_from_rfc3339(iso)
        .map(|d| {
            d.with_timezone(&chrono::Utc)
                .format("%Y-%m-%d %H:%M UTC")
                .to_string()
        })
        .unwrap_or_else(|_| iso.to_string())
}

fn paragraphs(text: &str) -> Vec<String> {
    text.replace("\r\n", "\n")
        .split("\n\n")
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
        .collect()
}

/// Keep story text from turning into Markdown headings or quotes.
fn md_escape(p: &str) -> String {
    p.lines()
        .map(|l| {
            if l.starts_with('#') || l.starts_with('>') {
                format!("\\{l}")
            } else {
                l.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// The route as readable text: chapter headings, then each turn with who
/// said it, in order.
pub async fn route_text(
    db: &Database,
    route_id: &str,
    format: TextFormat,
    timestamps: bool,
) -> AppResult<(String, TextExport)> {
    let view = crate::services::reader::route_view(db, route_id).await?;
    let state = &view.state.effective.state;
    let player = state
        .characters
        .get(&state.player_character_id)
        .map(|c| c.name.clone())
        .unwrap_or_else(|| "You".into());
    let md = format == TextFormat::Markdown;
    let mut out = String::new();
    let title = view.story.title.trim();
    let today = chrono::Utc::now().format("%Y-%m-%d");
    if md {
        out.push_str(&format!("# {}\n\n", md_escape(title)));
        out.push_str(&format!("Route: {} · Exported {today}\n", view.route.label));
    } else {
        out.push_str(&format!(
            "{title}\n{}\nRoute: {} · Exported {today}\n",
            "=".repeat(title.chars().count().max(3)),
            view.route.label
        ));
    }
    let (mut chapters, mut turns) = (0u32, 0u32);
    let label = |who: &str, at: &str| {
        let when = if timestamps {
            format!(" ({})", stamp(at))
        } else {
            String::new()
        };
        if md {
            format!("**{who}**{when}:")
        } else {
            format!("{who}{when}:")
        }
    };
    let note = |text: String| {
        if md {
            format!("\n*{}*\n", text.replace('*', "\\*"))
        } else {
            format!("\n[{text}]\n")
        }
    };
    for e in &view.history {
        match &e.body {
            EventBody::ChapterStart(c) => {
                chapters += 1;
                let heading = crate::domain::events::chapter_heading(c.ordinal, &c.title);
                if md {
                    out.push_str(&format!("\n## {}\n", md_escape(&heading)));
                } else {
                    out.push_str(&format!(
                        "\n{heading}\n{}\n",
                        "-".repeat(heading.chars().count())
                    ));
                }
            }
            EventBody::Player(p) => {
                turns += 1;
                let text = plain_message_tags(&p.shown_text());
                push_turn(&mut out, &label(&player, &e.created_at), &text, md);
            }
            EventBody::Assistant(p) => {
                turns += 1;
                let text = plain_message_tags(&p.text);
                push_turn(&mut out, &label("Storyteller", &e.created_at), &text, md);
            }
            EventBody::Edit(p) => {
                let what = if p
                    .changes
                    .iter()
                    .all(|c| matches!(c, StateEdit::SetVisualRef { .. }))
                {
                    "Picture changed"
                } else {
                    "Story details changed"
                };
                out.push_str(&note(match &p.note {
                    Some(n) => format!("{what}: {n}."),
                    None => format!("{what}."),
                }));
            }
            EventBody::Checkpoint(p) => out.push_str(&note(format!("Checkpoint: {}", p.label))),
            EventBody::FactConfirm(p) => {
                out.push_str(&note(format!("Fact confirmed: {}", p.fact.text)))
            }
        }
    }
    Ok((
        out,
        TextExport {
            file_name: String::new(),
            chapters,
            turns,
        },
    ))
}

fn push_turn(out: &mut String, label: &str, text: &str, md: bool) {
    let paras = paragraphs(text);
    let paras: Vec<String> = if md {
        paras.iter().map(|p| md_escape(p)).collect()
    } else {
        paras
    };
    out.push('\n');
    match paras.split_first() {
        Some((first, rest)) => {
            out.push_str(&format!("{label} {first}\n"));
            for p in rest {
                out.push_str(&format!("\n{p}\n"));
            }
        }
        None => out.push_str(&format!("{label}\n")),
    }
}

pub async fn export_route_text(
    db: &Database,
    route_id: &str,
    format: TextFormat,
    timestamps: bool,
    dest: &Path,
) -> AppResult<TextExport> {
    let (text, mut info) = route_text(db, route_id, format, timestamps).await?;
    let dest = dest.to_path_buf();
    let d = dest.clone();
    tokio::task::spawn_blocking(move || write_atomic(&d, text.as_bytes()))
        .await
        .map_err(join_err)??;
    info.file_name = file_name(&dest);
    Ok(info)
}

#[cfg(test)]
mod tests;

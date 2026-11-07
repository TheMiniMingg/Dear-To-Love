//! Image library rows, story-default picture links, and the reference scan
//! that keeps an image from being deleted while anything still shows it.

use std::collections::BTreeSet;

use serde::Serialize;
use sqlx::{FromRow, SqliteConnection};
use ts_rs::TS;

use super::{new_id, now, Database};
use crate::domain::story_state::StoryStateV1;
use crate::domain::visuals::VisualSlot;
use crate::errors::{AppError, AppResult, ErrorCode};

pub const MAX_LABEL: usize = 100;
pub const MAX_TAGS: usize = 12;
pub const MAX_TAG: usize = 30;

#[derive(Debug, Clone, FromRow)]
pub struct AssetRow {
    pub id: String,
    pub sha256: String,
    pub original_rel: String,
    pub thumb_rel: Option<String>,
    pub mime: String,
    pub width: i64,
    pub height: i64,
    pub byte_size: i64,
    pub label: String,
    pub tags_json: String,
    pub created_at: String,
    /// 1: any story can use it. 0: only the stories in `asset_stories`.
    pub shared: i64,
}

/// A story a story-only image belongs to.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AssetStory {
    pub id: String,
    pub title: String,
}

/// An image in the library, as the UI sees it (no file paths).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AssetDto {
    pub id: String,
    pub mime: String,
    pub width: u32,
    pub height: u32,
    #[ts(type = "number")]
    pub byte_size: u64,
    pub label: String,
    pub tags: Vec<String>,
    pub created_at: String,
    /// Any story can use it. Otherwise only `stories` can (none: its
    /// stories were deleted, or the story it was added for wasn't made).
    pub shared: bool,
    pub stories: Vec<AssetStory>,
}

impl AssetRow {
    /// The UI's view, without the stories a story-only image belongs to
    /// (see [`dto`]).
    pub fn to_dto(&self) -> AssetDto {
        AssetDto {
            id: self.id.clone(),
            mime: self.mime.clone(),
            width: self.width.max(0) as u32,
            height: self.height.max(0) as u32,
            byte_size: self.byte_size.max(0) as u64,
            label: self.label.clone(),
            tags: serde_json::from_str(&self.tags_json).unwrap_or_default(),
            created_at: self.created_at.clone(),
            shared: self.shared != 0,
            stories: vec![],
        }
    }
}

/// The UI's view of one image, with the stories it belongs to.
pub async fn dto(conn: &mut SqliteConnection, row: &AssetRow) -> AppResult<AssetDto> {
    let mut d = row.to_dto();
    d.stories = sqlx::query_as::<_, (String, String)>(
        "SELECT s.id, s.title FROM asset_stories a JOIN stories s ON s.id = a.story_id \
         WHERE a.asset_id = ? ORDER BY s.title, s.id",
    )
    .bind(&row.id)
    .fetch_all(&mut *conn)
    .await?
    .into_iter()
    .map(|(id, title)| AssetStory { id, title })
    .collect();
    Ok(d)
}

/// `SELECT <all columns> FROM assets <tail>` as a static string.
macro_rules! select_assets {
    ($tail:literal) => {
        concat!(
            "SELECT id, sha256, original_rel, thumb_rel, mime, width, height, byte_size, \
             label, tags_json, created_at, shared FROM assets ",
            $tail
        )
    };
}

pub async fn list(db: &Database) -> AppResult<Vec<AssetDto>> {
    let rows: Vec<AssetRow> = sqlx::query_as(select_assets!("ORDER BY created_at DESC, id DESC"))
        .fetch_all(db.reader())
        .await?;
    let links: Vec<(String, String, String)> = sqlx::query_as(
        "SELECT a.asset_id, s.id, s.title FROM asset_stories a JOIN stories s ON s.id = a.story_id \
         ORDER BY s.title, s.id",
    )
    .fetch_all(db.reader())
    .await?;
    let mut by_asset: std::collections::HashMap<String, Vec<AssetStory>> = Default::default();
    for (asset, id, title) in links {
        by_asset
            .entry(asset)
            .or_default()
            .push(AssetStory { id, title });
    }
    Ok(rows
        .iter()
        .map(|r| {
            let mut d = r.to_dto();
            d.stories = by_asset.remove(&r.id).unwrap_or_default();
            d
        })
        .collect())
}

/// Whether the story may show the image: it is shared, or it belongs to
/// the story.
pub async fn available_to(
    conn: &mut SqliteConnection,
    asset_id: &str,
    story_id: &str,
) -> AppResult<bool> {
    let ok: Option<i64> = sqlx::query_scalar(
        "SELECT 1 FROM assets a WHERE a.id = ? AND (a.shared = 1 OR EXISTS \
           (SELECT 1 FROM asset_stories m WHERE m.asset_id = a.id AND m.story_id = ?))",
    )
    .bind(asset_id)
    .bind(story_id)
    .fetch_optional(&mut *conn)
    .await?;
    Ok(ok.is_some())
}

/// An image the story can show, or why not.
pub async fn check_available(
    conn: &mut SqliteConnection,
    asset_id: &str,
    story_id: &str,
) -> AppResult<()> {
    if find(conn, asset_id).await?.is_none() {
        return Err(AppError::new(
            ErrorCode::AssetMissing,
            "that image is not in the library",
        ));
    }
    if !available_to(conn, asset_id, story_id).await? {
        return Err(AppError::invalid_input(
            "that image belongs to another story; share it with all stories first",
        ));
    }
    Ok(())
}

/// Adds the image to a story's own pictures (it stays shared if it is).
pub async fn add_to_story(
    conn: &mut SqliteConnection,
    asset_id: &str,
    story_id: &str,
) -> AppResult<()> {
    sqlx::query(
        "INSERT INTO asset_stories (asset_id, story_id, created_at) VALUES (?, ?, ?) \
         ON CONFLICT(asset_id, story_id) DO NOTHING",
    )
    .bind(asset_id)
    .bind(story_id)
    .bind(now())
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// Who may use a newly added image.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ImportScope {
    /// Every story. An image that was story-only becomes shared.
    Shared,
    /// Only this story. An image that is already shared stays shared.
    Story(String),
    /// Only the story being created (it doesn't exist yet). Creating it
    /// adds the image to it; until then the image is in no story.
    NewStory,
}

/// Applies `scope` to an image that was just added or found again.
pub async fn apply_import_scope(
    db: &Database,
    row: &AssetRow,
    is_new: bool,
    scope: &ImportScope,
) -> AppResult<AssetDto> {
    let mut tx = db.write_txn().await?;
    match scope {
        ImportScope::Shared => {
            if row.shared == 0 {
                sqlx::query("UPDATE assets SET shared = 1 WHERE id = ?")
                    .bind(&row.id)
                    .execute(&mut *tx)
                    .await?;
                sqlx::query("DELETE FROM asset_stories WHERE asset_id = ?")
                    .bind(&row.id)
                    .execute(&mut *tx)
                    .await?;
            }
        }
        ImportScope::Story(story_id) => {
            let exists: Option<i64> = sqlx::query_scalar("SELECT 1 FROM stories WHERE id = ?")
                .bind(story_id)
                .fetch_optional(&mut *tx)
                .await?;
            if exists.is_none() {
                return Err(AppError::not_found(format!("story {story_id} not found")));
            }
            if is_new {
                set_shared_tx(&mut tx, &row.id, false).await?;
            }
            if is_new || row.shared == 0 {
                add_to_story(&mut tx, &row.id, story_id).await?;
            }
        }
        ImportScope::NewStory => {
            if is_new {
                set_shared_tx(&mut tx, &row.id, false).await?;
            }
        }
    }
    let row = find(&mut tx, &row.id).await?.ok_or_else(|| {
        AppError::new(ErrorCode::AssetMissing, "that image is not in the library")
    })?;
    let out = dto(&mut tx, &row).await?;
    tx.commit().await?;
    Ok(out)
}

async fn set_shared_tx(conn: &mut SqliteConnection, id: &str, shared: bool) -> AppResult<()> {
    sqlx::query("UPDATE assets SET shared = ? WHERE id = ?")
        .bind(shared as i64)
        .bind(id)
        .execute(&mut *conn)
        .await?;
    Ok(())
}

/// Share an image with every story, or keep it for one story only. Stories
/// that already show it keep it either way, so making it story-only also
/// keeps it in those stories.
pub async fn set_scope(
    db: &Database,
    asset_id: &str,
    only_story: Option<&str>,
) -> AppResult<AssetDto> {
    let mut tx = db.write_txn().await?;
    let row = find(&mut tx, asset_id).await?.ok_or_else(|| {
        AppError::new(ErrorCode::AssetMissing, "that image is not in the library")
    })?;
    match only_story {
        None => {
            set_shared_tx(&mut tx, asset_id, true).await?;
            sqlx::query("DELETE FROM asset_stories WHERE asset_id = ?")
                .bind(asset_id)
                .execute(&mut *tx)
                .await?;
        }
        Some(story_id) => {
            let exists: Option<i64> = sqlx::query_scalar("SELECT 1 FROM stories WHERE id = ?")
                .bind(story_id)
                .fetch_optional(&mut *tx)
                .await?;
            if exists.is_none() {
                return Err(AppError::not_found(format!("story {story_id} not found")));
            }
            let mut keep: BTreeSet<String> = usages(&mut tx, asset_id)
                .await?
                .into_iter()
                .map(|u| u.story_id)
                .collect();
            keep.insert(story_id.to_string());
            sqlx::query("DELETE FROM asset_stories WHERE asset_id = ?")
                .bind(asset_id)
                .execute(&mut *tx)
                .await?;
            for s in &keep {
                add_to_story(&mut tx, asset_id, s).await?;
            }
            set_shared_tx(&mut tx, asset_id, false).await?;
        }
    }
    let row = find(&mut tx, &row.id).await?.ok_or_else(|| {
        AppError::new(ErrorCode::AssetMissing, "that image is not in the library")
    })?;
    let out = dto(&mut tx, &row).await?;
    tx.commit().await?;
    Ok(out)
}

pub async fn all_rows(db: &Database) -> AppResult<Vec<AssetRow>> {
    Ok(sqlx::query_as(select_assets!("ORDER BY id"))
        .fetch_all(db.reader())
        .await?)
}

pub async fn find(conn: &mut SqliteConnection, id: &str) -> AppResult<Option<AssetRow>> {
    Ok(sqlx::query_as(select_assets!("WHERE id = ?"))
        .bind(id)
        .fetch_optional(conn)
        .await?)
}

pub async fn get(db: &Database, id: &str) -> AppResult<AssetRow> {
    let mut conn = db.reader().acquire().await?;
    find(&mut conn, id)
        .await?
        .ok_or_else(|| AppError::new(ErrorCode::AssetMissing, "that image is not in the library"))
}

pub async fn by_sha(db: &Database, sha256: &str) -> AppResult<Option<AssetRow>> {
    Ok(sqlx::query_as(select_assets!("WHERE sha256 = ?"))
        .bind(sha256)
        .fetch_optional(db.reader())
        .await?)
}

pub struct NewAsset<'a> {
    pub sha256: &'a str,
    pub original_rel: &'a str,
    pub thumb_rel: Option<&'a str>,
    pub mime: &'a str,
    pub width: u32,
    pub height: u32,
    pub byte_size: u64,
    pub label: &'a str,
}

/// Adds the image, or returns the row that already has the same bytes.
/// `true` when a new row was added.
pub async fn insert_or_existing(db: &Database, new: NewAsset<'_>) -> AppResult<(AssetRow, bool)> {
    let label = clean_label(new.label);
    let done = sqlx::query(
        "INSERT INTO assets (id, sha256, original_rel, thumb_rel, mime, width, height, byte_size, label, tags_json, created_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?) ON CONFLICT(sha256) DO NOTHING",
    )
    .bind(new_id())
    .bind(new.sha256)
    .bind(new.original_rel)
    .bind(new.thumb_rel)
    .bind(new.mime)
    .bind(new.width as i64)
    .bind(new.height as i64)
    .bind(new.byte_size as i64)
    .bind(&label)
    .bind(now())
    .execute(db.writer())
    .await?;
    let row: AssetRow = sqlx::query_as(select_assets!("WHERE sha256 = ?"))
        .bind(new.sha256)
        .fetch_one(db.writer())
        .await?;
    Ok((row, done.rows_affected() == 1))
}

fn clean_label(label: &str) -> String {
    label.trim().chars().take(MAX_LABEL).collect()
}

/// Rename an image and set its tags (trimmed, de-duplicated, limited).
pub async fn update_details(
    db: &Database,
    id: &str,
    label: &str,
    tags: &[String],
) -> AppResult<AssetDto> {
    if label.trim().chars().count() > MAX_LABEL {
        return Err(AppError::invalid_input(format!(
            "an image name can be at most {MAX_LABEL} characters"
        )));
    }
    let mut seen = BTreeSet::new();
    let mut clean = Vec::new();
    for t in tags {
        let t = t.trim();
        if t.is_empty() || !seen.insert(t.to_lowercase()) {
            continue;
        }
        if t.chars().count() > MAX_TAG {
            return Err(AppError::invalid_input(format!(
                "a tag can be at most {MAX_TAG} characters"
            )));
        }
        clean.push(t.to_string());
    }
    if clean.len() > MAX_TAGS {
        return Err(AppError::invalid_input(format!(
            "an image can have at most {MAX_TAGS} tags"
        )));
    }
    let done = sqlx::query("UPDATE assets SET label = ?, tags_json = ? WHERE id = ?")
        .bind(clean_label(label))
        .bind(serde_json::to_string(&clean).expect("tags serialize"))
        .bind(id)
        .execute(db.writer())
        .await?;
    if done.rows_affected() == 0 {
        return Err(AppError::new(
            ErrorCode::AssetMissing,
            "that image is not in the library",
        ));
    }
    let row = get(db, id).await?;
    let mut conn = db.reader().acquire().await?;
    dto(&mut conn, &row).await
}

/// One place an image is shown.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AssetUsage {
    pub story_id: String,
    pub story_title: String,
    pub slot: String,
    /// Readable place, e.g. "Portrait of Mara Quill (story default)".
    pub place: String,
    /// Part of a story's history (an earlier turn or its starting state).
    /// History never changes, so this use lasts as long as the story.
    pub in_history: bool,
}

/// Every story default, starting state and edit event (on any route,
/// hidden ones included, at the head or long before it) that shows the
/// image.
pub async fn usages(conn: &mut SqliteConnection, asset_id: &str) -> AppResult<Vec<AssetUsage>> {
    let mut out: Vec<AssetUsage> = Vec::new();

    let links: Vec<(String, String, String, String, String)> = sqlx::query_as(
        "SELECT l.story_id, s.title, l.owner_type, l.owner_id, l.variant \
         FROM asset_links l JOIN stories s ON s.id = l.story_id \
         WHERE l.asset_id = ? ORDER BY s.title, l.owner_type, l.owner_id",
    )
    .bind(asset_id)
    .fetch_all(&mut *conn)
    .await?;
    for (story_id, title, owner_type, owner_id, variant) in links {
        let Some(slot) = VisualSlot::from_link(&owner_type, &owner_id, &variant) else {
            continue;
        };
        let what = describe(conn, &story_id, &slot).await?;
        let place = match slot {
            VisualSlot::Cover => what,
            _ => format!("{what} (story default)"),
        };
        out.push(AssetUsage {
            story_id,
            story_title: title,
            slot: slot.key(),
            place,
            in_history: false,
        });
    }

    let starts: Vec<(String, String, String)> = sqlx::query_as(
        "SELECT s.id, s.title, j.key FROM stories s, json_each(s.base_state_json, '$.visualRefs') j \
         WHERE j.value = ? ORDER BY s.title",
    )
    .bind(asset_id)
    .fetch_all(&mut *conn)
    .await?;
    for (story_id, title, key) in starts {
        let Ok(slot) = VisualSlot::parse(&key) else {
            continue;
        };
        let what = describe(conn, &story_id, &slot).await?;
        out.push(AssetUsage {
            story_id,
            story_title: title,
            slot: key,
            place: format!("{what} (story start)"),
            in_history: true,
        });
    }

    let edits: Vec<(String, String, String, String)> = sqlx::query_as(
        "SELECT DISTINCT e.story_id, s.title, r.label, json_extract(c.value, '$.slot') \
         FROM events e \
         JOIN stories s ON s.id = e.story_id \
         JOIN routes r ON r.id = e.origin_route_id, \
         json_each(e.payload_json, '$.changes') c \
         WHERE e.kind = 'edit' \
           AND json_extract(c.value, '$.op') = 'setVisualRef' \
           AND json_extract(c.value, '$.assetId') = ? \
         ORDER BY s.title, r.label",
    )
    .bind(asset_id)
    .fetch_all(&mut *conn)
    .await?;
    for (story_id, title, route, key) in edits {
        let what = match VisualSlot::parse(&key) {
            Ok(slot) => describe(conn, &story_id, &slot).await?,
            Err(_) => "A picture".into(),
        };
        out.push(AssetUsage {
            story_id,
            story_title: title,
            slot: key,
            place: format!("{what} on route {route}"),
            in_history: true,
        });
    }
    Ok(out)
}

/// "Cover", "Background" or "Portrait of <name>".
async fn describe(
    conn: &mut SqliteConnection,
    story_id: &str,
    slot: &VisualSlot,
) -> AppResult<String> {
    Ok(match slot {
        VisualSlot::Cover => "Cover".into(),
        VisualSlot::Background => "Background".into(),
        VisualSlot::Portrait(id) => {
            format!("Portrait of {}", character_name(conn, story_id, id).await?)
        }
    })
}

async fn character_name(
    conn: &mut SqliteConnection,
    story_id: &str,
    character_id: &str,
) -> AppResult<String> {
    let base: Option<String> =
        sqlx::query_scalar("SELECT base_state_json FROM stories WHERE id = ?")
            .bind(story_id)
            .fetch_optional(&mut *conn)
            .await?;
    if let Some(name) = base
        .and_then(|b| StoryStateV1::from_json(&b).ok())
        .and_then(|s| s.characters.get(character_id).map(|c| c.name.clone()))
    {
        return Ok(name);
    }
    // A character added during play: use the latest name an edit gave them.
    let added: Option<String> = sqlx::query_scalar(
        "SELECT json_extract(c.value, '$.character.name') \
         FROM events e, json_each(e.payload_json, '$.changes') c \
         WHERE e.story_id = ? AND e.kind = 'edit' \
           AND json_extract(c.value, '$.op') = 'upsertCharacter' \
           AND json_extract(c.value, '$.character.id') = ? \
         ORDER BY e.created_at DESC, e.id DESC LIMIT 1",
    )
    .bind(story_id)
    .bind(character_id)
    .fetch_optional(&mut *conn)
    .await?;
    Ok(added.unwrap_or_else(|| "a character".into()))
}

/// Removes the image's row when nothing shows it. Returns the row so the
/// caller can remove the files after the commit.
pub async fn delete(db: &Database, id: &str) -> AppResult<AssetRow> {
    let mut tx = db.write_txn().await?;
    let row = find(&mut tx, id).await?.ok_or_else(|| {
        AppError::new(ErrorCode::AssetMissing, "that image is not in the library")
    })?;
    let used = usages(&mut tx, id).await?;
    if !used.is_empty() {
        let places: Vec<String> = used
            .iter()
            .take(3)
            .map(|u| format!("{} in “{}”", u.place, u.story_title))
            .collect();
        let more = used.len().saturating_sub(3);
        return Err(AppError::invalid_input(format!(
            "this image is still used: {}{}",
            places.join("; "),
            if more > 0 {
                format!("; and {more} more")
            } else {
                String::new()
            }
        )));
    }
    sqlx::query("DELETE FROM assets WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(row)
}

/// A story-default picture choice.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct StoryVisual {
    pub slot: String,
    pub asset_id: String,
}

pub async fn story_visuals(db: &Database, story_id: &str) -> AppResult<Vec<StoryVisual>> {
    let rows: Vec<(String, String, String, String)> = sqlx::query_as(
        "SELECT owner_type, owner_id, variant, asset_id FROM asset_links \
         WHERE story_id = ? ORDER BY owner_type DESC, owner_id, variant",
    )
    .bind(story_id)
    .fetch_all(db.reader())
    .await?;
    Ok(rows
        .into_iter()
        .filter_map(|(t, o, v, asset_id)| {
            VisualSlot::from_link(&t, &o, &v).map(|slot| StoryVisual {
                slot: slot.key(),
                asset_id,
            })
        })
        .collect())
}

/// Sets (or clears) one story-default picture inside a transaction. The
/// image must be one the story may show.
pub async fn set_link_tx(
    conn: &mut SqliteConnection,
    story_id: &str,
    slot: &VisualSlot,
    asset_id: Option<&str>,
) -> AppResult<()> {
    let (owner_type, owner_id, variant) = slot.link_owner(story_id);
    match asset_id {
        Some(asset_id) => {
            check_available(&mut *conn, asset_id, story_id).await?;
            sqlx::query(
                "INSERT INTO asset_links (id, story_id, asset_id, owner_type, owner_id, variant, created_at) \
                 VALUES (?, ?, ?, ?, ?, ?, ?) \
                 ON CONFLICT(story_id, owner_type, owner_id, variant) \
                 DO UPDATE SET asset_id = excluded.asset_id, created_at = excluded.created_at",
            )
            .bind(new_id())
            .bind(story_id)
            .bind(asset_id)
            .bind(owner_type)
            .bind(owner_id)
            .bind(variant)
            .bind(now())
            .execute(&mut *conn)
            .await?;
        }
        None => {
            sqlx::query(
                "DELETE FROM asset_links WHERE story_id = ? AND owner_type = ? AND owner_id = ? AND variant = ?",
            )
            .bind(story_id)
            .bind(owner_type)
            .bind(owner_id)
            .bind(variant)
            .execute(&mut *conn)
            .await?;
        }
    }
    Ok(())
}

/// Choose (or clear, with `None`) the story-default picture for a slot.
/// Defaults are presentation for every route; route-specific changes are
/// edit events instead.
pub async fn set_story_visual(
    db: &Database,
    story_id: &str,
    slot: &VisualSlot,
    asset_id: Option<&str>,
) -> AppResult<Vec<StoryVisual>> {
    let mut tx = db.write_txn().await?;
    let exists: Option<i64> = sqlx::query_scalar("SELECT 1 FROM stories WHERE id = ?")
        .bind(story_id)
        .fetch_optional(&mut *tx)
        .await?;
    if exists.is_none() {
        return Err(AppError::not_found(format!("story {story_id} not found")));
    }
    set_link_tx(&mut tx, story_id, slot, asset_id).await?;
    tx.commit().await?;
    story_visuals(db, story_id).await
}

/// Asset ids that stories point at but the library no longer has
/// (possible only after a damaged restore or a hand-edited database).
pub async fn dangling_refs(db: &Database) -> AppResult<Vec<String>> {
    Ok(sqlx::query_scalar(
        "SELECT DISTINCT json_extract(c.value, '$.assetId') \
         FROM events e, json_each(e.payload_json, '$.changes') c \
         WHERE e.kind = 'edit' AND json_extract(c.value, '$.op') = 'setVisualRef' \
           AND json_extract(c.value, '$.assetId') IS NOT NULL \
           AND json_extract(c.value, '$.assetId') NOT IN (SELECT id FROM assets) \
         UNION \
         SELECT DISTINCT j.value FROM stories s, json_each(s.base_state_json, '$.visualRefs') j \
         WHERE j.value NOT IN (SELECT id FROM assets)",
    )
    .fetch_all(db.reader())
    .await?)
}

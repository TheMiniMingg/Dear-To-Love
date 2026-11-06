//! The reusable local image library (roadmap section 10).
//!
//! Files are content-addressed by SHA-256 under `assets/originals` and
//! `assets/thumbs`. Bytes are validated by decoding them; the file name and
//! extension are never trusted, and only PNG, JPEG and WebP are accepted
//! (no SVG or HTML: nothing that can run script). Each file is written to a
//! temporary name, flushed and renamed into place before the database row
//! is added, so an interruption leaves at most an unused file, never a row
//! that points at nothing.

use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};

use image::codecs::jpeg::JpegEncoder;
use image::metadata::Orientation;
use image::{DynamicImage, ImageDecoder, ImageFormat, ImageReader, Limits};
use sha2::{Digest, Sha256};

use crate::db::assets::{self, AssetDto, AssetRow, NewAsset};
use crate::db::{new_id, Database};
use crate::errors::{AppError, AppResult, ErrorCode};

/// Largest image file accepted (roadmap: 20 MB per image).
pub const MAX_IMAGE_BYTES: u64 = 20 * 1024 * 1024;
/// Largest width or height accepted.
pub const MAX_SIDE: u32 = 16_384;
/// Memory the decoder may use for one image (guards against tiny files that
/// claim huge dimensions).
const MAX_DECODE_ALLOC: u64 = 512 * 1024 * 1024;
/// Thumbnails fit in a square of this size.
pub const THUMB_SIDE: u32 = 320;
const THUMB_JPEG_QUALITY: u8 = 85;

/// Where the library keeps its files: `<app data>/assets`.
#[derive(Debug, Clone)]
pub struct AssetStore {
    root: PathBuf,
}

impl AssetStore {
    pub fn new(data_dir: &Path) -> Self {
        Self {
            root: data_dir.join("assets"),
        }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Absolute path of a stored relative path. Only paths this module
    /// wrote (`originals/<hash>.<ext>`, `thumbs/<hash>.<ext>`) are valid.
    pub fn path(&self, rel: &str) -> AppResult<PathBuf> {
        let ok = rel.split_once('/').is_some_and(|(dir, file)| {
            matches!(dir, "originals" | "thumbs")
                && !file.is_empty()
                && file.chars().all(|c| c.is_ascii_alphanumeric() || c == '.')
                && !file.starts_with('.')
        });
        if !ok {
            return Err(AppError::internal(format!("unexpected asset path {rel:?}")));
        }
        Ok(self.root.join(rel))
    }

    /// Writes `bytes` to `rel` through a flushed temp file and a rename.
    /// Content-addressed: an existing file of the right size is kept.
    fn put(&self, rel: &str, bytes: &[u8]) -> AppResult<()> {
        let dest = self.path(rel)?;
        if std::fs::metadata(&dest).is_ok_and(|m| m.is_file() && m.len() == bytes.len() as u64) {
            return Ok(());
        }
        let tmp_dir = self.root.join("tmp");
        std::fs::create_dir_all(&tmp_dir)?;
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let tmp = tmp_dir.join(format!("{}.part", new_id()));
        let result = (|| -> std::io::Result<()> {
            let mut f = std::fs::File::create(&tmp)?;
            f.write_all(bytes)?;
            f.sync_all()?;
            std::fs::rename(&tmp, &dest)
        })();
        if result.is_err() {
            let _ = std::fs::remove_file(&tmp);
        }
        result?;
        Ok(())
    }
}

/// A validated image and its thumbnail, ready to store.
pub struct Decoded {
    pub mime: &'static str,
    pub ext: &'static str,
    pub width: u32,
    pub height: u32,
    pub thumb: Vec<u8>,
    pub thumb_ext: &'static str,
}

fn not_an_image() -> AppError {
    AppError::invalid_input("this file isn't a PNG, JPEG or WebP image")
}

/// Decodes the whole image (so damaged or disguised files are refused),
/// applies its orientation, and renders a thumbnail.
pub fn decode(bytes: &[u8]) -> AppResult<Decoded> {
    let reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| not_an_image())?;
    let (mime, ext) = match reader.format() {
        Some(ImageFormat::Png) => ("image/png", "png"),
        Some(ImageFormat::Jpeg) => ("image/jpeg", "jpg"),
        Some(ImageFormat::WebP) => ("image/webp", "webp"),
        _ => return Err(not_an_image()),
    };
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_SIDE);
    limits.max_image_height = Some(MAX_SIDE);
    limits.max_alloc = Some(MAX_DECODE_ALLOC);
    let mut reader = reader;
    reader.limits(limits);
    let too_big = || {
        AppError::invalid_input(format!(
            "this image is too large (at most {MAX_SIDE} × {MAX_SIDE} pixels)"
        ))
    };
    let mut decoder = reader.into_decoder().map_err(|e| match e {
        image::ImageError::Limits(_) => too_big(),
        _ => not_an_image(),
    })?;
    let orientation = decoder.orientation().unwrap_or(Orientation::NoTransforms);
    let mut img = DynamicImage::from_decoder(decoder).map_err(|e| match e {
        image::ImageError::Limits(_) => too_big(),
        _ => not_an_image(),
    })?;
    img.apply_orientation(orientation);
    let (width, height) = (img.width(), img.height());
    if width == 0 || height == 0 {
        return Err(not_an_image());
    }

    let small = if width > THUMB_SIDE || height > THUMB_SIDE {
        img.thumbnail(THUMB_SIDE, THUMB_SIDE)
    } else {
        img
    };
    let mut thumb = Vec::new();
    let thumb_ext = if small.color().has_alpha() {
        small
            .write_to(&mut Cursor::new(&mut thumb), ImageFormat::Png)
            .map_err(|e| AppError::internal(format!("could not make a thumbnail: {e}")))?;
        "png"
    } else {
        JpegEncoder::new_with_quality(&mut thumb, THUMB_JPEG_QUALITY)
            .encode_image(&small.to_rgb8())
            .map_err(|e| AppError::internal(format!("could not make a thumbnail: {e}")))?;
        "jpg"
    };
    Ok(Decoded {
        mime,
        ext,
        width,
        height,
        thumb,
        thumb_ext,
    })
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

/// The result of adding one image.
#[derive(Debug, Clone)]
pub struct Imported {
    pub asset: AssetDto,
    /// The same bytes were already in the library; that image is reused.
    pub already_in_library: bool,
}

/// Adds an image from memory. The same bytes twice give the same library
/// image (one stored file); every story link to it stays independent.
pub async fn import_bytes(
    db: &Database,
    store: &AssetStore,
    bytes: Vec<u8>,
    label: &str,
) -> AppResult<Imported> {
    if bytes.is_empty() {
        return Err(not_an_image());
    }
    if bytes.len() as u64 > MAX_IMAGE_BYTES {
        return Err(AppError::invalid_input(format!(
            "this image is larger than {} MB",
            MAX_IMAGE_BYTES / (1024 * 1024)
        )));
    }
    let sha = sha256_hex(&bytes);
    if let Some(row) = assets::by_sha(db, &sha).await? {
        // Same picture: reuse it, and put back a file that went missing.
        let fixed = repair_files(store, &row, bytes).await;
        if let Err(e) = fixed {
            eprintln!(
                "could not restore image files for {}: {}",
                row.id, e.message
            );
        }
        return Ok(Imported {
            asset: row.to_dto(),
            already_in_library: true,
        });
    }

    let (bytes, decoded) = tokio::task::spawn_blocking(move || {
        let d = decode(&bytes);
        (bytes, d)
    })
    .await
    .map_err(|e| AppError::internal(e.to_string()))?;
    let decoded = decoded?;
    let original_rel = format!("originals/{sha}.{}", decoded.ext);
    let thumb_rel = format!("thumbs/{sha}.{}", decoded.thumb_ext);
    {
        let store = store.clone();
        let (o, t) = (original_rel.clone(), thumb_rel.clone());
        let thumb = decoded.thumb.clone();
        let original = bytes.clone();
        tokio::task::spawn_blocking(move || -> AppResult<()> {
            store.put(&o, &original)?;
            store.put(&t, &thumb)
        })
        .await
        .map_err(|e| AppError::internal(e.to_string()))??;
    }
    let (row, inserted) = assets::insert_or_existing(
        db,
        NewAsset {
            sha256: &sha,
            original_rel: &original_rel,
            thumb_rel: Some(&thumb_rel),
            mime: decoded.mime,
            width: decoded.width,
            height: decoded.height,
            byte_size: bytes.len() as u64,
            label,
        },
    )
    .await?;
    Ok(Imported {
        asset: row.to_dto(),
        already_in_library: !inserted,
    })
}

/// Reads and adds one image file. The name (without extension) becomes the
/// image's label.
pub async fn import_file(db: &Database, store: &AssetStore, path: &Path) -> AppResult<Imported> {
    let meta = tokio::fs::metadata(path)
        .await
        .map_err(|_| AppError::new(ErrorCode::Io, "the file could not be opened"))?;
    if !meta.is_file() {
        return Err(AppError::invalid_input("that is not a file"));
    }
    if meta.len() > MAX_IMAGE_BYTES {
        return Err(AppError::invalid_input(format!(
            "this image is larger than {} MB",
            MAX_IMAGE_BYTES / (1024 * 1024)
        )));
    }
    let bytes = tokio::fs::read(path).await?;
    let label = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();
    import_bytes(db, store, bytes, &label).await
}

async fn repair_files(store: &AssetStore, row: &AssetRow, bytes: Vec<u8>) -> AppResult<()> {
    let store = store.clone();
    let row = row.clone();
    tokio::task::spawn_blocking(move || -> AppResult<()> {
        store.put(&row.original_rel, &bytes)?;
        if let Some(t) = &row.thumb_rel {
            if !store.path(t)?.is_file() {
                let d = decode(&bytes)?;
                store.put(t, &d.thumb)?;
            }
        }
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(e.to_string()))?
}

/// Deletes an image nothing shows any more, then its files. A file that
/// can't be removed is left behind (harmless) rather than failing.
pub async fn delete(db: &Database, store: &AssetStore, id: &str) -> AppResult<()> {
    let row = assets::delete(db, id).await?;
    for rel in std::iter::once(&row.original_rel).chain(row.thumb_rel.iter()) {
        if let Ok(p) = store.path(rel) {
            let _ = std::fs::remove_file(p);
        }
    }
    Ok(())
}

/// Which file of an image to serve.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Size {
    Thumb,
    Full,
}

/// The bytes and type of an image file, for the `dtlimg:` protocol.
/// `None` when the image or its file is missing.
pub async fn load(
    db: &Database,
    store: &AssetStore,
    id: &str,
    size: Size,
) -> AppResult<Option<(String, Vec<u8>)>> {
    let mut conn = db.reader().acquire().await?;
    let Some(row) = assets::find(&mut conn, id).await? else {
        return Ok(None);
    };
    drop(conn);
    let (rel, mime) = match (size, &row.thumb_rel) {
        (Size::Thumb, Some(t)) => (t.clone(), thumb_mime(t)),
        _ => (row.original_rel.clone(), row.mime.clone()),
    };
    match tokio::fs::read(store.path(&rel)?).await {
        Ok(bytes) => Ok(Some((mime, bytes))),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.into()),
    }
}

fn thumb_mime(rel: &str) -> String {
    if rel.ends_with(".png") {
        "image/png".into()
    } else {
        "image/jpeg".into()
    }
}

/// Library problems for Diagnostics: missing or damaged files, and story
/// references to images that are gone. `deep` also re-hashes originals.
pub async fn check(db: &Database, store: &AssetStore, deep: bool) -> AppResult<AssetReport> {
    let rows = assets::all_rows(db).await?;
    let mut report = AssetReport {
        images: rows.len(),
        ..Default::default()
    };
    for row in rows {
        let original = store.path(&row.original_rel)?;
        match std::fs::metadata(&original) {
            Ok(m) if m.len() == row.byte_size as u64 => {
                if deep {
                    let bytes = std::fs::read(&original)?;
                    if sha256_hex(&bytes) != row.sha256 {
                        report.damaged.push(row.id.clone());
                    }
                }
            }
            Ok(_) => report.damaged.push(row.id.clone()),
            Err(_) => report.missing.push(row.id.clone()),
        }
        if let Some(t) = &row.thumb_rel {
            if !store.path(t)?.is_file() {
                report.missing_thumbs.push(row.id.clone());
            }
        }
    }
    report.dangling = assets::dangling_refs(db).await?;
    Ok(report)
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct AssetReport {
    pub images: usize,
    pub missing: Vec<String>,
    pub damaged: Vec<String>,
    pub missing_thumbs: Vec<String>,
    /// Asset ids referenced by stories but not in the library.
    pub dangling: Vec<String>,
}

#[cfg(test)]
mod tests;

//! Free space on the disk that holds the app's data. A full disk is the
//! one storage limit a player can actually hit: SQLite itself holds far
//! more than any story needs.

use std::path::Path;

/// Below this, Diagnostics warns.
pub const LOW_SPACE_BYTES: u64 = 1024 * 1024 * 1024;
/// Below this, Diagnostics fails and automatic backups are skipped so the
/// last few megabytes stay available for the story itself.
pub const CRITICAL_SPACE_BYTES: u64 = 200 * 1024 * 1024;

/// Bytes free for this user on the disk holding `path` (or its nearest
/// existing parent). `None` when the system cannot tell.
pub fn free_space(path: &Path) -> Option<u64> {
    let mut p = Some(path);
    while let Some(dir) = p {
        if dir.exists() {
            return fs4::available_space(dir).ok();
        }
        p = dir.parent();
    }
    None
}

/// "512 MB", "3.4 GB".
pub fn format_bytes(n: u64) -> String {
    const MB: f64 = 1024.0 * 1024.0;
    let mb = n as f64 / MB;
    if mb < 1024.0 {
        format!("{} MB", mb.round() as u64)
    } else {
        format!("{:.1} GB", mb / 1024.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn measures_the_nearest_existing_folder() {
        let dir = tempfile::tempdir().unwrap();
        let missing = dir.path().join("not/yet/created");
        assert!(free_space(&missing).is_some_and(|n| n > 0));
    }

    #[test]
    fn formats_sizes() {
        assert_eq!(format_bytes(200 * 1024 * 1024), "200 MB");
        assert_eq!(
            format_bytes(3 * 1024 * 1024 * 1024 + 400 * 1024 * 1024),
            "3.4 GB"
        );
    }
}

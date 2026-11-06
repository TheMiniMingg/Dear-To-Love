//! Health checks. Each check is a small function that performs real work
//! and reports PASS / WARN / FAIL / SKIPPED with remediation text.
//! Checks never mutate user stories and never make network calls unless
//! the user explicitly requests a connection test.

use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::Instant;

use crate::domain::diagnostics::{CheckStatus, DiagnosticCheck};

/// Everything the checks need, gathered by the command layer so the checks
/// themselves stay testable without a running Tauri app.
pub struct DiagnosticsContext {
    pub version: String,
    /// `Err` holds the reason the app-data directory could not be resolved.
    pub data_dir: Result<PathBuf, String>,
}

pub fn run_all(ctx: &DiagnosticsContext) -> Vec<DiagnosticCheck> {
    vec![
        check_app_version(&ctx.version),
        check_data_dir(&ctx.data_dir),
    ]
}

fn timed(
    id: &str,
    label: &str,
    f: impl FnOnce() -> (CheckStatus, String, Option<String>),
) -> DiagnosticCheck {
    let start = Instant::now();
    let (status, summary, remediation) = f();
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
}

use serde::Serialize;
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AppInfo {
    pub name: String,
    /// Packaged SemVer from `tauri.conf.json` (single source of truth).
    pub version: String,
    pub os: String,
    pub arch: String,
    pub build_profile: BuildProfile,
    /// The public repository, for the About section.
    pub repository_url: String,
    /// "Support development" link, only when one is configured.
    pub support_url: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum BuildProfile {
    Debug,
    Release,
}

impl BuildProfile {
    pub fn current() -> Self {
        if cfg!(debug_assertions) {
            Self::Debug
        } else {
            Self::Release
        }
    }
}

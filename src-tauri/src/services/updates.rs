//! Update notice and public links (roadmap section 12).
//!
//! Checks are opt-in. When on, the app asks GitHub for the configured
//! repository's releases at most once a day; "Check now" always works. Only
//! stable releases count (no drafts, no prereleases, no SemVer pre-release
//! tags), compared as numbers, never as strings, and only a release page on
//! that repository is ever opened. Nothing is installed automatically, and a
//! failed check is reported in Settings, never as a startup error.

use std::sync::OnceLock;
use std::time::Duration;

use chrono::{DateTime, Utc};
use semver::Version;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::db::prefs::{get_pref, set_pref};
use crate::db::Database;
use crate::errors::{AppError, AppResult};

pub const GITHUB_API: &str = "https://api.github.com";
const TIMEOUT: Duration = Duration::from_secs(8);
const MAX_BODY: usize = 5 * 1024 * 1024;
/// A successful check is reused for a day, a failed one for an hour.
const FRESH_HOURS: i64 = 24;
const RETRY_HOURS: i64 = 1;
const SETTINGS_KEY: &str = "update_settings";
const CACHE_KEY: &str = "update_cache";

// ------------------------------------------------------------ public links

/// `config/public-links.json`, checked into the repository.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PublicLinks {
    pub owner: String,
    pub repo: String,
    /// Shown as "Support development" only when it is a plain HTTPS URL.
    pub donation_url: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LinksFile {
    repository: RepoRef,
    #[serde(default)]
    donation_url: Option<String>,
}

#[derive(Deserialize)]
struct RepoRef {
    owner: String,
    repo: String,
}

fn github_name(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 100
        && s != "."
        && s != ".."
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

/// An HTTPS URL with a host and no user name or password, or `None`.
pub fn safe_https_url(raw: &str) -> Option<String> {
    let u = url::Url::parse(raw.trim()).ok()?;
    (u.scheme() == "https"
        && u.host_str().is_some_and(|h| !h.is_empty())
        && u.username().is_empty()
        && u.password().is_none())
    .then(|| u.to_string())
}

pub fn parse_links(json: &str) -> AppResult<PublicLinks> {
    let f: LinksFile = serde_json::from_str(json)
        .map_err(|e| AppError::internal(format!("public-links.json is invalid: {e}")))?;
    if !github_name(&f.repository.owner) || !github_name(&f.repository.repo) {
        return Err(AppError::internal(
            "public-links.json names an invalid repository",
        ));
    }
    Ok(PublicLinks {
        owner: f.repository.owner,
        repo: f.repository.repo,
        donation_url: f.donation_url.as_deref().and_then(safe_https_url),
    })
}

/// The links shipped with this build.
pub fn public_links() -> &'static PublicLinks {
    static LINKS: OnceLock<PublicLinks> = OnceLock::new();
    LINKS.get_or_init(|| {
        parse_links(include_str!("../../../config/public-links.json"))
            .expect("config/public-links.json is checked by the test suite")
    })
}

// ---------------------------------------------------------------- releases

/// One entry of `GET /repos/{owner}/{repo}/releases`.
#[derive(Debug, Clone, Deserialize)]
pub struct GhRelease {
    pub tag_name: String,
    pub html_url: String,
    #[serde(default)]
    pub draft: bool,
    #[serde(default)]
    pub prerelease: bool,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub published_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ReleaseInfo {
    /// Plain SemVer, without a leading "v".
    pub version: String,
    /// The release page on GitHub.
    pub url: String,
    pub name: Option<String>,
    pub published_at: Option<String>,
}

/// A stable SemVer from a tag like `v1.2.3` or `1.2.3`.
pub fn stable_version(tag: &str) -> Option<Version> {
    let t = tag.trim();
    let t = t.strip_prefix(['v', 'V']).unwrap_or(t);
    Version::parse(t).ok().filter(|v| v.pre.is_empty())
}

/// True for `https://github.com/{owner}/{repo}/releases/...` and nothing else.
pub fn is_release_page(raw: &str, owner: &str, repo: &str) -> bool {
    let Ok(u) = url::Url::parse(raw) else {
        return false;
    };
    if u.scheme() != "https"
        || u.host_str() != Some("github.com")
        || u.port().is_some()
        || !u.username().is_empty()
        || u.password().is_some()
    {
        return false;
    }
    let segs: Vec<&str> = u.path_segments().map(|s| s.collect()).unwrap_or_default();
    segs.len() >= 3
        && segs[0].eq_ignore_ascii_case(owner)
        && segs[1].eq_ignore_ascii_case(repo)
        && segs[2] == "releases"
}

/// The highest stable release on the page, by SemVer (T45). Drafts,
/// prereleases, unparseable tags and releases whose page isn't on the
/// configured repository are ignored (T46).
pub fn pick_release(releases: &[GhRelease], owner: &str, repo: &str) -> Option<ReleaseInfo> {
    releases
        .iter()
        .filter(|r| !r.draft && !r.prerelease)
        .filter(|r| is_release_page(&r.html_url, owner, repo))
        .filter_map(|r| stable_version(&r.tag_name).map(|v| (v, r)))
        .max_by(|a, b| a.0.cmp(&b.0))
        .map(|(v, r)| ReleaseInfo {
            version: v.to_string(),
            url: r.html_url.clone(),
            name: r.name.clone().filter(|n| !n.trim().is_empty()),
            published_at: r.published_at.clone(),
        })
}

// ------------------------------------------------------------------ state

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Settings {
    #[serde(default)]
    enabled: bool,
    /// The highest version whose notice was dismissed.
    #[serde(default)]
    acknowledged: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Cache {
    checked_at: String,
    latest: Option<ReleaseInfo>,
    error: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum UpdateState {
    /// Automatic checks are off and nothing was checked by hand.
    Off,
    NotChecked,
    UpToDate,
    Available,
    /// The last check failed (offline, GitHub unavailable).
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct UpdateStatus {
    /// Automatic daily checks (opt-in).
    pub enabled: bool,
    pub installed: String,
    pub state: UpdateState,
    /// The newest stable release seen, if any.
    pub latest: Option<ReleaseInfo>,
    pub checked_at: Option<String>,
    /// Why the last check failed.
    pub message: Option<String>,
    pub acknowledged: Option<String>,
    /// Show the notice: checks are on, and a release is newer than both the
    /// installed version and the last one dismissed (T42, T43).
    pub show_notice: bool,
}

fn newer(candidate: &str, than: Option<&str>) -> bool {
    match (Version::parse(candidate), than.map(Version::parse)) {
        (Ok(c), Some(Ok(t))) => c > t,
        (Ok(_), None) => true,
        _ => false,
    }
}

fn status_of(installed: &str, s: &Settings, cache: Option<&Cache>) -> UpdateStatus {
    let latest = cache.and_then(|c| c.latest.clone());
    let available = latest
        .as_ref()
        .is_some_and(|l| newer(&l.version, Some(installed)));
    let state = match cache {
        None if s.enabled => UpdateState::NotChecked,
        None => UpdateState::Off,
        Some(c) if c.error.is_some() => UpdateState::Unavailable,
        Some(_) if available => UpdateState::Available,
        Some(_) => UpdateState::UpToDate,
    };
    UpdateStatus {
        enabled: s.enabled,
        installed: installed.to_string(),
        state,
        show_notice: s.enabled
            && available
            && latest
                .as_ref()
                .is_some_and(|l| newer(&l.version, s.acknowledged.as_deref())),
        latest,
        checked_at: cache.map(|c| c.checked_at.clone()),
        message: cache.and_then(|c| c.error.clone()),
        acknowledged: s.acknowledged.clone(),
    }
}

async fn load(db: &Database) -> AppResult<(Settings, Option<Cache>)> {
    let mut conn = db.reader().acquire().await?;
    let s = get_pref::<Settings>(&mut conn, SETTINGS_KEY)
        .await?
        .unwrap_or_default();
    let c = get_pref::<Cache>(&mut conn, CACHE_KEY).await?;
    Ok((s, c))
}

/// What is known now. Never touches the network.
pub async fn status(db: &Database, installed: &str) -> AppResult<UpdateStatus> {
    let (s, c) = load(db).await?;
    Ok(status_of(installed, &s, c.as_ref()))
}

pub async fn set_enabled(db: &Database, installed: &str, enabled: bool) -> AppResult<UpdateStatus> {
    let mut tx = db.write_txn().await?;
    let mut s = get_pref::<Settings>(&mut tx, SETTINGS_KEY)
        .await?
        .unwrap_or_default();
    s.enabled = enabled;
    set_pref(&mut tx, SETTINGS_KEY, &s).await?;
    tx.commit().await?;
    status(db, installed).await
}

/// Hide the notice for `version` and everything older (T43).
pub async fn acknowledge(db: &Database, installed: &str, version: &str) -> AppResult<UpdateStatus> {
    let v = Version::parse(version)
        .map_err(|_| AppError::invalid_input(format!("{version} is not a version number")))?;
    let mut tx = db.write_txn().await?;
    let mut s = get_pref::<Settings>(&mut tx, SETTINGS_KEY)
        .await?
        .unwrap_or_default();
    if newer(&v.to_string(), s.acknowledged.as_deref()) {
        s.acknowledged = Some(v.to_string());
        set_pref(&mut tx, SETTINGS_KEY, &s).await?;
    }
    tx.commit().await?;
    status(db, installed).await
}

fn fresh(c: &Cache, now: DateTime<Utc>) -> bool {
    let Ok(at) = DateTime::parse_from_rfc3339(&c.checked_at) else {
        return false;
    };
    let age = now.signed_duration_since(at.with_timezone(&Utc));
    let limit = if c.error.is_some() {
        RETRY_HOURS
    } else {
        FRESH_HOURS
    };
    age >= chrono::Duration::zero() && age < chrono::Duration::hours(limit)
}

/// `GET {api}/repos/{owner}/{repo}/releases?per_page=100`, 8 s at most.
pub async fn fetch_releases(api: &str, owner: &str, repo: &str) -> Result<Vec<GhRelease>, String> {
    let mut builder = reqwest::Client::builder()
        .timeout(TIMEOUT)
        .user_agent(concat!("DearToLove/", env!("CARGO_PKG_VERSION")));
    if crate::domain::provider::is_loopback(api) {
        builder = builder.no_proxy();
    }
    let client = builder
        .build()
        .map_err(|e| format!("could not start the check ({e})"))?;
    let url = format!(
        "{}/repos/{owner}/{repo}/releases?per_page=100",
        api.trim_end_matches('/')
    );
    let mut res = client
        .get(&url)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                "GitHub did not answer in time".to_string()
            } else {
                "GitHub could not be reached".to_string()
            }
        })?;
    if !res.status().is_success() {
        return Err(format!("GitHub answered {}", res.status().as_u16()));
    }
    let mut body = Vec::new();
    while let Some(chunk) = res
        .chunk()
        .await
        .map_err(|_| "the release list was cut off".to_string())?
    {
        body.extend_from_slice(&chunk);
        if body.len() > MAX_BODY {
            return Err("the release list is too large".into());
        }
    }
    serde_json::from_slice(&body).map_err(|_| "the release list could not be read".into())
}

/// Check GitHub for a newer release. Automatic checks (`manual == false`)
/// do nothing while checks are off (T44) and reuse a recent result; a
/// manual check always asks. A failure is stored and reported, not raised.
pub async fn check(
    db: &Database,
    installed: &str,
    api: &str,
    links: &PublicLinks,
    manual: bool,
    now: DateTime<Utc>,
) -> AppResult<UpdateStatus> {
    let (s, cache) = load(db).await?;
    if !manual && (!s.enabled || cache.as_ref().is_some_and(|c| fresh(c, now))) {
        return Ok(status_of(installed, &s, cache.as_ref()));
    }
    let next = match fetch_releases(api, &links.owner, &links.repo).await {
        Ok(list) => Cache {
            checked_at: now.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            latest: pick_release(&list, &links.owner, &links.repo),
            error: None,
        },
        Err(e) => Cache {
            checked_at: now.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            latest: cache.and_then(|c| c.latest),
            error: Some(e),
        },
    };
    let mut tx = db.write_txn().await?;
    set_pref(&mut tx, CACHE_KEY, &next).await?;
    tx.commit().await?;
    status(db, installed).await
}

/// The release page to open, only when it is on the configured repository.
pub async fn release_page(
    db: &Database,
    installed: &str,
    links: &PublicLinks,
) -> AppResult<String> {
    let st = status(db, installed).await?;
    st.latest
        .map(|l| l.url)
        .filter(|u| is_release_page(u, &links.owner, &links.repo))
        .ok_or_else(|| AppError::not_found("there is no release page to open"))
}

/// The GitHub API base. Debug builds may point it at a local test server
/// with `DTL_RELEASES_API`; release builds always use GitHub.
pub fn releases_api() -> String {
    #[cfg(debug_assertions)]
    if let Ok(u) = std::env::var("DTL_RELEASES_API") {
        if !u.trim().is_empty() {
            return u;
        }
    }
    GITHUB_API.to_string()
}

#[cfg(test)]
mod tests;

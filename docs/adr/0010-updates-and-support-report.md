# ADR 0010: Update notice, support link and diagnostics report

Status: accepted (PR 12)

## Context

Roadmap §12 and M9 ask for an installed-version footer, opt-in update
notifications from the public GitHub repository, an optional "Support
development" link, and a Diagnostics `Copy report` that strips keys, story
bodies and file system paths. T42–T47 and T50 are the acceptance tests. The
app is local-first: nothing may go online unless the user asks, and a
failed check must never get in the way of playing.

## Decision

- **Off by default.** `update_settings` (an `app_preferences` row) holds
  `enabled` and the highest acknowledged version. While checks are off the
  footer's daily check returns at once and sends nothing; **Check now** in
  Settings → Updates always works, once per press.
- **What is fetched.** `GET /repos/{owner}/{repo}/releases?per_page=100`
  from `api.github.com`, with no credentials, an 8 s timeout and a 5 MB
  limit. Owner and repository come from `config/public-links.json`, built
  into the binary. Drafts, prereleases, tags that aren't plain SemVer
  (`v1.2.3` or `1.2.3`) and releases whose `html_url` isn't
  `https://github.com/{owner}/{repo}/releases/...` are ignored; the highest
  remaining version wins by numeric SemVer, never by list order or string
  sort (T45, T46). Releases beyond the first 100 are not read; tags are
  expected to increase, so the newest are on the first page.
- **Cache.** `update_cache` keeps the last result for 24 hours (a failed
  check is retried after an hour). A failure keeps the last known release
  and is shown as "unavailable" in Settings and the UPDATES diagnostic, never
  as a startup error (T44).
- **Notice.** Shown in the footer, under the reader and its composer, only
  when checks are on and the release is newer than both the installed
  version and the acknowledged one. **Got it** stores that version; it only
  ever moves up, so an older release can't bring the notice back, and a
  later one shows again (T43). **View release** opens the release page in
  the system browser; the URL is checked again against the repository
  before it opens. Nothing is downloaded or installed.
- **Support link.** `donationUrl` in `config/public-links.json` must be a
  plain `https` URL without credentials, or it is dropped. With none, no
  link shows (T47). It opens in the system browser only.
- **Opening pages** goes through `tauri-plugin-opener` from Rust commands
  that build or check the URL themselves; the webview gets no opener
  permission, so it can't open arbitrary links.
- **Diagnostics report.** Built in Rust from the checks just run, plus the
  version, schema version, row counts, connection kinds and update state.
  It never reads story text, titles, prompts or keys. Every line then goes
  through `sanitize`: known private folders (app data, home, temp) become
  placeholders, other absolute paths become `<path>`, URLs lose credentials,
  query and fragment, and key-like tokens become `<redacted>` (T50). The
  dialog shows the whole report before **Copy report** or **Save as file…**;
  saving only accepts text that starts with the report header and is at most
  256 KB.
- **Testing.** Debug builds read `DTL_RELEASES_API` to point checks at a
  local server; release builds always use GitHub.

## Consequences

- No background service, telemetry or auto-update. Users who want updates
  turn checks on or press Check now.
- The notice can't cover the composer because it is part of the footer.
- Release tags must be SemVer for a release to be noticed; PR 13's release
  job checks that the tag matches the packaged version (T48).

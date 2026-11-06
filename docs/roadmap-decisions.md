# Roadmap V4: agreed changes

Decisions made on 2026-11-06 after reviewing `roadmap-v4.md`. Where this file
and the roadmap differ, this file wins.

## Behaviour

- **Retries:** provider adapters never retry internally. Every retry is a new
  generation run with its own `api_requests` ledger row (keeps
  `api_requests.generation_run_id` UNIQUE valid).
- **Deletion:** only whole stories can be deleted. Routes can be hidden, never
  deleted, because other routes may share their events.
- **Chapters:** a new chapter starts when the player chooses **Next chapter**,
  which appends a `chapter_start` event (using the next outline if one exists).
- **Templates:** four worlds, four scenarios and six characters ship with the
  creation wizard (PR 08). A scenario can name the worlds it was written for;
  pickers only offer fitting scenarios. The set grows as we build.
- **Creation modes:** Guided uses pickers, menus and checkboxes over preset
  values (no typing); Custom shows a text field for every value. Both edit the
  same draft, and a typed value shows in Guided as "Your own: ...". One
  unfinished wizard draft is kept at a time.
- **Route switching:** a minimal route switcher ships with the reader; the full
  Chapter & Route Picker comes later.
- **Regenerate:** each regenerate creates a route; the route list groups routes
  by fork point and can hide abandoned ones.
- **Images** are app-wide (one library for every story); stories link to
  them. A picture used in any earlier turn can't be deleted while that story
  exists, because events never change; story defaults can be cleared first.
  Expressions and outfits are tags for now, not separate slots.
- **Storypacks** carry the whole story only (no single-route packs); a
  route can be exported as Markdown or `.txt` instead. Importing makes a new
  story with new ids every time, sharing images already in the library.
  Image files placed by an import that was rolled back stay in the library
  folder (harmless, reused by hash) until a later cleanup.
- **Backups:** automatic copies hold the database only (images are
  content-addressed and stay in the library); **Back up everything**
  includes images. A restore always replaces everything and keeps the
  previous data as a "Before a restore" copy; the swap happens at the next
  start, never under an open database.
- **Search** covers the current route only (no whole-story search), matches
  every word in any order ignoring case, and scans the history without an
  index. **Bookmarks** belong to a route; a new branch copies the ones on the
  history it shares, and they travel in storypacks.
- **Releases** are drafts until a maintainer publishes them. The installer
  smoke test is the packaged app's own `--smoke-test` mode (no WebDriver), run
  around a reinstall; upgrading from a previous release is added once one
  exists. Signing is used when its secrets are configured.
- **Updates** are off until turned on; Check now always works. The newest of
  the first 100 releases wins by SemVer; drafts, prereleases and pages off the
  repository are ignored. The notice lives in the footer, and Got it stores the
  highest acknowledged version. There is no auto-update. The **diagnostics
  report** is built and sanitized in Rust and shown in full before it is copied
  or saved.
- **In-story edits** use one `edit` event per Apply, with a short note listing
  what changed (shown in the story). Facts added in Story details are
  confirmed facts; the `fact_confirm` event is kept for the later suggestion
  queue. Relationships are not edited directly yet; removing a character
  removes theirs.
- **Preview context** lives in the reader's pause menu, because it needs a
  route; it previews the next reply on the current route.
- **Budget:** the pause gate reserves each paid call's ceiling inside the
  ledger's write transaction, so parallel routes can't share headroom. A model
  without prices needs a one-time "Send once without a price"; summaries never
  override. The warning dismissal lasts until the month, level, limit or
  threshold changes. Only USD.
- **Summaries** roll forward at fixed turn numbers (every 8th reply, keeping 8+
  recent turns verbatim), so branches that share history share summaries.
  The offline storyteller uses an extractive summary with no API call.

## Schema and contracts

- Error enum adds `BUDGET_PAUSED`, `BUDGET_OVERRIDE_REQUIRED`, `NO_PROVIDER`
  (plus generic `NOT_FOUND`, `INVALID_INPUT`, `IO`, `DATABASE`, `INTERNAL`).
- Provider profiles carry a `billing` flag (`paid` | `local`); local means the
  API-charge estimate is $0 regardless of adapter.
- `api_rate_cards.provider_profile_id` is NOT NULL.
- `memory_caches` has no `route_id`; eligibility is by ancestry and source hash.
- Fact-extraction suggestions and AI character suggestions are deferred
  (the `character_suggestion` ledger purpose stays reserved).
- `saves.save_type` is one of `manual`, `quick`, `auto`; five rotating auto slots.
- `provider_profiles` is part of the first migration because the ledger
  references it.

## Tooling

- License: MIT.
- First live adapter: OpenAI-compatible chat completions.
- Rust to TypeScript DTOs: generated with `ts-rs` (see `docs/adr/0001-*`).

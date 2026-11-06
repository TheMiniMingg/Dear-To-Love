# Database schema

SQLite file `story.db` in the app data folder, opened in WAL mode with
foreign keys enabled on every connection. Migrations live in
`src-tauri/migrations/` and are embedded in the binary.

## Rules

- IDs are UUID v7 text generated in Rust; timestamps are UTC RFC 3339 with milliseconds.
- **Events never change.** A route moves only by advancing `routes.head_event_id`
  (compare-and-swap on `routes.version`) or by creating a new route.
- Route membership is ancestry from the route head, never `events.origin_route_id`.
- One writer: every write transaction uses `BEGIN IMMEDIATE` on a single-connection pool.
- Deleting a story cascades to everything it owns. The usage ledger
  (`api_requests`) keeps its rows; their `route_id` becomes NULL.
- Routes are hidden (`routes.hidden`), never deleted on their own.

## Tables (0001_core)

| Table               | Purpose                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `stories`           | Title, description and the immutable `base_state_json` (`StoryStateV1`)                                    |
| `chapter_outlines`  | Optional authored chapter plans; never route progress                                                      |
| `routes`            | Mutable head pointer + version per branch; one main route per story                                        |
| `events`            | Immutable story graph (`chapter_start`, `player`, `assistant`, `edit`, `checkpoint`, `fact_confirm`)       |
| `saves`             | Pointers to committed events (`manual`, `quick`, `auto`)                                                   |
| `snapshots`         | Cached replayed state per event; cache only, never source of truth                                         |
| `generation_runs`   | AI run state machine; one active run per route                                                             |
| `provider_profiles` | Model connections; `billing` is `paid` or `local`; API key lives in the OS credential store (`secret_ref`) |
| `api_rate_cards`    | User-entered USD prices per 1M tokens for a profile + model                                                |
| `api_requests`      | One row per outbound model call; the only source for usage totals                                          |
| `app_preferences`   | Schema-validated JSON preferences (budget policy, dismissals, drafts, update checks)                       |

## Tables (0002_memory_caches)

| Table           | Purpose                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `memory_caches` | Rolling story summaries. Replaceable cache, never canonical. No `route_id`: usable where `source_end_event_id` is an ancestor and `source_hash` still matches |

## Tables (0003_assets)

| Table         | Purpose                                                                                                                     |
| ------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `assets`      | One row per image file (SHA-256 unique): relative original and thumbnail paths, type, size, name, tags. See ADR 0006        |
| `asset_links` | Story-default pictures (`cover`, `background`, `portrait:<id>`). Route-specific choices are `setVisualRef` edits, not links |

## Tables (0004_archive_operations)

| Table                | Purpose                                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `archive_operations` | Storypack import journal: `staged`, `committed`, `complete`, `rolled_back` or `failed`, with the staging folder and story. See ADR 0007 |

## Tables (0005_bookmarks)

| Table       | Purpose                                                                                                                    |
| ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| `bookmarks` | A named place in one route's history (`route_id`, `event_id`, unique together); copied to branches that share it. ADR 0009 |

## Startup checks

`db::contract::verify` runs at startup and in Diagnostics: foreign keys on,
`foreign_key_check` clean, usage-ledger columns present, route heads and event
parents in the same story, exactly one main route per story, no parent cycles,
every save and bookmark points into its route's history, and every story summary points
into its own story. After the checks, unfinished storypack imports are
finished or rolled back and their staging folders removed. A confirmed
restore is swapped in before the database opens (ADR 0008).

## Upgrades

Before applying new migrations to an existing database, the app writes a
consistent copy (`VACUUM INTO`) to `backups/pre-migration-v<from>-<time>.db`.
A database created by a newer app version is refused, not modified.
`src-tauri/tests/fixtures/data_vN.sql` must exist for every migration.

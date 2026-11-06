# Local-First AI Story Engine - Engineering Roadmap V4 (Updated: API Usage & Budget)

**Status:** Implementation specification / ready for staged development  
**Revision:** 2026-11-05 / API usage and budget integration  
**Targets:** Windows, macOS, Linux desktop; no hosted backend  
**Primary stack:** Tauri 2, React + TypeScript + Vite, Rust, SQLite + SQLx  
**Release model:** Open-source GitHub repository, downloadable installers, user-provided AI configuration

## 00. Build contract, scope and non-goals

**Deliver:** A standalone, local-first desktop app for creating and playing AI-generated stories. Users can choose a bundled starter template or build a custom story; enter free-text actions; save mid-scene; restart a chapter as a new route; compare alternate routes; edit character/world settings without retroactively changing other routes; import portraits and backgrounds; and connect a supported remote API or local model endpoint. Include Diagnostics, an installed-version footer, opt-in update notifications, an optional external donation link, and a local API Usage & Budget screen with request-level estimates and user-controlled spending alerts.

**P0 - first playable vertical slice:** desktop shell, SQLite persistence, event graph, saves/forks, Quick Start creation, reader with keyboard controls, deterministic mock storyteller, one functioning API adapter, provider settings, basic diagnostics, recovery behavior, per-request API usage ledger.

**P1 - first public release:** guided/custom creators, bundled world/scenario/character templates, second adapter, narrative context/summaries, route-specific editor, reusable local image library, storypack import/export, user-friendly backups, text export, search/bookmarks, session/monthly/all-time usage views, editable model rate cards, monthly budget warning and optional pause-new-requests control, full Diagnostics, update notice and donation footer, signed/distributable installers.

**Deferred:** MCP client, community/online template marketplace, cloud sync, accounts, multiplayer, image generation, audio, animated characters, automatic executable installation, visual node timeline editor. Do not scaffold unused plug-in infrastructure.

**Non-negotiable invariants:**

1. Committed story events never mutate. A route changes only by advancing its head or by creating a fork. No historical save, regenerate, restart, or edit may rewrite another route.
2. Reconstructed state for event `E` contains only `E` and its ancestors. All characters, knowledge, chapters, summaries and assets obey this boundary.
3. The active chapter belongs to the *route history*, not an independent story-global completion flag.
4. Every AI response is either fully committed once or absent. Partial streamed text is a UI draft, not canonical history.
5. A failed/retried request never inserts the same player action twice. Different completed responses require separate routes.
6. The Rust domain layer owns canonical state; React state is a projection, not a second database.
7. A user without API keys or internet can create, read, edit, save, import/export and run all local Diagnostics; only AI generation is unavailable.
8. Image import/export, migrations, and backups must recover from process interruption without broken references.
9. App health checks and updates never block local story use. Network tests are explicit. Update checks are opt-in.
10. Key material is stored in OS secure storage, never in the story database, exported bundles, JS logs or support reports.
11. Every outbound paid model request (including retries and summarization) has one app-local ledger record. Unknown API usage is never silently represented as $0.
12. Budget limits are local, approximate controls, **not** guaranteed provider billing caps; users must use provider-side spend limits for an actual billing ceiling.

## 01. Architecture decisions and module boundaries

| Component | Technology | Owns / does not own |
|---|---|---|
| Desktop shell | Tauri 2 | Window lifecycle, OS dialogs, controlled external links, app version |
| Frontend | React + TypeScript + Vite | Screens, focus, editor drafts, streamed text, loading/errors; not canonical story data |
| UI store | Zustand | Local UI focus, modal state, composer draft, read position; not route graph |
| Rust commands | Tauri typed invocation | Input validation, authorization by story/route IDs, transactions, typed errors |
| Persistence | SQLite + SQLx | Stories, immutable events, mutable route-head pointers, saves, derived caches, app preferences |
| Timeline service | Pure Rust domain functions | Ancestor lookup, branch/restart/regenerate, deterministic state replay |
| AI service | Rust `reqwest`, Tauri Channel | Prompt creation, provider adapters, stream/cancel, provider usage metadata |
| Usage & budget service | Rust + SQLite request ledger | Per-call token usage, cost estimates, active reservations, monthly warning/pause rules; not provider billing data |
| Assets and archives | Rust filesystem + image decoder | Content-addressed images, staged imports, checksummed archives, recovery journal |
| Diagnostics | Rust checks + typed DTOs | Health tests per subsystem; pass/warn/fail/skipped and remediation |
| Release service | Rust HTTP (opt-in) | Fetch stable GitHub release metadata, validated URLs, SemVer notice state |

**Design rules:** Prefer simple modules with explicit interfaces, not a generic plug-in system. Rust validates all mutations and returns canonical IDs and route versions. Each write takes `expectedHeadId` or route `expectedVersion` and reports `HEAD_CHANGED` for stale actions. Generate TypeScript DTO definitions from Rust schemas or enforce one shared fixture/schema-validation pipeline; do not manually evolve two incompatible representations.

```text
React screens -> typed Tauri command wrappers
    -> Rust story_service  -> SQLx / SQLite
    -> Rust timeline_service -> event graph / replay / snapshots
    -> Rust prompt_service -> ancestor-only history and summaries
    -> Rust model_service  -> cloud API / local model endpoint
    -> Rust usage_service  -> API request ledger + local budget policy
    -> Rust asset_service  -> managed local original/thumb files
    -> Rust archive_service -> temp staging + import journal
    -> Rust diagnostics / release_check

app data (resolved via Tauri): story.db, assets/, backups/, exports/, logs/
OS credential store: provider secrets (never in story.db)
```

## 02. Repository structure and development baseline

```text
story-engine/
  README.md  LICENSE  CONTRIBUTING.md  CHANGELOG.md
  package.json  pnpm-lock.yaml  vite.config.ts
  config/public-links.json      # owner/repo and donation URL; checked into repo
  templates/v1/               # bundled local JSON, no online template feed
  src/
    app/                      # router, navigation/focus, top-level error handling
    features/
      library/ create/ reader/ routes/ saves/ characters/
      assets/ search/ settings/ usage/ diagnostics/ updates/
    components/               # ArrowPicker, SelectField, Dialog, StatusRow
    api/commands.ts           # typed invoke wrappers and channel subscription
    types/                    # generated DTOs/schema types
    tests/                    # component and focus behavior
  src-tauri/
    tauri.conf.json  capabilities/default.json  Cargo.toml
    migrations/               # sequential SQL migrations
    src/
      commands/  domain/  db/  services/  providers/  storage/
      errors.rs  lib.rs
    tests/                    # fixture DB, property, interrupted-write tests
  e2e/                        # WebdriverIO + Tauri-service tests
  docs/architecture.md  docs/schema.md  docs/dev.md  docs/recovery.md
  .github/workflows/ci.yml  .github/workflows/release.yml
```

**M0 setup:** Tauri scaffold (React/TypeScript); pinned Node LTS, pnpm lockfile, stable Rust toolchain; strict TypeScript; formatting/linting; `cargo fmt`, Clippy and Rust test runner; one `getAppInfo` command and mock `runDiagnostics` contract. Package a development binary early. CI runs on PRs from the first week; initially full installer smoke on one OS, then expand to all targets.

## 03. SQLite schema, constraints and ownership

**Storage policy:** UUID TEXT identifiers (Rust generated); UTC timestamps; JSON payloads validated by `serde`; relative asset paths only. Set `PRAGMA foreign_keys=ON` on **every connection**, WAL mode once where supported, and a busy timeout. Fail startup clearly on unsupported migration or corrupted DB and offer restore. Use a SQLite-native consistent backup method; never copy a live WAL DB by copying only `story.db`.

```sql
-- 0001_core.sql: abbreviated schema, implement migrations as checked-in files.
CREATE TABLE stories (
 id TEXT PRIMARY KEY, title TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '',
 base_state_json TEXT NOT NULL,
 schema_version INTEGER NOT NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE chapter_outlines (
 id TEXT PRIMARY KEY, story_id TEXT NOT NULL REFERENCES stories(id),
 ordinal INTEGER NOT NULL, title TEXT NOT NULL,
 outline TEXT NOT NULL DEFAULT '', UNIQUE(story_id,ordinal)
);
CREATE TABLE routes (
 id TEXT PRIMARY KEY, story_id TEXT NOT NULL REFERENCES stories(id),
 label TEXT NOT NULL, parent_route_id TEXT REFERENCES routes(id),
 fork_event_id TEXT, head_event_id TEXT,
 is_main INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX one_main_route_per_story ON routes(story_id)
 WHERE is_main = 1;
CREATE TABLE events (
 id TEXT PRIMARY KEY, story_id TEXT NOT NULL REFERENCES stories(id),
 origin_route_id TEXT NOT NULL REFERENCES routes(id),
 parent_event_id TEXT REFERENCES events(id),
 kind TEXT NOT NULL CHECK(kind IN
 ('chapter_start','player','assistant','edit','checkpoint','fact_confirm')),
 payload_json TEXT NOT NULL, generation_run_id TEXT,
 created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX one_committed_event_per_generation
 ON events(generation_run_id) WHERE generation_run_id IS NOT NULL;
CREATE INDEX events_parent_idx ON events(parent_event_id);
CREATE TABLE saves (
 id TEXT PRIMARY KEY, route_id TEXT NOT NULL REFERENCES routes(id),
 event_id TEXT NOT NULL REFERENCES events(id),
 label TEXT NOT NULL, save_type TEXT NOT NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE snapshots (
 event_id TEXT NOT NULL REFERENCES events(id), schema_version INTEGER NOT NULL,
 state_json TEXT NOT NULL, state_hash TEXT NOT NULL,
 created_at TEXT NOT NULL, PRIMARY KEY(event_id,schema_version)
);
CREATE TABLE generation_runs (
 id TEXT PRIMARY KEY, route_id TEXT NOT NULL REFERENCES routes(id),
 input_event_id TEXT NOT NULL REFERENCES events(id),
 provider_profile_id TEXT,
 status TEXT NOT NULL CHECK(status IN
 ('pending','streaming','completed','failed','cancelled','interrupted')),
 error_code TEXT, usage_json TEXT,
 created_at TEXT NOT NULL, finished_at TEXT
);
CREATE UNIQUE INDEX one_active_generation_per_route
 ON generation_runs(route_id)
 WHERE status IN ('pending','streaming');
```

**Follow-on migrations:** add provider metadata, image metadata/default links, bookmarks, summary caches, preferences and the import journal. Reference schema:

```sql
CREATE TABLE provider_profiles (
 id TEXT PRIMARY KEY, label TEXT NOT NULL, adapter TEXT NOT NULL,
 model_id TEXT NOT NULL, base_url TEXT, secret_ref TEXT,
 settings_json TEXT NOT NULL
);
CREATE TABLE assets (
 id TEXT PRIMARY KEY, sha256 TEXT NOT NULL UNIQUE,
 original_rel TEXT NOT NULL, thumb_rel TEXT,
 mime TEXT NOT NULL, width INTEGER, height INTEGER,
 tags_json TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE asset_links (
 id TEXT PRIMARY KEY, story_id TEXT NOT NULL REFERENCES stories(id),
 asset_id TEXT NOT NULL REFERENCES assets(id),
 owner_type TEXT NOT NULL, owner_id TEXT NOT NULL,
 variant TEXT NOT NULL,
 UNIQUE(story_id,owner_type,owner_id,variant)
);
CREATE TABLE bookmarks (
 id TEXT PRIMARY KEY, route_id TEXT NOT NULL REFERENCES routes(id),
 event_id TEXT NOT NULL REFERENCES events(id), label TEXT NOT NULL
);
CREATE TABLE memory_caches (
 id TEXT PRIMARY KEY, route_id TEXT NOT NULL REFERENCES routes(id),
 source_end_event_id TEXT NOT NULL REFERENCES events(id),
 source_hash TEXT NOT NULL, schema_version INTEGER NOT NULL,
 summary_text TEXT NOT NULL, scene_hint_json TEXT
);
CREATE TABLE app_preferences (
 key TEXT PRIMARY KEY, value_json TEXT NOT NULL
);
CREATE TABLE archive_operations (
 id TEXT PRIMARY KEY, stage_rel TEXT NOT NULL,
 status TEXT NOT NULL, manifest_json TEXT NOT NULL
);
CREATE TABLE api_rate_cards (
 id TEXT PRIMARY KEY,
 provider_profile_id TEXT REFERENCES provider_profiles(id),
 model_id TEXT NOT NULL,
 currency TEXT NOT NULL DEFAULT 'USD' CHECK(currency='USD'),
 input_usd_per_million TEXT NOT NULL,
 output_usd_per_million TEXT NOT NULL,
 cached_input_usd_per_million TEXT,
 effective_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX api_rate_lookup ON api_rate_cards(provider_profile_id,model_id,effective_at);
-- One row per actual outbound model call, including summaries and retries.
CREATE TABLE api_requests (
 id TEXT PRIMARY KEY,
 generation_run_id TEXT UNIQUE REFERENCES generation_runs(id) ON DELETE SET NULL,
 provider_profile_id TEXT REFERENCES provider_profiles(id),
 provider_label TEXT NOT NULL, model_id TEXT NOT NULL,
 session_id TEXT NOT NULL, route_id TEXT REFERENCES routes(id) ON DELETE SET NULL,
 purpose TEXT NOT NULL CHECK(purpose IN
   ('story_reply','memory_summary','character_suggestion','manual_test')),
 status TEXT NOT NULL CHECK(status IN
   ('reserved','sent','completed','failed','cancelled','unknown')),
 usage_source TEXT NOT NULL DEFAULT 'unknown' CHECK(usage_source IN
   ('provider','estimated','unknown')),
 input_tokens INTEGER, cached_input_tokens INTEGER, output_tokens INTEGER,
 cost_micro_usd INTEGER, reserved_micro_usd INTEGER NOT NULL DEFAULT 0,
 rate_snapshot_json TEXT, error_code TEXT,
 started_at TEXT NOT NULL, finished_at TEXT
);
CREATE INDEX api_requests_period_idx ON api_requests(started_at,provider_profile_id);
CREATE INDEX api_requests_session_idx ON api_requests(session_id);
```

These are domain minimums, not a complete migration dump. The `api_requests` table is the sole source for application usage totals; `generation_runs.usage_json` is provider response metadata and must not be summed separately. Each retry creates a fresh API request row, while a duplicated stream callback updates the same row idempotently. Deleting a model profile or route must not erase the historical app-level usage ledger: nullable foreign keys use `ON DELETE SET NULL`, with provider/model labels and rate snapshots preserved. An API request without a story generation run (e.g., background summary) still has its own ledger row. Store `budget_settings` and the current warning dismissal in `app_preferences` (schema-validated JSON). Add timestamps, foreign-key indexes and operation-stage metadata in implementation. Validate references and ancestry in Rust; `asset_links` represent story-default assignments while route-specific variants are event-scoped. Add indexes as measured. All FK membership and ancestry checks for route heads, saves, bookmarks, fork events and linked character IDs happen in Rust, as SQLite FKs cannot express ancestry.

**Do not store route-specific progress in `chapter_outlines`.** These are optional authored plans. Actual play chapters are `chapter_start` events whose payload contains `{chapterInstanceId,title,ordinal,sourceOutlineId?}`. A chapter view is reconstructed from active-route ancestors; optionally cache its index by `(routeHeadId, schemaVersion)` for speed. Two routes can have different Chapter 4 titles, states or endings without editing the outline.

**Usage ledger contract:** Rate cards belong to an exact profile/model pair and use user-entered decimal-string USD prices per 1 million tokens. Copy the selected rate values into `rate_snapshot_json` when each outbound call starts; editing prices must not rewrite historical estimates. Use integer micro-USD for computed per-call cost, with deterministic rounding. Null cost is **unknown**, never free. Do not export app-level usage/rates/budgets in `.storypack`; whole-app backups may preserve them.

**Schema contract checks at initialization:** cycle-free ancestor graph; every route head belongs to its story; every event parent is same story; exactly one main route for an initialized story; referenced saves/bookmarks point to ancestors; foreign keys enabled for each SQLx pool connection. Add migration fixtures for `v0.1 -> v0.2` before an actual upgrade exists, then retain them permanently.

## 04. Canonical story state and template types

**`StoryStateV1` - canonical shape (Rust serde struct, reflected to TS):**

```ts
type StoryStateV1 = {
 schemaVersion: 1;
 playerCharacterId: string;
 world: { era: string; setting: string; description: string; rules: string[] };
 narration: {
   perspective: 'first'|'second'|'third';
   detail: 'brief'|'balanced'|'detailed'|'cinematic';
   tone: string; pacing: 'fast'|'normal'|'slow';
 };
 characters: Record<string, {
   id: string; name: string; control: 'player'|'npc';
   gender?: string; pronouns?: string; age?: string;
   role?: string; description?: string; appearance?: string;
   personality: string[]; goals: string[]; abilities: string[];
 }>;
 relationships: Array<{
   fromId: string; toId: string; label: string; status: string;
   sourceEventId?: string;
 }>;
 knownFacts: Array<{
   id: string; text: string; knownBy: string[];
   sourceEventId?: string; confirmed: boolean;
 }>;
 scene: { location: string; summary: string; participantIds: string[] };
 openThreads: string[];
 visualRefs: Record<string, string>; // optional asset IDs by slot
};
```

**Ownership:** `base_state_json` is the original story configuration and becomes immutable once play begins. `chapter_start`, `edit`, and `fact_confirm` events modify the effective state *from that event forward*. Player/assistant narrative events remain canonical *history*; their prose does not silently modify every structured fact field. Candidate fact extraction may populate a noncanonical suggestion queue; accept/correct as an explicit event if structured canon is desired. A scene location that changes in narrative can be reflected by a **derived, source-bound scene hint** (or by an explicit user-confirmed edit); the initial `scene` field must not incorrectly override a newer scene seen in the narrative. Store the derived hint in `memory_caches` (not in canonical `events`); keep it removable and branch-safe.

**State reducer (`replayStoryState(base, ancestorEvents)`):** deterministic; versioned; typed event payload validation; applies explicit mutations in order; derives active chapter from last `chapter_start`; preserves player vs NPC distinction; computes hash from canonical sorted serialization. Store snapshots every configurable N committed events (e.g. 20) but always compare snapshot+suffix replay to full replay in tests. Snapshots are cache, never source of truth.

**Templates:** Three offline categories: **world**, **scenario**, **character**. Include four world, four scenario, and six character presets as *small* bundled JSON assets. Merge priority: application defaults < world < scenario < chosen characters < user's edits. Every object has `templateSchemaVersion`, deterministic validation, and namespaced IDs. When selected defaults conflict, show the final effective preview; do not quietly merge conflicting character IDs. No remote template browser or community contribution workflow.

```json
{
  "templateSchemaVersion": 1,
  "type": "character",
  "id": "starter:curious-detective",
  "character": {
    "name": "The Detective", "control": "player",
    "role": "Investigator", "personality": ["observant","patient"]
  }
}
```

**Wizard drafts:** save incomplete form data to local preferences/draft storage automatically, independent from completed stories. Quick Start needs no free text; Guided mode offers arrow cycling **and** select menus; Custom mode allows typed values. All three resolve to the same validated `CreateStoryDraft` DTO.

## 05. Event graph, routes, chapters and save semantics

**Graph model:** Each event has one `parent_event_id`. A route owns a mutable pointer to its current `head_event_id`. Forks do **not** copy old events; their starting head points to an ancestor that can originate on another route. Use `origin_route_id`, not `route_id`, for immutable event provenance. Never infer membership from provenance; membership is `isAncestor(eventId, route.headEventId)`.

**Pure operations (unit-test before UI):**

```text
ancestors(head) -> ordered root..head; detects cycles/cross-story parents
isAncestor(candidate, head) -> boolean
appendEvent(route, expectedHead, kind, payload) -> newHead + version
forkRoute(sourceRoute, eventId, name) -> newRoute(head = eventId)
restartChapter(route, chapterStartEventId) -> fork at chapter entry
viewSave(saveId) -> historical read-only state
resumeSave(saveId) -> current route if save is head, otherwise fork from save event
regenerateReply(route, assistantEventId) -> fork at that assistant's player parent
editPriorPlayerTurn(route, playerEventId) -> fork at its preceding event
```

**Transactions:** `BEGIN IMMEDIATE`; assert story/route/event membership and `expectedHead`; insert event; compare-and-swap route head/version; commit. A fork transaction validates its fork event is an ancestor of source route head. Two concurrent writes to the same head: exactly one succeeds. Label routes clearly (`Main`, `Alt 1`, user rename).

**Saves:** A manual/quick-save is a pointer to a committed event. Quick-save can update its own slot pointer; it never rewrites event rows. Autosave on completed turn and chapter start, with a bounded number of rotated auto slots; crash during an AI response leaves the player event as a valid recoverable head. During streaming, Save targets the last committed head and says so in the UI. Loading an older save presents `View history` or `Continue as new branch`, unless the saved event is already head.

**Chapter semantics:** `chapter_start` events carry `chapterInstanceId`, `ordinal`, `title` and optional outline reference. Route-scoped chapter list is generated from ancestors. Restart from chapter entry creates a new route and retains the original chapter outcome. Jumping to an earlier chapter to *play* forks; read-only chapter review does not modify the route. Never merge two divergent canonical histories implicitly.

## 06. AI generation state machine and idempotency

**Explicit states:** `pending -> streaming -> completed | failed | cancelled | interrupted`. A user action is committed **once** before generation. The generation run is durable and belongs to a fixed `(routeId, inputEventId, expectedHeadId, providerProfileId)`; the frontend screen switch does not change ownership.

```text
submitAction(route, expectedHead, text):
  txn: append player event; advance head; create pending generation run
  return {inputEventId, runId, routeVersion}

startGeneration(runId):
  assert route head == inputEventId and run active
  build prompt (ancestors of input only; latest player input appears once)
  mark streaming; issue provider request; stream *draft* chunks to UI

onSuccess(runId, finalText, usage):
  txn: CAS run status streaming -> completed;
       assert route head == inputEventId;
       append one assistant event with generation_run_id=runId;
       advance route head; persist usage; commit atomically

onFailureOrCancel(runId):
  mark failed/cancelled; leave player event as route head;
  allow retry via a NEW generation run referencing SAME player event

onAppStart():
  mark stranded pending/streaming runs interrupted;
  provide Retry / Edit Action / Fork without losing player text
```

**Exactly-once commitment:** `events.generation_run_id` unique. CAS on run state and head ensures late callbacks or cancellation races do not double-commit. Only one pending/streaming run per route via partial unique index; if retry creates a new run, previous run must be terminal first. If an onSuccess transaction cannot advance the head (for example, user chose another edit), rollback and mark the run `interrupted` in a separate transaction. The UI blocks editing the *same* route while its generation is active unless the user cancels it first; viewing or forking another route is allowed. Regenerating a completed reply forks from the player event, then generates on the fork. Editing an earlier player action forks from its predecessor and appends edited player text there.

**Error model:** `HEAD_CHANGED`, `INVALID_ANCESTOR`, `WRONG_STORY`, `RUN_NOT_ACTIVE`, `RUN_INTERRUPTED`, `PROVIDER_UNREACHABLE`, `AUTH_FAILED`, `RATE_LIMITED`, `CANCELLED`, `CONTEXT_TOO_LONG`, `MIGRATION_FAILED`, `ASSET_MISSING`, `ARCHIVE_INVALID`. Make Retry safe, never silently resubmit a paid request on app restart, and display that an interrupted provider call may have already incurred a cost.

## 07. Prompt assembly, continuity and long-story memory

**Prompt builder is deterministic and branch-scoped.** Inputs: route head event, effective state, configured provider capabilities and output budget. Order:

1. App roleplay/narration contract and player-agency rules.
2. Effective world rules, current chapter/scene, viewpoint/detail/tone.
3. Confirmed character roster, relationships and `knownBy` facts as of the route head.
4. Valid route-scoped summary caches with source ending event that is an ancestor of the head.
5. Most recent verbatim ancestor events in chronological order.
6. Latest player action **only if not already included** in step 5.

**Memory layers:** canonical event history; confirmed structured state from explicit edits/fact-confirm events; derived summaries and scene hints (replaceable caches with source-event IDs and `sourceHash`). A summary from one branch is ineligible for another if its source ending event is not an ancestor or its source hash mismatches. Default no cross-route retrieval. New summaries can be generated every ~8 completed turns, but failures cannot block play; include validation and cache-version metadata. Only user-confirmed structured edits affect authoritative state.

**Budgeting:** reserve provider output tokens; allocate priority to system/world rules, scene and latest player turns; trim older verbatim messages before dropping confirmed state; report `CONTEXT_TOO_LONG` with an actionable reduction if even minimum cannot fit. Cache per `(routeHeadId, promptSchemaVersion, providerCapabilityHash)` but invalidate with state edits. Do not expose hidden system credentials in Prompt Preview.

**Debug tools:** Settings -> AI -> `Preview Context` opens a local read-only display of the *exact assembled prompt* and token estimate (provider tokenizer when available, otherwise approximate). Show which source event ranges supplied each summary. Only send to model when user triggers generation. Prompt Preview stays local.

## 08. Model adapters, credentials and networking

**P0:** one configured cloud-style chat completion adapter supporting streamed text with request cancel and typed errors; check its actual wire protocol (so-called compatible APIs vary). **P1:** one local Ollama adapter and optional native adapter for a provider that requires a different API; avoid hardcoding OpenAI-specific payloads into the story engine. MCP is not required for model inference and stays deferred.

```ts
type ModelCapabilities = {
  streaming: boolean; maxContextTokens?: number;
  vision: boolean; jsonOutput: boolean; tools: boolean;
};
type GenerateRequest = {
  runId: string; profileId: string;
  messages: Array<{role:'system'|'user'|'assistant';content:string}>;
  maxOutputTokens: number; temperature?: number;
  timeoutMs: number;
};
type StreamMessage =
  | {type:'delta'; runId:string; seq:number; text:string}
  | {type:'usage'; runId:string; inputTokens?:number; cachedInputTokens?:number; outputTokens?:number}
  | {type:'done'; runId:string; finishReason:string}
  | {type:'error'; runId:string; code:string; message:string};
```

Provider settings: kind, profile label, URL, model ID, generation defaults, Test Connection. Rust stores keys in OS credential store and a non-secret reference in DB. Never send story content in connection checks. Handle API errors, timeouts, context limit, streaming chunk fragmentation, user cancellation, no model configured, and local server unavailable. Persist provider/model/usage metadata per run so a model switch does not alter prior events.

**Usage transport:** Provider adapters normalize any final usage report into input / cached-input / output tokens and label unsupported fields unknown. The Rust usage service writes one request-ledger row per actual provider call. Account for background summaries, retries, explicit paid tests, and optional AI-assisted character suggestions; do not count only visible story replies. Cost and budget logic are specified in Section 08A. No central proxy or creator-owned inference costs.

## 08A. API usage and budget controls (integrated V4 feature)

**User journey:** `Settings -> AI Usage & Budget` displays usage for **this app session**, **current UTC calendar month**, and **all time**. Filters: provider profile and model. Show input/output/cached tokens when available, number of API requests, the **estimated** USD total, and a distinct count of calls whose usage/cost is unknown. A compact reader status chip may show session estimate; clicking it opens the same screen. Local-model requests may show tokens but have **$0 API-charge estimate**, explicitly excluding electricity/hardware costs.

**Source-of-truth rules:**

1. Insert a ledger row **before** every outbound provider request, with a stable `apiRequestId` and purpose. Retry is a separate billed attempt and gets a new row; duplicate completion/usage events must not double-count. The generation run references this row only through `generation_run_id` (unique where present).
2. Prefer provider-reported usage. If an adapter has a supported token estimator, mark its values `estimated`; otherwise leave token/cost fields null and show `Unknown`. Output text length alone is not billing truth. Failed, interrupted or cancelled requests may still incur real charges even when no usage response arrives.
3. Store a **rate snapshot** per call. Initial release uses manually configurable rates in `USD per 1M input`, `USD per 1M output`, and optional `USD per 1M cached input`. No real-time price scraping or automatic billing-account access. Missing rates -> cost unknown. Cache discounts, provider-specific reasoning tokens and multimodal billing must be reflected only when the adapter exposes the needed categories; otherwise label cost as approximate.
4. Compute text-only estimates from normalized tokens and a rate snapshot: `noncached = max(0, input - cachedInput)`; `USD = (noncached*inputRate + cachedInput*cachedRate + output*outputRate)/1_000_000`. If a separate cached rate is absent, charge cached tokens at the normal input rate **for a conservative estimate**, and label that assumption. Store the rounded result in integer micro-USD. Never sum a run's metadata and its ledger row together.
5. Session starts at app launch and has a generated `sessionId`; calendar-month reporting uses a documented **UTC** boundary; all-time counts remain local. Current totals should show `known/estimated portion + N unknown calls` rather than presenting an incomplete dollar amount as complete. Changing a rate card only affects future requests.

**Budget policy (per app install, not per story):**

```ts
type BudgetPolicy = {
  enabled: boolean;
  currency: 'USD';
  monthlyLimitUsd: string | null;          // decimal-string, e.g. '5.00'
  warningThresholdPercent: number;        // initial default 80 (range 1..100)
  mode: 'warn' | 'pause_new_requests';     // initial default 'warn'
};
type UsageSummary = {
  scope: 'session' | 'month_utc' | 'all_time';
  providerProfileId?: string;
  inputTokens?: number; cachedInputTokens?: number; outputTokens?: number;
  requestCount: number; unknownCostRequestCount: number;
  estimatedCostMicroUsd: number; localModelRequestCount: number;
};
getUsageSummary(scope, providerFilter?): Promise<UsageSummary>;
listApiRequests(filters): Promise<ApiRequestRow[]>;
upsertRateCard(rate: RateCardDraft): Promise<RateCard>;
getBudgetPolicy(): Promise<BudgetPolicy>;
setBudgetPolicy(policy: BudgetPolicy): Promise<void>;
previewRequestCost(profileId, promptStats, maxOutputTokens): Promise<CostPreview>;
```

**Warning behavior:** With an enabled monthly budget, show a nonmodal warning when estimated month-to-date spending reaches the threshold (default **80%**); display the configured limit, estimated amount, remaining budget and number of unknown-cost calls. A user can dismiss a warning for the current UTC month, but a **new threshold crossing / higher warning severity** can reappear. Do not trigger a separate pop-up every narrative turn. Budget settings and dismissals persist across restarts; changing the limit re-evaluates the notification.

**Optional pause behavior:** If the user chooses `pause_new_requests`, run an **atomic preflight gate before any paid provider dispatch**: sum posted month-to-date cost plus reservations for active requests; estimate the prospective request using prompt tokens and configured `maxOutputTokens`; reject a new request with `BUDGET_PAUSED` when it would exceed the local monthly limit. Reserve that projected cost in SQLite for simultaneous routes and release/reconcile the reservation after completion. If pricing or token estimation is unavailable, require an explicit one-time override or rate configuration rather than silently claiming that the budget will hold. Background summaries and AI suggestions use the **same** gate. Do not abort an already-running request just because its estimate crosses the limit.

**Limitations, prominently shown:** These are best-effort **local controls**, not a provider's billing cap. Network disconnects, provider-side additional tokens, incomplete usage reporting, failed calls and charges incurred outside this app can exceed the displayed estimate. Recommend configuring any actual provider-side spending limit in the provider's dashboard. This app does **not** know API credit balance and cannot promise that a `$5` budget will stop provider billing at `$5`.

**UI contract:** Settings panel with a 3-period switcher; summary totals; per-model breakdown; scrollable recent-request ledger (`time, model, purpose, status, token counts, cost estimate, source`); **Edit Rates**; **Monthly Budget** toggle, USD field, 80% warning slider, and `Warn only / Pause new requests` selector. Show a readable legend for `Provider-reported`, `Estimated`, and `Unknown`; add a link to provider billing settings but do not require accounts or fetching their balance. Diagnostics adds `USAGE_LEDGER` (DB consistency) and `RATE_CONFIG` (WARN if budget is active but pricing missing). Sanitized reports include counts/status only, never detailed story prompts or API keys.

**Implementation sequence:** Define ledger schema with M1, record request lifecycle at M4, ship the Usage & Budget screen/rate cards/warnings and optional pause rule at M5, and complete diagnostics/edge-case QA at M9. Offline story reading, editing, saving and local mock playback are never blocked by API budget controls.

## 09. UI contracts, screen flow and keyboard behavior

**Screen graph:** `Library -> Quick Start / Guided / Custom -> Chapter & Route Picker -> Reader`. Reader opens `Pause` -> `Save / Load`, `Restart chapter`, `Regenerate last AI reply`, `Character/World Editor`, `Images`, `Story Search`, `Export`, and `Settings`. Standalone `Settings -> Model Connections / AI Usage & Budget / Diagnostics / Updates / Data`. A persistent status footer includes `vX.Y.Z`, diagnostics shortcut and optional `Support` external link.

**Required visual status in Reader:** story name, *active route name*, active chapter title, model connection state, save/unsaved status, in-progress generation state, and an optional session-cost chip (clearly labeled Estimated). Use a stable content column for narrative, optional portrait/background region, bottom free-text composer, and a nonintrusive action bar. Long AI outputs should not yank reading position; show `Jump to latest` while scroll position is away from bottom. Text-size preference should be locally configurable.

| Key / control | Behavior | Priority / exception |
|---|---|---|
| Up / Down | Focus menu choices; scroll reader when no menu active | Do not intercept in editable input or IME composition |
| Left / Right | Cycle guided picker value, tabs or route cards | Inside text: move caret; avoid global handlers |
| Enter | Activate focused control or submit composer | Shift+Enter inserts newline; ignore composition-confirm Enter |
| Escape | Close top dialog; otherwise open pause | Preserve composer/wizard drafts |
| Ctrl/Cmd+S | Quick-save committed state | Show save timestamp; disable only during transaction |
| Tab / Shift+Tab | Normal focus movement | Modal traps focus; focus restores on close |
| Mouse | Identical access to all functions | Arrow controls have dropdown/selection alternative |

**UX state boundaries:** Library selections never mutate story history. Showing an old save is read-only until user confirms a fork. Mid-story edits have a preview: changed fields, affected route, effective event and `Apply from now`. Regenerate shows it will create a new route. A dismissed update banner stays dismissed through restart until a newer stable version is available. Diagnostics shows `PASS/WARN/FAIL/SKIPPED`, never a blanket green indicator when remote checks are unrun.

**Minimum UI test matrix:** keyboard-only Library -> Quick Start -> Reader -> Save -> Load; mouse parity; focus inside text fields; IME entry; 150%/200% UI scaling; missing portraits; long streamed narrative; no provider configured; no internet; modal Escape; screen-reader labels for icon-only buttons.

## 10. Image library, storypacks, backups and text export

**Images (P1):** user-supplied PNG/JPEG/WebP portraits, expressions, outfits, scene backgrounds, covers. Validate actual bytes and dimensions; apply configurable limits (initial 20 MB/image); compute SHA-256; store content-addressed originals in `assets/originals/` and generated thumbnails in `assets/thumbs/`. Asset table stores relative filename, hash, dimensions, mime, tags. Hash-based dedup reuses file bytes, not story links. Route-specific visual changes use `edit` events holding asset IDs; story defaults remain reusable.

**Deletion:** unlinking is distinct from deletion. Reject or require explicit remapping of an asset if any story or historical event/snapshot references it. Consider a reference scan of all histories, not only current heads. Never execute embedded image scripts (do not import SVG/HTML as playable assets in v1).

**Storypack:** `.storypack` ZIP with `manifest.json` (`formatVersion`, checksums, exported app version), story/base state, chapter outlines, immutable events, routes and their heads, saves, supported cache metadata, linked images. Export the full story with all routes; do not support lossless single-route storypack exports in V4, because shared ancestor events can reference other origin routes. Selected-route export is available as readable Markdown instead. Never include API keys, raw provider profiles, absolute paths, logs or app preferences.

**Import recovery protocol:**

```text
1 validate ZIP path/size/decompression limits and schema in temp directory
2 verify checksums and cross-table references; plan ID remapping
3 record operation ID + staged file manifest in archive_operations
4 stage assets as content-addressed temp files; flush to disk
5 in one DB transaction: insert/remap story graph and asset metadata
6 finalize atomic asset renames; mark operation complete
  (while import is pending, UI does not expose unfinished imported stories)
7 on interruption: startup recovery reconciles journal and assets;
  either finish or roll back partial import with no broken references
```

The DB and filesystem do not share a transaction: document and test reconciliation, not an impossible global atomic commit. For initial release, simplify to staging originals first and retaining safe orphan files for later cleanup rather than deleting referenced files aggressively.

**Backups:** manual Export All and rotating automatic backups after story changes (e.g. daily when used, retain five), using SQLite's backup API / safe WAL-aware snapshot plus assets. Restore into a *new* staging app-data location and validate before swapping. During migrations: create a pre-upgrade backup first. A read-only test restore may be run as part of release CI, not every app launch.

**Readable export (P1):** chosen route as Markdown or `.txt`, with chapter headings, role labels and optionally timestamps. This is separate from lossless `.storypack` and does not need PDF/EPUB support.

## 11. Diagnostics built incrementally, not at the end

**M0:** `APP_VERSION`, development build identity, app-data path check. **M1:** `DB_OPEN`, migration version, SQLite foreign keys, write-read-delete test, usage-ledger schema validation. **M2:** `TIMELINE_REPLAY`, mock save/fork. **M4-M5:** provider configuration, explicit connection test, usage-ledger and rate-policy checks. **M8:** asset/backup checks. **M9:** aggregate UI and sanitized support report.

| Check | Work performed | Result semantics |
|---|---|---|
| `APP_VERSION` | Read packaged version and target | PASS when valid SemVer / supported build target |
| `DATA_DIR` | Create/fsync/read/delete temp test file | FAIL on no write access; show remediation |
| `DATABASE` | Open/SELECT 1, verify migration/foreign keys | FAIL on inaccessible/corrupt DB |
| `DB_INTEGRITY` | Manual `PRAGMA quick_check` with time limit | SKIPPED unless user requests deep check |
| `TIMELINE_REPLAY` | Nonmutating deterministic mock fixture | FAIL if state hash differs; never mutate user story |
| `ASSETS` | Scan links, missing files, selected hashes | WARN with affected IDs; full scan optional |
| `BACKUPS` | Check last valid snapshot metadata and writable location | WARN when none or too old |
| `AI_CONFIG` | Validate chosen profile and secret ref | SKIPPED with no configured model |
| `AI_CONNECT` | Explicit non-story request; <=8s timeout | PASS only when verified; WARN if validation would cost tokens |
| `UPDATES` | Show cached release check / opt-in state | SKIPPED when disabled; local functions unaffected |
| `USAGE_LEDGER` | Validate no duplicate API request IDs or negative amounts; compare normalized totals | FAIL on corrupt rows; no external provider call |
| `RATE_CONFIG` | Validate budget policy and applicable rate cards | WARN when an enabled budget has unpriced models; no paid API call |

**DTO:** `{id,label,status:'PASS'|'WARN'|'FAIL'|'SKIPPED',summary,remediation?,durationMs,checkedAt}`. Run checks with bounded concurrency. Report actual performed checks rather than inferring that a model is functional. No default paid generation test. `Copy report` strips keys, story bodies and filesystem paths. Add `Test Story Engine` with deterministic mock turns to validate save/fork without any API. Never claim that a diagnostic pass guarantees future model availability.

## 12. Version footer, update notice and donation link

**Installed version:** single source of truth `tauri.conf.json.version`, e.g. `v0.1.0`. The roadmap label `V4` is *not* the product's released SemVer. CI compares release tag `vX.Y.Z` with packaged version; refuses mismatches.

**Update checks:** user opt-in (disabled by default). Manual `Check for updates` always available. Rust HTTP fetches `GET /repos/{owner}/{repo}/releases?per_page=100` from the statically configured public GitHub repository; ignore drafts and prereleases and select the highest valid stable SemVer in the returned page. Do **not** rely on `/releases/latest`: GitHub orders that endpoint by release-related commit metadata, not SemVer. Parse numeric SemVer, never string sort; validate `https://github.com/{owner}/{repo}/releases/...` URL; cache result 24h; 8s timeout; fail quietly offline. For a future repo with more than 100 releases, follow bounded pagination or enforce monotonically increasing release tags. Open official release page in default browser, never automatically install.

**Acknowledgment:** store highest acknowledged stable version rather than one transient banner ID. Show a notice only when `candidate > installed` AND `candidate > acknowledged`. A checkmark acknowledges through this version; a later version appears again. Banner must not cover the narrative composer during active play. API failures remain `unavailable` in Settings, not an app startup error.

**Donation:** show a small `Support development` link in footer/About when `config/public-links.json` supplies a validated HTTPS URL. Opens external system browser only. No payment SDK, recurring prompt, donations database, or navigation away from gameplay.

## 13. Corrected milestone sequence (dependency-ordered)

| Stage | Implementation | Exit gate / testable outcome |
|---|---|---|
| M0 - Foundation | Scaffold, typed command interface, CI, app version, data-path resolver, minimal Diagnostics, first dev package | Launch and install on development OS; version shown; health check executes |
| M1 - Persistence | SQLite schema including request ledger/rate cards, SQLx pool/migrations, state DTOs, secrets abstraction, backup plumbing | Create/restart 100 stories, migrate fixture, DB foreign keys and usage schema verified |
| M2 - Timeline core | Immutable events, ancestor traversal, route heads, chapter_start, fork/restart, saves/snapshots, property tests | 100 randomized forks; deterministic replay; no cross-route state leak |
| M3 - Offline vertical slice | Story Library, Quick Start, basic reader, focus manager, local mock storyteller, save/load UI | Full keyboard-only create/play/save/fork/reopen without API or internet |
| M4 - First live AI | First cloud-compatible adapter, provider form, streaming/cancel, generation idempotency; durable per-call usage records | 10-turn live session, save after turn 5, retry failure, reopen both routes; ledger records every attempt |
| M5 - Continuity + second adapter | Ollama/local adapter, branch-only prompts, summary cache, Prompt Preview; usage dashboard, rate cards, monthly warnings/optional pause | Model switching safe; summaries/retries counted; budget behavior and unknown usage tested |
| M6 - Creation wizard | Guided arrow/dropdown, Custom creator, offline presets, auto-restored wizard drafts | Create valid world/character with no typed fields; override any preset |
| M7 - In-story editor | Route-scoped character/world/narration edits, fact confirmation, regeneration, edit earlier action | Edits and alternative replies do not mutate original history |
| M8 - Assets + portability | Image gallery, route visual links, `.storypack`, text export, backups, recovery journal, bookmarks/search | Export/import full two-route story + images and search it; interrupt import safely |
| M9 - Release UX | Full Diagnostics including ledger/rate checks; version checks, acknowledgments, donation link, accessibility and budget UI pass | PASS/WARN/FAIL/SKIPPED; budget warnings nonblocking; link optional |
| M10 - Public readiness | Cross-platform CI installer smoke, signing/notarization as applicable, docs, fresh install/upgrades, regression suite | Releasable Windows/macOS/Linux artifacts, no missing acceptance gates |

**Usage integration gate:** M4 must record every provider attempt even when token usage is missing; M5 must make those records visible and configurable in the UI before implementing further optional features. Budget controls gate only model dispatch; they cannot block editing, saving or backup.

**Early integration policy:** An installable development binary at M0; CI regression from M1; UI E2E at M3; installer smoke at M4/M8/M10; diagnostic checks added with each service. Avoid building P2 features while any M0-M5 invariant test is failing.

## 14. Ordered pull requests and interfaces

| PR | Branch | Delivers | Blocks |
|---|---|---|---|
| 01 | `chore/scaffold` | Tauri shell, typed invoke, CI, version, dev installer | All others |
| 02 | `feat/db-core` | Migration 0001, usage-ledger/rate-card schema, domain structs, temp DB fixtures, backup helper | 03-06 |
| 03 | `feat/events-and-routes` | Ancestors, CAS route heads, forks, chapter_start, property tests | 04,06 |
| 04 | `feat/saves-replay` | Saves, snapshots, resume as fork, restart, crash fixtures | 05,06 |
| 05 | `feat/quickstart-ui` | Library, Quick Start, reader, mock responses, keyboard UX | 06-07 |
| 06 | `feat/model-runs` | Run-state machine, first adapter, Tauri Channel, retry/cancel, per-outbound-request ledger hooks | 07 |
| 07 | `feat/context-local-model` | Route prompts, summaries, local adapter, usage dashboard, rate editor, monthly budget warnings/pause | 08 |
| 08 | `feat/create-wizard` | Guided/Custom and offline templates, draft restore | 09 |
| 09 | `feat/route-editor` | Edits, regenerate, chapter actions, confirmation UI | 10 |
| 10 | `feat/assets-archives` | Gallery, manifests, import journal, backups, text export | 11 |
| 11 | `feat/search-bookmarks` | Local search and route-event bookmarks | 12 |
| 12 | `feat/release-ux` | Full Diagnostics (including usage/rates), updates, version footer polish, donation | 13 |
| 13 | `chore/release` | Installer CI, signing, README, smoke + upgrade tests | Public release |

**Interface freeze before each dependent PR:** database migration & event payload version; `StoryStateV1`; Tauri DTO names; stream `runId` and `apiRequestId` contracts; usage/rate/budget policy schema; archive `formatVersion`. Log decisions in short ADRs for only these contracts. Do not freeze visual styling before user testing.

## 15. Acceptance and regression test matrix

**Timeline, data and AI (blocking):**

| ID | Test | Pass condition |
|---|---|---|
| T01 | Quick Start without free text | Valid story, player character, main route and first chapter |
| T02 | Close/reopen after 10 turns | Exact narrative and state restored |
| T03 | Fork at historical event | Original head unchanged; shared ancestors identical |
| T04 | Restart Chapter 3 | New route begins at that route's chapter entry |
| T05 | Save at historical checkpoint; resume writing | New fork; old route head unchanged |
| T06 | Run 100 randomized append/fork/save/edit operations | No cycles or cross-story parents; valid ancestry |
| T07 | Replay snapshot + suffix vs full replay | Stable identical state hash |
| T08 | Main and alt Chapter 4 diverge | Separate chapter title, state, relationships and known facts |
| T09 | AI starts then network drops | Player event remains; assistant not committed |
| T10 | Retry interrupted generation | One player event; at most one new assistant on route |
| T11 | Two simultaneous sends | One accepted; second `HEAD_CHANGED` / run-active error |
| T12 | Cancel vs completion race | At most one assistant event and one terminal run state |
| T13 | Switch route while generation streams | Response attaches to original run route only |
| T14 | Regenerate completed assistant reply | Fork with alternative response; original preserved |
| T15 | Edit past player action | Fork at predecessor; previous action unchanged |
| T16 | In-story character/narration edit | Effective only from edit event on that branch |
| T17 | Prompt on alternate branch | Contains only ancestor facts, summaries and events |
| T18 | Prompt after latest player action | Player action included exactly once |
| T19 | Stale summary or scene-hint cache after fork | Rejected by ancestry/hash; no leaked future events |
| T20 | Switch cloud to local adapter | Existing history identical; next run uses chosen adapter |
| T21 | No model connected / offline | Editing and local mock Diagnostics still work |
| T22 | API 401 / rate-limit / timeout | Typed error; retry offered; no silent duplicate charge attempt |

**UI, templates and portability (blocking):**

| ID | Test | Pass condition |
|---|---|---|
| T23 | Arrow picker + dropdown + typed override | Same validated field value; keyboard focus correct |
| T24 | Caret, IME and Shift+Enter in composer | Text editing not intercepted by global shortcuts |
| T25 | Keyboard-only create/play/save/load | No mouse required; focus visible and restored |
| T26 | Long response streaming; user scrolls up | Reading position stable; jump-to-latest available |
| T27 | Escape with unsent action text | Draft preserved |
| T28 | Wizard closes halfway | Draft restored on reopen |
| T29 | Edit modal preview on alternate route | Effective point and affected route explicit |
| T30 | Import same image twice | One original hash file; links remain independently usable |
| T31 | Image referenced by older historical route | Deletion blocked/remapped; no hidden broken references |
| T32 | Storypack export/import with 2 routes + images | Exact graph/state reconstruction after ID remap |
| T33 | Malicious ZIP / large expansion | Rejected before DB mutation; staged files cleaned |
| T34 | Kill process during import phases | Journal recovery; no broken DB/file references |
| T35 | Backup then restore into fresh data path | All stories and images consistent |
| T36 | Export chosen route as Markdown | Ordered chapters, dialogue and role labels |
| T37 | Search/bookmark content on route | Search returns route-scoped results; bookmarks resolve after reopen |

**Diagnostics, updates and packaging (blocking):**

| ID | Test | Pass condition |
|---|---|---|
| T38 | No provider profile, run Diagnostics | Local checks PASS, model checks SKIPPED |
| T39 | Data dir not writable | DATA_DIR FAIL + remediation, no app crash |
| T40 | Broken asset reference | ASSETS WARN with IDs; stories still readable |
| T41 | AI Connect explicit offline/bad key test | Typed result, no story text or hidden paid request |
| T42 | Installed 1.9.0; stable release 1.10.0 | Update banner appears after opt-in |
| T43 | Acknowledge 1.10.0; then 1.11.0 released | 1.10 notice remains hidden, 1.11 appears |
| T44 | Release endpoint timeout / disabled checks | Local operation unaffected; no automatic network when disabled |
| T45 | GitHub release SemVer different from `releases/latest` ordering | Highest allowed stable version selected when necessary |
| T46 | Invalid release URL/tag | No untrusted page opened; notice suppressed |
| T47 | Donation URL absent/present | Link hidden/opens external browser; no payment SDK |
| T48 | CI tag vs packaged version mismatch | Release job fails |
| T49 | Install/upgrade/launch on Win/macOS/Linux | Story DB retained; first-run/restore test passes |
| T50 | Sanitized diagnostic export | No keys, prompts, story bodies or absolute paths |
| T51 | Narrow desktop window or 200% text scaling | No inaccessible controls; reader remains usable |
| T52 | Deterministic Test Story Engine, fully offline | Can create, fork, save and verify replay without provider |

**API usage & budget (blocking for public release):**

| ID | Test | Pass condition |
|---|---|---|
| T53 | Provider returns final usage counts | One ledger row with normalized tokens and source `provider`; correct session/month/all-time totals |
| T54 | Provider reports cached-input tokens | Cost uses cached rate if configured; missing cached rate uses labeled regular-input assumption |
| T55 | Provider response has no usage or a cancelled request has unknown charge | Cost remains unknown (not $0); unknown-call count increments |
| T56 | No rate card for a paid model | Tokens shown if known; dollar estimate unavailable; no invented price |
| T57 | User edits model pricing after previous calls | Old cost/rate snapshot unchanged; next request uses new rate |
| T58 | Network retry of one player action | Exactly one player event; two separate attempted API calls counted once each |
| T59 | Background memory summary or paid manual test | API call included in usage/budget total even without new story assistant event |
| T60 | Local Ollama generation | Token stats optional; API-charge estimate explicitly $0 and local hardware excluded |
| T61 | Session restart / UTC month boundary | Correct session reset and monthly rollover; all-time history preserved |
| T62 | Month spend crosses configured 80% warning | One dismissible warning; threshold/limit changes re-evaluate appropriately |
| T63 | Pause-new-requests budget limit reached | New paid dispatch refused with `BUDGET_PAUSED`; local story operations remain usable |
| T64 | Pause mode with missing pricing/token estimate | Explicit override or rate setup required; no silent "guaranteed cap" |
| T65 | Two concurrent requests on different routes | Atomic preflight reservations prevent double-spending assumed local headroom; reconciled after completion |
| T66 | Reopen/export/diagnostic after usage recorded | Usage persists locally, no usage ledger in `.storypack`, sanitized diagnostics reveal no prompts or keys |

**Test execution:** Rust `cargo test` + property-based generator for event graphs; SQLx migration fixtures; TypeScript/Vitest + Testing Library; WebdriverIO Tauri service for desktop E2E on each target where CI supports the needed WebDriver setup. Test signing/installers on actual target OS, not only a web frontend preview. Maintain a small *fictional, original* two-route fixture in the public repo; do not ship the author's private stories.

## 16. Build verification, API budgets and release criteria

**CI on each PR:** frozen dependency install, frontend typecheck/lint/unit tests, `cargo fmt --check`, Clippy, Rust unit/integration tests, migration fixtures, basic security/secret scan, coverage of updated modules. At M3 start automated UI smoke. On tag: build Win/macOS/Linux packages with release workflow; assert `tauri.conf.json.version` equals tag; smoke install/launch/save/reopen; attach checksums and documented installation files to a stable public release. Complete platform signing/notarization before recommending downloads to general users.

**Source license:** select one standard license (e.g. MIT or Apache-2.0) before publishing; use the same license file across repo, and provide simple instructions for BYO model setup. No community template ingestion service. Project maintainer can still update bundled templates in normal releases.

**Privacy/operational scope:** all narrative files, assets and storypacks are local. The user-selected model endpoint receives only the assembled context needed to generate its next response; document this in Model Settings. No analytics or telemetry. Update checks use GitHub only if enabled. Provider usage costs are paid directly by the user to the configured provider, and will vary by model/context length; local models consume users' hardware resources. The app displays local estimates, not actual provider bills or account balances. Its budget controls do not replace provider-side spend limits.

**V4 completion gate:**

- [ ] P0 and P1 required tasks implemented and all T01-T66 acceptance cases pass or have documented target-specific exception with non-blocking reason.
- [ ] Ten-turn end-to-end scenario: create -> play -> save -> fork -> regenerate -> edit NPC -> quit -> reopen -> verify both routes.
- [ ] No mixed canonical histories, duplicate player sends, or uncommitted assistant partials.
- [ ] Export/import + migration recovery validated with interruption injection.
- [ ] Keyboard-only and mouse flows work; scaling, text entry and focus verified.
- [ ] Diagnostics distinguishes FAIL/WARN/SKIPPED correctly and contains no private story details in exported report.
- [ ] API usage counts every outbound paid request (including summaries/retries); costs are labeled estimates, unknowns visible, and monthly budget warning/optional pause tested.
- [ ] GitHub version check is opt-in and dismissible; donation remains a passive external URL.
- [ ] Cross-platform installation and upgrade smoke pass with user data retained.

## 17. Engineering references

- [R1] Tauri Channels and calling frontend: https://tauri.app/develop/calling-frontend/
- [R2] Tauri + WebdriverIO testing: https://tauri.app/develop/tests/webdriver/
- [R3] WebdriverIO Tauri service: https://webdriver.io/docs/desktop-testing/tauri
- [R4] SQLite foreign key connection requirement: https://sqlite.org/foreignkeys.html
- [R5] SQLite WAL: https://sqlite.org/wal.html
- [R6] GitHub Releases REST list: https://docs.github.com/en/rest/releases/releases#list-releases
- [R7] Tauri distribution and signing: https://tauri.app/distribute/

**Build rule:** Do not begin MCP, community templates, an online library, image generation or auto-update installation until P0/P1 reliability and user testing justify them.

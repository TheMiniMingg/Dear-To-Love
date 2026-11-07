# ADR 0003: Prompt assembly, story memory and Prompt Preview

Status: accepted (PR 07)

## Context

Roadmap section 07 asks for a deterministic, branch-scoped prompt with a token
budget, derived summaries that can never leak across branches, and a local
Prompt Preview. Migration 0002 and the preview DTO are interface contracts
(section 14), so they are recorded here.

## Decision

- **Migration 0002** adds `memory_caches` (kind `summary` or `scene_hint`).
  Rows are caches: deleting one only means it is rebuilt. There is no
  `route_id`. A row is eligible for a chain when `source_end_event_id` is in
  the chain and `source_hash` equals SHA-256 over the chain up to that event
  (each event's id, kind and payload). `schema_version` (now 1) lets a later
  format ignore old rows. `(source_end_event_id, kind, schema_version)` is
  unique; inserts use `INSERT OR IGNORE`.
- **Summaries roll forward.** A new summary is the previous summary plus the
  turns since, so the newest eligible one covers turns `1..=coveredTurns`.
  Boundaries are fixed: the reply at turn 8, 16, 24, ... once 8 newer turns
  exist; at most 16 turns are caught up per request.
- **Prompt order** (`PROMPT_SCHEMA_VERSION` 2; 3 adds the `STORY` section
  and the chapter plan, see ADR 0012; 4 adds `EARLIER CHAPTERS`, see
  ADR 0014; 5 adds styles, thoughts, language and `MESSAGES`, see ADR 0015; 6 adds
  `DICE`, stats and roll results in actions, see ADR 0016): system message (narration
  rules, world, characters, relationships, confirmed facts, scene, then
  `STORY SO FAR` when the summary fits), verbatim turns after the summary,
  then the latest player action exactly once. A window that starts with a
  story reply relabels it as a user turn prefixed `(Earlier in the story:)`.
- **Budget:** `maxContextTokens` (new `GenerationSettings` field, default
  16 000, at least twice `maxOutputTokens`) minus `maxOutputTokens`. The
  system part and latest action are required (`CONTEXT_TOO_LONG` otherwise,
  before any ledger row or call); then the newest 4 messages, then the
  summary, then older turns. Assembly is recomputed per run (no cache).
- **Token estimate:** ASCII characters x 0.3 plus one per other character,
  plus 4 per message and 3 per prompt. It overestimates on purpose and is
  labelled approximate. Ledger usage still comes from the provider.
- **Ledger:** live summaries use purpose `memory_summary`, no
  `generation_run_id`, and the route's id. The cache row links back through
  `api_request_id`. The budget gate (PR 07c) will apply to them too.
- **Prompt Preview:** `preview_context(routeId)` returns `ContextPreview`
  (messages with per-message estimates, totals, reservation, limit, summary
  source range, verbatim and omitted counts). It never contacts a provider.
  Prompts never contain API keys.

## Consequences

Branch isolation for memory is enforced by data (ancestry + hash), not by
code paths remembering to filter. Changing the summary format or prompt
means bumping `MEMORY_SCHEMA_VERSION` or `PROMPT_SCHEMA_VERSION`.

# Architecture

```text
React screens -> src/api/commands.ts (typed invoke wrappers)
  -> Rust commands/      input validation, typed AppError
  -> Rust domain/draft   CreateStoryDraft: one validator for every way to
                         create a story (Quick Start, Guided, Custom)
  -> Rust db/stories     story rows, main route, first chapter
  -> Rust db/drafts      the creation wizard's saved draft
  -> Rust db/timeline    event graph, route heads, forks, chapters
  -> Rust db/contract    startup consistency checks
  -> Rust db/runs        generation runs (CAS state machine)
  -> Rust db/usage       API usage ledger, rate cards, cost estimates
  -> Rust db/providers   AI connections, chosen storyteller
  -> Rust db/assets      image library rows, story-default pictures,
                         reference scan for safe deletion
  -> Rust services/      generation, prompt, adapters (OpenAI-compatible,
                         offline), reader view, diagnostics, secrets,
                         assets (image validation, thumbnails, files),
                         storypack (format, checks, id remapping),
                         archive (storypack export/import, recovery,
                         readable text export)
  -> SQLite (story.db)   OS credential store for API keys
     assets/originals, assets/thumbs (content-addressed image files)
     imports/<operation>  storypack staging (removed when done)
  dtlimg: protocol      serves library images to the webview by id
```

## Creating a story

```text
templates/v1/*.json  -> TemplateCatalog (4 worlds, 4 scenarios, 6 characters)
Quick Start          -> compose_draft -> CreateStoryDraft -> into_story_input
Guided / Custom      -> CreateStoryDraft edited in the wizard, saved as
                        app_preferences.wizard_draft -> create_story
```

- A draft may be incomplete; `check()` lists what to fix by wizard step, and
  `into_story_input()` refuses with the same messages. Conflicting character
  ids are reported, never merged. See ADR 0005.

## Timeline model

- Each event has one parent. A route is a mutable pointer (`head_event_id`)
  plus a `version` counter. Writes compare-and-swap both; a stale caller gets
  `HEAD_CHANGED`.
- A fork creates a route whose head is an existing event; no events are copied.
  Membership is always "is an ancestor of the route head".
- `restart_chapter` forks at a `chapter_start` event. `next_chapter` appends one
  with the next ordinal (title from the authored outline when present).
- `regenerate_fork` forks at the player action a reply answered;
  `edit_prior_player_turn` forks at the event before the action and appends the
  edited action there. Neither touches the original route.
- A player action must be answered before another action is appended, which
  prevents duplicate sends; a reply must follow a player action.

See `db/timeline/tests.rs` for the randomized isolation test (T06).

## Changing a story in play

```text
Story details   effective state at the head -> edited copy -> diff into StateEdit
                ops -> preview (fields, route, effective point) -> one `edit`
                event at the head (validated by replaying it first)
Another reply   regenerate_reply: fork at the action the reply answered +
                pending run on the new route, in one transaction
Change action   edit_action: fork before the action + new player event +
                pending run, in one transaction (any action, not just the last)
```

- All three only add events or routes; nothing earlier is rewritten. An edit
  can't be added while the head is an action waiting for its reply.

## Replies (generation runs)

```text
submit_action   txn: append player event, advance head, create pending run
generate_reply  CAS pending -> streaming; insert ledger row (status sent)
                adapter streams drafts over a Tauri Channel (display only)
                txn: CAS streaming -> completed + append the one assistant event
                close ledger row with normalized usage and cost estimate
failure/cancel  run -> failed/cancelled, player event stays the head;
                retry_reply = new run (and new ledger row) for the same event
app start       pending/streaming runs -> interrupted; open ledger rows -> unknown
```

- A run belongs to one `(route, input event)`. The reply is only appended if
  that route's head is still the input event; otherwise the run is marked
  `interrupted` and nothing attaches anywhere.
- `events.generation_run_id` and `api_requests.generation_run_id` are unique,
  so a run can commit at most one reply and has at most one ledger row.
- Adapters never retry. Requests to loopback addresses bypass proxies.
  `openai_compatible` speaks `POST /chat/completions` (SSE); `ollama` speaks
  Ollama's `POST /api/chat` (NDJSON) and sends `options.num_ctx` from the
  connection's context limit, because Ollama otherwise loads models with its
  own default context and truncates longer prompts from the start.
- The offline storyteller is an adapter too (no ledger row: it is not an API).
- See ADR 0002 for the stream and ledger contracts.

## Prompts and story memory

```text
prompt     system: narration rules, world, characters, relationships,
                   confirmed facts, current scene  (+ STORY SO FAR summary)
           verbatim player/story turns after the summary, oldest first
           the latest player action, exactly once, last
budget     max context - reply reservation; system + latest action must fit
           (else CONTEXT_TOO_LONG before anything is sent), then the newest
           4 messages, then the summary, then older turns while they fit
summaries  after each reply (background, never blocks play): when 16+ turns
           are unsummarized, roll the previous summary forward to the reply
           at turn 8, 16, 24, ... leaving 8+ recent turns verbatim
```

- Everything comes from the run's input event and its ancestors. A summary
  is eligible only when its ending event is one of those ancestors and its
  `source_hash` (SHA-256 over the chain's ids, kinds and payloads) matches,
  so branches never see each other's futures. Branches that share history
  share summaries, because boundaries are fixed turn numbers.
- The offline storyteller gets an extractive summary (no API call). A live
  storyteller writes it with a `memory_summary` ledger row; a failed
  boundary is not retried in the same session.
- Token counts are a conservative local estimate (`services/tokens.rs`);
  ledger usage still comes from the provider.
- **Preview context** (reader pause menu) shows the exact assembled prompt
  for the next reply, its token estimate and which turns the summary covers.
  It is built locally and never sent. See ADR 0003.

## Images

```text
import    read file (<= 20 MB) -> detect format from bytes -> decode (limits)
          -> sha256 -> same hash? reuse row : write original + thumbnail
          (temp file, flush, rename) -> insert row
picture   effective(slot) = this route's setVisualRef up to the head
                            else the story default (asset_links)
delete    refused while a default, a starting state or any edit event on
          any route shows the image; then row, then files
```

- Slots: `cover` (story only), `background`, `portrait:<character id>`.
  See ADR 0006.

## Storypacks and text export

```text
export    one read txn -> PackStory + referenced images -> manifest with
          sha256/size per file -> <dest>.<id>.part -> flush -> rename
import    unpack allowed names only, byte-counted limits -> manifest match
          -> check graph + replay every branch -> decode images
          -> journal 'staged' -> place image files -> one write txn: assets
          by sha, story with new ids, journal 'committed' -> 'complete'
startup   staged -> rolled_back, committed -> complete, clear imports/
text      route view -> chapters, labelled turns, notes -> .md or .txt
```

- `.storypack` holds one whole story; no keys, connections, usage,
  preferences, logs or paths. See ADR 0007.

## Usage and budget

```text
open_request   write txn: paid + budget pause on -> ceiling at current rates
               posted + reserved + ceiling > limit  -> BUDGET_PAUSED (no row)
               no rates and no override             -> BUDGET_OVERRIDE_REQUIRED
               else insert row (status sent, reserved_micro_usd = ceiling)
close_request  known cost -> posted, reservation released
               unknown cost -> reservation kept (gate stays conservative)
```

- The month is the UTC calendar month. Local connections are never counted
  or gated. Warn-only mode only shows the reader's budget banner.
- Usage totals come straight from `api_requests`; unknown costs are counted,
  never summed as 0. See ADR 0004.

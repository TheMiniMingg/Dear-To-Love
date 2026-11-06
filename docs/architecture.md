# Architecture

```text
React screens -> src/api/commands.ts (typed invoke wrappers)
  -> Rust commands/      input validation, typed AppError
  -> Rust db/stories     story rows, main route, first chapter
  -> Rust db/timeline    event graph, route heads, forks, chapters
  -> Rust db/contract    startup consistency checks
  -> Rust db/runs        generation runs (CAS state machine)
  -> Rust db/usage       API usage ledger, rate cards, cost estimates
  -> Rust db/providers   AI connections, chosen storyteller
  -> Rust services/      generation, prompt, adapters (OpenAI-compatible,
                         offline), reader view, diagnostics, secrets
  -> SQLite (story.db)   OS credential store for API keys
```

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
- The offline storyteller is an adapter too (no ledger row: it is not an API).
- See ADR 0002 for the stream and ledger contracts.

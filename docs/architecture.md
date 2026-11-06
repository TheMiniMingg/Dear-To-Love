# Architecture

```text
React screens -> src/api/commands.ts (typed invoke wrappers)
  -> Rust commands/      input validation, typed AppError
  -> Rust db/stories     story rows, main route, first chapter
  -> Rust db/timeline    event graph, route heads, forks, chapters
  -> Rust db/contract    startup consistency checks
  -> Rust services/      diagnostics, secrets (more services land per roadmap PR)
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

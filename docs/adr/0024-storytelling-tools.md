# ADR 0024: Storytelling tools

Status: accepted

## Context

Batch 4 of the UI and quality-of-life list (agreed with MiniMe on 2026-11-07) asks for tools
that steer the story without leaving it: Keep going, a length for the next reply, Another
reply with a hint, a note to the storyteller, editing a reply in place, taking back the last
turn, and Remember this for words picked in the story. They must fit the event-sourced
timeline: events are never changed or deleted, and every route is a head pointer.

## Decision

- **Reply options are per reply, kept with the run.** `ReplyOptions { length, hint }` goes
  with `submit_action` and `regenerate_reply` and is stored in `generation_runs.options_json`
  (migration 0008), so Retry asks the same. It is never an event and never part of the story.
  Live storytellers get it as an out-of-character line after the latest action
  (`with_direction`). The offline storyteller writes less for Short and more for Long, and
  reads the hint into its seed.
- **Keep going is an empty action.** A player event may now have empty text (no roll). The
  prompt sends `prompt::KEEP_GOING` in its place, the reader shows "You let the story go on.",
  and exports, summaries and route maps show `KEPT_GOING` ("(lets the story go on)").
- **The note to the storyteller is part of the narration** (`Narration.storyteller_note`, at
  most 500 characters). It is set with an ordinary `SetNarration` edit, so it is per route,
  starts at the turn it was written and can be undone like any change. The system prompt
  carries it under "THE PLAYER'S NOTE TO YOU" with the rule to never quote or mention it.
- **Another reply differs offline.** The offline storyteller's seed now includes how many
  replies the action already has (and the hint). This replaces the "asking again gives the
  same reply" point of ADR 0023: the first reply to an action is still the same every time.
- **Take back my last turn rewinds the head and keeps the turn on a branch.** `rewind_tx`
  forks the old head to a new route ("Taken back: …"), moves the saves on the turn that left
  to it, drops the route's bookmarks there (the branch has copies), and moves the head back
  with the usual version check. It is refused while a reply is being written, for an action
  in an earlier chapter (Restart chapter and Routes cover that), and before the route's fork.
- **Edit a reply works on the latest reply only.** The route rewinds to the action with a
  hidden "Before your edit" branch, a new assistant event takes the new words with the old
  reply's asides (notes, threads, characters, ideas) added back, and the edits, checkpoints
  and confirmed facts after it are appended again. The player's saves and bookmarks follow to
  the new events; the autosave of the old words stays with the hidden branch. An earlier reply
  is changed with Branch from here, as before.
- **Remember this is only a shortcut.** Words picked in the story open Story memory with a new
  note holding them: the note of the person they name (with the words added), or a new moment
  in the timeline. Nothing is saved until the player saves the note.

## Consequences

- Prompt schema version 11, database schema version 8 (with `tests/fixtures/data_v8.sql`).
- Taking back and editing never delete events, so every earlier version stays reachable in
  Routes (shown, or hidden for edits).
- Mod+U takes back the last turn; Mod+Z is left to the text boxes.

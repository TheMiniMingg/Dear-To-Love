# ADR 0014: End chapter and chapter recaps

Status: accepted

## Context

MiniMe asked for an **End chapter** button that ends the chapter, saves it,
gives a recap of what happened and keeps that recap so the story continues
from it. Before this, **Next chapter** only appended a `chapter_start`
event. The rolling story summary (ADR 0003) covers old turns, but it is
written every 8 replies on fixed boundaries, so it does not line up with
chapters and the player never sees or edits it.

## Decision

- **Where the recap lives.** `ChapterStartPayload.previousChapterRecap` on
  the next chapter's `chapter_start` event holds the recap of the chapter
  that just ended. The events table's `kind` CHECK constraint would need a
  migration for a new event kind, and a field on the next chapter's start
  says exactly what it is: the closing note of the chapter before it. Like
  every event it belongs to the route's history, so branches keep their own
  recaps and a fork before the end does not see it. The field is optional
  and omitted when empty, so older stories and storypacks read unchanged.
- **Two steps.** `draft_chapter_recap` writes a recap and stores nothing.
  `end_chapter` takes the expected route head, the recap and an optional
  next title; it appends the next `chapter_start` with the recap and inserts a
  manual save "End of Chapter N: title" pointing at it, in one transaction
  guarded by the route head (`HEAD_CHANGED` on a moved route). The player
  reads and edits the recap between the two, and can skip the draft and
  write their own. An empty recap ends the chapter without one.
- **Who writes it.** With a connected storyteller, one request through
  `call_once` with ledger purpose `memory_summary` (the `api_requests`
  purpose CHECK stays as it is), so the budget gate and ledger apply as for
  summaries. It sends only this chapter's turns: every turn is shortened to
  600 characters if the chapter does not fit, then the oldest turns are left
  out, and `CONTEXT_TOO_LONG` is returned only if nothing fits. Reply length
  is at least the summary minimum, so models that think first have room.
  Offline, the extractive summarizer recaps the chapter's turns.
- **A chapter can end** once it has at least one reply and the last action
  is answered; otherwise both commands return `INVALID_INPUT` with a
  sentence the reader shows as is.
- **Prompt.** `PROMPT_SCHEMA_VERSION` 4 adds `EARLIER CHAPTERS` before
  `NOW`: one line per recap, `Chapter N, title: recap`, oldest first, the
  10 most recent kept (`MAX_RECAPS_IN_PROMPT`); older chapters are covered
  by the rolling summary. `assemble` reads the recaps from the route's
  history, so preview and replies always agree.
- **Limits.** A recap is at most 6,000 characters and a chapter title at
  most 120.
- **Reader.** **End chapter** replaces **Next chapter** in the action bar.
  The recap shows at the chapter break above the new chapter's heading.

## Consequences

- Recaps travel with storypacks and backups as part of the story. They are
  story text, never keys or connection details.
- Changing the recap prompt or the `EARLIER CHAPTERS` format means bumping
  `PROMPT_SCHEMA_VERSION`.
- An app version from before this change cannot import a storypack whose
  events carry a recap (payloads deny unknown fields).

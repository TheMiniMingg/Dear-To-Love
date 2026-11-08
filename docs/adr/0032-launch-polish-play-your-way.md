# ADR 0032: Launch polish: How to play, presets, Tune, Previously and the memory gauge

Status: accepted

## Context

A review before launch asked what would help people play the game their way, what should be
explained better, and which small things stood between the app and a first release. The
findings were: the controls were learnable only from the first-run tips and a long README;
the four narration settings people change most while reading sat behind Story details; a
story opened days later started cold at the composer; a world someone built by hand could
only be duplicated with its turns; nothing in the reader said how close the storyteller was
to its reading limit; and the story typeface had no easy-to-read option.

## Decision

- **How to play** is a screen of the app (`features/help/HelpScreen`), not a document:
  eleven sections, each a few lines, reached from the footer, the library, the pause menu,
  the Ctrl+K box and the last first-run tip. It names the three ways to steer the storyteller
  (a note for how the story is told, rules for what is true, Remember this for one fact) and
  the three things to do when a story gets long. The same explanations are repeated in
  place: beside the note field, the rules list, the recap field, the offline storyteller and
  the routes list.
- **Tune the telling** is a reader sheet (`TunePanel`) over the four narration fields most
  changed while reading. It reuses `diffState` and `editStoryDetails`, so a tune is an
  ordinary Story details edit: from the next reply on, this route only, with the same note
  in the timeline.
- **Previously…** (`PreviouslyCard`) greets a route with at least two replies, no reply on
  the way and nothing written for 20 minutes, once per app session per route. It reads the
  summary (else the newest recap), the last reply, the chapter, place and time and the open
  threads it already has, with no request to the storyteller. The choice to see it is a
  preference of this computer (`dtl.previously`), kept out of backups and storypacks.
- **Presets of the player's own** are the creation wizard's draft, rebuilt from the route's
  effective state (`domain::presets::draft_from_state`): a preset starts a story exactly as
  finishing the wizard would, and **Change first** opens the wizard on Review with it. They
  live in `user_presets` (migration 0011) and share as `.dtlpreset` files with a format name
  and version, holding the draft only. The library's **Save as a preset…** and the Preset
  Story screen's **Your presets** are the two doors.
- **The memory gauge** is derived on the client from the same `preview_context` the Preview
  context window shows, refreshed when the route's head changes and no reply is in flight:
  the estimated input over the room (context limit less the reply's reserve), amber at 80%,
  red (and 100%) once the summary is dropped or turns are left out, with a line of advice and
  the two buttons that fix it. When `preview_context` answers CONTEXT_TOO_LONG the advice
  is different (more room, a shorter reply or a shorter setup) and **Story details** takes
  the place of **End chapter**. The offline storyteller reports no live preview and shows no
  gauge.
- **An ended chapter's recap stands in for its turns.** `prompt::assemble` starts the
  verbatim turns at the newest chapter start that carries a non-empty recap (keeping the last
  exchange before it, so the seam reads on), unless a newer summary already starts them later.
  The gauge's advice to end a long chapter is then true at once, rather than once the rolling
  summary reaches the chapter's end. Prompt schema 15. `StoryMemory.wordForWordTurns`
  reports the same start, so Story memory can say how many turns are read word for word.
- **Story typeface** is one more `Look` preference (`font`), applied as the `--font-story`
  variable on the reader, so a theme that sets its own face (Terminal) keeps it under
  **Theme's choice**. Atkinson Hyperlegible is bundled with the other two faces.
- **Reading aloud per character** adds `muted` names to the read-aloud preference and a
  voice row to each character in Story details, bound to the active voice pack.
- **StorySummary** gains `place` (the newest scene mark along the last played route, else
  the opening scene), `setting` and `cast`, read in the same query as the rest, so the
  library card can say where a story is and the search can find a story by who is in it.

## Consequences

- Help text lives in the app and is translated like everything else: 126 new texts in four
  languages. Wording in the help page and in place must be kept in step by hand.
- A preset is a snapshot of the draft, not a link: changing the story later does not change
  the preset, and a preset from a newer app version is refused with a message rather than
  half-read.
- The gauge costs one `preview_context` call per turn, which builds the prompt without
  sending it; it is skipped while a reply is streaming.
- The Previously card is off in every UI test by default (fixtures are dated days ago) and
  turned on only by its own tests.
- A player who ends a chapter with a thin recap loses that chapter's detail sooner than
  before; the recap field already says to keep the names, promises and secrets that matter,
  and an empty recap keeps every turn.

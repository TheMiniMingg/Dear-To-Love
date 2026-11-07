# ADR 0026: Feelings, a notebook tidy-up, books and the command palette

Status: accepted

## Context

Batch 6 of the brainstorm ("extras, as you like") asked for a command palette, a chapter
jump, read aloud, export as a book, relationship bars, a notebook tidy-up at chapter end, the
remaining themes and a first-run tour. Most are small screens on top of what exists. Three
change how stories are stored or sent: the bars, the tidy-up and the book.

## Decision

- **Feelings live in the relationship.** `Relationship` gains `bond: Option<Bond>`, a
  `heart` (affection) or `trust` bar from 0 to 100 (`MAX_BOND`), starting at 50
  (`START_BOND`). No bar is the default, so old stories and storypacks read as before. The
  storyteller moves bars with a `<bond name="Mara" heart="+10">line</bond>` tag at the end of
  a reply; a step is capped at 30, `heart="70"` sets a value, and words like "up" or "down"
  count as ±5. Replay applies the tags of each reply in order like memory notes, so every
  route keeps its own feelings, and **Undo** on the "Memory updated" line takes back the bar
  with the notes. The prompt shows each bar as `[heart 60/100]` beside the relationship. This
  raises `PROMPT_SCHEMA_VERSION` (to 11 here; 12 once merged after batch 4, which also
  raises it).
- **The tidy-up is a suggestion, applied at the end.** `draft_notebook_tidy` runs while the
  End chapter window is open, only when the notebook has at least six notes or a long one and
  the story keeps notes itself. A live storyteller gets the numbered notebook and answers
  with JSON changes (`replace` note numbers, plus the note that takes their place).
  `tidy::accept` throws away anything unsafe: unknown or repeated numbers, a "merge" of one
  note that is not shorter, a note too long, or one that would overwrite a note it doesn't
  replace. The offline storyteller only merges a first-name person note into the one full-name
  note it matches and drops repeated sentences. Nothing is written until **Save and start
  Chapter N**: the kept changes go through the existing `edit_story_details` (so they are an
  event like any other edit, undone by going back), then the chapter ends on the new head.
  The tidy call is billed and logged as a memory summary.
- **Books are EPUB 3, built in Rust.** `services::book` writes the zip itself (mimetype stored
  first, then the container, package, nav and an NCX for older readers), with one XHTML page
  per chapter that has turns. Story text is escaped, `*emphasis*` and `**bold**` are paired
  with a stack so the XHTML is always well formed, and actions read as quiet italic lines.
  Literata (latin and latin-ext, OFL, from `@fontsource-variable/literata` 5.3.0) is embedded
  so the book looks like the reader; it lives in `src-tauri/assets/fonts/literata` with its
  licence. The cover is the story's own cover picture, or an SVG drawn from the title and
  byline. The labels (byline, colophon, "Contents", route subtitle) come from the UI in the
  player's language. Only story text goes in: no notes, settings, keys or paths, like a text
  export.
- **Read aloud uses the computer's voices.** The Web Speech API (`speechSynthesis`) reads a
  reply a paragraph at a time (long ones split at sentences, because some voices stop after
  a few hundred characters), in the story's narration language, with the voice and speed
  from **Settings → Sound**. It needs no network and costs nothing. The speaker is hidden
  when the computer has no voices (WebKitGTK without speech, for example), and Settings says
  so.
- **The palette is a registry.** `usePalette` holds `paletteSources`: screens register a
  function that returns entries (the reader adds its chapters and windows), and the palette
  adds stories, screens, shortcuts and every settings section. `searchPalette` ranks prefix and
  word matches first. Ctrl/Cmd+K is a shortcut like the others, and it does not open over
  another window, which could hold unsaved changes.
- **Themes and tips are settings of this computer.** Neon, Café and Gothic join the theme
  list and the genre table (Gothic for horror and mysteries, Neon for science fiction,
  Midnight for thrillers, Café for cozy stories). The first-run tips remember they were seen
  in `localStorage` (`dtl.tourDone`) and show nothing if storage is unavailable.

## Consequences

- A storypack from this version can carry bars; an older app rejects the unknown `bond`
  field, as with any newer state.
- The book was checked by parsing every page as XML and rendering it in Chromium, not with
  EPUBCheck.
- Read aloud can't be tested in the end-to-end runner (no voices in WebKitGTK there); it is
  covered by unit tests with a stand-in `speechSynthesis`.

# ADR 0007: Storypacks and the import journal

Status: accepted (PR 10b)

## Context

Roadmap section 10 asks for a lossless `.storypack` of one whole story (every
route, saves, cache metadata and linked images), an import that survives
damaged or hostile files (T33) and interruption at any step (T34), and a
readable Markdown or `.txt` export of one route (T36). Storypacks never carry
API keys, connections, the usage ledger, preferences, logs or absolute paths
(T66). Single-route storypacks are out of scope: shared ancestor events can
belong to other routes.

## Decision

- **Format** (`services::storypack`, version 1). A ZIP with exactly:
  `manifest.json` (format version, app and app version, export time, title,
  SHA-256 and size of every other file), `story.json` (`PackStory`: story,
  starting state, chapter outlines, routes with heads, events with their
  payload version, saves, story summaries, story-default pictures and image
  metadata) and `images/<sha256>.<png|jpg|webp>`. Story JSON uses
  `deny_unknown_fields`, so a key or path smuggled into it is refused, not
  ignored. Only summaries whose hash still matches their events are
  exported; a picture whose file is missing is left out and counted.
- **Writing.** Export reads the story in one read transaction, then writes
  `.<name>.<id>.part` next to the destination, flushes and renames. The text
  export uses the same atomic write.
- **Checking before anything changes.** Import unpacks into
  `<app data>/imports/<operation id>`, accepting only the three kinds of
  name above (no directories, symlinks, encrypted or duplicate entries, so
  no path can escape). Each entry is copied through a byte counter against
  per-file and total limits (default 2 GiB archive, 5000 entries, 256 MiB
  story, 20 MB per image, 4 GiB unpacked), so a ZIP bomb stops at the limit
  whatever its headers claim. Every file must match the manifest and the
  manifest must list every file. A newer format version gets "update the
  app". Then `storypack::check` verifies the graph: unique ids, one main
  route, every reference resolves, one event tree under one chapter start,
  no cycles, every payload parses at a known version, every branch replays
  from the starting state, saves sit on their route's history. Each image
  is decoded with the library's limits and must be the type it claims.
- **New ids.** `storypack::remap` gives the story, routes, events, outlines
  and saves fresh ids and rewrites every reference, including those inside
  event payloads (fact sources, chapter outlines, picture asset ids).
  Summaries get their chain hash recomputed so they stay usable. A picture
  pointing at an image the pack doesn't carry is dropped, so imported
  history never refers to whatever this install has under that id. The same
  pack imported twice gives two independent stories.
- **Journal** (`archive_operations`, migration 0004). After checking: insert
  the operation as `staged`; place every image's original and thumbnail in
  the content-addressed library (temp file, flush, rename; an existing file
  of the same size is kept); then one write transaction inserts or reuses
  asset rows by SHA-256, inserts the whole story, and marks the operation
  `committed` with its story id; finally mark it `complete` and remove the
  staging folder. Any failure marks it `failed` and removes the folder.
  `list_stories` hides a story whose operation is still `committed`.
- **Recovery** (`archive::recover_imports`, at every start after the
  consistency checks): `staged` becomes `rolled_back` (nothing was written
  to the database; placed files are content-addressed and harmless),
  `committed` becomes `complete` (the story is whole), and `imports/` and
  `assets/tmp/` are removed. Files are always placed before any row points
  at them, so no state has a row without its file.
- **Readable text** (`archive::route_text`). One route from the reader's
  view: title, route and export date, `## Chapter N: Title` headings, each
  turn labelled with the player character's name or "Storyteller",
  checkpoints, picture and story-detail changes as notes, optional UTC
  times. Markdown escapes lines that would turn into headings or quotes.

## Consequences

- Rejected imports leave the database, the library and the staging folder
  exactly as they were. An interrupted import is either absent or complete
  after the next start.
- An image added by an import that was rolled back stays in
  `assets/originals` without a row. It is reused if the same picture is
  added later; a later cleanup may remove such files.
- Imported events have no generation run and summaries no API request:
  usage stays with the install that paid for it.
- Format version 1 is an interface contract. A later version must keep
  reading version 1 packs.

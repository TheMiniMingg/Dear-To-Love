# ADR 0031: Launch audit: place pictures, reading each reply, cleaner memory

Status: accepted

## Context

Before launch, the whole app was read through again: every branch, the storyteller's
prompt and adapters, how memory is kept, how the story's pictures and sounds are used, the
preset templates and the screens. The code was in good shape; three things stood out.

The stage above the story had one background per route, chosen by hand, while the
storyteller already marks every change of scene with its place. Reading aloud always took a
click. And the summaries and chapter recaps a live storyteller is asked for were sent the
raw reply text, message tags, memory notes, threads and all, though the app keeps those
itself.

## Decision

- **A place is a picture slot.** `VisualSlot::Place(key)` (`place:<name in lower case with
single spaces>`, keyed as items are) joins cover, background, portraits and items. It is
  route-scoped, lives in `asset_links` as `("place", key, "picture")`, and goes through the
  same `setVisualRef` edit and story default as the others, so storypacks, backups and
  **Where it is used** need no special case. On the stage, `sceneBackground` shows the
  picture of `scene.location` when there is one, else the background. **Pictures → Places**
  lists where the story is now, the places from its scene marks (latest first), the places in
  its memory notes and the ones with a picture, each once by key and named as first seen
  (a place known only by its key gets a capital), and **Another place** prepares a picture
  for somewhere the story has not reached. The
  storyteller is not told about place pictures: it keeps writing scene marks as before.
- **Read each new reply aloud** is a preference in `dtl.readAloud` (`autoRead`, off by
  default). When a reply lands in the story being read, whether this screen wrote it or
  followed one in progress, it is read with the chosen voices. The speaker under the reply
  still works, and the sound switch and sound-off rules apply.
- **Summaries and recaps see the story as words.** `memory::transcript`, which both the
  rolling summary and the chapter recap use, now runs every turn through
  `plain_message_tags`: a text or a call becomes "[Text from Mara] …", and the asides beside
  a reply (memory notes, open threads, new characters, next moves, feelings) are left out.
  Those are kept by the app and shown to the storyteller in their own sections already.

## Consequences

- A place the storyteller spells differently ("The Pier", "the pier") is one place; one it
  renames ("the old pier") is another, and shows the background until it gets a picture.
- Reading each reply aloud with AI voices bills each reply once; the setting is off until
  the player turns it on.
- Summary and recap prompts are a little shorter and never repeat the notes. Offline
  summaries already read the tags as words and are unchanged.
- The template npc ids that two scenarios share (`starter:npc-theo` and six others) were
  checked and left alone: a story takes one scenario's cast, and preset characters have ids
  of their own, so the ids never meet.

# ADR 0033: Pictures as the story goes

Status: accepted

## Context

MiniMe asked (2026-11-25): when an image engine is set up and allows it, pair the
introduction of new characters or events with generated pictures, stored so they can be used
again in that story or in others, "re-designated" from the library. The engine must not spam
generation: there must be options for how many pictures and when.

ADR 0018 added picture connections and portraits on request; ADR 0031 made places picture
slots. Nothing made a picture unless the player asked for that one picture.

## Decision

- **One command for pictures made while playing**: `make_story_picture` (and
  `preview_story_picture`, which sends nothing) take a `PictureSubject` (`portrait` with the
  character, `item` with name and description, `place` with name and time of day), the
  world, a style, the story and `share`. The prompts follow ADR 0018: no names for people, no
  story text, and a closing safe-for-work sentence that is never cut off. A place is "a wide
  view … with no one in it" and asked for wide (Stable Diffusion 768 × 512, `gpt-image-*`
  1536 × 1024, `dall-e-3` 1792 × 1024; other models stay square).
- **Where made pictures go.** `share` (the default in Settings) adds them for every story, so
  any story can use them again; otherwise they are kept for the story (and can be shared later
  in Images, ADR 0017). Each gets its kind tag (Portrait, Item, Place) and
  `Made automatically`, which Images offers as a filter with Place and Item. One ledger row per
  attempt, as for every picture.
- **When** (`src/features/reader/autoPictures.ts`). After each new reply on the route being
  read (replies already there when a route opens are skipped), the reader lists what could
  have a picture, in order: people in the scene with no portrait (never the player), the
  scene's place when it has none (the opening place is left to the story's background), then
  inventory items with none (off by default). A slot handled once in a story (made, found,
  declined or failed) is never offered again there.
- **Library first.** With "Use a matching picture from your images first" (default on), a
  usable picture (shared, or this story's own; another story's own never) whose label fits is
  put in place for free: "Portrait of <name>" or the name for portraits, the place's or item's
  key for places (tagged Place or Background) and items. This story's own pictures win.
- **Limits** apply to made pictures only: at most N per story (default 12), N per day across
  stories (default 20), and a gap of replies between made pictures (default 3); 0 is no
  limit. At most one picture is made per reply. Modes: Off, **Ask me first** (default: a card
  under the reply with Make it / Not this one / No pictures in this story) and **Make them on
  their own**. A story can be turned off from its Pictures panel.
- **Placing.** A found or made picture becomes the route's picture for its slot
  (`setVisualRef`) once the route is free, through the same queue that places newcomers'
  portraits. The card under the reply shows the pictures with "New picture" or "From your
  images" and **Change in Pictures**.
- **Kept on this computer.** Settings (`dtl.autoPictures`) and the counts and handled slots
  (`dtl.autoPicturesLog`, 60 stories, 300 slots each, the day count resets each day) live in
  local storage like the other reader preferences. No migration.

## Consequences

- Without a picture connection, only library pictures are used.
- The per-day count is per computer, and counts pictures made by this feature only (portraits
  asked for by hand are not limited).
- Events other than a change of place (a fight, a kiss) have no structured mark from the
  storyteller yet, so they don't get pictures of their own.

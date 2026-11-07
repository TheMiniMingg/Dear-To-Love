# ADR 0023: An offline storyteller that follows the story

Status: accepted

## Context

MiniMe asked to expand the offline (no API) storyteller, with more scenarios, scenes and
genre-related writing, "for trying things out but also to not heavily rely on an API". The
storyteller from ADR 0012 reacted only to the kind of action, with one set of neutral lines.
It ignored the style, the point of view, the dice settings and tracking.

## Decision

- **Still deterministic and world-free.** `mock_storyteller::reply` keeps its signature and
  still picks lines from a SHA-256 of the turn and the action. The engine self-test and the UI
  tests stay stable, and asking again gives the same reply. No line names a particular place,
  so it can't contradict the story.
- **Banks by the kind of story** (`banks.rs`). `Flavor` is decided by the genres, setting
  first (fantasy, then the future), then mood (dark, then heartfelt), then adventure. Without
  a genre the era decides, and the fallback is the earlier neutral set. Each flavor has beats,
  looking, moving, handling, fighting, twists, sensory details, the text adventure's ways
  onward and items to find.
- **Voices.** `Voice` (bright, wry, soft, gruff, plain) comes from personality words. A voice
  has things to say when talked to, reactions, bursts of texts, call lines, first texts and
  inner thoughts.
- **Point of view by tokens.** Lines about the player use `{You}`, `{you!}`, `{your}`,
  `{s}`, `{are}` and similar tokens. `Person::say` fills them for first, second or third
  person, with the player's first name and pronouns. `{you*}`/`{your*}` use the name where
  a pronoun would have nothing to refer to. A test runs every line through every point of
  view. Tense is not followed: the offline storyteller writes in the present.
- **Settings it follows:**
  - the style (a script is always third person);
  - detail;
  - scene headings (the chapter's place, and "Later" when travelling);
  - inner thoughts;
  - surprises (none, one in five, one in two);
  - texts first, now and then, only in modern flavors, never with `quietPhones`;
  - dice rules: `playerOnly`, the story's dice, frequency and odds, to place the target;
  - criticals.
- **Tracking.** With `tracking` on, it writes the same `<meter>` and `<item>` tags a model
  would, so replay applies them the same way (ADR 0022). The changes come from fights,
  spells, rest, buying, searching, using an item named in the action, and talking to a
  character with a social meter. There are at most four tags a reply.

## Consequences

- Offline replies are richer but still generic, and English only, whatever the story
  language.
- Changing a line changes the replies of existing offline stories when a reply is asked for
  again. That is acceptable for a deterministic fallback, and stored replies never change.

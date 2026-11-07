# ADR 0022: Story features, dice settings and RPG tracking

Status: accepted

## Context

MiniMe asked for:

- texts and calls that read like real people, with place and time headings like a script;
- examples of each way of telling a story, and more of them;
- a custom story that is customizable "down to RNG", with a box for any feature a player
  doesn't want;
- RPG play: health and mana bars, damage counters and an inventory. The app tells the AI what
  is wanted, the AI records what changes ("a chest gives an item"), and the app shows it,
  including an item's description and a picture if one is made. Romance stories can have
  items too, and all of it is set when the story is made or in its settings.

## Decision

- **Styles and features are narration settings.**
  - `Narration` gains `sceneHeadings` (the `<scene place time/>` tag), `tense`, `surprises`,
    `autopilot` (the player character's small reactions) and `quietPhones` (characters never
    text or call first).
  - There are two new styles, `roleplay` and `adventure`.
  - With the existing `innerThoughts`, `messageCards` and `dice`, every feature has a box.
  - Each field is optional, and unset keeps the earlier behavior, so stories made before
    keep reading the same.
  - The wizard's Narration step and Story details show a short example of the chosen style,
    drawn by the reader's own components.
- **Dice settings.** `Narration.diceRules` (`DiceRules`) holds who asks for rolls, fixed dice,
  how often, the odds, whether stats count, critical rolls and whether the target shows. The
  prompt asks for what the rules say. The app also enforces them: a fixed `dice` replaces
  what the storyteller wrote on the card and in the roll that is stored, `noStats` drops a
  stat, and `playerOnly` stops roll requests from showing a button. Criticals are decided
  from the faces the app rolled.
- **Tracking is story state, changed by tags in replies.** `StoryStateV1.tracking`
  (`Tracking`: meters and an optional inventory of items) is set by the draft or by a
  `setTracking` edit. When it is on, the contract gets a `TRACKING` section with the current
  values and two tags:
  - `<meter name change|set [max] [who]/>`;
  - `<item gain|lose qty>description</item>`.

  `EffectiveState::apply` applies these tags from each `Assistant` event, through
  `Tracking::apply_reply`. This is the one case where replay reads a reply's text. It keeps
  tracking event-sourced with no new event kind: every route, branch, retry and save point
  has the values of its own history, and a storypack carries them for free.

- **The app does the arithmetic.** Bars are clamped to `0..=max`; values to ±1,000,000; names
  and descriptions are cut to 60 and 600 characters; at most 24 meters and 200 kinds of item.
  A meter `who` that names the player is the player's. A new meter name starts a new meter. A
  bar starts full and a counter at zero. An item needs the inventory and is matched by
  `item_key` (lower case, single spaces).
- **Only the storyteller's tags count.** `roll`, `meter` and `item` are app tags.
  `strip_app_tags` removes them from the player's text before the storyteller reads it, and
  the reader leaves them out of the player's words, so a typed `<item gain="…"/>` does
  nothing.
- **Shown where it happened, and in one place.** The reader turns each tag into a chip in the
  reply. The player's own bars show above the action box. **Status and inventory** lists
  every meter by whose it is, and every item with its quantity, description and picture.
- **Item pictures.** A new `item:<key>` visual slot. **Make a picture** sends
  `ItemPictureInput` to the picture connection with the same budget rules as portraits. The
  prompt asks for the object alone, with no people, safe for work and no text. The asset is
  kept for the story and set as the story default for that item's slot.
- `PROMPT_SCHEMA_VERSION` 7 (texts and calls, headings, styles, features, dice settings and
  tracking).

## Consequences

- An app from before this change cannot import a storypack whose state carries `tracking`,
  the new narration fields or a `setTracking` edit (state and edits deny unknown fields).
- Tracking depends on the model writing the tags. A model that forgets them leaves the
  numbers where they were. A wrong tag changes nothing it can't name: an unknown item can't
  be lost, and an unparsable number is ignored. The player can always correct the values in
  Story details.
- A reply's tags are part of its saved text. Editing tracking by hand is an edit event, so
  a later reply on that route starts from the corrected values.

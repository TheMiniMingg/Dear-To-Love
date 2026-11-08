# ADR 0029: Versions of a reply, and bringing a character you already made

Status: accepted

## Context

**Another reply** keeps every version on its own route, but the only way back to the first
version was **Routes**. Players who build a character they like also want to use them again
in a new story, or bring one from a character card, the PNG or JSON files that many roleplay
tools share.

## Decision

- **Versions are routes, read only.** `route_view` returns `replyVersions`: for each reply on
  the route whose action has other replies (assistant events with the same parent), the route
  to open for each version, oldest first. A version kept on several visible routes opens the
  one played most recently; hidden routes (an edited reply's old version) don't count, so an
  edited reply is not a second version. The reader shows ‹ n / total › under the reply, and
  each arrow opens that route. Nothing is written, so flipping never changes a story. It
  costs one query for a story with no versions.
- **From your stories.** `list_story_characters` reads each story's latest route at its head
  and lists its player and other characters, the player first, once per name and
  description. Bringing one copies their fields (not their id) into the draft as the player
  or as someone to meet, with their portrait when they have one.
- **From a character card.** `read_character_card` reads a JSON file or a PNG's `ccv3` or
  `chara` text chunk (tEXt, zTXt or iTXt; `ccv3` wins), V1 to V3, at most 30 MB, with the
  unpacked text limited to the same size. Only the name, description, personality, scenario
  and first message are kept; a card's system prompt, example messages, lorebook and other
  instructions are dropped, so a card can't add instructions of its own. `{{char}}` becomes
  the name and `{{user}}` the player's name, or "you" on the player's own card. Markup,
  Markdown images and asterisks go. The scenario and opening fill only empty fields. A PNG
  card's picture is imported as the portrait through the usual image import, so only its
  file name is kept.
- **A card that reads as under 18 is refused**, with words such as "loli", "underage" or
  "schoolgirl", school levels such as "high school student", or an age under 18 ("16 years
  old", "aged 15", "she is 17."). An age in the past ("when she was 12") is not refused.
  This is a first check on top of the app's own rules: an adults-only story still refuses any
  character whose age is under 18, and the storyteller is told that everyone in sexual
  content is 18 or older.

## Consequences

- A version's arrows go to another route, so the story beside them (state, notebook, saves)
  is that route's. The title on each arrow says so.
- The age check can refuse an adult card that mentions a child it isn't about; the player
  can write the character in Custom Story instead.

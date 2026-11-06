# ADR 0015: Story types, narration styles and message cards

Status: accepted

## Context

MiniMe asked for a way to pick the type of story first, for stories told
without a narrator (a character's inner thoughts and reply to what the
player did, as in a dating story), for texts and phone calls that look like
a phone instead of prose, and for stories written in the player's language
(Chinese, Japanese, Korean) when their own AI service can do it.

## Decision

- **Narration fields.** `Narration` gains `style` (`narrated`, `thoughts`,
  `script`, `messages`; unset means narrated), `innerThoughts`,
  `messageCards` and `language`. All are optional and omitted when unset,
  so existing stories, snapshots and state hashes do not change. They are
  edited like the rest of Narration (one `setNarration` edit), so they can
  change mid-story on one route.
- **Message tags.** The storyteller is told to write
  `<text from to time>`, `<call with status/>`, `<thought who>`,
  `<letter from>` and `<post from time>` when cards are on (and always for
  the messages style). Tags rather than JSON or markdown because models of
  every size follow them well, they read sensibly as plain text, and a
  partial tag while streaming is easy to hold back. The reader parses them
  (`messages.ts`) and renders cards (`RichText.tsx`); anything else is
  prose with `**bold**`, `*italic*` and a bold leading speaker name. A
  malformed tag shows as text, so nothing is lost.
- **The player's side.** The composer's menu sends an action as a text,
  a call or the player's own thought, stored as the same tags in the
  player event. The model is told it may receive them. The offline
  storyteller answers a text with a text and a call with a connected call,
  and adds a thought when thoughts are on.
- **Inner thoughts** are only ever other characters'; the player's thoughts
  stay the player's to write, as the narration contract already requires.
- **Language** adds "Write in X" to the contract, and summaries and chapter
  recaps are written in it too. The value is an English name ("Japanese")
  because that is what every model reads reliably; the picker shows native
  names.
- **Story type** is `storyType` on the wizard draft and an optional Quick
  Start input. It filters the preset worlds by their genres and is put
  first in the story's genres when the story is created. New stories have
  `messageCards` on.
- `PROMPT_SCHEMA_VERSION` 5.

## Consequences

- Text exports and offline summaries write tags out as plain text
  (`plain_message_tags`), so a story reads cleanly outside the app.
- Search matches inside tags as well; harmless, and it finds messages.
- An app from before this change cannot import a storypack whose state
  uses the new narration fields (payloads deny unknown fields).

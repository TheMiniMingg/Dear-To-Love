# ADR 0025: Fill in the rest, and seeing a story before it starts

Status: accepted

## Context

Batch 5 of the brainstorm asked for story creation that does more of the work and shows the
result: "Fill in the rest" on every step of Custom Story, a cover-style preview in Preset Story
and Custom Story, a step bar, and a Look section in Settings with reading options on a live
sample. A blank form with many fields is the hardest part of starting a custom story; the
player should be able to write a few words and let the storyteller do the rest, without losing
what they typed.

## Decision

- **One request per press** (`services::story_setup`). `empty_fields(draft, step)` lists the
  step's empty fields (Review, or no step, lists every step's). `fill_messages` sends what the
  player wrote as JSON ("keep to it") and asks for one JSON object with exactly the empty
  keys, each described in plain words. The reply is merged by `merge_reply`, which only ever
  writes fields that are still empty, so the player's words always win.
- **Adults only.** The request says everyone is 18 or older, and the merge drops any age that
  reads as a minor and any invented person who is one. Looks are described without explicit
  detail.
- **The cast.** With nobody in the cast, two or three new people join, each with a role and
  how they know the player (which becomes a relationship). With a cast the player made, the
  storyteller only fills the missing details of those people, matched by name; nobody new is
  added.
- **Offline.** With the offline storyteller, a story set to it, or when the player chooses
  "Fill in from the preset stories instead" after a failed call, `fill_offline` picks the
  preset world, scenario and character whose words and genres best match what was typed
  (a seed picks among equals, so pressing again can offer another) and fills only the empty
  fields from it. When the player typed a world no preset fits, nothing is filled and the
  app says so rather than overwrite the idea with an unrelated preset.
- **No new request purpose.** The call is recorded as `character_suggestion`, now shown as
  "Story ideas and pictures" in Usage, so no migration is needed and costs stay visible.
  Picture connections are refused.
- **Undo is in the screen.** The draft before the fill is kept in memory; **Undo** puts it
  back. Fields are disabled while a fill runs, and Cancel drops its answer.
- **Previews from the draft.** `StoryCover` draws a story as a cover in the theme it will be
  read in (`defaultStoryTheme`), from the same draft or template the story is made from, so
  the preview can't drift from the result.
- **Reading options are a look setting.** Width and line spacing live with the theme in
  `dtl.look` and reach the reader through `--reading-width` and `--reading-leading`; text
  size keeps its own key. They apply to every story on this computer and are never sent to
  the storyteller.

## Consequences

- A fill costs one request with a small answer (at most 1,500 tokens).
- What the storyteller invents is ordinary draft text: it is checked by `check()` like
  anything typed, and can be edited or cleared.

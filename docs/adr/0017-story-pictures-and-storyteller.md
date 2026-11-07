# ADR 0017: Pictures for one story, and a storyteller per story

Status: accepted

## Context

MiniMe asked for three things while creating a story:

- Pictures can belong to one story, or be shared with every story, and the two are kept
  apart.
- Pictures can be added, and assigned to characters as portraits, while the story is being
  created (a library picture can be used too).
- The AI that writes the story can be chosen while creating it.

Until now every library image was usable everywhere, and one storyteller (Settings) wrote
every story.

## Decision

- **Shared or story-only images** (migration 0006). `assets.shared` (1 by default, so every
  older image stays shared) and `asset_stories (asset_id, story_id)`:
  - A shared image can be shown by any story.
  - A story-only image can be shown only by the stories listed for it. The same bytes added
    for two stories keep one file and one row, listed for both.
  - `db::assets::check_available` is enforced for story defaults (`set_story_visual`),
    route edits (`setVisualRef`) and pictures picked while creating.
  - Making an image story-only keeps it in every story that already shows it, so no story
    loses a picture. Sharing it again clears the list.
  - Deleting a story never deletes its pictures. Its own pictures then belong to no story and
    show under **Not in any story** in Images, where they can be shared or deleted.
- **Adding images says who may use them.** `import_images` takes an optional scope: all
  stories (the default and the Images screen), one story (the reader's **Add for this
  story**), or the story being created (`newStory`). A new image takes the scope. An image
  that was already in the library stays shared if it was shared, and gains the story if it
  was story-only. Adding for all stories shares it.
- **Storypacks.** An imported story's new images are kept for that story. Images already
  shared in the library stay shared. Storypacks still carry no sharing information,
  connections or keys.
- **The wizard's Pictures step** (between Narration and Review). It sets the cover, the
  background and a portrait for the player and each character. Pictures added there are
  imported with `newStory` and listed in `CreateStoryDraft.storyImages`; `pictures` holds
  `{slot, assetId}`, with `portrait:@player` for the player. `create_story` applies them in
  the same transaction as the story (`create_story_with` and `StorySetup`): the new story
  gets its own images, then the pictures. A portrait for a character no longer in the draft
  is left out.
- **A storyteller per story.** `stories.storyteller_profile_id` and
  `stories.storyteller_offline`:
  - Both empty: the story follows the app's storyteller.
  - Offline set: the built-in offline storyteller.
  - Otherwise the named connection. `ON DELETE SET NULL` sends a story back to the app's
    storyteller when its connection is deleted.
  - `providers::story_storyteller` resolves it for replies, retries, edits, regenerations,
    chapter recaps and Preview context. `StorytellerInfo.storyChoice` tells the reader
    whether the story chose its own.
  - The wizard sets it in the Pictures step. The reader sets it from the storyteller's name
    in the header (or **Menu → Storyteller**) with `set_story_storyteller`. Settings still
    sets the app's storyteller.
- **Switching keeps the story.** Summaries, chapter recaps and facts are stored with the
  story, not with a connection, so a story that changes storyteller keeps everything it
  remembers.

## Consequences

- Images lists pictures in groups: **For all stories**, **Only in “title”** for each set of
  stories, and **Not in any story**. Each picture's details say who may use it, with **Share
  with all stories** or **Keep for one story only**.
- The reader's Pictures chooser shows **This story's pictures** and **For all stories**, and
  another story's own pictures never appear there.
- A wizard abandoned after adding pictures leaves them in no story, where Images shows them.
- Schema version 6. The v6 migration fixture covers a story with its own connection and a
  story-only picture, and the v3 fixture checks that older images stay shared.

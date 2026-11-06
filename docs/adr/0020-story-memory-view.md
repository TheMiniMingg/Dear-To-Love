# ADR 0020: A Story memory panel

Status: accepted

## Context

MiniMe asked that "the most important parts of the story" are saved or summarized, so that
switching to another API "doesn't just erase the entire story". The app already did this:
every event is stored, older turns are summarized into `memory_caches`, ended chapters keep
a recap on their `chapter_start` event, and facts, relationships and open threads are part of
the route's state. None of it is tied to a connection, so a new storyteller reads it all. But
none of it was visible except as raw prompt text in **Preview context**, so a player couldn't
tell what would carry over.

## Decision

- **`get_story_memory(route_id)`** (`services/story_memory.rs`) returns, for the route's head:
  - `turns`: storyteller replies on the route (what summaries count);
  - `summary`: the summary the next reply would read (`latest_eligible_summary`, the same
    lookup as the prompt), with `coveredTurns`, when it was written and `writtenBy`
    (connection label and model). The writer comes from the summary's ledgered request when
    it is still there, otherwise from its `model:<label>/<model>` generator, split at the
    first slash. Offline summaries have no writer;
  - `recaps`: the chapter recaps along the route (`prompt::chapter_recaps`), oldest first;
  - `recapsRead` and `firstSummaryAfter`: the prompt's limits (10 recaps; the first summary
    after 16 replies), so the panel explains them without copying constants.

  It only reads; nothing new is stored, so there is no migration.

- **Reader → Story memory** (`src/features/reader/StoryMemoryPanel.tsx`), in the pause menu
  after **Storyteller**, says first that everything is kept in the story on this computer and
  that a new storyteller reads it, names the current storyteller with **Change storyteller**,
  then shows the summary, the recaps and the confirmed facts, relationships and open threads
  (from the route view already loaded, the same ones the prompt uses), with **Edit in Story
  details**. **Storyteller** links back with **See what the story remembers**.
- If the memory can't be read, the panel says so and still shows the facts and threads.

## Consequences

- The panel is read-only. Summaries are caches the app rewrites as the story grows, so they
  aren't edited here; facts are edited in **Story details**, recaps when the chapter ends.
- Text is English for now; the UI translations part localizes it.

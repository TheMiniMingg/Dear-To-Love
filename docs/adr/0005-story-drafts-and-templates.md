# ADR 0005: Story drafts, the creation wizard and template set

Status: accepted (PR 08)

## Context

Roadmap section 04 asks for four world, four scenario and six character
templates, Quick Start, Guided and Custom creation that all resolve to one
validated `CreateStoryDraft`, and wizard drafts that survive closing the app
(T28). The draft DTO, its saved form and the template schema are interface
contracts (section 14), so they are recorded here.

## Decision

- **`CreateStoryDraft`** (`domain/draft.rs`) is the editable story before it
  exists: title, description, `world`, `narration`, `player`, `npcs`,
  `relationships` (`@player` stands for the player), opening `scene`,
  `openThreads`, `firstChapterTitle`, `chapterOutlines`, plus the template ids
  each section came from (informational, for the pickers).
  `draftSchemaVersion` is 1. Every field has a default, so a half-filled draft
  always loads.
- **One validator.** `check()` lists problems in wizard order, each tagged
  with its step (`world`, `character`, `story`, `review`).
  `into_story_input()` refuses with the first problem's text, then trims every
  field, drops blank list entries and builds a `StoryStateV1` that must pass
  `validate()`. Quick Start (`quick_start`), Guided and Custom
  (`create_story`) all go through it.
- **Required fields:** setting, the player's name, title, where the story
  opens, and the first chapter's title. A player without a template id gets
  `custom:player`; other characters added by hand get `custom:npc-N`.
- **No silent merges.** A character who is both the player and another
  character, the same character twice, or a relationship to someone no longer
  in the story is a problem to fix, never merged or dropped.
- **Merge order** stays app defaults < world < scenario < character < user
  edits. Picking a template replaces only its own section (a world also resets
  narration to its defaults), so edits elsewhere survive.
- **Templates:** a scenario may list `worlds` it was written for (empty means
  any world). The field is optional, so `templateSchemaVersion` stays 1.
  Quick Start and the wizard's scenario picker only offer fitting scenarios,
  and `compose_story_draft`/`quick_start` refuse a mismatch. Template ids are
  unique across the catalog, and a scenario may only name worlds that exist.
- **Wizard draft** lives in `app_preferences` under `wizard_draft` as
  `{ mode: "guided" | "custom", step, draft, savedAt }`, at most 512 KB. The
  wizard saves it about 0.4 s after each change and on leaving the screen. It
  is cleared when the story is created or the user starts over. A draft that
  can no longer be read is ignored rather than blocking the wizard.
- **Commands:** `compose_story_draft`, `check_story_draft`, `create_story`,
  `get_wizard_draft`, `save_wizard_draft`, `clear_wizard_draft`.

## Consequences

Guided mode can build a complete story without typing (pickers, menus and
checkboxes over preset values), and any preset value can be overridden in
Custom mode; a typed value shows in Guided as "Your own: ...", so switching
modes never loses it. One active wizard draft at a time.

# ADR 0012: Story content settings, the story frame, and full disks

Status: accepted (quality sweep after PR 13)

## Context

The storyteller only knew the world, characters and scene. It never saw the
story's title, its premise or the authored chapter plan, and nothing told it
what kind of story it was telling, so a horror story and a romance got the
same instructions. MiniMe asked for every kind of story to be supported,
including erotic and fetish fiction between adults. Separately, nothing
handled a full disk: SQLite's `SQLITE_FULL` reached the user as raw database
text and automatic backups could take the last free space.

## Decision

- **Content settings live in `Narration`.** Four optional fields: `genres`
  (free text, any number), `rating` (`general`, `mature`, `explicit`; unset
  leaves it to the model), `themes` (wanted elements, including kinks in
  adults-only stories) and `limits` (never written). They use
  `serde(default, skip_serializing_if)` so older states serialize and hash
  exactly as before; `StateEdit::SetNarration` already carries them through
  Story details, storypacks and backups.
- **Prompt schema 3.** The system message gains a `STORY` section: title,
  premise, genre, rating guidance, the minors rule, themes and hard limits;
  the `NOW` section gains the current chapter's plan ("a direction to steer
  toward, not a script"). Title, premise and plan come from `stories` and
  `chapter_outlines` (`StoryFrame`), not from route state.
- **Minors are never allowed in sexual content.** Every `mature` or
  `explicit` prompt carries a fixed rule against sexual content involving
  anyone under 18. An `explicit` story refuses, on create and on every edit,
  any character whose age reads as under 18 (`names_a_minor`: a first
  number below 18, a minor word such as "teen" or "child", or a spelled-out
  number up to seventeen). The check is strict on purpose; the UI mirrors
  it and asks once (per device) that the player is 18 or older.
- **No output filtering, no explicit template text.** The app passes the
  player's settings on and leaves policy to the chosen provider; the docs
  say plainly that hosted services may refuse and local models follow the
  settings. Bundled templates stay general-audience; worlds carry `genres`.
- **Filtered replies.** When an OpenAI-compatible service ends a reply with
  `finish_reason: content_filter` and no text, the run fails with
  `CONTENT_FILTERED` and a message that points to another reply, another
  action or a model whose rules allow the story. A partly written reply that
  was cut off is kept as written.
- **Full disks.** `ErrorCode::DISK_FULL` covers `SQLITE_FULL` and the OS
  "no space" errors, with one plain message. Writes are single
  transactions, so a failed write leaves nothing half-done. Automatic
  backups skip a day when free space is below the database size plus
  200 MB. Diagnostics adds `DISK_SPACE` (warn under 1 GB, fail under
  200 MB, skipped when the size can't be read).
- **Offline storyteller.** It reacts to the kind of action (look, talk,
  move, handle), speaks through a character who is present, sets the scene
  only on a chapter's first reply, and no longer echoes the action. It
  never mentions a particular world.

## Consequences

Old stories keep working unchanged and simply have no content settings
until the player adds them. The prompt is a little longer (the STORY
section), which the context budget already accounts for. Changing the
rating guidance or the minors rule means bumping `PROMPT_SCHEMA_VERSION`.

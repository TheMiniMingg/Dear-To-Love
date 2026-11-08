# ADR 0027: Beta readiness

Status: accepted

## Context

Before a closed beta with other players, the whole app was reviewed with batches 4, 5 and 6
combined. Most findings were small fixes. These changed how something works.

## Decision

- **Models that think first.** OpenAI's GPT-5 and GPT-6 families and the o-series reason
  before they answer: they refuse a temperature while reasoning, and their reasoning counts
  toward the output limit. For these models (`gpt-N` with N ≥ 5 and `oN`, not the `-chat`
  ones or `o1-mini`), on api.openai.com only, a request sends no temperature, asks for
  `reasoning_effort: "low"`, and gets `REASONING_ROOM` (2,000) more output tokens.
  `Adapter::fit_request` applies this before usage is recorded, so the budget reserves the
  larger limit. Other OpenAI-compatible services are unchanged.
- **Refused keys.** A 400 whose body names a bad API key (Google answers that way) is
  `AUTH_FAILED`, and Google's one-item error list is read. The connection check's result is
  built in the UI from its code, so it shows in the player's language, and a paid
  connection with no key saved says so.
- **What a picture was drawn from.** `assets.made_from` (migration 0009) keeps the text the
  picture service was sent, including what to avoid, for pictures the app makes. Imported
  pictures have none. Storypacks carry it as an optional `madeFrom`.
- **Painter-ready cards.** The `<character>` card asks for apparent age, height and build,
  skin tone or heritage, hair, eyes, clothes and anything that stands out, then a few words
  on how they come across, and to keep to the looks in CHARACTERS afterwards
  (`PROMPT_SCHEMA_VERSION` 13).
- **A portrait for someone new.** With a picture connection, a new character's card has
  **Make their portrait too**, ticked unless **Settings → Pictures** turns the offer off
  (kept on this computer). The portrait is made after they join and becomes the route's
  picture for them once the route is free (no reply written or waited for), as one more
  edit event. It is route-scoped because the player may make different choices on other
  routes.
- **Ids for people added mid-story** are random (`custom:npc-<8 hex>`). Numbered ids were
  only unique on one route, so a story-wide portrait chosen for someone could show on a
  different person who took the same number on another route. Characters made with the
  story keep numbered ids, which every route shares.
- **Report a problem** (footer and palette) puts the sanitized diagnostics report above the
  player's own words. It can be copied, saved, or copied before opening the repository's
  new-issue page, a fixed URL opened from Rust. Nothing is sent by the app.
- **Long stories keep fitting.** A story a few hundred turns in, with thirty people, a full
  notebook and twenty chapters, needed more than the default 16,000-token context for its
  setup alone, so it stopped with `CONTEXT_TOO_LONG`. The cast now gets a quarter of the
  room and the confirmed facts a tenth, like the notes' fifth: the player and the people in
  the scene are always sent in full, then those the scene names, and the rest in brief
  (pronouns, species, role); the newest facts are kept and the rest counted. When the setup
  still takes more than half the room, it is packed tighter: the shares are halved, every
  earlier chapter goes in brief and only the newest twelve open threads are listed. Stories
  that fit are sent exactly as before (`PROMPT_SCHEMA_VERSION` 14).
- **Installing updates.** Testers should get fixes without downloading again, so the
  roadmap's "no auto-update installation" rule ends here, with the player in charge. The
  Tauri updater plugin is registered with an empty public key; a release built with the
  update signing key (repository secret and variable, see `docs/release.md`) gets the key,
  signs its updater files, and publishes a `latest.json` built by
  `scripts/updater-manifest.mjs`. Only such a release build offers **Install … and
  restart** in Settings → Updates (the footer notice leads there). Nothing is downloaded
  until the player presses it, the download is checked against the built-in key, and the
  checks themselves stay off until turned on. The plugin's commands are not exposed to the
  page; the Rust side runs it.

## Consequences

- Stories made before this keep their numbered ids for people added mid-story.
- A storypack with `madeFrom` is refused by an older app, like any newer field.
- Copies from a release built without the update key can't update themselves; their next
  update is a manual download. The key must be kept safe: without it, no build can update
  the copies already installed.

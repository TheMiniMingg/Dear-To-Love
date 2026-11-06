# Changelog

## Unreleased

- Create your own story (Library): a five-step wizard (world, your character, the opening and
  other characters, narration, review). Guided mode needs no typing: arrows, menus and
  checkboxes over preset values. Custom mode lets you type any field, add or remove characters
  and plan chapters. Switching modes keeps every value. The unfinished story is saved as you go
  and picked up again after closing the wizard or the app. Review lists anything left to fix
  and links to the step. The bundled set grows to four worlds (Harbor Town, The Glass Orchard,
  Meridian Station, Ashcombe 1923), four scenarios and six characters; Quick Start only offers
  scenarios written for the chosen world.
- Usage & budget (Settings): estimated cost, requests and tokens for this session, this UTC
  month or all time, by connection and model, plus the recent requests with where each count
  came from. Unknown costs are counted separately, never shown as $0. Enter each paid model's
  prices per 1M tokens. An optional monthly budget warns at a chosen percentage (dismissible
  until something changes) and can pause new paid replies that would pass it; a model without
  prices then needs an explicit "Send once without a price". Preview context shows the most the
  next reply could cost. Diagnostics warns when a budget is on and a paid model has no prices.
- Ollama connections use Ollama's own API: each request asks for the connection's context
  limit (so long prompts are not silently cut), token counts are reported, and the API-charge
  estimate is $0. The Ollama preset now uses it; "Test connection" lists installed models.
- Long stories: the storyteller keeps a rolling summary of earlier turns (written in the
  background every 8 turns; the offline storyteller summarizes without any API call), and each
  prompt is fitted to the connection's context limit, keeping recent turns word for word. A
  prompt that can never fit is refused before sending with a clear fix. Preview context in the
  pause menu shows the exact prompt, its approximate size and which turns the summary covers.
  Connections gain a context limit setting (presets for OpenAI, OpenRouter and local servers).
- Live AI storyteller: connect any OpenAI-compatible service (cloud or a local server such as
  LM Studio or Ollama) in Settings; keys stay in the system credential store. Replies stream in
  as they are written, can be stopped, and a failed or interrupted reply keeps your action with
  Retry and Change action. Every request is recorded in the usage ledger with token counts and a
  cost estimate when rates are known. Free connection test and an explicit test message.
  Diagnostics adds the AI storyteller check (contacts the service only on the deep check).
- Library, Quick Start and reader: pick a starter world, scenario and character with arrow
  pickers, play turns with the built-in offline storyteller, quick save (Ctrl/Cmd+S), save and
  load (older saves continue as a new branch), branch from any reply, restart a chapter, start
  the next chapter, rename or hide routes, delete whole stories. Unsent text survives Escape and
  closing the reader. Keyboard-only end-to-end test on Linux CI.
- Saves and replay: deterministic state reducer, snapshot caches (every 20 events, hash-checked),
  manual/quick/rotating auto saves, read-only save view, resume-as-branch, edits validated
  against the effective state, offline story engine self-test (TIMELINE_REPLAY diagnostic).
- Timeline core: typed event payloads, ancestor traversal, compare-and-swap route heads,
  forks, restart chapter, next chapter, regenerate fork, edit earlier action, hide/rename routes.
- Story database: first migration (stories, event graph, routes, saves, snapshots,
  generation runs, provider profiles, usage ledger, rate cards, preferences), single-writer
  transactions, pre-upgrade backups, startup consistency checks, migration fixtures.
- Secure key storage through the OS credential store.
- Diagnostics: database, deep integrity check, usage ledger, key storage.
- Project scaffold: Tauri 2 desktop shell, React UI, typed commands, version footer,
  Diagnostics (app version, data folder), CI.

# Changelog

## Unreleased

- **Type of story** comes first in Quick Start and the wizard and narrows the preset worlds.
  New genres include School life, Action, Cyberpunk, Post-apocalyptic, Superhero, Western and
  Dating sim.
- **How the story is told**: a style (Narrated; Thoughts and dialogue with no narrator; Script;
  Messages), other characters' **inner thoughts** after you act, and the **story language**.
- **Texts, calls, letters and posts** appear as phone and letter cards (on for new stories),
  and the action box can send a text, make a call or write your own thought. The offline
  storyteller texts and calls back. Exports write them out as plain text.
- **End chapter** replaces **Next chapter**. The storyteller writes a recap of the chapter
  (offline, from the chapter's own turns, when no AI is connected); you can edit it or write
  your own, and name the next chapter. Ending saves your place as "End of Chapter N: title",
  shows the recap at the chapter break, and sends every recap on that route with later
  replies (the new **EARLIER CHAPTERS** part of the prompt), so the story keeps what happened.
- What kind of story. The wizard's **Narration** step and **Story details → Narration** set the
  genre (any mix, or your own), a content rating (_All ages_, _Mature_ or _Adults only_),
  themes and elements you want, and hard limits the storyteller never writes. The storyteller
  now also reads the story's title, premise and the current chapter's plan with every reply.
  Adults-only stories are for players 18 or older (asked once) and refuse any character whose
  age reads as under 18; sexual content involving minors is never allowed.
- When a hosted AI service's content filter blocks a reply, you are told so and offered what to
  try next, instead of "The reply did not finish".
- Four more worlds, each with its own scenario: Hollow Pines (horror), The Ember Road
  (fantasy adventure), Larkport (romantic comedy) and Vesper City (science-fiction noir), and
  two more characters. Every world now lists its genres, shown in Quick Start.
- More AI services. **Add connection** now lists the big AI labs (OpenAI, Anthropic's Claude,
  Google Gemini, xAI's Grok, Mistral AI and DeepSeek), hosted open models (OpenRouter, Groq,
  Together AI, Fireworks AI, DeepInfra and Hugging Face) and local servers (Ollama, LM Studio,
  llama.cpp, KoboldCpp, Jan, text-generation-webui and vLLM), with the address filled in.
  Claude uses Anthropic's own API. Models that think before they answer work: their thinking
  is never shown or saved, OpenAI's reasoning models no longer fail on the temperature
  setting, and a reply that ran out of room while thinking says which setting to raise.
- **Create your own → Custom** starts from empty fields with no presets: no world, character
  or scenario to pick, just your own setting, character, starting location and opening scene.
  Other characters in Custom have an age field too. **Clear all fields** empties a draft at any
  time. To build on a preset, pick it in Guided first and switch; it carries over.
- A new story opens with its premise, the opening scene and a hint, instead of a blank page.
- The offline storyteller reacts to what you do (looking, talking, moving, handling things),
  speaks through a character who is present, and sets the scene only at the start of a
  chapter instead of in every reply.
- A full disk no longer shows a database error: you are told the disk is full and that
  everything saved before is safe. Automatic backups wait until there is room, and
  **Diagnostics** warns when free space runs low.
- Fixes: the preset character list ran names and roles together, the Story details scrollbar
  covered the fields, the Routes list showed "Main" twice (the first route is now marked
  "Original"), the Library's Delete link touched the card edge, and an over-long action is now
  stopped in the box instead of failing on send.
- [How it works](docs/how-it-works.md) explains storage, memory, limits and workarounds,
  templates and content settings. The README has examples and screenshots.

- Installers for Windows (setup and MSI), macOS (one download for Apple silicon and Intel)
  and Linux (`.deb`, `.rpm` and AppImage), published with checksums. Each one is installed and
  started on a clean machine before a release is made, and must keep a test story through a
  reinstall. The README now explains how to install, open unsigned builds and connect an AI
  model.
- Updates, About and support. **Settings → Updates** can check GitHub for a new release once a
  day; it is off until you turn it on, and **Check now** asks once. When a newer stable release is
  out, a small notice in the footer links to its release page; **Got it** hides it until an even
  newer release appears. Nothing is downloaded or installed, nothing about you or your stories
  is sent, and a failed check only shows in Settings. **About** shows the version and license
  and links to the source code. A **Support development** link appears in the footer and About
  only when one is configured.
- Diagnostics report. **Copy report…** in Diagnostics shows a report to paste into a support
  request or save as a file: versions, counts and check results, never story text, titles, API
  keys or file paths. Diagnostics also shows the state of update checks.
- Search and bookmarks. **Story search** (pause menu, the Search button or Ctrl/Cmd+F) finds
  words in what happened on the current route, never on other branches, and lists each place
  with its chapter and the matching words marked. Choosing one shows it in the story. Every
  chapter heading, action and reply has **Bookmark**; bookmarks are listed under the search
  with **Go to**, **Rename** and **Remove**, stay after the app is closed, come along when you
  branch from a later point, and travel in storypacks and backups.
- Backups. Once a day when you play, a copy of your stories is kept automatically (the newest
  five). **Settings → Backups → Back up everything** saves one file with all stories, pictures,
  settings, connections and usage records; API keys are never included. **Restore** takes a
  kept copy or a backup file, checks it first and says what it holds, then saves your current
  data as "Before a restore" and restarts to swap it in safely. Backups from an earlier version
  are upgraded; damaged ones and ones from a newer version are refused without changing
  anything. Diagnostics checks that automatic backups exist and, in the deep check, that the
  newest one opens.
- Share and keep stories. **Export…** in the pause menu saves the current route as readable
  text (Markdown or plain text, with chapter headings, who said what, and optional times) or
  the whole story as a `.storypack`: every route, saves, story summaries and the pictures it
  shows, never API keys, connections, usage records or settings. **Import storypack** in the
  library adds a pack as a new story; pictures already in your library are shared, and the same
  pack imported twice gives two separate stories. Damaged, incomplete or unsafe packs are
  refused with the reason and change nothing; packs from a newer version of the app ask you to
  update. An import interrupted by a crash or power loss is finished or undone the next time
  the app starts.
- Pictures. **Images** in the library holds PNG, JPEG and WebP pictures on this computer (up to
  20 MB each; the same picture added twice is kept once), with names, kinds and where each one
  is used. In a story, **Pictures** in the pause menu sets the background, each character's
  portrait and the cover: on this route from now on, or as the story default for every route
  that hasn't chosen its own. The current scene's background and portraits show above the story,
  and covers show in the library. An image can't be deleted while any story shows it, including
  earlier turns on other routes. Diagnostics warns about missing or damaged image files.
- Change the story as you play. **Story details** in the pause menu edits characters (add,
  change or remove), the world, narration, the current scene and open questions, and the facts
  the storyteller must keep to. Before anything is written it shows each changed field with its
  old and new value, the route it applies to and the point it takes effect from, then **Apply
  from now** records one change on that route only: earlier turns and other routes keep what
  they had. **Another reply** on any reply and **Change this action** on any of your actions
  each start a new route and leave the original as it was. Story details are unavailable while
  an action is still waiting for its reply.
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

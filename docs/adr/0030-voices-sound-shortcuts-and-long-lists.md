# ADR 0030: Voice packs, a sound switch, changeable shortcuts and long lists

Status: accepted

## Context

Players asked for voices of their own: a different voice for each character, from the
computer, from an AI voice service, or from someone else's set. Some never want sound at
all. Keyboard shortcuts were fixed. Long lists (the storyteller's rules above all, but also
pictures and the pickers in Custom Story) had no way to find one thing. Pictures could not
be GIFs, and there were six looks.

## Decision

- **A voice pack is a narrator plus a voice per character name.** Its voices come from one
  source: the computer's voices (`speechSynthesis`), ElevenLabs, or an OpenAI-style speech
  server such as Kokoro. The two AI sources are connections like any other (adapters
  `elevenlabs` and `openai_speech`): the key stays in the OS credential store, they never
  become the storyteller, and they have no test message. `speak_text` sends one piece of
  text and returns the audio bytes (ElevenLabs' PCM wrapped as WAV, or the server's WAV);
  `list_voices` lists a connection's voices (ElevenLabs' own, designed and cloned voices,
  or the server's `/audio/voices`).
- **Who is speaking** comes from the reply itself (`src/app/speakers.ts`): a `Name:` line,
  or quoted text ("" “” 「」 『』) next to a character's name, the name just after the quote
  first, else the last name before it. Names inside quotes don't count. Anything else is the
  narrator's. Neighbouring pieces from the same voice are read as one, so a reply is a few
  requests, not one per sentence, and the next piece is fetched while one plays.
- **Every AI reading is one ledger row** (`character_suggestion`, like portraits) and goes
  through the budget. A budget that pauses requests without a price asks first ("Read aloud
  anyway"). Recent readings are kept in memory (60 pieces), so reading a reply again is free.
- **Packs are local preferences, and share as files.** A pack is saved in this computer's
  preferences with the connection it uses. **Save to a file** writes a `.dtlvoices` file
  (`{format: "dear-to-love-voices", version: 1, pack}`) that holds only the pack's name,
  source, speed, narrator and character voices: never a key, connection, address or path.
  Import cleans the file (lengths clipped, at most 300 characters, empty or repeated names
  dropped, unknown fields ignored), refuses another format or a newer version, and attaches
  the first connection of the same kind. A cloned voice's id only works for the account
  that owns it, so a shared pack names voices the importer may have to pick again.
- **One Sound switch.** `dtl.sound` (on by default) silences the reply chime and reading
  aloud, and stops a reading in progress. It is in **Settings → Sound** and the Ctrl+K box.
- **Shortcuts can be changed**, except the few that typing needs (send, new line, scroll,
  move stories, close the window). **Change**, then press the keys; Escape cancels. A key
  without Ctrl/Cmd or Alt is refused unless it is a function key, the system's own keys
  (copy, paste, cut, select all, undo, redo, quit, close, hide, minimize, reload, Alt+F4,
  Tab) are refused, and keys another shortcut already uses where both work ask before they
  move. Changes live in `dtl.shortcuts`; **Put back all the usual keys** clears them. Every
  key hint, the Ctrl+K box and the shortcuts window read the same store.
- **Long lists get a search, a kind and an order** (`src/components/ListTools.tsx`). The
  search ignores case and accents and needs every word. Sorting changes only what is shown:
  rules stay in the order written, because the storyteller reads them in that order. Rules
  get a kind from keywords (`ruleCategories.ts`: limits and content, romance, magic, tech,
  tone, danger, society, everyday life, other), matched as whole words in Latin scripts and
  as text elsewhere, so a player's own rule finds its kind without asking. Rules are edited
  where they are, and the suggestions are browsed with the same tools. The image library,
  the long pickers and the character list in Story details get the same search. So that a
  few hundred rules keep up with typing, the list filters on a deferred copy of the search
  (`useDeferredValue`), each rule's kind is worked out once and remembered, and unchanged
  rows and the suggestions skip rendering (`memo` with handlers that stay the same).
  **Show all** clears the search and the kind together.
- **GIF pictures.** Migration 0010 rebuilds `assets` to allow `image/gif` (SQLite can't
  change a CHECK in place; foreign keys are off for the rebuild, and no row is dropped). The
  original file is kept as it is, so a moving GIF keeps every frame; the thumbnail is the
  first frame. Storypacks and backups carry `.gif` files.
- **Six more looks**: Forest, Ocean, Lavender, Ember, Terminal and Ink (black on white, the
  strongest contrast), with genres that pick them when a story takes a look from its genre.
- **Twelve more preset storylines**, on twelve worlds, six of them with tracked progress.

## Consequences

- AI voices cost money per reading. The first reading of a reply is billed; reading it again
  in the same session is not. Nothing is spoken unless the player presses the speaker.
- Speaker matching is a guess from the text. A line it can't place is read by the narrator,
  never by the wrong character on purpose, and a `Name:` line always wins.
- A pack imported on another computer may name voices that computer does not have; the
  computer's usual voice reads those lines until the player picks another.
- Rule kinds are a guess too. They only sort and narrow the list; nothing the storyteller is
  sent depends on them.

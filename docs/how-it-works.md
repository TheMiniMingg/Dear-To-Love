# How Dear to Love works

A plain-language tour of where your stories live, how the storyteller remembers them, what
happens when something fills up, where story templates come from, and how the AI learns what
kind of story it is telling. Developers will find the details in [`schema.md`](schema.md),
[`architecture.md`](architecture.md) and the [ADRs](adr/).

## Where everything is stored

Everything stays on your computer, in the app's data folder:

| System  | Data folder                                                       |
| ------- | ----------------------------------------------------------------- |
| Windows | `%APPDATA%\io.github.theminimingg.deartolove`                     |
| macOS   | `~/Library/Application Support/io.github.theminimingg.deartolove` |
| Linux   | `~/.local/share/io.github.theminimingg.deartolove`                |

Inside it:

| What                        | Where                                                           |
| --------------------------- | --------------------------------------------------------------- |
| Stories, saves, settings    | `story.db`, one SQLite database                                 |
| Pictures you add            | `assets/` (originals and thumbnails, each file stored once)     |
| Automatic backups           | `backups/auto/` (one a day when you play, the newest five kept) |
| Copies made before upgrades | `backups/pre-migration-…db`                                     |
| API keys                    | **Not here.** They live in your system's credential store       |

API keys go to Windows Credential Manager, the macOS Keychain or the Linux Secret Service.
They never appear in the database, logs, exports, backups or support reports.

### What a story is made of

- **The starting point.** When you create a story, its world, narration settings (including
  genre, content rating, themes and hard limits), characters, relationships, facts, opening
  scene and open questions are saved once as the story's _starting state_. The title, premise
  and chapter plan are saved next to it.
- **Events.** Everything that happens after that is an event: a chapter start, your action,
  the storyteller's reply, a change you made in **Story details**, a confirmed fact. Events
  are never edited. Each one points to the event before it, so a story is a tree.
- **Routes.** A route is a branch of that tree: a pointer to its newest event. Branching,
  **Another reply** and **Change this action** make a new route that shares the history up to
  that point. Nothing is copied.
- **Characters and settings over time.** The details in effect at any point are the starting
  state plus every change made on that route up to that point. That is why changing a
  character only affects the route you changed it on, from then on, and earlier turns keep the
  details they were written with. To make this fast, the app caches the computed state every
  20 events (`snapshots`); the cache can always be rebuilt.
- **Saves** are named pointers to a point on a route: manual saves, quick saves (Ctrl/Cmd+S)
  and five rotating autosaves per story.
- **Chapters and recaps.** **End chapter** asks the storyteller for a recap of the chapter
  (or writes one offline from the chapter's own turns), lets you edit it, then starts the next
  chapter with the recap kept on its `chapter_start` event and makes a save named "End of
  Chapter N: title". The recap belongs to that route only, like everything else on it.
- **App settings** (budget, update checks, the half-made story in the wizard) are in the
  `app_preferences` table. AI connections are in `provider_profiles`, with only a reference
  to the key.

## How the storyteller remembers

Models do not remember anything between requests. For every reply the app builds the request
again, in this order:

1. **The narration contract**: who the player controls, point of view, length, pacing, tone.
2. **STORY**: title, premise, genre, content rating, themes you want and hard limits.
3. **WORLD**: setting, era, description and the world's rules.
4. **CHARACTERS** and **RELATIONSHIPS**: everyone in the story as of this point on the route.
5. **ESTABLISHED FACTS**: facts the storyteller must keep to, and who knows them.
6. **EARLIER CHAPTERS**: the recap of each chapter you ended with **End chapter** on this
   route (the 10 most recent), so later chapters remember what happened.
7. **NOW**: the chapter and its plan, where you are, what is happening, who is present and
   the open questions.
8. **STORY SO FAR**: a summary of older turns, when there is one.
9. **Recent turns**, word for word, then **your action** last.

Every 8 replies, the older part of the story is summarized (by the same AI connection, or by
the offline storyteller without any API call), and at least the 8 most recent turns are always
sent word for word. Summaries are a cache: branches that share history share summaries, and a
summary that no longer matches the story is ignored and redone.

**Preview context** in the pause menu shows exactly what would be sent for the next reply,
with a token estimate. Nothing is sent until you play.

## Limits, and what happens when something is full

| Limit               | Value                                         |
| ------------------- | --------------------------------------------- |
| One action          | 20,000 characters (the box stops there)       |
| One reply           | 200,000 characters                            |
| One detail field    | 20,000 characters; lists up to 200 entries    |
| Story length        | No fixed limit. A few kilobytes per turn      |
| Context per request | Set per connection (default 16,000 tokens)    |
| One picture         | 20 MB                                         |
| One storypack       | 10,000 routes, 500,000 events, 2,000 pictures |

### A story longer than the model can read

This is the common "maxed out" case, and it is handled for you. Long stories never need to fit
in one request: older turns are summarized and dropped first. If room is still short, the
summary gives way to recent turns. Only when the story setup plus your action cannot fit at
all does the app stop **before sending anything** (so nothing is charged) and say so.

When that happens, or replies start forgetting things:

- **Raise the context limit** if your model supports more: **Settings → AI connections →
  Edit**. Many hosted models read 32,000 to 128,000 tokens; local models depend on your
  hardware.
- **Trim the story setup.** Character descriptions, world rules and facts are sent with every
  reply. In **Story details**, shorten long descriptions and remove facts that no longer
  matter.
- **End the chapter.** **End chapter** keeps a short recap of what happened, which every
  later reply reads, and gives the storyteller the next chapter's plan and a clear new focus.
  Edit the recap to keep the names, promises and secrets that matter.
- **Pin what matters as a fact.** Facts are always sent, so a detail the summary might lose
  belongs in **Story details → Facts**.
- **Lower the detail level or reply length** to leave more room for history.

### A full disk

SQLite grows as you play, up to the space on the disk. If the disk fills up:

- The change that could not be written is rolled back as a whole, and you see "The disk is
  full, so this could not be saved. Everything saved before is safe." Nothing half-written is
  left behind.
- Automatic backups pause when less than the database size plus 200 MB is free, so a backup
  never fills the last of the disk.
- **Diagnostics** warns when less than 1 GB is free and fails below 200 MB.

To make room: free space on the disk, delete stories you no longer need (export them first
with **Export… → Storypack** to keep a copy), and remove unused pictures under **Images**.
**Settings → Backups → Back up everything** saves one file you can move to another drive.

## Story templates

Templates are the starting points offered by **Quick Start** and the creation wizard. There are
three kinds, and any mix works:

- **Worlds**: setting, era, description, rules, and narration defaults including genres.
- **Scenarios**: title, premise, opening scene, open questions, other characters, chapter
  plan. A scenario can be tied to one world.
- **Characters**: who you play.

Bundled with the app:

| World             | Genres                          | Scenario                |
| ----------------- | ------------------------------- | ----------------------- |
| Harbor Town       | Mystery, Romance, Slice of life | The Unsigned Letter     |
| The Glass Orchard | Fantasy, Drama                  | The Memory Harvest      |
| Meridian Station  | Science fiction, Mystery        | Night Shift on Meridian |
| Ashcombe, 1923    | Historical, Romance, Comedy     | The Summer Guest        |
| Hollow Pines      | Horror, Mystery                 | Dead Air                |
| The Ember Road    | Fantasy, Adventure              | The Last Caravan        |
| Larkport          | Romance, Comedy, Drama          | The Wrong Reservation   |
| Vesper City       | Science fiction, Noir, Thriller | Ghost in the Ledger     |

and eight characters to play, from a new lighthouse keeper to a sellsword and a late-night
radio host.

### How templates are made

Bundled templates are JSON files in [`templates/v1/`](../templates/v1), built into the app.
A world looks like this:

```json
{
  "templateSchemaVersion": 1,
  "type": "world",
  "id": "starter:hollow-pines",
  "label": "Hollow Pines",
  "summary": "A mountain town cut off by the first snow of winter…",
  "world": {
    "era": "Present day",
    "setting": "Hollow Pines, a logging town high in the mountains, snowed in until spring",
    "description": "One road in, closed by snow…",
    "rules": ["Horror builds slowly: dread first, answers late"]
  },
  "narration": {
    "perspective": "second",
    "detail": "detailed",
    "tone": "Quiet, creeping dread with moments of warmth",
    "pacing": "slow",
    "genres": ["Horror", "Mystery"]
  }
}
```

To add one: write the file, add its name to `BUNDLED` in
`src-tauri/src/domain/templates.rs`, and run `cargo test`. The tests check every file and
build a story from every world, scenario and character combination.

### Your own stories

**New story → Create your own** walks through World, You, Story, Narration and Review.
**Guided** builds a whole story from presets without typing. **Custom** has no presets: it
starts from empty fields and you write your own world, character, starting location, opening
scene and everyone else in the story. To build on a preset, pick it in Guided and then switch
to Custom; what you picked carries over, and **Clear all fields** empties it again. The
half-made story is saved as you go. Everything a template sets can also be changed later, per route, in
**Story details**.

## How the AI knows what kind of story it is

Through the STORY section of the request, which is rebuilt for every reply from the story's
current settings. For an adults-only romance it might read:

```text
STORY
Title: The Wrong Reservation
Premise: The best table on the city's best rooftop is booked under your name. It is also
booked under someone else's, and they are already sitting at it.
Genre: Romance; Comedy
Content: adults only. The player is an adult who chose explicit fiction. Write sexual content
and other mature material openly and in as much detail as the scene calls for, without
moralizing, warnings or fading to black unless the player asks. All characters in sexual
content are adults (18 or older).
Never write sexual content involving anyone under 18, and never describe a character in a
sexual context as a child or with a child's body.
Themes and elements the player wants, woven in when they fit: slow burn; enemies to lovers
Hard limits, never write these even if the story drifts toward them: cheating
```

You set these in the wizard's **Narration** step, or later in **Story details → Narration**:

- **Genre**: any number, from the list or (in Custom) typed in. Anything works.
- **Content rating**: _Not set_ (the model decides), _All ages_, _Mature_ (violence, horror,
  strong language, sex without explicit detail) or _Adults only_ (explicit).
- **Themes and elements you want**: tropes, dynamics, settings, and in adults-only stories
  kinks and fetishes. The storyteller weaves them in when they fit.
- **Hard limits**: things that must never be written.

The world's rules, the tone and the chapter plan steer the story too.

## Adult and explicit stories

Dear to Love supports any kind of fiction between adults, including erotica, dark themes, and
kinks and fetishes you list as themes. How it works:

- Choosing **Adults only** asks once whether you are 18 or older.
- An adults-only story must have only adult characters. The app refuses to create or save one
  where any character's age reads as under 18 ("16", "teen", "child" and the like). This rule,
  and the instruction never to write sexual content involving anyone under 18, cannot be turned
  off.
- **The model decides what it will write.** The app passes your settings on and does not
  filter replies, but providers have their own rules. Many hosted services (OpenAI among them)
  refuse explicit content and may act on accounts that ask for it. Local models through
  [Ollama](https://ollama.com) or [LM Studio](https://lmstudio.ai) follow your settings and
  keep everything on your computer, and services like OpenRouter list models with different
  policies. Check your provider's terms. When a service's content filter blocks a reply, the
  app says so; your action stays, and you can ask for another reply or switch the storyteller.
- Stories stay on your computer. The only thing that leaves it is what **Preview context**
  shows, sent to the connection you chose.

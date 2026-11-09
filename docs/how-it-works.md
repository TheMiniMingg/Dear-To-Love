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
- **Pictures** are either shared with every story or kept for the stories listed in
  `asset_stories`. Pictures added from a story or while creating it are that story's own.
  Deleting a story keeps its pictures in the library (under **Not in any story**).
- **App settings** (budget, update checks, the half-made story in the wizard) are in the
  `app_preferences` table. AI connections are in `provider_profiles`, with only a reference
  to the key. A story that picked its own storyteller names the connection on its `stories`
  row; the story's summaries, recaps and facts don't depend on the connection, so switching
  keeps them.

## How the storyteller remembers

Models do not remember anything between requests. For every reply the app builds the request
again, in this order:

1. **The narration contract**: who the player controls (only you decide what your character
   does, says, thinks and feels), that the storyteller plays everyone else from their own
   personality and goals rather than a script, that the world carries on across chapters
   with lasting consequences, that a chapter can cover a night or months, and the style,
   point of view, length, pacing, tone, other characters' inner thoughts and the story
   language.
2. **MESSAGES**: how to write texts, calls, letters and posts so the reader can show them as
   cards, when that is switched on.
3. **DICE**: how to ask for a roll and set its odds, when dice are on.
4. **MEMORY NOTES**: how to keep the story's notebook (below), unless you keep it yourself.
5. **STORY**: title, premise, genre, content rating, themes you want and hard limits.
6. **WORLD**: setting, era, description and the world's rules.
7. **CHARACTERS** and **RELATIONSHIPS**: everyone in the story as of this point on the route,
   with their stats.
8. **ESTABLISHED FACTS**: facts the storyteller must keep to, and who knows them.
9. **MEMORY**: the story's notes, grouped as People, Places, Things, Timeline and Other facts.
10. **EARLIER CHAPTERS**: the recap of each chapter you ended with **End chapter** on this
    route: the 10 most recent in full and the 40 before them in brief (their first sentences).
    Older chapters are left to the summary and the notes.
11. **NOW**: the chapter and its plan, where you are, what is happening, who is present and
    the open questions.
12. **STORY SO FAR**: a summary of older turns, when there is one.
13. **Recent turns**, word for word, then **your action** last.

Every 8 replies, the older part of the story is summarized (by the same AI connection, or by
the offline storyteller without any API call), and at least the 8 most recent turns are always
sent word for word. Once a chapter is ended with a recap, the recap stands in for that
chapter's turns at once: only its last exchange is sent again word for word, so the next
chapter picks up from the same moment, and a long chapter's room is freed without waiting for
the summary to catch up. A chapter ended with an empty recap keeps its turns. Summaries are a cache: branches that share history share summaries, and a
summary that no longer matches the story is ignored and redone.

### Memory notes

A summary shortens everything a little, so a detail such as a ring given in chapter 4 could
fade by chapter 9. Memory notes keep such details whole. As it writes, the storyteller ends a
reply with a note when something lasting happens or comes to light:

```text
<remember person="Erika">Your girlfriend since chapter 4. Wears the silver ring you gave her.</remember>
<remember place="Z's house">A two-floor house in the suburbs with a blue door.</remember>
<forget item="Old phone"/>
```

There is one note for each kind and name (People, Places, Things, Timeline events and Other
facts). A new note with the same kind and name replaces the old one, so a note always says
where things stand now, and `<forget …/>` removes one. Timeline events keep the chapter they
happened in. The reader never shows the tags: under the reply, a **Memory updated** line names
what was noted, with **See notes** and **Undo** (which takes the notes back and leaves the story
as it is). A story keeps up to 400 notes.

Notes are part of the story like everything else, so they follow branches: going back to an
earlier save or branching from an old turn gives the notes as they were then. The notebook in
**Story memory** lists them, and you can add, change or remove any note while the story goes
on; the change is saved like a **Story details** edit and holds from the next reply on.
To keep the notebook yourself, turn off **Let the storyteller keep memory notes** in **Story
details**: the storyteller still reads the notes but no longer writes them.

Every note is sent while the notes fit in a fifth of the request (the connection's context
limit less the room kept for the reply). Beyond that, notes about the people, places and things
in the current scene and the latest turns come first, then the newest of the rest. Notes that
do not fit are still named, so the storyteller knows they exist.

The cast and the facts work the same way. Everyone is sent in full while the cast fits in a
quarter of the request; beyond that, you, the people in the scene and those the latest turns
name are sent in full, and the rest in brief (pronouns, species and role), with a line saying
they are kept in full. Confirmed facts get a tenth, newest first, and the storyteller is told
how many earlier ones were left out. Nothing is removed from the story itself.

### Threads, new characters, ideas and the scene

The storyteller fills in a few more things as it writes, each one yours to change:

- **Threads to follow.** Promises, mysteries, goals and plans the story has not settled are
  written as `<thread>Find out who sent the letter</thread>`, and
  `<thread done>Find out who sent the letter</thread>` settles one. They show on the **Memory
  updated** line (Undo takes them back too) and in **Story memory → Threads to follow**,
  where you can tick one off, reword it, remove it, add your own or reopen a settled one. Up
  to 40 open and 40 settled threads are kept; every request lists the open ones.
- **Someone new.** When a named character joins who is not in the cast, the reply ends with
  a tag for them:
  `<character name="Rowan Ellis" role="barista" age="30s">How they look.</character>`. A card
  under the reply offers **Add to the cast** (as they are), **Change first** or **Not now**
  (remembered on this computer). Added, they join the scene and every later request. An
  adults-only story refuses anyone whose age says under 18.
- **Ideas for your next move.** Each reply ends with two or three `<next>…</next>` ideas.
  They sit above the empty action box; picking one puts it in the box to send or change.
  **Help with your next move** (Story details, Tune the telling, Preset Story) switches
  between these ideas, **Choices A–D** and **Off**. With choices the prompt's `CHOICES`
  section asks for exactly four `<next>` choices that take the story different ways (one
  bold, one careful, one about someone else, one unexpected); the reader letters them A to
  D, and clicking one sends it as the player's turn. That costs a few more output tokens
  per reply than the ideas (four lines of up to fifteen words instead of two or three of up
  to ten).
- **Where and when.** The storyteller marks a new place or time with
  `<scene place="…" time="…"/>`. With headings on, the mark shows as a heading; off, it is
  hidden, but the scene above the story and in **Story details** follows it either way, and a
  save's name starts from it.
- **The next chapter's title.** When a story has no planned title for the next chapter, the
  recap ends with a suggested one, which **End chapter** offers to keep or change.

Threads and new characters are asked for only while the storyteller keeps the memory notes.
None of the tags are shown as story text, and all of them follow branches like the rest.

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
in one request: older turns are summarized and dropped first. When the story setup itself
(cast, facts, notes, chapter recaps and threads) would take more than half the request, it
is packed tighter: smaller shares for the cast, facts and notes, every earlier chapter in
brief, and only the newest twelve open threads, so the summary and newest turns still fit. If
room is still short, the summary gives way to recent turns. Only when the story setup plus
your action cannot fit at all does the app stop **before sending anything** (so nothing is
charged) and say so.

The reader shows how close a story is to this. The **memory gauge** in the status line
(**Memory 42%**) is the share of the next request's room (the context limit less what is
kept for the reply) that the story setup, memory and turns already fill, read from the same
preview as **Preview context**. At 80% it turns amber with advice to end the chapter soon;
when the summary has been dropped or turns are being left out, it reads 100% and turns red,
with **End chapter** and **Preview context** beside it. When the story setup and your action
alone no longer fit, no reply can be written: the warning says so and offers **Story details**
instead of **End chapter**, since a recap would only add to the setup. The offline storyteller
reads no request, so it shows no gauge. **Story memory** says how many of the newest turns
are read word for word and that ended chapters are read from their recaps.

When that happens, or replies start forgetting things:

- **Raise the context limit** if your model supports more: **Settings → AI connections →
  Edit**. Many hosted models read 32,000 to 128,000 tokens; local models depend on your
  hardware.
- **Trim the story setup.** Character descriptions, world rules and facts are sent with every
  reply. In **Story details**, shorten long descriptions and remove facts that no longer
  matter.
- **End the chapter.** **End chapter** keeps a short recap of what happened, which every
  later reply reads in place of the chapter's turns, so the room they took is free at once,
  and gives the storyteller the next chapter's plan and a clear new focus.
  Edit the recap to keep the names, promises and secrets that matter.
- **Pin what matters as a note or a fact.** The newest facts are always sent, and notes are
  sent while they fit, so a detail the summary might lose belongs in the notebook in **Story memory** or
  in **Story details → Facts**.
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

Templates are the starting points offered by **Preset Story** and the creation wizard. There are
three kinds, and any mix works:

- **Worlds**: setting, era, description, rules, and narration defaults including genres.
- **Scenarios**: title, premise, opening scene, open questions, other characters, chapter
  plan, and optionally the bars, counters and items it starts with. A scenario can be tied to
  one world.
- **Characters**: who you play.

Bundled with the app:

| World                   | Genres                                      | Scenario                              |
| ----------------------- | ------------------------------------------- | ------------------------------------- |
| Harbor Town             | Mystery, Romance, Slice of life             | The Unsigned Letter                   |
| The Glass Orchard       | Fantasy, Drama                              | The Memory Harvest                    |
| Meridian Station        | Science fiction, Mystery                    | Night Shift on Meridian               |
| Ashcombe, 1923          | Historical, Romance, Comedy                 | The Summer Guest                      |
| Hollow Pines            | Horror, Mystery                             | Dead Air                              |
| The Ember Road          | Fantasy, Adventure                          | The Last Caravan                      |
| Larkport                | Romance, Comedy, Drama                      | The Wrong Reservation                 |
| Vesper City             | Science fiction, Noir, Thriller             | Ghost in the Ledger                   |
| Northgate University    | School life, Romance, Comedy, Slice of life | Midterm Week                          |
| The Underhalls          | Adventure, Fantasy, Action                  | The Lantern Job                       |
| Neon Harbor             | Cyberpunk, Thriller, Science fiction        | Clean Slate                           |
| The Dry Country         | Post-apocalyptic, Adventure, Drama          | The Water Run                         |
| Lumen City              | Superhero, Action, Comedy                   | Night of the Blackout                 |
| Dust Creek              | Western, Adventure, Drama                   | The Stage from Redwater               |
| The Lantern Palace      | Historical, Drama, Romance                  | The Empress's Tea                     |
| Maple & Fern            | Dating sim, Romance, Slice of life          | First Week at the Café                |
| Greywatch               | Fantasy, Adventure, Action                  | The Shifting Deep ★; The Lost Party ★ |
| Arclight                | Cyberpunk, Action, Science fiction          | Going Dark ★; The Last Free Radio ★   |
| The Saltmarsh Lyceum    | School life, Fantasy, Romance               | Familiar Trouble ★                    |
| Brackwater, 1891        | Horror, Mystery, Historical                 | The Thirteenth Bell ★                 |
| Juniper Heights, Day 41 | Post-apocalyptic, Horror, Action            | The Supply Run ★                      |
| The Tallow Drift        | Science fiction, Adventure, Comedy          | The Ghost Liner ★                     |
| Star Lane               | Romance, Drama, Slice of life               | Ninety Days to Debut ★                |
| The Tumbledown Isles    | Slice of life, Fantasy, Comedy              | The Potion Shop on Pell Island ★      |
| The Velvet Court        | Romance, Horror, Drama                      | The Treaty Night ★                    |
| The Aurelia, 1934       | Mystery, Historical, Thriller               | The Empty Cabin ★                     |
| The Shattered Main      | Adventure, Action, Comedy                   | Captain by Morning ★                  |
| The Nine Rivers         | Action, Fantasy, Historical                 | The Stolen Manual ★                   |
| The Rosaline Court      | Romance, Fantasy, Comedy                    | The Villainess Wakes ★                |
| Calder Falls            | Mystery, Science fiction, Drama             | Tuesday, Again ★                      |
| Isla Monarch            | Thriller, Action, Drama                     | One Night at the Monarch ★            |
| Doomspire Tower         | Superhero, Comedy, Action                   | Local 404 ★                           |
| The Ashen Throne        | Fantasy, Drama, Action                      | The Regent's First Winter ★           |

and 27 characters to play, from a new lighthouse keeper to an elf hedge mage, a netrunner, a
pirate quartermaster and a duke's daughter with a terrible reputation. Scenarios marked ★
start with **Keep track of health, items and more** turned on, with bars, counters and items
written for them (the party's health and mana in Greywatch, the ship's hull in the Tallow
Drift, each vampire house's favor in the Velvet Court). Preset Story and the wizard show what
a scenario tracks before you start, and you can change or remove any of it.

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

A scenario can start the story with bars, counters and items. Add a `tracking` block in the
same shape Story details uses (`who` names a party member, or a ship or house):

```json
"tracking": {
  "meters": [
    { "name": "Health", "value": 100, "max": 100 },
    { "name": "Gold", "value": 25 },
    { "name": "Health", "value": 140, "max": 140, "who": "Dorn Ashgrave" }
  ],
  "inventory": true,
  "items": [{ "name": "Healing draught", "qty": 2, "description": "Restores a good deal of health." }]
}
```

To add one: write the file, add its name to `BUNDLED` in
`src-tauri/src/domain/templates.rs`, and run `cargo test`. The tests check every file and
build a story from every world, scenario and character combination.

### Your own stories

**Custom Story** walks through World, You, Story, Narration, Pictures and Review. It opens
in **Custom**: every field starts empty and takes your own words or a pick from a list (the
type of story, setting, era, name, pronouns, role, species, tone and more), and × clears it
again. Only your name is needed. **Guided** starts from presets instead (a world, a character
and an opening, chosen with arrows and menus), and **None (start blank)** takes one back.
Switching to Custom before changing anything starts blank again; after a change, what you
picked carries over, and **Clear all fields** empties it. Fields most people can skip are
folded under **More options**, which opens by itself when something in it is filled in.
**RPG mode**, a switch on the World step, turns on dice and sets up stats, bars (health,
mana and so on) and starting items under You; switched off, the story has no numbers and
stats are left out. The half-made story is saved as you go.

Anything left empty is left open, and the storyteller is told so. A world with nothing in it
reads `Left open by the player: let it take shape from the opening and from what they do.`,
and after the characters comes `Anything not given here (looks, age, species and so on) is
left open: don't bring it up unless the story needs it or the player does, and once it is
said, keep to it.` A story without a title is called _Untitled story_, and an unnamed first
chapter _Chapter 1_. Everything a template sets can also be changed later, per route, in
**Story details**.

#### Presets of your own

A story you made can be kept as a **preset**: the creation wizard's draft, rebuilt from the
route as it stands now (**Save as a preset…** under More on a story card). It takes the
title and premise, the world and its rules, the narration without the note to the
storyteller, the cast with the player marked as yours, the relationships, the scene, the open
threads, the first chapter's title and the tracking, with bars set back to full. Turns, memory
notes, established facts and pictures stay with the story. Presets live in the `user_presets`
table and are listed under **Preset Story → Your presets**; beginning one is exactly
finishing the wizard with that draft, and **Change first** opens the wizard on Review with
it. A preset saved as a file is JSON with a format name and version (`.dtlpreset`); the app
refuses a file that is not one, or one from a newer version, and the file never holds a key,
a picture or a setting.

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

- **Genre**: the type of story plus any number of **More genres**, from the list or typed
  in. Anything works.
- **Content rating**: _Not set_ (the model decides), _All ages_, _Mature_ (violence, horror,
  strong language, sex without explicit detail) or _Adults only_ (explicit).
- **Themes and elements you want**: tropes, dynamics, settings, and in adults-only stories
  kinks and fetishes. The storyteller weaves them in when they fit.
- **Hard limits**: things that must never be written.

The world's rules, the tone and the chapter plan steer the story too. The plan is only a
guide: the storyteller is told to follow the story when it goes another way, and to drop or
rework the plan.

**Type of story** is the first choice in Preset Story and in the wizard. It narrows the preset
worlds to ones made for that type and leads the story's genres. A type with no preset world
yet (such as _School life_) still makes that kind of story from any world.

## How the story is told

Also in **Narration** (wizard and Story details). Under the **Style** picker, a short example
shows how the chosen style reads, drawn the way the reader draws it, with a heading, a thought
or a text card when those are on.

- **Style**: _Mixed_ (the usual for a custom story: narration, dialogue, thoughts and
  messages, each where the moment suits it), _Narrated_ (a narrator and dialogue), _Script_ (`Name: "line"`, with short stage
  directions in italics), _Roleplay chat_ (actions in italics, dialogue in quotes and short
  replies), _Thoughts and dialogue, no narrator_ (only what the characters say and think, with
  at most a short line of action), _Messages_ (told mostly through texts, calls, letters and
  posts) or _Text adventure_ (where you are, what you can see and the ways onward). Any
  style but Mixed is a starting point, not a rule: the storyteller is told it can shift for
  a moment (a text exchange, a letter, a private thought) and come back. **Your own style**
  describes it in your own words (`like a cozy anime, lots of banter`), sent as
  `How the player would like it told: …`.
- **Point of view** ("You open the door.", "I open the door." or "Sam opens the door.") and
  **Tense** (present, past, or not set to let the storyteller choose).
- **Detail** and **Pacing**: how long each reply is and how fast events move.

**Features** lists what the storyteller can do, each with a box to turn it off:

- **Show other characters' inner thoughts**: after you act, the characters can show what they
  really think of it, even when they don't say it. Your own character's thoughts are always
  yours to write.
- **Show texts, calls and letters as cards** (on for new stories): the storyteller writes
  messages as tags and the reader shows them as a phone screen, a call, a letter or a post.
  For example `<text from="Erika K." time="7:11 PM">Is that really you?</text>` becomes a text
  bubble from Erika K. Any model that follows instructions can do this; the offline storyteller
  answers your texts and calls in kind, and now and then texts you first. **Characters can text or call you first** (on) lets them
  start a conversation when they have a reason; off, only you do.
- **Texts that read like texts**: with cards on, the storyteller is asked to write each
  character's texts the way that person would (short, casual, often several in a row, with
  emoji, slang or lowercase only when it suits them), to make calls sound like real speech,
  and to let characters text or call first when they have a reason. A character with a
  portrait shows it as their picture on the card.
- **Show a heading when the place or time changes** (on for new stories): the storyteller
  starts a new place or time with `<scene place="Countryside" time="7:11 PM"/>`, which the
  reader shows as a heading, "Countryside — 7:11 PM", and exports write as
  `[Countryside, 7:11 PM]`.
- **Let the storyteller add your small reactions** (off): the storyteller may write that your
  character nods, laughs or glances, but never what they say, choose, think or feel beyond
  what you wrote. Off, it writes nothing for your character at all.
- **Twists and surprises**: _Sometimes_ (when the story calls for one), _Often_ (complications
  keep coming) or _None_ (what happens follows only from what you and the characters do).
- **Roll dice for uncertain moments**, with its **Dice settings** folded away below it (see
  [Dice](#dice)).

The story's language is set in the same place:

- **Story language**: the language the story is written in, whatever language you type in.
  Summaries and chapter recaps follow it too. New stories start with the app's language
  (Settings → Language) when it is Chinese, Japanese or Korean. Not set, most models answer in
  your language.

The menu next to the action box sends what you write as a **text** to someone, a **call**, or
a **thought** of your own instead of an action. They are saved in the story as the same tags,
so exports write them out as plain text, such as `[Text to Mara] Are you awake?`.

### The app's language

**Settings → Language → App language** switches every menu, button and message between
English, Simplified Chinese, Traditional Chinese, Japanese and Korean, or follows the
computer (the default; Taiwan and Hong Kong get Traditional Chinese). It is a setting of this
computer, not of a story: it isn't in backups or storypacks, and changing it never changes a
story's own language. The preset worlds, characters, races and rules are story content and
stay in English; the storyteller writes in the story's language whatever language they are
in. The names the app gives things itself ("Main", "Alt 2", "Autosave", "Portrait of …") are
stored in English and shown in the app's language. Diagnostics shows each check's name in the
app's language, but the details and the copied report stay in English so they can be read by
whoever helps you.

### The app's background picture

**Settings → Background picture** shows a picture from the image library behind every screen,
under a veil in the page colour so text stays readable (**How much of the picture shows**: a
little, some or a lot). Like the app language it is a setting of this computer, kept outside
the database, so it isn't in backups or storypacks. Deleting the picture in **Images** removes
it as the background too.

## Dice

Turn on **Roll dice for uncertain moments** in **Narration** (on by default for Adventure,
Fantasy and School life stories). Then:

- When you try something risky, the storyteller stops at the moment of truth and asks for a
  roll, such as `1d20, needs 12` or a range such as `40-100`. It sets the odds from the story
  so far: if your character studied twice for a test scored 0 to 100, the roll might be 40
  to 100. Press **Roll** on the card.
- The app rolls, not the AI, using your computer's random source, so every number is equally
  likely. The result is saved with your action: asking for another reply or changing your
  words never rerolls it.
- Your character can have **stats** (a name and a number, such as Smarts 2). Add them in the
  wizard's **You** step or in **Story details → Characters**. A roll that uses a stat adds it.
- **Roll dice** in the menu next to the action box rolls on your own: pick the dice, a stat
  and the number you need.
- The storyteller narrates what the roll decided, success or failure. The offline storyteller
  asks for a roll when you try something risky.

**Dice settings**, folded away under the dice box, change the rules for one story. Each one
left as it is keeps the usual behavior:

- **Who asks for rolls**: the storyteller (and you, any time), or only you, when you choose to.
- **Dice for every roll**: such as `1d20`, `2d6` or `0-100`. Every roll the storyteller asks
  for uses these dice, whatever it wrote; empty lets it pick dice that suit the moment.
- **How often to ask**: only at big moments, when it matters (usual), or whenever the outcome
  is uncertain.
- **Odds**: generous, fair (set from the story) or tough.
- **Add your stats to rolls** (on): off, rolls never add a stat, and the action box hides it.
- **Critical rolls** (off): on a single die, the top number is a critical success and a 1 a
  critical failure, whatever the target. The card says so, and the storyteller makes it
  spectacular or a disaster.
- **Show the number needed before you roll** (on): off, the card keeps the target hidden
  until the dice land.

## Health, items and more

For stories played like an RPG, turn on **Keep track of health, items and more** in the
wizard's **Narration** step or in **Story details → Narration**. It starts with what suits
the kind of story: Health, Mana and Gold for fantasy and adventure, Health and Credits for
science fiction, Affection for romance, and Health and Money otherwise. Change any of it:

- **Bars** have a maximum, such as Health 80/100. **Counters** don't, such as Gold 35 or
  damage dealt. Each has a name, a value and, if it isn't yours, whose it is (a party
  member's or a rival's). Up to 24.
- **Keep an inventory** (on): what you find, buy or are given, each with how many and a
  description. Add starting items, such as a rope or a letter. Up to 200 kinds of item.

As the story goes, the storyteller is told the current numbers and the inventory, and writes
a short tag right where something changes them: a goblin's blade, a potion, a chest with a
key in it. The app does the arithmetic, keeps bars between 0 and their maximum, and shows
each change in the story as a small chip ("Health −12", "+1 Rusty Key"). Tags you type in
your own action are ignored, so a story can't be cheated by writing one.

Your bars and counters show above the action box. **Inventory** next to them (or **Status
and inventory** in the pause menu) lists everyone's bars and every item with its
description. **Make a picture** asks your picture connection for a picture of the item (the
object alone, safe for work), kept for this story.

Each route keeps its own numbers: going back, branching or asking for another reply gives
the values from that point of the story. **Story details** changes them by hand, from now on
on that route, like any other detail.

## Playing offline

The built-in **offline storyteller** needs no AI service and no internet, and costs nothing.
It is for trying the app out and for a quick game when no model is at hand. Its replies are
short and made from prepared lines, so they never know your world the way a model does, but
they follow the story:

- **The kind of story.** Fantasy, science fiction and cyberpunk, horror and mystery, romance
  and slice of life, and adventure each have their own scenes: torchlight and runes, neon and
  drones, creaking floorboards, coffee and late light, open country and distant thunder. It
  goes by the genres first, then by the era.
- **What you do.** Looking around turns up clues, moving on finds a new place, fighting,
  casting a spell, resting, buying and searching each get their own outcome.
- **The characters.** Someone in the scene answers when you talk to them, and reacts when you
  do something, in a voice that fits their personality: cheerful, wry, shy, gruff or plain.
- **Texts and calls.** Your texts get replies the way that character texts (several short
  messages, lowercase or emoji when it suits them), and calls sound like calls, with pauses.
  With cards on, someone texts you first now and then, unless **Characters can text or call
  you first** is off. There are no phones in fantasy or adventure worlds.
- **Your settings.** Each style (a script with stage directions in the third person, roleplay
  chat, thoughts and dialogue, messages, a text adventure with the ways onward), the point of
  view, detail, place headings, inner thoughts and how often twists come. It always writes in
  English and in the present tense.
- **Dice.** It asks for a roll when you try something risky, as often as **Dice settings**
  say, with the story's own dice and odds, and never when only you ask for rolls. A critical
  roll gets a spectacular success or a disaster.
- **Health, items and more.** In a story that keeps track, a lost fight costs health, a won
  one pays gold or experience, a spell costs mana, rest brings some back, buying costs money,
  searching sometimes turns up an item that suits the world, using a potion heals, and
  talking warms a character up.

Every reply depends only on the story and your action, so asking again gives the same reply.

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
  shows, sent to the connection you chose, and, when you make a portrait, the description
  **Show what is sent** shows, sent to your picture connection.

## Portraits

A picture connection (Settings → Pictures) makes a character's portrait from their
description. It is a separate kind of connection: OpenAI's images API (and servers that copy
it) or Stable Diffusion WebUI's API. It never writes story replies, and a story connection
never makes pictures.

- **What is sent**: one description, built from the character's species, gender or pronouns,
  age, role, looks and up to three personality traits, plus the world's era and setting for
  the clothes and background. Names, story text and hidden details are never sent. **See or
  change what is sent** in the portrait panel shows the description, and you can rewrite it
  before the picture is made (item pictures too).
- **Always safe for work.** Every description, yours too, ends with "One person, fully
  clothed, safe for work, no text", and asks the service to avoid nudity, sexual content and
  gore, whatever the story's rating. These can't be changed.
- **Where it goes**: the picture joins the library like any picture you add, labelled
  "Portrait of …" and tagged Portrait, and is kept for that story only (for a story still
  being created, for the story once it is made).
- **Cost**: each picture is one request, recorded in Usage as "Character picture". The app
  can't price pictures, so paid ones show no estimate; when the budget pauses paid requests,
  the app asks before sending one.

## Picture view

When a story has a background or portraits, the reader shows a stage above the story: the
scene's background with the portrait and name of the character the story is with, as in a
visual novel. The app works out who that is from the replies, on this computer, without
asking the storyteller:

- A character with a portrait who appears in a reply for the first time, or again after
  three replies away, takes the stage. A text, call or letter from them counts.
- The character on stage stays while the replies keep mentioning them, even when others are
  mentioned too. When they drop out, whoever the reply mentions most takes over.
- Names match as whole words (a first name counts when no one else shares it); names in
  Chinese, Japanese or Korean match anywhere in the text. Your own character is never on
  stage.
- The small portraits beside the stage put anyone else in the scene on stage until the next
  reply.

**Picture view** on the right side of the story turns the stage off for text only, and on
again. The choice is kept on this computer.

### A picture for each place

The storyteller marks each change of scene with its place (`<scene place="The pier"/>`), and
the stage can follow it. **Pictures → Places** in the reader lists where the story is now,
the places it has been, the places in its memory notes, and the ones that already have a
picture; **Another place** names one ahead of time. A place's picture is a slot like any
other (`place:<name in lower case>`, as items are keyed), so it can be chosen for one route
from now on or as the story default, and it goes into storypacks and backups. While the
scene's place has a picture, the stage shows it instead of the background; otherwise the
background shows as before.

## Keyboard shortcuts

**F1** (or **Ctrl+/**) shows every shortcut, from any screen; so does **Shortcuts** on the
right side of the story, **Keyboard shortcuts** in the pause menu and in the footer. On a
Mac, use **⌘** wherever this says Ctrl; the app shows the keys the way your computer names
them. Buttons show their keys when you point at them, and the pause menu lists them beside
each item.

| In a story                              | Keys                |
| --------------------------------------- | ------------------- |
| Send what you wrote / new line          | Enter / Shift+Enter |
| Pause menu                              | Esc                 |
| Quick save                              | Ctrl+S              |
| Save / Load                             | Ctrl+L              |
| Story search                            | Ctrl+F              |
| Bookmark the latest reply, or remove it | Ctrl+B              |
| Routes                                  | Ctrl+G              |
| Story details                           | Ctrl+I              |
| Story memory                            | Ctrl+Shift+M        |
| End chapter                             | Ctrl+E              |
| Picture view on or off                  | Ctrl+P              |
| Larger / smaller text                   | Ctrl+= / Ctrl+-     |
| Jump to the latest and write            | Ctrl+J              |
| Scroll the story                        | ↑ / ↓               |

In the library, **Ctrl+N** starts a new story and ↑/↓ move between stories. Anywhere,
**Ctrl+,** opens Settings and **Esc** closes a window.

Shortcuts with Ctrl work while you type in the action box. With the pause menu open, they go
straight to their window; with any other window open, only Quick save works, so a window
never loses what you typed in it. Letters match by their place on the keyboard, so the
shortcuts also work with a Korean, Russian or other layout switched on.

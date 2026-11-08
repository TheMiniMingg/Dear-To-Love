# Dear to Love

Dear to Love is a desktop app for playing interactive stories with AI. Pick a world, a
character and a situation, write what you do, and the storyteller writes what happens next
and plays everyone else. Cozy romance, dungeon raids with a party, cyberpunk resistance,
horror, mystery, school life, and explicit stories for adults all work.

Everything stays on your computer: your stories, saves and pictures. You bring your own AI,
either a service like OpenAI or Claude with your API key, or a free model running on your own
computer. A built-in offline storyteller lets you play with neither.

Windows, macOS and Linux. The app is in English, Simplified Chinese, Traditional Chinese,
Japanese and Korean, and stories can be written in many more languages.

![A café story told in script style: where and when at the top, the scene's picture and portraits, speakers' portraits beside their lines, and the action pills and tools](docs/screenshots/reader.webp)

## Highlights

- **Start in a few clicks** from 33 worlds, 47 scenarios and 27 characters, or build your
  own story from scratch. Bring a character from another story, or from a character card.
- **Tell it your way**: narrated, script (like the story above), roleplay chat, thoughts and
  dialogue, mostly messages, or a classic text adventure, each with an example before you
  choose.
- **Texts and phone calls** show up as phone cards, written the way each character really
  texts and talks. You can text and call them too.
- **RPG tracking**: health and mana bars, counters such as gold, and an inventory with item
  descriptions and pictures. The storyteller changes them as things happen.
- **Dice** for risky moments, with every rule adjustable.
- **Picture view**: the scene's background and the portrait of whoever you are with, like a
  visual novel. One click switches to text only.
- **Play several stories at once**, branch from any moment, and keep long stories consistent
  with automatic memory.
- **Characters with feelings**: a bar for how each character feels about you, from cold to
  devoted or from suspicious to complete trust, that moves as the story goes.
- **Made for reading**: a book font, chapters that open like a book's, each character's name
  in their own color, and twelve themes (Rose, Midnight, Parchment, Neon, Café, Gothic,
  Forest, Ocean, Lavender, Ember, Terminal and the high-contrast Ink). A story can take the
  look that fits its genre, any reply can be read aloud in a voice for each character, and
  any route can be saved as an e-book.
- **Every feature can be switched off** with a checkbox.

## Download

> **Downloads arrive with the first release.** Dear to Love is still being built, so there is
> no installer on the [Releases page](https://github.com/TheMiniMingg/Dear-To-Love/releases)
> yet. Until then you can [build it from source](#build-from-source).

Testing the beta? [The beta guide](docs/beta-testing.md) covers installing, a first story and
reporting problems in ten minutes.

<details>
<summary>Which file to pick, and opening an unsigned build</summary>

| System                          | File                                                             |
| ------------------------------- | ---------------------------------------------------------------- |
| Windows 10/11 (64-bit)          | `…_x64-setup.exe` (installs for you only) or `…_x64_en-US.msi`   |
| macOS (Apple silicon and Intel) | `…_universal.dmg`: open it and drag Dear to Love to Applications |
| Debian, Ubuntu (64-bit)         | `…_amd64.deb`: `sudo apt install ./Dear.to.Love_…_amd64.deb`     |
| Fedora, openSUSE (64-bit)       | `….x86_64.rpm`                                                   |
| Other Linux (64-bit)            | `…_amd64.AppImage`: `chmod +x` it and run it                     |

Each release lists SHA-256 checksums in `SHA256SUMS.txt`.

The builds are not code-signed yet, so your system warns you the first time:

- **Windows:** SmartScreen says it "protected your PC". Choose **More info → Run anyway**.
- **macOS:** right-click the app → **Open**, or System Settings → Privacy & Security →
  **Open Anyway**. If macOS says the app "is damaged", run
  `xattr -dr com.apple.quarantine "/Applications/Dear to Love.app"` in Terminal once.
- **Linux AppImage:** some distributions need `libfuse2` (`sudo apt install libfuse2`).

Installing a newer version keeps your stories. Turn on update checks in **Settings → Updates**
to be told when a new release is out. From there, **Install … and restart** installs it in one
step (the download is checked against the app's own signature first); otherwise download it
from the release page.

</details>

## Getting started

1. **Preset Story** opens a ready-made story. Pick a type of story, a world, a scenario and
   who you play with the arrows; the story shows as a cover, in the look it will be read in,
   with its cast and first page. Then **Start story**. To make your own instead, choose
   **Custom Story**.
2. Write what you do and press Enter. Without any setup, the built-in offline storyteller
   answers, so you can try everything first.
3. When you want a real AI storyteller, open the **Setup guide** (in the library, in
   Settings and at the bottom of every screen). It starts with the short version, recommends
   a few models with what a reply costs, sets up a connection with one click, and spells out
   every click for each service if you want it.

![Preset Story: The Unsigned Letter as a cover in Midnight, with its genres, cast, first page and Start story](docs/screenshots/quickstart.webp)

_Preset Story: pick with the arrows, see the cover, cast and first page, then Start story._

## A story, step by step

**1. Say what you do.** Type an action and press Enter: `I wave Mina over to the corner
table.` The buttons above the box choose what kind of action it is (**Do or say**, **Send a
text**, **Call** or **Think**), and **Short**, **Normal** or **Long** sets how much the next
reply writes. With nothing typed, **Keep going** lets the story move on by itself. Here Mina
is texting back, and the scene and her portrait sit above the story.

![Mina is typing a text at Maple & Fern, with her portrait in the scene above; the action box with Do or say, Send a text, Call and Think below](docs/screenshots/typing.webp)

_Picture view, a text coming in, and the action box._

**2. Read the reply.** The storyteller answers and plays everyone else, but never decides
for you. Under the reply, **Memory updated** shows what it wrote down (a person, a promise,
the ring you gave), with **See notes** and **Undo**. Everything it remembers is in **Story
memory**, where you can change any of it.

![A reply that noted Mina, the silver ring and the moment you gave it, with See notes and Undo](docs/screenshots/memory-line.webp)

_The memory line under a reply._

**3. Meet someone new.** When the story brings in someone new, a card offers to add them to
the cast, or change them first. With a picture connection, **Make their portrait too** draws
them from the card's description, and the portrait shows beside their lines. Above the box,
two or three ideas for your next move wait: pick one to put it in the box, or write your own.

![Hazel Okafor, a florist, joins the story: her card with Make their portrait too ticked, a new thread on the memory line, and three ideas above the box](docs/screenshots/newcomer-portrait.webp)

_A new character's card, a new thread to follow, and ideas for the next move._

![After Add to the cast: Hazel's portrait in the scene above the story and beside her lines, with notes that she joined and that her picture changed](docs/screenshots/portrait-ready.webp)

_Once she joins, her portrait shows in the scene and beside her lines._

**4. Not what you wanted? Try again.** **Another reply** writes it again, shorter or longer,
with a hint such as "More romantic". Every version is kept as a route, and the arrows under
the reply (‹ 1 / 2 ›) flip between them. **Routes** shows them as a list, a map or a
timeline, so you can go back to any choice. You can also change your last action, or take
the turn back.

![Another reply: Short, Normal or Long, and a hint such as More romantic, on a new route that keeps the first](docs/screenshots/story-tools-another.webp)

_Another reply, with a hint for this reply only._

**5. End the chapter.** When a chapter feels finished, **End chapter** has the storyteller
write a recap you can edit and suggest the next chapter's title. Later chapters remember the
recap, and when the notebook has grown it offers to tidy it: keep or undo each change.

![Ending a chapter: the recap, the next chapter's title and Tidy the notebook, which merges two notes about Mara and shortens the letter's](docs/screenshots/notebook-tidy.webp)

_The recap, the next chapter's title and a tidier notebook._

Something not working? **Report a problem** at the bottom of every screen copies a short
report (versions and check results, never your story or keys) with your own words.

![Report a problem: what happened in your own words, the report it adds, and Copy, Save as file and Copy and open GitHub](docs/screenshots/report-problem.webp)

_Report a problem: your words first, then the report, and nothing is sent until you paste it._

## Playing

Write actions in plain words, as long or short as you like, or speak:
`"Who wrote this?" I ask Mara.` The storyteller plays everyone else, from allies to villains,
each with their own goals, and never decides what your character does. The box under the
story can also **Send a text**, **Call** someone, **Think** a thought of your own, or
**Roll dice**.

- **Picture view.** With a background or portraits chosen, a stage above the story shows the
  scene and whoever you are with, and switches when someone new appears. Give a place a
  picture of its own under **Pictures → Places** and the stage shows it whenever the story is
  there. **Picture view** beside the story (or Ctrl/Cmd+P) switches to text only and back.
- **Several stories at once.** **Stories** beside the story goes back to the library. A reply
  keeps writing while you play something else, and the library shows "Writing a reply…"
  until it is in. Each story opens where you left it, with your unsent text kept.
- **Save anywhere**: quick-save with Ctrl/Cmd+S, Save / Load, and five autosaves.
- **Branch** from any reply, ask for **another reply**, or **change an earlier action**. Each
  makes a new route and keeps the original. A reply with more than one version shows
  ‹ 1 / 2 › under it to flip between them. **Routes** shows them as a list, a map of how
  they branch, or a timeline.
- **End a chapter** when it feels finished: the storyteller writes a recap, you can edit it,
  and later chapters remember it. When the notebook has grown, it also offers to tidy it up:
  merge notes about the same person and shorten long ones. Keep or undo each change. The
  chapter name under the story's title lists every chapter so far; pick one to jump there.
- **Long stories stay consistent.** Older turns are summarized automatically, so a story can
  run for thousands of turns. As it writes, the storyteller keeps a notebook of what must not
  be forgotten: people, places, things, a timeline and other facts, so the ring you gave in
  chapter 4 is still on her hand in chapter 9. A small "Memory updated" line under the reply
  shows what it noted, with **Undo**. **Story memory** shows everything the storyteller
  remembers and lets you add, change or remove any note while the story goes on, and
  **Preview context** shows exactly what it will read next.
- **Change the story as you go** in **Story details**: characters, the world, the narration,
  the scene and the facts it must keep to. **Tune the telling** on the tool bar changes the
  detail, pacing, twists and point of view in one step, from the next reply on.
- **Three ways to steer the storyteller.** A **Note to the storyteller** is about how the
  story is told from here on ("slow the romance down", "let her say no") and is never part of
  the story. **Rules** (Story details → World) are what is always true in this world.
  **Remember this** keeps a single fact whole. **How to play**, in the footer and the pause
  menu, explains the whole game on one page.
- **Know how full the storyteller's memory is.** The status line under the story shows how
  much of the next request the story already fills. It turns amber when it is time to end the
  chapter and red when older turns no longer fit, with advice and **End chapter** at hand.
- **Come back to where you were.** A story opened again after a while shows **Previously…**:
  the chapter and place, the story so far, the last reply and the open threads, with one
  button back into it.
- **How they feel about you.** Each character can have a **Heart** bar (cold to devoted) or a
  **Trust** bar (suspicious to complete trust) next to how they know you and how they feel
  now. The storyteller reads them before every reply and moves them as things happen; the
  "Memory updated" line shows the change (Mara +10) with **Undo**, and **Story details**
  lets you set them yourself.
- **The storyteller fills in the details, and you can change any of them.** It keeps a list
  of **threads to follow** (promises, mysteries, goals) that you can tick off in **Story
  memory**, offers to add anyone new it brings in to the cast, ends each reply with two or
  three ideas for your next move (pick one to put it in the box), and keeps track of where
  and when the story is. It also suggests the next chapter's title and a save's name, and you
  can rewrite a portrait's description before the picture is made.
- **Your library** shows each story as a card with its cover, how far it got and its last
  line. Search, sort and pin stories, and rename, copy or change the cover of one from its
  **…** menu. A reply keeps writing when you leave a story, and a notice (with a soft chime)
  says when it is ready.
- **Where and when** the story is shows above it, and panels such as **Story details** and
  **Story memory** open beside the story instead of over it.
- **Search and bookmarks**, and **Export** a route as text, as an e-book (`.epub`, with a
  cover, a title page, a page for each chapter and the reading font, for any e-reader or book
  app), or a whole story as a `.storypack` to share.
- **Read aloud, with a voice for everyone.** The speaker under a reply reads it with your
  computer's own voices, offline and free. A **voice pack** (**Settings → Sound**) gives the
  narrator and each character a voice of their own: the computer's, or AI voices from
  ElevenLabs (including voices you design or clone there) or a free voice server on your
  computer such as Kokoro. Lines are matched to whoever says them ("Mina: …", or quoted
  speech next to a name). A pack saves to a `.dtlvoices` file to share, which names the
  voices only, never your key. Each AI reading is recorded in **Usage**. **Read each new
  reply aloud** reads every reply as it lands.
- **Sound on or off with one switch** in **Settings → Sound** (or **Turn sound off** in
  Ctrl/Cmd+K): off means no chime and nothing read aloud.
- **Find anything with Ctrl/Cmd+K**: a story, a chapter, a window or a setting, as you type.
- **Keyboard shortcuts** for almost everything; press **F1** to see them, and **Change** any
  of them to keys of your own (press the new keys; a clash asks first). Your first story
  starts with four short tips; **Skip tips** hides them for good.
- **Find things in long lists.** The storyteller's rules can be searched, narrowed to a kind
  (magic, danger, romance, technology and more) and sorted, and edited where they are; the
  image library searches names, kinds and stories, shows only moving GIFs or one kind, and
  sorts by date or name.
- **Looks.** Stories are set in Literata, a font made for long reading, and each chapter
  opens with its number, its title and a large first letter. Everyone in the cast gets a
  color for their name, picked from the name; change it under **Name color** in **Story
  details**. **Settings → Look** has twelve themes: Rose (light or dark with your computer),
  Midnight, Parchment, Neon, Café, Gothic, Forest, Ocean, Lavender, Ember, Terminal (green on
  black in a typewriter face) and Ink (black on white, the strongest contrast). With **Give
  each story a look that fits its genre** on, horror and mysteries read in Gothic, science
  fiction in Neon, thrillers in Midnight, fantasy and history on Parchment, action and war in
  Ember, text adventures in Terminal, nature stories in Forest, beach and sea stories in
  Ocean, whimsical and fae stories in Lavender, cozy stories in Café and romance in Rose;
  **Look** beside the story picks another for that story. Text size, column width, line
  spacing and the **story typeface** are there too, beside a sample of a story: **Book**
  (Literata), **Plain** (the interface's Inter) or **Easy to read** (Atkinson Hyperlegible,
  made for low vision and dyslexia).

![The same app in Rose, Midnight and Parchment: a café romance, a late-night radio story and a fantasy raid](docs/screenshots/themes.webp)

_The same app in Rose, Midnight and Parchment: a café romance, a late-night radio story and a fantasy raid._

![Neon, Café and Gothic: a cyberpunk heist, a potion shop on an island and a ghost story](docs/screenshots/themes-more.webp)

_Neon, Café and Gothic: a cyberpunk heist, a potion shop on an island and a ghost story._

![Settings → Look with all twelve themes and Give each story a look that fits its genre](docs/screenshots/settings-look.webp)

_Settings → Look with all twelve themes and Give each story a look that fits its genre._

![A chapter opening: the chapter number, its title, an ornament and a large first letter](docs/screenshots/reader-look.webp)

_A chapter opening: the chapter number, its title, an ornament and a large first letter._

![Settings → Look: themes, then text size, column width and line spacing beside a sample of a story](docs/screenshots/settings-reading.webp)

_Settings → Look: themes, then text size, column width and line spacing beside a sample of a story._

![The library as cards: covers, how far each story got and its last line](docs/screenshots/library.webp)

_The library as cards: covers, how far each story got and its last line._

![The notebook in Story memory, beside the story: Mina with her portrait, a place, a thing and a timeline that marks Chapter 1](docs/screenshots/notebook.webp)

_The notebook in Story memory, beside the story: Mina with her portrait, a place, a thing and a timeline that marks Chapter 1._

![Threads to follow in Story memory: open threads to tick off, a box to add one, and a settled thread](docs/screenshots/threads.webp)

_Threads to follow in Story memory: open threads to tick off, a box to add one, and a settled thread._

![A portrait's description, rewritten before it is made, with the safe-for-work sentence the app always adds](docs/screenshots/picture-description.webp)

_A portrait's description, rewritten before it is made, with the safe-for-work sentence the app always adds._

![A reply that noted Mara, the letter and the lamp room, and moved Mara's heart bar up by 10](docs/screenshots/feelings.webp)

_A reply that noted Mara, the letter and the lamp room, and moved Mara's heart bar up by 10._

![How Mara Quill feels about you in Story details: how she knows you, how she feels now and a Heart bar at 65](docs/screenshots/feelings-details.webp)

_How Mara Quill feels about you in Story details: how she knows you, how she feels now and a Heart bar at 65._

![Ctrl+K finds the chapters, Replay a chapter and End chapter as you type](docs/screenshots/palette.webp)

_Ctrl+K finds the chapters, Replay a chapter and End chapter as you type._

![The chapter list under the story's title: both chapters and Replay a chapter](docs/screenshots/chapter-jump.webp)

_The chapter list under the story's title: both chapters and Replay a chapter._

![The first of four tips at the start of your first story](docs/screenshots/tour.webp)

_The first of four tips at the start of your first story._

![A route saved as an e-book: the cover, the title page and the first chapter](docs/screenshots/book.webp)

_A route saved as an e-book: the cover, the title page and the first chapter._

![A voice pack with AI voices from a voice server: a narrator, and a voice each for Inès and Rook, added from their story](docs/screenshots/voice-pack.webp)

_A voice pack with AI voices from a voice server: a narrator, and a voice each for Inès and Rook, added from their story._

![Changing Routes to Ctrl+B in the shortcuts window, which asks first because Ctrl+B already bookmarks](docs/screenshots/shortcut-change.webp)

_Changing Routes to Ctrl+B in the shortcuts window, which asks first because Ctrl+B already bookmarks._

![The storyteller's rules in Story details, searched for “romance”, with each rule's kind and the suggestions to browse below](docs/screenshots/rules-find.webp)

_The storyteller's rules in Story details, searched for “romance”, with each rule's kind and the suggestions to browse below._

### Texts and calls

Characters text in short bursts, in their own voice, and calls read like real speech. Their
portrait appears on the card. They can text or call you first when they have a reason, or
only answer when you start (a checkbox).

![Text messages from Rowan, a text you sent back, and his reply](docs/screenshots/messages.webp)

_Text messages from Rowan, a text you sent back, and his reply._

![An incoming call card, then the call itself](docs/screenshots/call.webp)

_An incoming call card, then the call itself._

### Adventures with health, mana and items

For stories played like an RPG, a story can track bars (Health 88/100), counters (Gold 35)
and an inventory. The storyteller is told the numbers and writes what changes (a goblin's
spear, a chest with a key in it); the app does the arithmetic and shows each change in the
story. Your bars sit above the action box, and **Inventory** lists the whole party's bars and
every item with its description. **Make a picture** draws an item with your picture
connection, or you can use your own picture.

Most of the new adventure scenarios start with this set up, and you can add or change any
bar, counter or item when creating a story or later in **Story details**. Romance stories
can track things too, such as affection or a gift you were given.

![A dungeon fight: Mana and Health go down, Gold goes up](docs/screenshots/rpg.webp)

_A dungeon fight: Mana and Health go down, Gold goes up._

![Status and inventory, with every party member's bars and a picture of the healing draught](docs/screenshots/inventory.webp)

_Status and inventory, with every party member's bars and a picture of the healing draught._

## Stories to start from

Preset Story includes 33 worlds with 47 scenarios between them, and 27 characters to play.
Scenarios marked ★ start with health, items and more already set up.

<details>
<summary>All worlds and scenarios</summary>

| World                   | Genres                                      | Scenario                                                |
| ----------------------- | ------------------------------------------- | ------------------------------------------------------- |
| Harbor Town             | Mystery, Romance, Slice of life             | The Unsigned Letter; Storm Season                       |
| The Glass Orchard       | Fantasy, Drama                              | The Memory Harvest                                      |
| Meridian Station        | Science fiction, Mystery                    | Night Shift on Meridian; The Quiet Signal               |
| Ashcombe, 1923          | Historical, Romance, Comedy                 | The Summer Guest                                        |
| Hollow Pines            | Horror, Mystery                             | Dead Air; The Lodge on Cutter Ridge                     |
| The Ember Road          | Fantasy, Adventure                          | The Last Caravan; The Glowing Ruins ★                   |
| Larkport                | Romance, Comedy, Drama                      | The Wrong Reservation; The Wedding Speech               |
| Vesper City             | Science fiction, Noir, Thriller             | Ghost in the Ledger; Witness in the Rain ★              |
| Northgate University    | School life, Romance, Comedy, Slice of life | Midterm Week; The Club Wars                             |
| The Underhalls          | Adventure, Fantasy, Action                  | The Lantern Job                                         |
| Neon Harbor             | Cyberpunk, Thriller, Science fiction        | Clean Slate                                             |
| The Dry Country         | Post-apocalyptic, Adventure, Drama          | The Water Run                                           |
| Lumen City              | Superhero, Action, Comedy                   | Night of the Blackout                                   |
| Dust Creek              | Western, Adventure, Drama                   | The Stage from Redwater; The Silver Claim ★             |
| The Lantern Palace      | Historical, Drama, Romance                  | The Empress's Tea                                       |
| Maple & Fern            | Dating sim, Romance, Slice of life          | First Week at the Café; The Midnight Book Club          |
| Greywatch               | Fantasy, Adventure, Action                  | The Shifting Deep ★; The Lost Party ★                   |
| Arclight                | Cyberpunk, Action, Science fiction          | Going Dark ★; The Last Free Radio ★                     |
| The Saltmarsh Lyceum    | School life, Fantasy, Romance               | Familiar Trouble ★                                      |
| Brackwater, 1891        | Horror, Mystery, Historical                 | The Thirteenth Bell ★                                   |
| Juniper Heights, Day 41 | Post-apocalyptic, Horror, Action            | The Supply Run ★                                        |
| The Tallow Drift        | Science fiction, Adventure, Comedy          | The Ghost Liner ★                                       |
| Star Lane               | Romance, Drama, Slice of life               | Ninety Days to Debut ★                                  |
| The Tumbledown Isles    | Slice of life, Fantasy, Comedy              | The Potion Shop on Pell Island ★; The Harvest Lantern ★ |
| The Velvet Court        | Romance, Horror, Drama                      | The Treaty Night ★                                      |
| The Aurelia, 1934       | Mystery, Historical, Thriller               | The Empty Cabin ★                                       |
| The Shattered Main      | Adventure, Action, Comedy                   | Captain by Morning ★; The Drowned Queen’s Map ★         |
| The Nine Rivers         | Action, Fantasy, Historical                 | The Stolen Manual ★; The Tournament at Cloudgate ★      |
| The Rosaline Court      | Romance, Fantasy, Comedy                    | The Villainess Wakes ★                                  |
| Calder Falls            | Mystery, Science fiction, Drama             | Tuesday, Again ★                                        |
| Isla Monarch            | Thriller, Action, Drama                     | One Night at the Monarch ★                              |
| Doomspire Tower         | Superhero, Comedy, Action                   | Local 404 ★                                             |
| The Ashen Throne        | Fantasy, Drama, Action                      | The Regent's First Winter ★                             |

</details>

### Your own presets

**Save as a preset…** (More, on a story card) keeps the world, cast, relationships, rules,
style and scene of a story you made, without its turns, memory or pictures. **Preset Story →
Your presets** begins a new story from it, opens it in Custom Story to change first, saves it
as a `.dtlpreset` file to share, and imports one someone sent you. A preset file holds the
story setup only: never a key, a picture or a setting.

## Make your own story

**Custom Story** walks through six steps: world, you, the story, narration, pictures and
review. It opens in **Custom**, with every field empty. Each one takes your own words or a
pick from a list (more than 40 races and peoples, 60 roles, 45 personality traits, eras,
settings and world rules), and the × clears it again. Only your name is needed: anything
you leave empty is for the story to decide, and the storyteller doesn't bring up what you
left out (your species, say) unless the story needs it or you do. Fields most people can
skip are folded under **More options**. **Guided** starts from a preset world, character
and opening instead, chosen with arrows and menus, and **None** takes a preset back. The
draft is saved as you go. The step bar at the top goes to any step, and a preview beside the
steps shows the story as a cover, with its first page, as you fill it in.

**Fill in the rest** on each step asks the storyteller to fill that step's empty fields to fit
what you wrote: a few words of setting become an era, a description and rules; a title and a
premise become an opening scene and two or three people to meet. Your own words stay as you
typed them, everything it fills in can be changed, and **Undo** takes it all back. On Review,
**Fill in everything left** does every step at once. Without a connection, or if the call
fails, the offline storyteller fills in from the preset story closest to what you wrote.

**Bring someone you already made.** On the **You** step, **From your stories** plays as a
character from another of your stories, and **From a character card** reads a character
card (the common PNG or JSON format) with its picture, scenario and opening. Under
**People**, the same two buttons bring someone in for you to meet. Only the name,
description, personality, scenario and opening come across, never a card's own
instructions, and a card that reads as under 18 is refused.

![Custom Story: Fill in the rest filled the title, opening scene and two people, and the preview shows them](docs/screenshots/create.webp)

_Custom Story: Fill in the rest filled the title, opening scene and two people, and the preview shows them._

**RPG mode** is a switch on the first step for stats, health, mana, items and dice rolls.
Each stat says what it is for (Strength is raw power; Fitness is stamina and athletics) and
adds to the rolls that use it; common bars such as Health and Mana are one click away. Leave
it off for a story without numbers.

![RPG mode: stats that explain themselves, bars and starting items](docs/screenshots/rpg-mode.webp)

_RPG mode: stats that explain themselves, bars and starting items._

A **chapter plan** is optional, and only a guide: if the story heads somewhere else, the
storyteller follows the story, and you can rename each next chapter when one ends.

### Ways to tell a story

Pick a style and an example shows how the story will read:

- **Mixed** (the usual): narration, dialogue, thoughts and messages, each where the moment
  suits it.
- **Narrated**: a narrator describes what happens, with dialogue.
- **Script**: like a play, with `Name: "line"` and stage directions in italics.
- **Roleplay chat**: actions in italics and short replies, like roleplaying in a chat.
- **Thoughts and dialogue**: no narrator, only what characters say and think.
- **Messages**: told mostly through texts, calls, letters and posts.
- **Text adventure**: where you are, what you see and the ways onward.

A style is where the story starts, not a lock: the storyteller can switch for a moment (a
text exchange, a private thought) and come back. Describe the style you want in your own
words too (`like a cozy anime, lots of banter`), and the storyteller follows it. Under
**More ways to shape it**, choose the point of view (you, I, or they), past or present
tense, how much detail, the pacing, the tone and the story's language.

![The style picker on Mixed, with an example and the style in your own words](docs/screenshots/styles.webp)

_The style picker on Mixed, with an example and the style in your own words._

### Every feature is a checkbox

**Features** turns each part on or off: other characters' inner thoughts, texts and calls as
cards, characters texting you first, place and time headings, small reactions written for
you, how often twists come, and tracking. Long options only open when their box is
checked. **Dice settings**, under RPG mode, go down to the dice every roll uses (or the
storyteller's choice),
who asks for rolls, how often, generous, fair or tough odds, whether stats count, critical
rolls, and whether you see the number needed before rolling. The app rolls fairly and
enforces those rules itself.

![Features: a checkbox for each part of the story](docs/screenshots/features.webp)

_Features: a checkbox for each part of the story._

### What kind of story

Mix any genres, choose a content rating (_All ages_, _Mature_ or _Adults only_), list the
themes and elements you want (`slow burn`, `found family`, `rivals to lovers`, …) and hard
limits the storyteller must never write. You can change all of it later in **Story details**.

**Adults only.** Adult fiction is supported, including erotica and fetish content between
adults. Choosing _Adults only_ asks once that you are 18 or older. Every character in an
adults-only story must be an adult: the app refuses characters whose age reads as under 18,
and the storyteller is always told never to write sexual content involving minors. Whether a
model writes explicit scenes depends on the provider: many hosted services refuse, while
local models follow your settings and keep everything on your computer. Check your
provider's terms.

## Languages

**Settings → Language** shows the app in English, Simplified Chinese (简体中文), Traditional
Chinese (繁體中文), Japanese (日本語) or Korean (한국어), or follows your computer.

The app language and the story language are separate. Each story has its own language
(**Style → Story language**), and the storyteller is told to write in it, dialogue and
messages included, whatever language you type in. New stories start with the app's language,
and you can play a Japanese story with the app in English or the other way round. The
bundled templates are written in English and the storyteller tells them in the story's
language. The offline storyteller writes in English.

![Settings in Japanese](docs/screenshots/settings-ja.webp)

_Settings in Japanese._

## Connect an AI

The **Setup guide** covers this step by step. Or open **Settings → AI connections → Add
connection** yourself:

| Choice                                                                                                                                              | What you need                                     | Cost          |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------- |
| **Offline storyteller** (built in)                                                                                                                  | Nothing                                           | Free          |
| **On your computer**: [Ollama](https://ollama.com), [LM Studio](https://lmstudio.ai), llama.cpp server, KoboldCpp, Jan, text-generation-webui, vLLM | The program and an open model                     | Free, private |
| **AI labs**: OpenAI, Anthropic (Claude), Google Gemini, xAI (Grok), Mistral AI, DeepSeek                                                            | An API key                                        | Paid per use  |
| **Open models, hosted**: OpenRouter, Groq, Together AI, Fireworks AI, DeepInfra, Hugging Face                                                       | An API key                                        | Paid per use  |
| **Other**                                                                                                                                           | Any OpenAI-compatible address, key and model name | Varies        |

Pick the service and the address is filled in. Under **Model**, suggested models for that
service are one click away, with a few words on each, and **Step by step, every click**
walks through making an account and a key. Keys are kept in your system's credential store
(Windows Credential Manager, macOS Keychain, Linux Secret Service), never in story files,
exports or backups. **Test connection** checks a connection for free. Choose it as the
**Storyteller** in Settings, or give one story its own storyteller by clicking the
storyteller's name above it. Switching keeps everything the story remembers.

![The Setup guide: the short version first, with the contents bar above](docs/screenshots/guide-top.webp)

_The Setup guide starts with the short version; the contents bar stays at the top._

### Which model should I use?

A few good places to start, checked in November 2026 (the guide's **Recommended models**
sets each one up for you). Names change often: each service's model list has the current
ones, and any model you like works.

| For                               | Model                                           | One reply in a long story |
| --------------------------------- | ----------------------------------------------- | ------------------------- |
| The best place to start           | OpenAI `gpt-6.1-terra` (same key for pictures)  | about 2¢                  |
| Long stories that stay consistent | Claude `claude-sonnet-5-5` (Opus 5.5: about 7¢) | about 3¢                  |
| Cheap and good                    | Google `gemini-3.8-flash` (has a free tier)     | about 1¢                  |
| Many models, looser rules         | OpenRouter, e.g. `deepseek/deepseek-v4.1-flash` | see its model page        |
| Free and private                  | Ollama `gemma4:12b` (about 16 GB of memory)     | free                      |
| The cheapest                      | `gpt-6-luna` or `claude-haiku-5-5`              | about 0.2¢                |

"One reply in a long story" assumes about 12,000 tokens read and 600 written; early replies
cost much less. Models that think before they write (most current ones from OpenAI,
Anthropic, Google and xAI) are asked to think briefly, with 2,000 more tokens of room. For
pictures, `gpt-image-2.6-flare` is quick and `gpt-image-2.6-sunburst` takes more care; free on
your computer: Stable Diffusion WebUI.

![Recommended models in the Setup guide, each with what a reply costs and Set up](docs/screenshots/guide-picks.webp)

_Recommended models, each with what a reply costs and a Set up button._

![Step by step, every click: OpenAI, opened in the Setup guide](docs/screenshots/guide-steps.webp)

_Every click for a service, folded away until you open it._

### Costs and your budget

Paid services charge for what they read and write, and each reply sends the story so far up
to the connection's context limit. New paid connections start at 32,000 tokens, which keeps a
long story's replies cheap; older parts of the story are summarized to fit.

Every request is logged in **Usage & budget** with its token count and estimated cost, and an
optional monthly budget can warn you or pause paid replies. Estimates need each model's
prices: **Use the listed prices** fills them in for the models above (check, then save).
Set a spending limit in your provider's dashboard too: that one really stops charges.

### Pictures

Use your own pictures for covers, backgrounds, portraits and items, or let a **picture
connection** draw them. **Add for this story only** keeps a picture with one story; **Add to
your library (any story)** shares it with every story, so you can use it again anywhere.
Picture connections: **OpenAI images** (an API key, paid per picture) or **Stable Diffusion
WebUI** on your computer (free). Choose it under **Settings → Pictures**, then **Make
portrait** or **Make a picture** asks for one in the style you pick. **See or change what is
sent** shows the description first: it uses looks, role and the world's setting, never names
or story text. Each picture keeps it, under **What was sent to make it** in **Images**. When
the storyteller brings someone new into the story, their card offers **Make their portrait
too** as they join the cast (turn the offer off under **Settings → Pictures**). Pictures are
always asked for as safe for work.
**Settings → Background picture** can also put a picture of your own behind every screen.

![Choosing a portrait: add a picture for this story only or to your library, or pick one from either](docs/screenshots/picture-buttons.webp)

**Pictures → Places** in a story gives any place a picture of its own: where the story is
now, the places it has been, or one you name ahead of time. While the story is at a place
with a picture, the stage shows it instead of the background, following the storyteller's
scene marks.

![Pictures → Places: the bakery, where the story is now, can have a picture of its own, and another place can be named ahead of time](docs/screenshots/pictures-places.webp)

_Choosing a portrait: add a picture for this story only or to your library, or pick one from either._

## Playing offline

The built-in offline storyteller needs no internet and no key, and never costs anything. It
writes simple replies in English that fit the kind of story you chose (fantasy, science
fiction and cyberpunk, horror and mystery, romance and slice of life, adventure), with
characters who answer in their own voice, text back, call, and sometimes text you first. It
follows the story's style, point of view, headings and twists, rolls dice, and keeps health,
gold, mana, items and affection changing. It is good for trying the app out and for a quick
story without an API; a connected AI writes far better.

## Your data

Everything lives in the app's data folder (Windows `%APPDATA%\io.github.theminimingg.deartolove`,
macOS `~/Library/Application Support/io.github.theminimingg.deartolove`, Linux
`~/.local/share/io.github.theminimingg.deartolove`): one SQLite database, your pictures and
backups.

- **Backups:** a copy is kept automatically once a day when you play (the newest five), and
  **Settings → Backups → Back up everything** saves one file you can restore anywhere. API
  keys are never included.
- **Upgrades are safe:** before a new version changes the database, it saves a copy of the
  old one.
- **A full disk loses nothing:** the change that could not be saved is rolled back, you are
  told plainly, and backups wait until there is room. **Diagnostics** warns when space is low.
- **No length limit:** older turns are summarized, and the newest are always sent word for
  word. When a long story's cast and notes grow big, the people not in the scene are sent in
  brief so the summary still fits. If a story's setup still cannot fit the model's context,
  the app says so before sending.

[How it works](docs/how-it-works.md) explains storage, memory, limits, templates, dice and
content settings in detail, including what the storyteller is told with each reply.

## Build from source

You need [Node.js 22](https://nodejs.org), [pnpm](https://pnpm.io), [Rust](https://rustup.rs)
and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your system.

```sh
git clone https://github.com/TheMiniMingg/Dear-To-Love.git
cd Dear-To-Love
pnpm install
pnpm tauri dev          # run it
pnpm tauri build        # make an installer for this system
```

More in [`docs/dev.md`](docs/dev.md); releases are described in
[`docs/release.md`](docs/release.md).

## Help and development

- Problems and ideas: [GitHub issues](https://github.com/TheMiniMingg/Dear-To-Love/issues).
  **Report a problem** at the bottom of every screen puts your own words under a short report
  (versions and check results, never story text, keys or file paths) and copies it, or opens a
  new issue with it. Beta testers: see [the beta guide](docs/beta-testing.md).
- How it works: [`docs/how-it-works.md`](docs/how-it-works.md). Architecture and decisions:
  [`docs/architecture.md`](docs/architecture.md), [`docs/adr/`](docs/adr/),
  [`docs/roadmap-v4.md`](docs/roadmap-v4.md) and
  [`docs/roadmap-decisions.md`](docs/roadmap-decisions.md).
- [Changelog](CHANGELOG.md).
- License: [MIT](LICENSE). The bundled fonts and icons: [third-party notices](THIRD-PARTY-NOTICES.md).

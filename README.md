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

## Download

Free, with no account needed. Download the installer for your computer, open it, and follow
the steps.

<p>
  <a href="https://github.com/TheMiniMingg/Dear-To-Love/releases/download/v0.1.0/Dear.to.Love_0.1.0_x64-setup.exe"><img src="docs/download/windows.svg" width="250" alt="Download for Windows: installer (.exe) for Windows 10/11"></a>
  <a href="https://github.com/TheMiniMingg/Dear-To-Love/releases/download/v0.1.0/Dear.to.Love_0.1.0_universal.dmg"><img src="docs/download/mac.svg" width="250" alt="Download for Mac: installer (.dmg) for all Macs"></a>
  <a href="https://github.com/TheMiniMingg/Dear-To-Love/releases/download/v0.1.0/Dear.to.Love_0.1.0_amd64.AppImage"><img src="docs/download/linux.svg" width="250" alt="Download for Linux: AppImage for any 64-bit Linux"></a>
</p>

| Your computer               | Installer                                                                                                                          | How to install                                                                                                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows 10 or 11            | [Windows installer (.exe)](https://github.com/TheMiniMingg/Dear-To-Love/releases/download/v0.1.0/Dear.to.Love_0.1.0_x64-setup.exe) | Open it and follow the steps. An [.msi installer](https://github.com/TheMiniMingg/Dear-To-Love/releases/download/v0.1.0/Dear.to.Love_0.1.0_x64_en-US.msi) is there too. |
| Mac, Apple silicon or Intel | [Mac installer (.dmg)](https://github.com/TheMiniMingg/Dear-To-Love/releases/download/v0.1.0/Dear.to.Love_0.1.0_universal.dmg)     | Open it and drag **Dear to Love** into **Applications**.                                                                                                                |
| Ubuntu, Debian, Mint        | [Linux package (.deb)](https://github.com/TheMiniMingg/Dear-To-Love/releases/download/v0.1.0/Dear.to.Love_0.1.0_amd64.deb)         | Open it, or run `sudo apt install ./Dear.to.Love_*_amd64.deb`                                                                                                           |
| Fedora, openSUSE            | [Linux package (.rpm)](https://github.com/TheMiniMingg/Dear-To-Love/releases/download/v0.1.0/Dear.to.Love-0.1.0-1.x86_64.rpm)      | Open it, or run `sudo dnf install ./Dear.to.Love-*.x86_64.rpm`                                                                                                          |
| Any other Linux             | [Linux AppImage](https://github.com/TheMiniMingg/Dear-To-Love/releases/download/v0.1.0/Dear.to.Love_0.1.0_amd64.AppImage)          | Make it executable (`chmod +x`), then open it.                                                                                                                          |

**The first time you open it**, your computer may warn you, because the app isn't
code-signed yet:

- **Windows:** SmartScreen says it "protected your PC". Choose **More info → Run anyway**.
- **Mac:** right-click the app → **Open**, or System Settings → Privacy & Security →
  **Open Anyway**. If macOS says the app "is damaged", run
  `xattr -dr com.apple.quarantine "/Applications/Dear to Love.app"` in Terminal once.
- **Linux AppImage:** some distributions need `libfuse2` (`sudo apt install libfuse2`).

Installing a newer version keeps your stories, and **Settings → Updates** can install new
versions for you, after checking each against the app's own signature. See
[what's new in this version](https://github.com/TheMiniMingg/Dear-To-Love/releases/tag/v0.1.0), or [every release](https://github.com/TheMiniMingg/Dear-To-Love/releases) with its checksums
(`SHA256SUMS.txt`). You can also [build it from source](#build-from-source).

Testing the beta? [The beta guide](docs/beta-testing.md) covers installing, a first story and
reporting problems in ten minutes.

## Highlights

![A café story told in script style: where and when at the top, the scene's picture and portraits, speakers' portraits beside their lines, and the action pills and tools](docs/screenshots/reader.webp)

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
- **Choices A–D** if you'd rather click than type: four ways the story could go after each
  reply, or write your own.
- **Every feature can be switched off** with a checkbox.

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

## Learn more

The [player's guide](docs/guide.md) shows everything else, with pictures:

- [A story, step by step](docs/guide.md#a-story-step-by-step): what happens when you play, one picture at a time
- [Playing](docs/guide.md#playing): steering the story, routes, saves, texts and calls, health, mana and items
- [Stories to start from](docs/guide.md#stories-to-start-from): the worlds, scenarios and characters, and presets of your own
- [Make your own story](docs/guide.md#make-your-own-story): Custom Story, the ways to tell a story, and every switch
- [Languages](docs/guide.md#languages): the app in five languages, stories in many more
- [Connect an AI](docs/guide.md#connect-an-ai): which model to pick, what it costs, and pictures
- [Playing offline](docs/guide.md#playing-offline): what the built-in storyteller can do
- [Your data](docs/guide.md#your-data): where your stories live, backups, and long stories

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

# Dear to Love

A local-first desktop app for creating and playing AI-generated stories. Your stories, saves
and pictures stay on your computer, and you bring your own AI model: a cloud service with an
API key, or a model running on your own computer. Without one, a built-in offline storyteller
lets you try everything.

- Start from a bundled world, scenario and character, or build your own step by step.
- Type what you do; the storyteller writes what happens. Save anywhere, branch from any point,
  and compare routes. Changing a character or the world only affects the route you change it on.
- Add portraits, backgrounds and covers from your own images.
- Search a route, bookmark places, export a story as text or a `.storypack`, and keep automatic
  backups.
- See what each AI request cost, set a monthly budget, and get warned (or paused) before you go
  over it.

**Status:** v0.1.0, the first release.

## Install

Download the file for your system from the
[Releases page](https://github.com/TheMiniMingg/Dear-To-Love/releases) and check it against
`SHA256SUMS.txt` if you like.

| System                          | File                                                             |
| ------------------------------- | ---------------------------------------------------------------- |
| Windows 10/11 (64-bit)          | `…_x64-setup.exe` (installs for you only) or `…_x64_en-US.msi`   |
| macOS (Apple silicon and Intel) | `…_universal.dmg`: open it and drag Dear to Love to Applications |
| Debian, Ubuntu (64-bit)         | `…_amd64.deb`: `sudo apt install ./Dear.to.Love_…_amd64.deb`     |
| Fedora, openSUSE (64-bit)       | `….x86_64.rpm`                                                   |
| Other Linux (64-bit)            | `…_amd64.AppImage`: make it executable and run it                |

Until the builds are signed, your system may warn you the first time:

- **Windows:** SmartScreen says it "protected your PC". Choose **More info → Run anyway**.
- **macOS:** right-click the app → **Open**, or System Settings → Privacy & Security →
  **Open Anyway**.

Installing a newer version keeps your stories. The app never updates itself; turn on update
checks in **Settings → Updates** to be told when a new release is out.

## Connect an AI model

Open **Settings → AI connections → Add connection** and pick a service:

- **A cloud service** (OpenAI or any OpenAI-compatible API): enter the model name and your API
  key. The key is kept in your system's credential store, never in the story files.
  **Test connection** checks it for free; **Send test message** sends one short message.
- **A model on your computer** with [Ollama](https://ollama.com): install it, run
  `ollama pull <model>`, and choose Ollama. No key and no API charges.

Then choose it as the **Storyteller**. Paid services' costs are estimates from prices you enter
under **Usage & budget**; set a spending limit in your provider's own dashboard too.

## Your data

Everything lives in the app's data folder (Windows `%APPDATA%\io.github.theminimingg.deartolove`,
macOS `~/Library/Application Support/io.github.theminimingg.deartolove`, Linux
`~/.local/share/io.github.theminimingg.deartolove`). **Settings → Backups** keeps automatic copies
and saves a full backup file you can restore on any computer. **Diagnostics** (in the footer)
checks the app and makes a report for support requests without story text, keys or file paths.

## Help and development

- Problems and ideas: [GitHub issues](https://github.com/TheMiniMingg/Dear-To-Love/issues).
  Attach the report from **Diagnostics → Copy report…**.
- Developer setup: [`docs/dev.md`](docs/dev.md). Making a release: [`docs/release.md`](docs/release.md).
- The plan: [`docs/roadmap-v4.md`](docs/roadmap-v4.md), with agreed changes in
  [`docs/roadmap-decisions.md`](docs/roadmap-decisions.md).
- License: [MIT](LICENSE).

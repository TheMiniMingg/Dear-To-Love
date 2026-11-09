# Welcome to the Dear to Love beta

Thank you for trying Dear to Love before anyone else. It's an interactive story app: you
write what your character does, and a storyteller writes what happens next. Your stories
stay on your computer.

This page covers installing it, a first story, and how to tell us when something goes wrong.
It takes about ten minutes.

## 1. Install it

Download the file for your computer from the
[Releases page](https://github.com/TheMiniMingg/Dear-To-Love/releases/latest):

| Your computer                | File                                                                      |
| ---------------------------- | ------------------------------------------------------------------------- |
| Windows 10 or 11             | the one ending in `_x64-setup.exe`                                        |
| Mac (Apple silicon or Intel) | the one ending in `_universal.dmg`: open it, drag the app to Applications |
| Ubuntu, Debian               | the one ending in `_amd64.deb`                                            |
| Other Linux                  | the one ending in `.AppImage`                                             |

The beta isn't code-signed yet, so your computer warns you the first time you open it. That
is expected:

- **Windows:** when SmartScreen says it "protected your PC", choose **More info**, then
  **Run anyway**.
- **Mac:** right-click the app in Applications and choose **Open**, then **Open** again. Or
  open System Settings → Privacy & Security and choose **Open Anyway**. If the Mac says the
  app "is damaged", open Terminal and run this once:
  `xattr -dr com.apple.quarantine "/Applications/Dear to Love.app"`
- **Linux AppImage:** make it executable (`chmod +x`), then run it. Some systems need
  `libfuse2` first.

## 2. Play a first story

1. Choose **Preset Story**, pick a kind of story with the arrows, then **Start story**.
   Rather click than type? Set **Help with your next move** to **Choices A–D** first.
2. Write what you do and press Enter (or click a choice). With no setup, the built-in
   offline storyteller answers. Its replies are simple, but everything else works, so you
   can look around.
3. Above the box, choose what kind of action it is: **Do or say**, **Send a text**,
   **Call** or **Think**. With nothing typed, **Keep going** lets the story move on.
4. Under a reply, **Another reply** writes it again. Every choice is kept as a route, so you
   can go back to any of them under **Routes**.

## 3. Connect a real storyteller

For proper stories, connect an AI service. Open the **Setup guide** (at the bottom of every
screen). It explains the choices, opens the page where you get a key, and fills in the
connection for you.

- You need your own API key from the service. It is paid per use, usually a fraction of a
  cent per reply. Set a monthly limit under **Usage & budget**, and on the service's own
  website too.
- The key is kept in your computer's own password store (Keychain, Credential Manager or
  Secret Service). It never goes into a story file, export or backup.
- **Test connection** checks the key for free.
- If you'd rather not pay, the Setup guide also explains running a model on your own
  computer with Ollama or LM Studio. It needs a fairly strong computer.

## 4. Things worth trying

- **Story memory** (Ctrl+K, then type "memory"): what the storyteller remembers. You can
  change anything there.
- **Story details**: the characters, the world and the scene. Edit them at any time.
- **Saves** and **Routes**: keep a moment, or try another choice and come back.
- **Custom Story**: make your own from a blank page.
- **Settings**: the look, the language (English, Chinese, Japanese, Korean), text size and
  sound.

Stories marked adults-only are for players who are 18 or older, and the app asks before
showing that option.

## 5. Tell us what went wrong

Anything confusing, broken, slow or surprising is worth reporting, even small things.

1. At the bottom of the screen, choose **Report a problem**.
2. Say what you did, what you expected, and what happened instead.
3. Choose **Copy** and paste it into a message to the person who invited you, or **Copy and
   open GitHub** if you have a GitHub account.

The report adds versions and check results. It never includes your story text, titles,
API keys or file paths, and nothing is sent until you paste it yourself.

## 6. Updates

Turn on **Settings → Updates → Check GitHub for a new release once a day**. When a new
version is out, you'll see a note at the bottom of the screen, and **Install … and restart**
in Settings installs it. Your stories, settings and keys stay as they are.

## Your stories are yours

Everything stays on your computer. The app only talks to the AI service you chose (to
write replies) and, if you turn on update checks, to GitHub. **Backups** makes a copy of
everything, and **Export** saves a story as text, a storypack or an e-book.

Thanks again for testing. Every report makes it better for the next person.

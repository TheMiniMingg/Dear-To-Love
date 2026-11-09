# Changelog

## Unreleased

## 0.1.0 - 2026-11-09

The first release. Dear to Love is a desktop app for playing interactive stories with AI: pick
a world, a character and a situation, write what you do, and the storyteller writes what
happens next and plays everyone else. Your stories, saves and pictures stay on your computer.

- **Start in a few clicks** from 33 worlds, 47 scenarios and 27 characters, or build your own
  story from blank fields, with **Fill in the rest** for anything you leave out. Keep a
  story's setup as a preset of your own and share it as a file.
- **Bring your own AI**: OpenAI, Claude, Gemini, Grok, Mistral, DeepSeek, OpenRouter and other
  hosted models with your API key, or a free model on your own computer (Ollama, LM Studio and
  more). Keys stay in your system's credential store. The built-in offline storyteller plays
  with neither.
- **Steer the story**: Keep going, a note to the storyteller, Remember this, another reply
  with a hint, edit a reply or take back your last turn, and **Tune the telling** for detail,
  pacing, twists and point of view. Branch from any moment and see the routes as a list, a
  map or a timeline.
- **Tell it your way**: narrated, script, roleplay chat, thoughts and dialogue, mostly
  messages or a classic text adventure. Texts and phone calls show up as phone cards.
- **RPG mode**: health and mana bars, counters, an inventory and dice for risky moments, and a
  bar for how each character feels about you.
- **Long stories stay consistent** with automatic story memory, chapter recaps and threads to
  follow. A memory gauge warns before the storyteller runs out of room, and **End chapter**
  frees it.
- **Pictures and voices**: backgrounds, portraits, places and items from a picture connection
  or your own files, and any reply read aloud with a voice for each character.
- **Made for reading**: twelve looks, a story typeface (including one made for low vision and
  dyslexia), chapters that open like a book's, and any route saved as an e-book.
- **How to play** in the app explains the whole game, and every feature can be switched off.
- The app is in English, Simplified and Traditional Chinese, Japanese and Korean.

## Built before 0.1.0

Everything below went into 0.1.0, newest first.

- **How to play.** A page with the whole game: playing a turn, the three ways to steer the
  storyteller (a note, the rules, Remember this), changing your mind, chapters and memory,
  what to do when a story gets long, pictures, reading aloud, dice, saving and sharing, cost
  and privacy. It is in the footer, the library, the pause menu and the Ctrl+K box, and the
  first-run tips end by pointing to it.
- **Tune the telling.** A tool bar button changes **Detail**, **Pacing**, **Twists** and
  **Point of view** for the open story from the next reply on, without opening Story
  details. Everything else is a click away under **More in Story details…**.
- **Previously…** A story opened again after a while greets you with where it stands: the
  chapter and place, the story so far (or the last chapter's recap), the last reply and the
  open threads, with **Keep reading** and **Story memory**. A checkbox turns it off.
- **Your presets.** **Save as a preset…** (More, on a story card) keeps the world, cast,
  relationships, rules, style and scene of a story without its turns, memory or pictures.
  **Preset Story → Your presets** begins a new story from one, opens it in Custom Story to
  change first, saves it as a `.dtlpreset` file to share, imports one and deletes one. A
  preset file holds the story setup only: never a key, a picture or a setting.
- **The memory gauge.** The reader's status line shows how much of the next request the
  story already fills (**Memory 42%**). It turns amber at 80% and red when turns are being
  left out, with a line of advice and **End chapter** and **Preview context** at hand. When
  the story setup alone no longer fits, it says so and offers **Story details** instead. Only
  live storytellers show it; the offline one reads no request.
- **End chapter frees memory at once.** A chapter ended with a recap no longer sends its
  turns word for word: the recap stands in for them, with only the last exchange kept so the
  next chapter picks up from the same moment. Before, the room came back only when the
  rolling summary caught up.
- **Story typeface.** **Settings → Look → Story typeface** picks **Book** (Literata),
  **Plain** (the interface's Inter) or **Easy to read** (Atkinson Hyperlegible, made for low
  vision and dyslexia); **Theme's choice** lets a look such as Terminal keep its own.
- **A voice for each character.** In **Story details → Characters**, each character shows
  their voice in the active voice pack and can be given another, and **Skip this character's
  lines when reading aloud** leaves them out.
- **Bookmarks in the chapter menu.** The chapter name under the story's title now lists your
  bookmarks after the chapters, so a marked place is one click away.
- **The library knows where each story is.** Cards show the story's current place under its
  last line, and the search also looks in the cast, the place and the setting.
- **The stage names the place.** When a place has no picture of its own, the background
  carries the place and time as a caption.
- **Clearer words** throughout: what a note, a rule and a memory note are each for, what a
  recap does to a long story, what the offline storyteller is good for, which look each genre
  gets, how routes relate, that AI voices are billed by their service, and a kinder message
  when the version check cannot reach GitHub.
- **A picture for each place.** **Pictures → Places** gives any place in the story a picture
  of its own: where the story is now, the places it has been, the places in its memory, or
  one you name ahead of time. While the story is at a place with a picture, the stage shows
  it instead of the background, so the scene follows the storyteller's scene marks without a
  click. Place pictures travel in storypacks and backups like any other.
- **Read each new reply aloud.** A switch in **Settings → Sound → Read aloud** reads every
  reply as soon as it is written, in the story you are reading, with the voices you chose.
  The speaker under a reply still reads it again or stops it.
- **Cleaner memory.** The story summaries and chapter recaps the storyteller is asked for
  now see texts, calls and other message cards as plain words, and never the notes, threads
  and ideas the app keeps beside a reply: shorter requests, and nothing to confuse them. If
  a storyteller writes such tags into a summary or recap anyway, they are dropped (or turned
  into plain words) before it is kept.
- **Voice packs.** **Settings → Sound → Voices** can read each character in a voice of their
  own, with a narrator for the rest. Voices come from your computer, from ElevenLabs (its
  voices, or ones you designed or cloned there) or from a voice server of your own such as
  Kokoro; the setup guide has a **Voices (optional)** section. **Add the people from a
  story** fills in the cast. A pack saves to a `.dtlvoices` file to share and imports back;
  the file names voices only, never a key or a connection. AI readings show in **Usage &
  budget**, and a reply read again is not paid for twice.
- **Sound can be turned off.** One **Sound** switch in **Settings → Sound** (and in the
  Ctrl+K box) silences the reply chime and reading aloud.
- **Change any shortcut.** In the shortcuts window (F1), **Change** a shortcut and press the
  keys you want. Keys typing needs and the system's own keys are kept, a key another
  shortcut uses asks first, and **Put back all the usual keys** undoes it all.
- **Find things in long lists.** The storyteller's rules have a search, a kind (magic,
  danger, romance and more, worked out from the words) and an order, and each rule is
  edited where it is. Suggested rules are browsed the same way. The image library, the long
  pickers in Custom Story and the character list in Story details can be searched too.
  **Show all** clears a search and a kind in one click, a long rule wraps so all of it
  shows, and a list of a few hundred rules keeps up with typing.
- **GIF pictures.** The image library takes GIFs, and moving ones keep moving, also as a
  cover in a storypack.
- **Six more looks:** Forest, Ocean, Lavender, Ember, Terminal and the high-contrast Ink.
  Stories that take a look from their genre use them too.
- **Twelve more preset storylines**, among them Storm Season, The Quiet Signal, The Lodge
  on Cutter Ridge, The Harvest Lantern and The Drowned Queen’s Map, six of them with tracked
  progress. There are now 47.

- **Flip between versions of a reply.** When a reply has been written again (**Another
  reply**, or **Keep going** again after **Take back**), ‹ 1 / 2 › under it goes to each
  version. Every version stays on its own route, so nothing in the story changes until you
  pick one.
- **Bring a character you already made.** In Custom Story, **From your stories** plays as, or
  brings in, someone from another of your stories, and **From a character card** reads a
  PNG or JSON character card (V1 to V3) with its picture, scenario and opening. Only the
  name, description, personality, scenario and opening are kept, `{{user}}` becomes your
  name, and a card that reads as under 18 is refused.
- **Fixed:** on a bookmarked reply, the other tools under it (Another reply, Edit and the
  rest) never showed, even on hover.
- The end-to-end dice test now waits for the roll button to show before reading it.

- **A setup guide that starts with what matters.** The Setup guide opens with the short
  version (play free now, connect an AI, stay within budget, your keys stay here), then a few
  **recommended models** with what a reply costs and a **Set up** button that fills in the
  service and model, then a table of what replies cost with each model. A bar of contents
  stays at the top while you read.
- **Every click, if you want it.** Each service in the guide, and the connection form under
  **Service**, has **Step by step, every click**: from making an account and a key to testing
  the connection, with terminal help for Ollama.
- **Current models, suggested in one click.** The connection form shows suggested models for
  each service with a few words on each (checked November 2026): Gemini 3.8 Flash, Grok 4.7,
  DeepSeek's Flash and V4 Pro, Mistral's latest, popular OpenRouter models for roleplay, and
  Ollama models by memory size. Claude now suggests Sonnet 5.5 first.
- **Prices without the hunt.** **Usage & budget → Prices** offers **Use the listed prices**
  for models the app knows, so estimates and the budget work; check and save them.
- **New paid connections start at a 32,000-token context**, which keeps a long story's replies
  about a quarter of the price; older parts of the story are summarized as before. Existing
  connections are unchanged.
- **Models that think first work better.** Claude 5, Gemini 2.5 and later, Grok 4 and those
  models through OpenRouter are now asked to think briefly, with 2,000 more tokens for it, so
  short reply limits no longer end before the story is written. If a service refuses a
  setting the app adds on its own (such as a temperature a model no longer takes), the
  request is sent once more without it, at no charge for the refused one.

- **Install updates from the app.** When a new release is out, **Settings → Updates** can
  install it and restart (the footer notice leads there). The download is checked against the
  app's own signature first, and nothing is downloaded until you ask. This needs a release
  built with the update signing key.
- **Report a problem.** The footer (and Ctrl/Cmd+K) has **Report a problem**: say what
  happened, and the app adds the short diagnostics report, with no story text, keys or paths.
  **Copy** it into a message, **Save as file…**, or **Copy and open GitHub** for a new issue.
  Nothing is sent from the app.
- **A portrait for someone new.** With a picture connection, the card for a new character
  has **Make their portrait too** ticked: adding them to the cast draws their portrait from
  the card's looks and shows it on that route once it's made. **Settings → Pictures** turns
  the offer off.
- **See how a picture was made.** A portrait or item picture the app makes keeps the
  description the picture service was sent. Open it in the image library, or pick it under
  **Pictures**, and choose **What was sent to make it**. Cards for new characters now give
  what a painter needs (apparent age, build, skin tone or heritage, hair, eyes, clothes), so
  their portraits match the story, and a description no longer ends in two full stops.
- **Testing a connection explains more.** The result is in your language, a wrong Google
  Gemini key is reported as a refused key, and a paid connection with no key saved says so.
- Fixed: a long story with a big cast could outgrow the default context and stop with "the
  story setup … needs about N tokens". The people not in the scene are now sent in brief, and
  the oldest facts, chapters and threads more briefly, so the story keeps its summary and
  newest turns. Nothing is removed from the story itself.
- The first tip moves on once you send your first action, and **See notes** and **Undo**
  stay together on the memory line.
- Fixed: jumping to a reply (a bookmark, a search result or a chapter) could push the whole
  reader up, hiding the story's title and the menu until the story was opened again.
- Fixed: replies from OpenAI's GPT-6 models (the preset's default) failed or came back
  empty. The app now treats every GPT-5, GPT-6 and o-series model as one that thinks first:
  no temperature, low reasoning effort, and 2,000 more tokens for the thinking.

- **Keep going.** With nothing typed, the send button is **Keep going**: the story goes on
  without your character doing anything.
- **How long the next reply is.** **Short**, **Normal** or **Long** beside the kinds of action
  asks the next reply only to be short or long.
- **Another reply with a hint.** **Another reply** can ask for a length and say what should be
  different, in your own words or with a ready-made hint such as "More dialogue" or "More
  romantic". The hint is for that reply only. The offline storyteller now writes a different
  reply each time too.
- **A note to the storyteller.** The note button beside the story, or the pause menu, keeps a
  note to the storyteller ("let the romance build slowly"). It steers every reply from then
  on, shows above the action box, and is never part of the story.
- **Edit a reply.** The pencil under the latest reply changes its words in place. Its memory
  notes and ideas stay, and the reply as it was is kept as a hidden route.
- **Take back my last turn.** The pause menu, the arrow under your last action, or Ctrl+U
  (Cmd+U on a Mac) goes back to just before your last action and puts its words back in the
  box. The turn is kept in **Routes** as "Taken back: …".
- **Remember this.** Pick words in the story and press **Remember this** to make them a memory
  note: about the person they name, or a moment in the timeline.
- **Find anything.** Ctrl+K (Cmd+K on a Mac) opens a box that finds any story, chapter,
  window or setting as you type. Up and Down choose, Enter goes.
- **Jump to a chapter.** The chapter name under the story's title lists every chapter so far;
  pick one to jump there, or **Replay a chapter…**.
- **Read aloud.** The speaker under a reply reads it with the computer's own voices, offline
  and free. **Settings → Sound** chooses the voice and the speed, with **Try it**. The
  speaker shows only where the computer has voices.
- **Save a route as a book.** **Export → Book** saves the route as an e-book (`.epub`) for any
  e-reader or book app: the story's cover (or a drawn one), a title page with who you played,
  a page for each chapter, a table of contents and the Literata font. Only the story goes in,
  never notes or settings.
- **How they feel about you.** A character can have a **Heart** bar (cold to devoted) or a
  **Trust** bar (suspicious to complete trust) beside how they know you and how they feel now.
  The storyteller reads the bars before every reply and moves them as things happen; the
  "Memory updated" line shows each change (Mara +10) with **Undo**. Set them yourself in
  **Story details**.
- **A tidier notebook.** When a chapter ends and the notebook has grown, the storyteller
  offers to merge notes about the same person or thing and shorten long ones. Each change
  shows what it would become, with **Keep** or **Undo**; nothing changes until the chapter
  ends. The offline storyteller does a simpler version, and stories that keep their notes by
  hand are left alone.
- **Tips for your first story.** Four short tips point at the action box, the kinds of
  action, the tools and the side bar. **Skip tips** hides them for good.
- **A new look.** Stories are set in Literata, a book font, and the rest of the app in Inter;
  both come with the app, so they look the same on every computer. Chapters open like a
  book's, with the chapter number, a large title, an ornament and a large first letter.
  Buttons, cards, dialogs and settings have depth, on/off options are switches, lists to
  pick from are pills, and the main buttons have icons. Things fade in gently, and not at all
  when the computer asks for less motion.
- **Themes.** **Settings → Look** chooses Rose (light or dark with your computer), Midnight,
  Parchment, Neon (near black with cyan and magenta), Café (latte browns and a soft green) or
  Gothic (charcoal and deep red, with serif headings). With **Give each story a look that fits
  its genre** on, each story takes the look of its genre: Gothic for horror and mysteries,
  Neon for science fiction, Midnight for thrillers, Parchment for fantasy and history, Café
  for cozy stories and Rose for romance. **Look** beside the story chooses another for that
  story. Looks are a setting of this computer.
- **Reading the way you like.** **Settings → Look** and **Look** beside the story choose the
  text size, the column width (Narrow, Medium or Wide) and the line spacing (Compact, Normal or
  Roomy) for every story, shown on a sample of a story as you choose. They are remembered on
  this computer.
- **Settings at a glance.** Every section of Settings has an icon, and two new ones say what
  stays on your computer (**Privacy and data**) and how to see every key (**Shortcuts**).
- **Name colors.** Each character's name shows in their own color in the story, on script
  lines and on text, call and post cards, picked from the name so it never changes. Choose
  another under **Name color** in **Story details**; it is only for the screen and is never
  sent to the storyteller.
- **A library of story cards.** Each story is a card with its cover (or a large letter) in its
  own look, how far it got ("Chapter 3 · 48 turns · 2 routes · played 2 hours ago") and the
  last line of the story. Search by title, premise or genre, sort by last played, title or
  newest, and pin stories to the top. The **…** menu on each card renames the story, changes
  its cover, makes a copy, exports it or deletes it. Arrow keys move between the cards.
- **A notice when a reply is ready.** When a reply finishes in a story you left, a notice says
  so, with **Read it** to go there, and a soft chime that **Settings → Sound** can turn off.
- **A tidier reader.** Where and when the story is shows above it; click it to correct the
  scene. The kind of action is a row of pills with
  icons, with Quick save, Save / Load, End chapter, Routes and Search beside them. Another
  reply, Branch from here, Change this action and the bookmark are icons under each reply,
  lines in script style show the speaker's portrait, and the pause menu has icons. While a
  character's text arrives, the action box says "Mina Cho is typing…".
- **Panels beside the story.** Story details, Story memory, Save / Load, Routes, Search and
  the other panels slide in from the side, so the story stays in view; a click on the story
  closes them. Story details shows each character on a profile card. The notebook shows notes
  as cards with portraits, item pictures or icons, the timeline marks where each chapter
  starts, and a click on a note's text changes it. Point at a "Memory updated" chip to read
  the whole note.
- **Story memory that keeps itself up to date.** As it writes, the storyteller notes what
  must stay true: people (where things stand with them), places, things that matter, a
  timeline of events with their chapters, and other facts. Every later reply reads the notes,
  so a gift, a promise or a new home is not forgotten chapters later. A small "Memory updated"
  line under the reply names what was noted, with **See notes** and **Undo**. **Story memory**
  now opens with the notebook, where you can add, change or remove any note while the story
  goes on; changes hold from the next reply. Notes follow branches like the rest of the story.
  Turn off **Let the storyteller keep memory notes** in **Story details** to keep them only
  by hand. When a story has more notes than fit, the ones about the current scene go first and
  the rest are still named.
- **Threads to follow.** The storyteller keeps a short list of promises, mysteries and goals
  the story has not settled, and ticks them off when they are. The "Memory updated" line
  names the threads a reply opened or settled (Undo takes them back too), and **Story memory
  → Threads to follow** lets you tick one off, reword it, add your own or reopen one.
- **Someone new.** When the storyteller brings in a named character who is not in the cast,
  a card under the reply offers to add them as they are, change them first, or not now.
- **Ideas for your next move.** Two or three ideas sit above the empty action box after each
  reply; pick one to put it in the box. **Suggest what you could do next** turns them off.
- **Where and when, always.** The scene above the story and in **Story details** (with a new
  **When**) follows the place and time the storyteller marks, headings on or off. A save's
  name starts from it, and **End chapter** says when the next chapter's title is the
  storyteller's idea.
- **Change a picture's description.** **See or change what is sent** lets you rewrite a
  portrait's or an item picture's description before it is made; the safe-for-work sentence
  is always added.
- **A friendlier start.** An empty library welcomes you with two big choices, **Preset
  Story** and **Custom Story**. A chapter's start offers ways in above the action box (Look
  around, Talk to someone there, Wait and listen), and opening a story puts you in the action
  box. **Preset Story** has **Surprise me**, shows the genres as tags and keeps **Start
  story** in view; in **Custom Story**, Previous, Next and Create story stay at the bottom of
  a long step.
- **Polish from a review pass.** Story covers are wider, so a whole card fits a small window;
  the pause menu fits in two columns; **Story details** gives names, roles and places room;
  **Settings** has links to each section at the top; **Save / Load** lists your saves apart
  from the autosaves; a title stays with a name in ideas ("Lord Shen", not "Lord"); and
  Escape closes a panel even after a button in it turned off while busy.
- **Characters who suit the world.** Preset characters now say which worlds they suit:
  **Surprise me** picks someone who belongs there (no lizardfolk scout on a modern campus),
  the character list shows the best fits first, and the suggested character follows the
  world until you pick one yourself. Any character can still go anywhere.
- **Custom Story's problems in your language.** The list of things to fix before creating
  a story was always in English; it now follows the app's language.
- **Older chapters are kept in brief.** Beyond the 10 newest chapter recaps, the 40 before
  them are now sent in brief instead of being left out.
- **Play several stories at once.** A Stories button beside the story goes back to the library
  in one click. A reply keeps writing when you leave and open another story; the library marks
  the story with "Writing a reply…" until it is in. Each story still opens where you left it,
  with your unsent text kept.
- **Preset Story and Custom Story.** The library's two buttons are now **Preset Story** (a
  ready-made story; it was New story) and **Custom Story** (it was Create your own). Custom
  Story opens in Custom with every field empty. Guided is one click away, and **None (start
  blank)** takes back a preset world, character or opening.
- **Fill in the rest.** Each step of Custom Story has **Fill in the rest**: the storyteller
  fills that step's empty fields to fit what you wrote, in one request, and says which it
  filled. A few words of setting become an era, a description and rules; a title and a premise
  become an opening scene and two or three people to meet, each with a role and how they know
  you. Your own words stay, everything can be changed, and **Undo** takes it all back. Review
  has **Fill in everything left**. Without a connection, or when the call fails, the offline
  storyteller fills in from the preset story closest to what you wrote. Everyone it invents is
  an adult.
- **A story you can see as you make it.** Preset Story shows the story as a cover in the look
  it will be read in: its picture or a large letter, title, genres, premise, cast (you first)
  and the first page in the story's font. Custom Story shows the same cover beside the steps
  and fills it in as you type, and a step bar at the top ticks off the steps behind you and
  goes to any step.
- **Type your own or pick one.** The type of story, setting, era, name, pronouns, role,
  species and tone each take your own words or a pick from a list, and × clears them. Only
  your name is needed to begin: the title becomes _Untitled story_, the first chapter
  _Chapter 1_, and the storyteller is told not to bring up anything you left out (your
  species, say) unless the story needs it or you do.
- **Shorter pages.** Fields most people can skip are folded under **More options**, which
  says how many are filled in. Text boxes are taller and grow as you write. Everyone else in
  the story is a card with a name, a role and how they know you.
- **RPG mode.** A switch on the first step for stats, dice, health, mana and items, all set
  up under You. Each stat says what it is for (Strength is raw power; Fitness is stamina and
  athletics), and the usual stats and bars are one click away. Off, the story has no numbers.
- **A style that isn't locked.** The new **Mixed** style, the usual for a custom story, tells
  each moment the way that suits it: narration, dialogue, thoughts and messages. Any other
  style is a starting point the storyteller can step out of for a moment, and **Your own
  style** describes how you'd like it told in your own words.
- **The chapter plan is only a guide.** The storyteller is told to follow the story when it
  goes another way, and to drop or rework the plan. A chapter without its own name is called
  just "Chapter 2" in the request and in exports, not "Chapter 2: Chapter 2".
- **Clearer picture buttons.** **Add for this story only** keeps a picture with the story;
  **Add to your library (any story)** shares it with every story. The two groups of
  pictures are named the same way.
- **Fix: item pictures.** Choosing or making a picture for an inventory item stopped with a
  database error, so it was never saved. The database is upgraded (schema 7) to keep item
  pictures; as with every upgrade, a copy of the old database is saved first.
- **Polish from a whole-app check.** Stories without a cover get a letter tile in the
  library, so the list stays even. The labels beside the story (Picture view, Shortcuts) are
  a little larger. Picture connections and the Setup guide now say they make item pictures
  as well as portraits. The offline storyteller's description says it writes in English. The
  "(required)" mark on fields is translated, two of the guide's links point to the
  services' new pages, and Settings leaves room between the background picture and its
  options.
- **Which model should I use?** The Setup guide has a folded-away section with suggestions
  for stories, pictures, low cost and privacy: OpenAI's GPT-6 models with GPT Image for
  stories and pictures on one key, Claude for long stories, cheap and quick picks, OpenRouter,
  and models on your own computer. The Model field also lists current names for OpenAI,
  Claude, Gemini and OpenAI pictures, while any other name can still be typed.
- **Fixed: OpenAI pictures.** New OpenAI picture connections suggested `gpt-image-1`, which
  OpenAI retired on 23 October 2026. They now use `gpt-image-2.6-flare`, and Settings points
  out a connection still set to a retired picture model.
- **17 new worlds, 19 scenarios and 12 characters.** Raid the Shifting Deep with a party of
  four in Greywatch, or join the resistance against STEWARD, the AI that runs Arclight. Also
  new: a college of weather magic, a gothic fen village with a bell that rings for the dead, a
  fortified high school forty-one days into an outbreak, a salvage crew and a ghost liner, a
  talent agency ninety days before debut, a cozy potion shop on a turtle-ferry island, a
  vampire court, a locked-room mystery on a 1934 airship, a pirate crew that just voted you
  captain, a martial sect's stolen manual, waking up as a romance novel's villainess, a town
  stuck on the same Tuesday, a casino heist, a supervillain's henchpeople forming a union, and
  a regent's first winter with a dragon under the mountain. Most new scenarios start with
  health, items and more already set up for them (the whole party's health and mana, a ship's
  hull and fuel, a vampire house's favor), shown in Quick Start before you begin.
- **A richer offline storyteller.** Playing without an AI service now feels like the kind of
  story you chose: fantasy, science fiction and cyberpunk, horror and mystery, romance and
  slice of life, and adventure each have their own scenes, twists and things to find. The
  characters answer and react in a voice that fits their personality, text back in short
  bursts the way they would, sound like people on calls, and now and then text you first. It
  follows the story's style (including a proper script with stage directions), point of view,
  detail, headings, thoughts and twists, the dice settings, and keeps health, gold, mana,
  items and affection changing as you play.
- **Health, items and more, like an RPG.** **Keep track of health, items and more** (in the
  wizard's Narration step and Story details) gives a story bars such as Health 80/100,
  counters such as Gold 35, and an inventory. It starts with what suits the story (Health,
  Mana and Gold for fantasy, Affection for romance) and every bar, counter and starting item
  can be changed, including a party member's. The storyteller is told the numbers and writes
  what changes (a goblin's blade, a chest with a key in it); the app does the arithmetic and
  shows each change in the story. Your bars show above the action box, and **Inventory**
  lists every item with its description. **Make a picture** asks your picture connection for
  a picture of an item. Each route keeps its own numbers.
- **More ways to tell a story, with an example of each.** Two new styles, _Roleplay chat_
  (actions in italics, short replies) and _Text adventure_ (where you are, what you see and
  the ways onward), join Narrated, Script, Thoughts and Messages. Under the style picker a
  short example shows how the story will read, with a heading, a thought or a text card when
  those are on. Script lines now read `Name: "line"` with stage directions in italics. Point
  of view, detail and pacing say what each choice means, and a new **Tense** picker sets
  present or past.
- **Every feature has a box.** **Features** (in the wizard's Narration step and Story details)
  turns each one on or off: inner thoughts, texts and calls as cards, characters texting you
  first, place and time headings, your small reactions written for you, how often twists come,
  and dice.
- **Dice settings.** Folded away under the dice box: who asks for rolls, the dice every roll
  uses (or the storyteller's pick), how often it asks, generous, fair or tough odds, whether
  stats count, critical rolls on a natural top or bottom face, and whether the number needed
  shows before you roll. The app enforces the dice and stats rules itself.
- **Texts and calls that sound like people.** The storyteller is now asked to write texts the
  way each character really texts (short, casual, often several in a row, with emoji or
  slang only when it suits them), to make calls sound like real speech, and to let characters
  text or call you first when they have a reason. A character's portrait, when they have one,
  is their picture on text, call and post cards.
- **Place and time headings.** When the story moves to a new place or time, a heading such as
  "Countryside — 7:11 PM" appears above it. New stories have it on; **Style** turns it off.
- **Setup guide.** A new **Setup guide** (in the library, Settings and the footer) explains,
  step by step, how to play right away, which kind of AI service to choose, and how to
  connect each one: the AI labs, hosted open models, programs on your computer (Ollama, LM
  Studio, Jan, KoboldCpp, llama.cpp, text-generation-webui, vLLM) and the picture
  connections. Each service has buttons for its key and model pages, which open in your
  browser, and **Set it up here** opens a new connection with the service filled in. It also
  covers testing, keeping costs in check, where keys are kept and the usual problems.
- **Keyboard shortcuts.** Most things in a story now have a key: Ctrl+L for Save / Load,
  Ctrl+B to bookmark the latest reply, Ctrl+G for routes, Ctrl+I for story details,
  Ctrl+Shift+M for story memory, Ctrl+E to end the chapter, Ctrl+P for picture view, Ctrl+=
  and Ctrl+- for text size and Ctrl+J to jump back to the latest and write, alongside Ctrl+S,
  Ctrl+F, Esc and the arrow keys. Ctrl+N starts a new story from the library and Ctrl+,
  opens Settings. **F1** (or **Shortcuts** beside the story) lists them all; buttons and the
  pause menu show their keys. On a Mac they use ⌘.
- **Picture view.** With a background or portraits chosen, the reader shows a stage above
  the story, like a visual novel: the scene's background with the portrait of the character
  the story is with, and their name. When someone new appears in a reply, or returns after a
  while, the stage switches to them; the small portraits beside it put anyone else in the
  scene on stage. **Picture view**, on the right side of the story, switches to text only
  (and back), and the app remembers the choice.
- **A background picture.** **Settings → Background picture** puts a picture from your image
  library (or a new one from your computer) behind every screen, softened so the text stays
  easy to read; choose how much of it shows. It is a setting of this computer, and **Images**
  says which picture it is.
- **One continuing world.** The storyteller is now told outright that it plays everyone
  except your character, from allies to villains, and that each acts from their own
  personality and goals rather than a script. The world carries on across chapters, with
  lasting consequences and returning characters. A chapter can cover one night or several
  months, and the storyteller keeps track of secrets and who knows them.
- **The app in Chinese, Japanese and Korean.** **Settings → Language → App language** shows
  every menu, button and message in Simplified Chinese (简体中文), Traditional Chinese
  (繁體中文), Japanese (日本語) or Korean (한국어), or follows the computer's language (the
  default). Dates and numbers follow the language, each language uses its own system fonts,
  and new stories start with the story language set to the app's, which **Style** can
  change. Story presets and templates stay in English; the storyteller writes in the story's
  language either way.
- **Story memory.** A new **Story memory** panel in the pause menu shows what the storyteller
  remembers beyond the newest turns: the summary of earlier turns (which turns it covers and
  which connection wrote it), the recaps of ended chapters, and the facts, relationships and
  open threads. It is all kept in the story, so switching to another storyteller, or to the
  offline one, carries it over. **Storyteller** links to it.
- **Routes as a list, a map or a timeline.** **Routes** now says where each route branched
  ("after turn 4"), what it did differently first (another reply, a different action or a
  change), how many turns it has, its chapter and its latest words. Switch between a **List**,
  a **Map** of how the routes branch, and a **Timeline** of the turns each route covers; the
  app remembers your choice. Every view can switch, rename, hide and show routes.
- **Portraits from a description.** Add a picture connection (**OpenAI images**, or **Stable
  Diffusion WebUI** on your own computer) and choose it under **Settings → Pictures**. Then
  **Make portrait**, while creating a story or from a story's **Pictures**, draws a character
  from their looks, species, role and traits in the style you pick (painted, anime, photo or
  pencil sketch). **Show what is sent** shows the description first; names and story text are
  never sent, and portraits are always safe-for-work. Each portrait belongs to its story, and
  every request appears in **Usage** as "Character picture".
- **Pictures for one story or for all.** Pictures added from a story's **Pictures**, or
  while creating a story, belong to that story only; pictures added in **Images** can be used
  in any story. **Images** shows them apart (for all stories, only in a story, and not in any
  story) and can share a picture or keep it for one story. A story's pictures stay in the
  library if the story is deleted.
- **Pictures and storyteller while creating.** The wizard has a new **Pictures** step: add
  pictures, pick the cover and background, give each character a portrait, and choose which
  AI writes this story.
- **A storyteller per story.** Click the storyteller's name above a story (or **Menu →
  Storyteller**) to pick another one for that story only. Summaries, recaps and facts carry
  over, so switching never loses the story.
- **Eight more worlds**, each with a scenario: Northgate University (school life, with dice
  for exams), The Underhalls (a dungeon delve with orcs, goblins and lizardfolk), Neon Harbor
  (cyberpunk), The Dry Country (post-apocalyptic), Lumen City (superheroes), Dust Creek
  (western), The Lantern Palace (court intrigue) and Maple & Fern (a cozy dating story). Seven
  more characters, including an orc delver, a goblin tinkerer and a lizardfolk scout, with
  stats.
- **Race or species** for every character, with more than 40 to pick from (orc, goblin,
  lizardfolk, catfolk, merfolk, android and more) or your own. Guided creation also offers
  many more roles, personality traits, eras, settings and world rules. **Rules** and
  **personality** are now a compact menu instead of a long list of checkboxes.
- **Dice rolls.** With **Roll dice for uncertain moments** on (the default for Adventure,
  Fantasy and School life), the storyteller stops at risky moments and asks for a roll. It
  sets the odds from the story, such as a test scored 40 to 100 after studying twice. You
  press **Roll** and the app rolls fairly. Characters can have **stats** that add to rolls,
  and **Roll dice** in the action box rolls on your own. A roll is saved with the action, so
  another reply never rerolls it.
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
- More fixes: a dice result typed into an action is ignored (only the app's own rolls count),
  and a roll's bonus needs its stat; the **Roll dice** box accepts exactly the dice the app can
  roll; the safety line at the end of a portrait request can no longer be cut off; a picture or
  portrait for a story that was just deleted is refused before anything is paid or added;
  bookmarks, search results and the routes list show texts, calls and thoughts as short labels
  instead of raw tags; a chapter with no title of its own shows as "Chapter 2", not
  "Chapter 2: Chapter 2"; a long rule no longer makes the create screen scroll sideways; and a
  story's **Pictures** lists the cover and background first, as when the story was made. In
  Chinese, Japanese and Korean, the app's own names (Main, Alt 2, Autosave, Portrait of …),
  the Diagnostics checks and the search labels are translated too.
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

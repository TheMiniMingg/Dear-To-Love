import type { ReactNode } from 'react';
import {
  BookMarked,
  Compass,
  Dices,
  GitBranch,
  Image,
  KeyRound,
  MessageSquareText,
  Save,
  Settings2,
  Volume2,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';
import { useUiStore } from '../../app/store';
import { shortcutKeys } from '../../app/shortcuts';
import { msg, t } from '../../i18n';

/**
 * How to play: the whole game in one page, for anyone who skipped the
 * first-run tips or wants the finer points (steering the storyteller,
 * memory, routes, pictures, dice). The Setup guide covers services and keys.
 */
const SECTIONS: { id: string; title: string; icon: LucideIcon }[] = [
  { id: 'help-basics', title: msg('Playing a turn'), icon: MessageSquareText },
  { id: 'help-steer', title: msg('Three ways to steer the storyteller'), icon: Compass },
  { id: 'help-undo', title: msg('Changing your mind'), icon: GitBranch },
  { id: 'help-memory', title: msg('Chapters and memory'), icon: BookMarked },
  { id: 'help-long', title: msg('When a story gets long'), icon: Waypoints },
  { id: 'help-style', title: msg('Your story, your way'), icon: Settings2 },
  { id: 'help-pictures', title: msg('Pictures'), icon: Image },
  { id: 'help-sound', title: msg('Reading aloud'), icon: Volume2 },
  { id: 'help-dice', title: msg('Dice and RPG mode'), icon: Dices },
  { id: 'help-saving', title: msg('Saving, sharing and presets'), icon: Save },
  { id: 'help-privacy', title: msg('Cost and privacy'), icon: KeyRound },
];

function Section({ id, children }: { id: string; children: ReactNode }) {
  const s = SECTIONS.find((x) => x.id === id)!;
  const Icon = s.icon;
  return (
    <section className="settings-section help-section" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} tabIndex={-1}>
        <Icon className="section-icon" aria-hidden={true} />
        {t(s.title)}
      </h2>
      {children}
    </section>
  );
}

/** A term and what it does, as one line of a list. */
function Term({ name, children }: { name: string; children: ReactNode }) {
  return (
    <li>
      <strong>{name}</strong> {children}
    </li>
  );
}

export function HelpScreen() {
  const goBack = useUiStore((s) => s.goBack);
  const navigate = useUiStore((s) => s.navigate);
  return (
    <section className="screen help-screen" aria-labelledby="help-title">
      <div className="screen-header">
        <button type="button" onClick={goBack}>
          {t('Back')}
        </button>
        <h1 id="help-title">{t('How to play')}</h1>
        <div className="button-row">
          <button type="button" onClick={() => navigate({ name: 'guide' })}>
            {t('Setup guide')}
          </button>
        </div>
      </div>
      <p className="muted">
        {t(
          'You play one character. The storyteller plays everyone else, keeps the world turning, and never decides what you do, say, think or feel. Everything below can be found again from Menu (Esc) while you read.',
        )}
      </p>
      <nav className="help-nav" aria-label={t('On this page')}>
        <ol>
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}-title`}>{t(s.title)}</a>
            </li>
          ))}
        </ol>
      </nav>

      <Section id="help-basics">
        <ul className="help-terms">
          <Term name={t('Write what you do')}>
            {t(
              'in the box at the bottom and press Enter (Shift+Enter for a new line). The pills above it change the kind of action: do or say, send a text, make a call, think to yourself, or roll the dice.',
            )}
          </Term>
          <Term name={t('Keep going')}>
            {t('with the box empty lets the story move on without you doing anything.')}
          </Term>
          <Term name={t('Short, Normal, Long')}>
            {t(
              'beside the pills sets the length of the next reply only. The usual length is the Detail setting in Story details.',
            )}
          </Term>
          <Term name={t('Ideas under a reply')}>
            {t(
              'are suggestions you can click or ignore; the storyteller never takes them for you.',
            )}
          </Term>
          <Term name={t('Choices A–D')}>
            {t(
              'turn the ideas into four choices that take the story different ways: click one to send it as your turn, or write your own. Switch them on in Tune the telling, Story details or Preset Story (Help with your next move).',
            )}
          </Term>
        </ul>
      </Section>

      <Section id="help-steer">
        <p>
          {t(
            'Each one works at a different distance from the story. Use the lightest one that does the job.',
          )}
        </p>
        <ul className="help-terms">
          <Term name={t('Note to the storyteller')}>
            {t(
              '(tool bar, or Menu) is about how the story is told from here on: “slow the romance down”, “more danger”, “let her say no”. It is never part of the story and you can change or remove it at any time.',
            )}
          </Term>
          <Term name={t('Rules')}>
            {t(
              '(Story details → World) are what is true in this world and what the storyteller must always do: “magic has a price”, “no one dies off-screen”. They go into every reply.',
            )}
          </Term>
          <Term name={t('Remember this')}>
            {t(
              '(point at a reply, or write a note in Story memory) keeps one fact whole: a promise, a secret, the name of the inn. Memory notes survive summaries; feelings and facts about people live in Story details.',
            )}
          </Term>
        </ul>
        <p className="muted small">
          {t(
            'Story details also hold everyone’s description, goals and relationships, the scene (where and when) and the established facts. Apply from now changes the story from the next reply without rewriting the past.',
          )}
        </p>
      </Section>

      <Section id="help-undo">
        <ul className="help-terms">
          <Term name={t('Take back my last turn')}>
            {t('(Menu) removes your last action and its reply; the turn stays in Routes.')}
          </Term>
          <Term name={t('Another reply')}>
            {t(
              '(point at a reply) asks the storyteller for a different reply to the same action, at a length you choose and with a hint such as “she says no”. Each take is kept; flip between versions with the arrows under the reply.',
            )}
          </Term>
          <Term name={t('Change this action, Edit this reply')}>
            {t(
              'rewrite your words or the storyteller’s. Edited replies are read as written from then on.',
            )}
          </Term>
          <Term name={t('Branch from here')}>
            {t(
              'starts a new route from any point. Routes are separate timelines: each has its own memory, saves and pictures, and they share everything before the branch. Switch between them in Routes.',
            )}
          </Term>
        </ul>
      </Section>

      <Section id="help-memory">
        <p>
          {t(
            'The storyteller reads the newest turns word for word, every detail in Story details and Story memory, and a summary of the older turns. The summary begins after 16 turns and is renewed every 8, so long stories stay affordable.',
          )}
        </p>
        <ul className="help-terms">
          <Term name={t('End chapter')}>
            {t(
              '(tool bar) has the storyteller write a recap of the chapter, which you can edit. Every later reply reads the recap, so names, promises and secrets you keep in it are never forgotten, and the next chapter starts with a clear plan.',
            )}
          </Term>
          <Term name={t('Story memory')}>
            {t(
              '(Menu) shows exactly what the storyteller remembers: the summary, the chapter recaps, the notebook of people, places and things, and the facts and relationships. Fix anything that drifted.',
            )}
          </Term>
          <Term name={t('Preview context')}>
            {t(
              '(Menu) shows the whole request the next reply would send, its size and its cost, before anything is sent.',
            )}
          </Term>
        </ul>
      </Section>

      <Section id="help-long">
        <p>
          {t(
            'Every model can read only so much at once. The app handles this for you: older turns are summarized first, then the story setup is packed tighter. The memory gauge in the reader’s status line shows how full the request is; it turns amber when it is time to act.',
          )}
        </p>
        <ul className="help-terms">
          <Term name={t('End the chapter.')}>
            {t('A recap takes far less room than the turns it replaces.')}
          </Term>
          <Term name={t('Trim the setup.')}>
            {t(
              'Long descriptions, old facts and finished threads are sent with every reply. Shorten them in Story details.',
            )}
          </Term>
          <Term name={t('Raise the context limit')}>
            {t(
              'for the connection (Settings → AI connections → Edit) when the model can read more than the limit set there. Many hosted models read 128,000 tokens or more; a bigger limit also costs more per reply.',
            )}
          </Term>
          <Term name={t('Pin what matters')}>
            {t(
              'as a memory note or a fact; they are kept whole where a summary would shorten them.',
            )}
          </Term>
        </ul>
      </Section>

      <Section id="help-style">
        <ul className="help-terms">
          <Term name={t('Tune')}>
            {t(
              '(tool bar) changes Detail, Pacing, twists and point of view for this story from the next reply on. The full set, including style, tense, inner thoughts and texts as cards, is in Story details → Narration.',
            )}
          </Term>
          <Term name={t('Look')}>
            {t(
              '(the rail beside the story) picks this story’s colors; Settings → Look sets the app’s theme, text size, column width, line spacing and the story typeface, with an easy-to-read option.',
            )}
          </Term>
          <Term name={t('Keyboard shortcuts')}>
            {t(
              'are listed with {keys}; click any of them and press new keys to change it. Picture view, sound and reading aloud each have a switch.',
              { keys: shortcutKeys('help') },
            )}
          </Term>
          <Term name={t('Story language')}>
            {t(
              'is chosen when a story is made and can be changed in Story details; the app’s own language is in Settings.',
            )}
          </Term>
        </ul>
      </Section>

      <Section id="help-pictures">
        <p>
          {t(
            'Pictures (Menu) gives the story a cover, a background, a portrait for each character, pictures of items and a picture for each place. Portraits can be made with a picture connection or chosen from the image library; anything you import works too.',
          )}
        </p>
        <p className="muted small">
          {t(
            'The stage above the story shows the current place and whoever the story is with. The storyteller marks each change of scene with its place, so a place picture appears when the story goes there. Picture view on the rail turns the stage off for text only.',
          )}
        </p>
      </Section>

      <Section id="help-sound">
        <p>
          {t(
            'The speaker under a reply reads it with the computer’s own voices, free and offline. Settings → Sound can read every new reply as it arrives, set the speed, and build voice packs: a voice for the narrator and one for each character, from the computer or from a voice service. One switch turns all sound off.',
          )}
        </p>
      </Section>

      <Section id="help-dice">
        <p>
          {t(
            'With dice on (Story details → Narration), uncertain moments are decided by a roll: the storyteller asks and sets the odds, you roll, and the result shapes the reply. RPG mode adds stats that count towards rolls, meters such as health, and an inventory, all shown beside the story and editable in Status and inventory.',
          )}
        </p>
      </Section>

      <Section id="help-saving">
        <ul className="help-terms">
          <Term name={t('Autosave')}>
            {t(
              'keeps every turn as it happens. Quick save and Save / Load keep named points you can return to, on any route.',
            )}
          </Term>
          <Term name={t('Export')}>
            {t(
              '(Menu) saves a route as readable text or as a book, or the whole story as a storypack that another copy of the app can import. Storypacks never contain keys or settings.',
            )}
          </Term>
          <Term name={t('Save as a preset')}>
            {t(
              '(More, on a story card) keeps the world, cast, rules and style of a story without its turns, under Preset Story → Your presets, to start fresh from or to share as a file.',
            )}
          </Term>
          <Term name={t('Backups')}>
            {t(
              '(Settings) write everything to one file and restore it on this or another computer.',
            )}
          </Term>
        </ul>
      </Section>

      <Section id="help-privacy">
        <p>
          {t(
            'Your stories, pictures and settings stay on this computer. The only things that leave it are the requests to the AI connections you add, and the once-a-day version check if you turn it on. API keys live in the system’s credential store, never in the database, in exports or in backups.',
          )}
        </p>
        <p className="muted small">
          {t(
            'Usage & budget shows what each connection has cost, request by request, and can pause paid replies at a monthly amount. The offline storyteller is good for learning the controls; for a real story, add an AI connection in the Setup guide.',
          )}
        </p>
      </Section>
    </section>
  );
}

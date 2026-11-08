/**
 * Memory notes in the reader: the "Memory updated" line under a reply, and
 * the names of the notebook's sections.
 */
import {
  CalendarClock,
  CircleCheck,
  Gem,
  HeartHandshake,
  Lightbulb,
  ListTodo,
  MapPin,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import type { MemoryNote, NoteKind, StateEdit, StoryStateV1 } from '../../types';
import {
  bondChanges,
  noteChanges,
  threadChanges,
  type NoteChange,
  type ThreadChange,
} from './messages';
import { BOND_ICONS, standingBonds } from './feelings';
import { msg, t } from '../../i18n';

/** The notebook's sections, in the order the storyteller reads them. */
export const NOTE_KINDS: { kind: NoteKind; heading: string; one: string; hint: string }[] = [
  {
    kind: 'person',
    heading: msg('People'),
    one: msg('Person'),
    hint: msg('Where things stand with someone: relationship, promises, what they know or wear.'),
  },
  {
    kind: 'place',
    heading: msg('Places'),
    one: msg('Place'),
    hint: msg('A home, an office, a hideout, and what it is like.'),
  },
  {
    kind: 'item',
    heading: msg('Things'),
    one: msg('Thing'),
    hint: msg('Something that matters: a gift, a weapon, a key.'),
  },
  {
    kind: 'event',
    heading: msg('Timeline'),
    one: msg('Event'),
    hint: msg('Something that happened, with the chapter it happened in.'),
  },
  {
    kind: 'fact',
    heading: msg('Other facts'),
    one: msg('Fact'),
    hint: msg('Anything else that must stay true.'),
  },
];

/** Each kind of note's icon, in the notebook and on the Memory updated line. */
export const NOTE_ICONS: Record<NoteKind, LucideIcon> = {
  person: UserRound,
  place: MapPin,
  item: Gem,
  event: CalendarClock,
  fact: Lightbulb,
};

/** A note's key, as `notes::note_key` in Rust: lower case, single spaces. */
export const noteKey = (name: string) => name.trim().split(/\s+/).join(' ').toLowerCase();

export const sameNote = (n: MemoryNote, kind: NoteKind, name: string) =>
  n.kind === kind && noteKey(n.name) === noteKey(name);

/** True when an edit only changes memory notes or threads (shown as "Memory changed"). */
export function notesOnly(changes: StateEdit[]): boolean {
  return (
    changes.length > 0 &&
    changes.every((c) =>
      ['upsertNote', 'removeNote', 'setOpenThreads', 'setDoneThreads', 'setRelationships'].includes(
        c.op,
      ),
    )
  );
}

/**
 * A thread's key, as `threads::thread_key` in Rust: lower case, single
 * spaces, no closing full stop or question mark.
 */
export const threadKey = (text: string) =>
  text
    .trim()
    .split(/\s+/)
    .join(' ')
    .replace(/[.?!。？！]+$/u, '')
    .toLowerCase();

/** Open and settled threads, as the story keeps them. */
export type ThreadLists = { open: string[]; done: string[] };

/** The threads a reply opened or settled that still stand as it left them. */
export function standingThreads(text: string, now: ThreadLists): ThreadChange[] {
  const has = (list: string[], t: string) => list.some((x) => threadKey(x) === threadKey(t));
  return threadChanges(text).filter((c) => has(c.done ? now.done : now.open, c.text));
}

/**
 * The notes a reply wrote that still stand as it left them: what its Undo
 * would take back (a note changed again since is left alone).
 */
export function standingNotes(text: string, current: MemoryNote[]): NoteChange[] {
  return noteChanges(text).filter((c) => {
    const now = current.find((n) => sameNote(n, c.kind, c.name));
    return c.forget ? !now : now?.text === c.text;
  });
}

/**
 * Under a reply that wrote memory notes: what it noted, a way to see the
 * notes and a way to take them back.
 */
export function MemoryLine({
  text,
  current,
  threads,
  feelings,
  onOpen,
  onUndo,
}: {
  text: string;
  /** The notes as they are now: Undo is offered only while some of this reply's notes stand. */
  current?: MemoryNote[];
  /** The threads as they are now, likewise. */
  threads?: ThreadLists;
  /** The story as it is now, for how people feel about the player. */
  feelings?: StoryStateV1;
  onOpen?: () => void;
  onUndo?: () => void;
}) {
  const changes = noteChanges(text);
  const threadMoves = threadChanges(text);
  const bonds = bondChanges(text);
  if (!changes.length && !threadMoves.length && !bonds.length) return null;
  const stands =
    !current ||
    standingNotes(text, current).length > 0 ||
    (!!threads && standingThreads(text, threads).length > 0) ||
    (!!feelings && standingBonds(text, feelings).length > 0);
  const undo = onUndo && stands ? onUndo : undefined;
  return (
    <p className="memory-line">
      <span className="memory-label">{t('Memory updated')}</span>
      {changes.map((c, i) => {
        const Icon = NOTE_ICONS[c.kind];
        return c.forget ? (
          <span key={i} className={`memory-chip kind-${c.kind} forgot`}>
            <Icon className="memory-chip-icon" aria-hidden={true} size={13} />
            {t('Forgot {name}', { name: c.name })}
          </span>
        ) : (
          <span
            key={i}
            className={`memory-chip kind-${c.kind}`}
            aria-label={`${c.name}: ${c.text}`}
          >
            <Icon className="memory-chip-icon" aria-hidden={true} size={13} />
            {c.name}
            <span className="memory-pop" role="tooltip">
              {c.text}
            </span>
          </span>
        );
      })}
      {threadMoves.map((c, i) => {
        const Icon = c.done ? CircleCheck : ListTodo;
        return (
          <span
            key={`thread-${i}`}
            className={`memory-chip kind-thread${c.done ? ' done' : ''}`}
            aria-label={
              c.done
                ? t('Thread settled: {thread}', { thread: c.text })
                : t('New thread: {thread}', { thread: c.text })
            }
          >
            <Icon className="memory-chip-icon" aria-hidden={true} size={13} />
            <span className="memory-chip-text">{c.text}</span>
          </span>
        );
      })}
      {bonds.map((c, i) => {
        const Icon = c.kind ? BOND_ICONS[c.kind] : HeartHandshake;
        const change = c.change ? c.change.replace('-', '−') : '';
        const said = c.kind
          ? c.kind === 'heart'
            ? t('{name}: heart {change}', { name: c.name, change })
            : t('{name}: trust {change}', { name: c.name, change })
          : c.name;
        return (
          <span
            key={`bond-${i}`}
            className={`memory-chip kind-bond${c.kind ? ` bond-${c.kind}` : ''}${
              c.change?.startsWith('-') ? ' down' : ''
            }`}
            aria-label={c.line ? `${said}. ${c.line}` : said}
          >
            <Icon className="memory-chip-icon" aria-hidden={true} size={13} />
            {c.name}
            {change && <span className="bond-change">{change}</span>}
            {c.line && (
              <span className="memory-pop" role="tooltip">
                {c.line}
              </span>
            )}
          </span>
        );
      })}
      {(onOpen || undo) && (
        <span className="memory-actions">
          {onOpen && (
            <button type="button" className="memory-action" onClick={onOpen}>
              {t('See notes')}
            </button>
          )}
          {undo && (
            <button
              type="button"
              className="memory-action"
              onClick={undo}
              title={t('Take back what this reply noted; the story itself stays')}
            >
              {t('Undo')}
            </button>
          )}
        </span>
      )}
    </p>
  );
}

/**
 * Memory notes in the reader: the "Memory updated" line under a reply, and
 * the names of the notebook's sections.
 */
import type { MemoryNote, NoteKind, StateEdit } from '../../types';
import { noteChanges, type NoteChange } from './messages';
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

/** A note's key, as `notes::note_key` in Rust: lower case, single spaces. */
export const noteKey = (name: string) => name.trim().split(/\s+/).join(' ').toLowerCase();

export const sameNote = (n: MemoryNote, kind: NoteKind, name: string) =>
  n.kind === kind && noteKey(n.name) === noteKey(name);

/** True when an edit only changes memory notes (shown as "Memory changed"). */
export function notesOnly(changes: StateEdit[]): boolean {
  return changes.length > 0 && changes.every((c) => c.op === 'upsertNote' || c.op === 'removeNote');
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
  onOpen,
  onUndo,
}: {
  text: string;
  /** The notes as they are now: Undo is offered only while some of this reply's notes stand. */
  current?: MemoryNote[];
  onOpen?: () => void;
  onUndo?: () => void;
}) {
  const changes = noteChanges(text);
  if (!changes.length) return null;
  const undo = onUndo && (!current || standingNotes(text, current).length) ? onUndo : undefined;
  return (
    <p className="memory-line">
      <span className="memory-label">{t('Memory updated')}</span>
      {changes.map((c, i) =>
        c.forget ? (
          <span key={i} className="memory-chip forgot">
            {t('Forgot {name}', { name: c.name })}
          </span>
        ) : (
          <span key={i} className="memory-chip" title={c.text} aria-label={`${c.name}: ${c.text}`}>
            {c.name}
          </span>
        ),
      )}
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
    </p>
  );
}

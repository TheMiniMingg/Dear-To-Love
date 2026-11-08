/**
 * Story memory -> Notebook: the memory notes the storyteller keeps (and the
 * player can write), grouped like separate notebooks: people, places,
 * things, a timeline and other facts. Every change is saved as an edit at
 * the newest turn, so it holds from the next reply on and can be undone
 * like any other change.
 */
import { useContext, useEffect, useId, useRef, useState } from 'react';
import { NotebookPen, Pencil, Trash2 } from 'lucide-react';
import { commands, errorMessage } from '../../api/commands';
import type { MemoryNote, NoteKind, RouteView, StateEdit } from '../../types';
import { t } from '../../i18n';
import { Thumb } from '../images/ImageGrid';
import { NameColorsContext, nameStyle } from './nameColors';
import { NOTE_ICONS, NOTE_KINDS, noteKey, sameNote } from './notes';
import { itemKey, picture } from './pictures';
import { PortraitsContext } from './portraits';

/** As `MAX_NOTE_NAME` and `MAX_NOTE_TEXT` in Rust. */
const MAX_NAME = 80;
const MAX_TEXT = 800;
/** Above this many notes the notebook offers a search box. */
const FILTER_FROM = 8;

type Draft = { kind: NoteKind; name: string; text: string; chapter: string };

const keyOf = (n: { kind: NoteKind; name: string }) => `${n.kind}:${noteKey(n.name)}`;
const headingOf = (kind: NoteKind) => t(NOTE_KINDS.find((k) => k.kind === kind)!.heading);

/** The notes of one kind as the notebook lists them: a timeline in chapter order, the rest by name. */
function ordered(notes: MemoryNote[], kind: NoteKind): MemoryNote[] {
  const mine = notes.filter((n) => n.kind === kind);
  if (kind === 'event') {
    return mine
      .map((n, i) => ({ n, i }))
      .sort((a, b) => (a.n.chapter ?? 1e9) - (b.n.chapter ?? 1e9) || a.i - b.i)
      .map((x) => x.n);
  }
  return [...mine].sort((a, b) => a.name.localeCompare(b.name));
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The id of the name box of a note opened by "Remember this", to focus it. */
export const REMEMBER_NAME_ID = 'remember-note-name';

/**
 * A note holding words picked in the story: the note of the person they
 * name, with the words added, or a new moment in the timeline.
 */
function pickedNote(
  words: string,
  view: RouteView,
): { adding: Draft } | { editing: { key: string; draft: Draft } } {
  const s = view.state.state;
  const notes = s.notes ?? [];
  const chapter = view.state.activeChapter?.ordinal;
  const lower = words.toLowerCase();
  // A name as a whole word; names in scripts without spaces, anywhere.
  const named = (name: string) =>
    [name, name.split(/\s+/)[0] ?? ''].some((n) =>
      n.length < 2
        ? false
        : /^[\w' -]+$/.test(n)
          ? new RegExp(`\\b${escapeRe(n)}\\b`).test(lower)
          : lower.includes(n),
    );
  const who = Object.values(s.characters).find(
    (c) => c.id !== s.playerCharacterId && c.name.trim() && named(c.name.trim().toLowerCase()),
  );
  const kept = who && notes.find((n) => sameNote(n, 'person', who.name.trim()));
  if (kept) {
    const text = `${kept.text.trim()} ${words}`.slice(0, MAX_TEXT);
    return {
      editing: {
        key: keyOf(kept),
        draft: { kind: 'person', name: kept.name, text, chapter: '' },
      },
    };
  }
  return {
    adding: who
      ? { kind: 'person', name: who.name.trim(), text: words, chapter: '' }
      : { kind: 'event', name: '', text: words, chapter: chapter ? String(chapter) : '' },
  };
}

export function Notebook({
  view,
  disabled,
  onChanged,
  startNote,
}: {
  view: RouteView;
  /** True while a reply is being written. */
  disabled: boolean;
  onChanged: (v: RouteView) => void;
  /** Words picked in the story: open a note holding them. */
  startNote?: string | null;
}) {
  const notes = view.state.state.notes ?? [];
  const manual = !!view.state.state.narration?.manualMemory;
  const chapter = view.state.activeChapter?.ordinal;
  const [filter, setFilter] = useState('');
  const [picked] = useState(() => (startNote?.trim() ? pickedNote(startNote.trim(), view) : null));
  const [adding, setAdding] = useState<Draft | null>(
    picked && 'adding' in picked ? picked.adding : null,
  );
  const [editing, setEditing] = useState<{ key: string; draft: Draft } | null>(
    picked && 'editing' in picked ? picked.editing : null,
  );
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filterId = useId();
  const root = useRef<HTMLElement>(null);
  /**
   * Where focus goes once a form closes: a note's key (its Change button),
   * 'add' (Add a note) or 'top' (the heading). Without it, focus would fall
   * out of the window and Escape would no longer close it.
   */
  const refocus = useRef<string | null>(null);
  useEffect(() => {
    const target = refocus.current;
    const box = root.current;
    if (!target || !box) return;
    refocus.current = null;
    const note = [...box.querySelectorAll<HTMLElement>('[data-note]')].find(
      (el) => el.dataset.note === target,
    );
    const el =
      note?.querySelector<HTMLElement>('button:not([disabled])') ??
      (target === 'add'
        ? box.querySelector<HTMLElement>('[data-add-note]:not([disabled])')
        : null) ??
      box.querySelector<HTMLElement>('h3');
    el?.focus();
  });
  const closeForms = (focusOn: string) => {
    refocus.current = focusOn;
    setAdding(null);
    setEditing(null);
    setRemoving(null);
  };

  const q = filter.trim().toLowerCase();
  const shown = q
    ? notes.filter((n) => n.name.toLowerCase().includes(q) || n.text.toLowerCase().includes(q))
    : notes;

  const locked = disabled || busy;

  const save = async (changes: StateEdit[], note: string, focusOn: string) => {
    setBusy(true);
    setError(null);
    try {
      const v = await commands.editStoryDetails({
        storyId: view.story.id,
        routeId: view.route.id,
        expectedHeadId: view.route.headEventId ?? '',
        changes,
        note,
      });
      closeForms(focusOn);
      onChanged(v);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  /** Problems with a draft, or the changes that save it in place of `was`. */
  const changesFor = (d: Draft, was?: MemoryNote): string | StateEdit[] => {
    const name = d.name.trim().split(/\s+/).join(' ');
    const text = d.text.trim();
    if (!name) return t('Give the note a name: who or what it is about.');
    if (!text) return t('Write what the storyteller should remember.');
    const moved = !was || !sameNote(was, d.kind, name);
    if (moved && notes.some((n) => sameNote(n, d.kind, name))) {
      return t('{heading} already has a note called {name}. Change that one instead.', {
        heading: headingOf(d.kind),
        name,
      });
    }
    const ch = d.kind === 'event' ? Math.trunc(Number(d.chapter)) : NaN;
    const note: MemoryNote = { kind: d.kind, name, text };
    if (ch > 0) note.chapter = ch;
    const out: StateEdit[] = [];
    if (was && moved) out.push({ op: 'removeNote', kind: was.kind, name: was.name });
    out.push({ op: 'upsertNote', note });
    return out;
  };

  const submit = (d: Draft, was?: MemoryNote) => {
    const changes = changesFor(d, was);
    if (typeof changes === 'string') return setError(changes);
    const name = d.name.trim().split(/\s+/).join(' ');
    void save(changes, name, keyOf({ kind: d.kind, name }));
  };

  const startAdding = () => {
    setEditing(null);
    setRemoving(null);
    setError(null);
    setAdding({ kind: 'person', name: '', text: '', chapter: chapter ? String(chapter) : '' });
  };

  return (
    <section aria-labelledby="memory-notes" className="notebook" ref={root}>
      <h3 id="memory-notes" className="memory-heading" tabIndex={-1}>
        <NotebookPen aria-hidden={true} size={18} /> {t('Notebook')}
      </h3>
      <p className="muted small">
        {manual
          ? t(
              'The storyteller reads these notes before every reply. In this story only you write them; to let the storyteller add to them, turn on "Let the storyteller keep memory notes" in Story details.',
            )
          : t(
              'The storyteller reads these notes before every reply and adds to them as the story goes. Change, add or remove anything; it holds from the next reply on.',
            )}
      </p>
      {notes.length > FILTER_FROM && (
        <div className="field">
          <label htmlFor={filterId} className="visually-hidden">
            {t('Find a note')}
          </label>
          <input
            id={filterId}
            type="search"
            value={filter}
            placeholder={t('Find a note')}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notes.length === 0 && !adding && (
        <p className="muted">
          {manual
            ? t(
                'No notes yet. Add the things that must stay true: who is who, where they live, what they own.',
              )
            : t(
                'No notes yet. The storyteller adds them when something lasting happens: a new place, a gift, a promise. You can add your own too.',
              )}
        </p>
      )}
      {notes.length > 0 && shown.length === 0 && <p className="muted">{t('No notes match.')}</p>}
      {NOTE_KINDS.map(({ kind, heading }) => {
        const list = ordered(shown, kind);
        if (!list.length) return null;
        const Icon = NOTE_ICONS[kind];
        return (
          <div key={kind} className={`note-group kind-${kind}`}>
            <h4>
              <Icon className="note-group-icon" aria-hidden={true} size={16} />
              {t(heading)} <span className="muted small">({list.length})</span>
            </h4>
            <ul
              aria-label={t(heading)}
              className={kind === 'event' ? 'note-list timeline' : 'note-list'}
            >
              {list.map((n, i) => {
                const key = keyOf(n);
                // On the timeline, each chapter's first event carries its name.
                const marker =
                  kind === 'event' && n.chapter !== undefined && list[i - 1]?.chapter !== n.chapter;
                if (editing?.key === key) {
                  return (
                    <li key={key}>
                      <NoteForm
                        draft={editing.draft}
                        nameId={picked && 'editing' in picked ? REMEMBER_NAME_ID : undefined}
                        busy={locked}
                        onChange={(draft) => setEditing({ key, draft })}
                        onCancel={() => {
                          closeForms(key);
                          setError(null);
                        }}
                        onSave={() => submit(editing.draft, n)}
                        label={t('Change note: {name}', { name: n.name })}
                      />
                    </li>
                  );
                }
                const edit = () => {
                  if (locked) return;
                  setAdding(null);
                  setRemoving(null);
                  setError(null);
                  setEditing({
                    key,
                    draft: {
                      kind: n.kind,
                      name: n.name,
                      text: n.text,
                      chapter: n.chapter !== undefined ? String(n.chapter) : '',
                    },
                  });
                };
                return (
                  <li key={key} className="note" data-note={key}>
                    {marker && (
                      <span className="timeline-chapter">
                        {t('Chapter {n}', { n: n.chapter ?? 0 })}
                      </span>
                    )}
                    {kind !== 'event' && <NoteVisual note={n} view={view} />}
                    <div className="note-main">
                      <div className="note-head">
                        <strong>{n.name}</strong>
                        <span className="note-actions">
                          <button
                            type="button"
                            className="note-action"
                            disabled={locked}
                            aria-label={t('Change note: {name}', { name: n.name })}
                            title={t('Change')}
                            onClick={edit}
                          >
                            <Pencil aria-hidden={true} size={15} />
                          </button>
                          <button
                            type="button"
                            className="note-action danger-action"
                            disabled={locked}
                            aria-label={t('Remove note: {name}', { name: n.name })}
                            title={t('Remove')}
                            onClick={() => {
                              setEditing(null);
                              setError(null);
                              setRemoving(key);
                            }}
                          >
                            <Trash2 aria-hidden={true} size={15} />
                          </button>
                        </span>
                      </div>
                      {/* Clicking the words changes them too (the pencil is the way by keyboard). */}
                      <p
                        className={locked ? 'note-text' : 'note-text editable'}
                        onClick={edit}
                        title={locked ? undefined : t('Click to change')}
                      >
                        {n.text}
                      </p>
                      {removing === key && (
                        <div
                          className="note-confirm"
                          role="group"
                          aria-label={t('Remove note: {name}', { name: n.name })}
                        >
                          <span>
                            {t('Remove this note? The storyteller will no longer read it.')}
                          </span>
                          <button
                            type="button"
                            className="danger"
                            disabled={locked}
                            onClick={() =>
                              void save(
                                [{ op: 'removeNote', kind: n.kind, name: n.name }],
                                t('removed {name}', { name: n.name }),
                                'add',
                              )
                            }
                          >
                            {t('Remove')}
                          </button>
                          <button type="button" disabled={busy} onClick={() => closeForms(key)}>
                            {t('Keep')}
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {adding ? (
        <NoteForm
          draft={adding}
          busy={locked}
          onChange={setAdding}
          onCancel={() => {
            closeForms('add');
            setError(null);
          }}
          onSave={() => submit(adding)}
          label={t('New note')}
          chooseKind
          nameId={picked && 'adding' in picked ? REMEMBER_NAME_ID : undefined}
        />
      ) : (
        <div className="button-row">
          <button type="button" onClick={startAdding} disabled={locked} data-add-note>
            {t('Add a note')}
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * Beside a note: the person's portrait (or their initial in their colour),
 * a thing's picture, or the icon of the note's kind.
 */
function NoteVisual({ note, view }: { note: MemoryNote; view: RouteView }) {
  const portraitOf = useContext(PortraitsContext);
  const colorOf = useContext(NameColorsContext);
  if (note.kind === 'person') {
    const portrait = portraitOf(note.name);
    if (portrait) return <Thumb assetId={portrait} alt="" className="note-visual" />;
    return (
      <span
        className="note-visual note-initial"
        style={nameStyle(colorOf(note.name))}
        aria-hidden="true"
      >
        {[...note.name.trim()][0]?.toUpperCase()}
      </span>
    );
  }
  if (note.kind === 'item') {
    const key = itemKey(note.name);
    const held = view.state.state.tracking?.items?.some((i) => itemKey(i.name) === key);
    const asset = held ? picture(view, `item:${key}`).assetId : null;
    if (asset) return <Thumb assetId={asset} alt="" className="note-visual" />;
  }
  const Icon = NOTE_ICONS[note.kind];
  return (
    <span className="note-visual note-icon" aria-hidden="true">
      <Icon size={18} />
    </span>
  );
}

function NoteForm({
  draft,
  busy,
  onChange,
  onCancel,
  onSave,
  label,
  chooseKind,
  nameId,
}: {
  draft: Draft;
  busy: boolean;
  onChange: (d: Draft) => void;
  onCancel: () => void;
  onSave: () => void;
  label: string;
  /** A new note picks its kind; a kept one can move to another kind too. */
  chooseKind?: boolean;
  /** An id for the name box, so a window can put the focus there. */
  nameId?: string;
}) {
  const id = useId();
  const kind = NOTE_KINDS.find((k) => k.kind === draft.kind)!;
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  return (
    <form
      className="note-form"
      aria-label={label}
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <div className="field">
        <label htmlFor={`${id}-kind`}>{t('Kind')}</label>
        <select
          id={`${id}-kind`}
          value={draft.kind}
          aria-describedby={`${id}-kind-hint`}
          onChange={(e) => set({ kind: e.target.value as NoteKind })}
          autoFocus={chooseKind}
        >
          {NOTE_KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {t(k.one)}
            </option>
          ))}
        </select>
        <p id={`${id}-kind-hint`} className="muted small">
          {t(kind.hint)}
        </p>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor={nameId ?? `${id}-name`}>{t('Name')}</label>
          <input
            id={nameId ?? `${id}-name`}
            value={draft.name}
            maxLength={MAX_NAME}
            placeholder={draft.kind === 'event' ? t('What happened, in a few words') : undefined}
            onChange={(e) => set({ name: e.target.value })}
            autoFocus={!chooseKind}
          />
        </div>
        {draft.kind === 'event' && (
          <div className="field note-chapter">
            <label htmlFor={`${id}-chapter`}>{t('Chapter')}</label>
            <input
              id={`${id}-chapter`}
              type="number"
              min={1}
              inputMode="numeric"
              value={draft.chapter}
              onChange={(e) => set({ chapter: e.target.value })}
            />
          </div>
        )}
      </div>
      <div className="field">
        <label htmlFor={`${id}-text`}>{t('What to remember')}</label>
        <textarea
          id={`${id}-text`}
          value={draft.text}
          rows={3}
          maxLength={MAX_TEXT}
          onChange={(e) => set({ text: e.target.value })}
        />
      </div>
      <div className="button-row">
        <button type="submit" className="primary" disabled={busy}>
          {t('Save note')}
        </button>
        <button type="button" onClick={onCancel} disabled={busy}>
          {t('Cancel')}
        </button>
      </div>
    </form>
  );
}

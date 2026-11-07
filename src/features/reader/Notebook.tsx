/**
 * Story memory -> Notebook: the memory notes the storyteller keeps (and the
 * player can write), grouped like separate notebooks: people, places,
 * things, a timeline and other facts. Every change is saved as an edit at
 * the newest turn, so it holds from the next reply on and can be undone
 * like any other change.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { commands, errorMessage } from '../../api/commands';
import type { MemoryNote, NoteKind, RouteView, StateEdit } from '../../types';
import { t } from '../../i18n';
import { NOTE_KINDS, noteKey, sameNote } from './notes';

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

export function Notebook({
  view,
  disabled,
  onChanged,
}: {
  view: RouteView;
  /** True while a reply is being written. */
  disabled: boolean;
  onChanged: (v: RouteView) => void;
}) {
  const notes = view.state.state.notes ?? [];
  const manual = !!view.state.state.narration?.manualMemory;
  const chapter = view.state.activeChapter?.ordinal;
  const [filter, setFilter] = useState('');
  const [adding, setAdding] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<{ key: string; draft: Draft } | null>(null);
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
      <h3 id="memory-notes" tabIndex={-1}>
        {t('Notebook')}
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
        return (
          <div key={kind} className="note-group">
            <h4>
              {t(heading)} <span className="muted small">({list.length})</span>
            </h4>
            <ul aria-label={t(heading)} className="note-list">
              {list.map((n) => {
                const key = keyOf(n);
                if (editing?.key === key) {
                  return (
                    <li key={key}>
                      <NoteForm
                        draft={editing.draft}
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
                return (
                  <li key={key} className="note" data-note={key}>
                    <div className="note-head">
                      <strong>{n.name}</strong>
                      {kind === 'event' && n.chapter !== undefined && (
                        <span className="muted small">{t('Chapter {n}', { n: n.chapter })}</span>
                      )}
                      <span className="note-actions">
                        <button
                          type="button"
                          className="link-button"
                          disabled={locked}
                          aria-label={t('Change note: {name}', { name: n.name })}
                          onClick={() => {
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
                          }}
                        >
                          {t('Change')}
                        </button>
                        <button
                          type="button"
                          className="danger-link"
                          disabled={locked}
                          aria-label={t('Remove note: {name}', { name: n.name })}
                          onClick={() => {
                            setEditing(null);
                            setError(null);
                            setRemoving(key);
                          }}
                        >
                          {t('Remove')}
                        </button>
                      </span>
                    </div>
                    <p className="note-text">{n.text}</p>
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

function NoteForm({
  draft,
  busy,
  onChange,
  onCancel,
  onSave,
  label,
  chooseKind,
}: {
  draft: Draft;
  busy: boolean;
  onChange: (d: Draft) => void;
  onCancel: () => void;
  onSave: () => void;
  label: string;
  /** A new note picks its kind; a kept one can move to another kind too. */
  chooseKind?: boolean;
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
          <label htmlFor={`${id}-name`}>{t('Name')}</label>
          <input
            id={`${id}-name`}
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

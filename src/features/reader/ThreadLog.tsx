/**
 * Story memory -> Threads: the promises, mysteries, goals and plans the story
 * has not settled, as a short quest log. The storyteller adds and settles
 * them as it writes (unless the player keeps the notes); the player can tick
 * them off, reword, remove, add and reopen them. Each change is saved as an
 * edit at the newest turn, like the notebook's.
 */
import { useId, useRef, useState } from 'react';
import { CircleCheck, ListTodo, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { commands, errorMessage } from '../../api/commands';
import type { RouteView, StateEdit } from '../../types';
import { t } from '../../i18n';
import { threadKey } from './notes';

/** As `MAX_THREAD_TEXT` and `MAX_OPEN` in Rust. */
const MAX_TEXT = 200;
const MAX_OPEN = 40;
const MAX_DONE = 40;

const oneLine = (s: string) => s.split(/\s+/).join(' ').trim().slice(0, MAX_TEXT);
const without = (list: string[], text: string) =>
  list.filter((x) => threadKey(x) !== threadKey(text));

export function ThreadLog({
  view,
  disabled,
  onChanged,
}: {
  view: RouteView;
  /** True while a reply is being written. */
  disabled: boolean;
  onChanged: (v: RouteView) => void;
}) {
  const s = view.state.state;
  const open = s.openThreads.filter((x) => x.trim());
  const done = (s.doneThreads ?? []).filter((x) => x.trim());
  const manual = !!s.narration?.manualMemory;
  const [adding, setAdding] = useState('');
  const [editing, setEditing] = useState<{ was: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const section = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const locked = disabled || busy;

  const save = async (next: { open?: string[]; done?: string[] }, note: string) => {
    const changes: StateEdit[] = [];
    if (next.open) changes.push({ op: 'setOpenThreads', openThreads: next.open });
    if (next.done) changes.push({ op: 'setDoneThreads', doneThreads: next.done.slice(-MAX_DONE) });
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
      setEditing(null);
      onChanged(v);
      // A ticked or removed thread takes its buttons with it: keep the
      // focus in the list, so keys (Escape too) still reach the panel.
      requestAnimationFrame(() => {
        if (!section.current?.contains(document.activeElement)) heading.current?.focus();
      });
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const settle = (text: string) =>
    save({ open: without(open, text), done: [...without(done, text), text] }, text);
  const reopen = (text: string) =>
    save({ open: [...without(open, text), text], done: without(done, text) }, text);
  const add = async () => {
    const text = oneLine(adding);
    if (!text) return;
    if (open.some((x) => threadKey(x) === threadKey(text))) {
      setError(t('That thread is already open.'));
      return;
    }
    if (await save({ open: [...open, text], done: without(done, text) }, text)) setAdding('');
  };
  const rename = async () => {
    if (!editing) return;
    const text = oneLine(editing.text);
    if (!text) return;
    if (threadKey(text) === threadKey(editing.was) && text === editing.was) {
      setEditing(null);
      return;
    }
    await save({ open: open.map((x) => (x === editing.was ? text : x)) }, text);
  };

  return (
    <section ref={section} aria-labelledby={`${id}-title`} className="thread-log">
      <h3 id={`${id}-title`} ref={heading} tabIndex={-1}>
        <ListTodo aria-hidden={true} size={18} /> {t('Threads to follow')}
      </h3>
      <p className="muted small">
        {manual
          ? t('Promises, mysteries and goals the story has not settled yet. You keep this list.')
          : t(
              'Promises, mysteries and goals the story has not settled yet. The storyteller adds and ticks them off as the story goes; you can too.',
            )}
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {open.length === 0 ? (
        <p className="muted">{t('Nothing open right now.')}</p>
      ) : (
        <ul className="thread-list" aria-label={t('Open threads')}>
          {open.map((x) =>
            editing?.was === x ? (
              <li key={x} className="thread editing">
                <label htmlFor={`${id}-edit`} className="visually-hidden">
                  {t('Thread')}
                </label>
                <input
                  id={`${id}-edit`}
                  value={editing.text}
                  maxLength={MAX_TEXT}
                  autoFocus
                  disabled={locked}
                  onChange={(e) => setEditing({ was: x, text: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void rename();
                    } else if (e.key === 'Escape') {
                      e.stopPropagation();
                      setEditing(null);
                    }
                  }}
                />
                <button type="button" disabled={locked || !oneLine(editing.text)} onClick={rename}>
                  {t('Save')}
                </button>
                <button type="button" onClick={() => setEditing(null)}>
                  {t('Cancel')}
                </button>
              </li>
            ) : (
              <li key={x} className="thread">
                <button
                  type="button"
                  className="thread-tick"
                  disabled={locked}
                  aria-label={t('Settle: {thread}', { thread: x })}
                  title={t('Mark as settled')}
                  onClick={() => void settle(x)}
                >
                  <span aria-hidden={true} className="thread-box" />
                </button>
                <span className="thread-text">{x}</span>
                <button
                  type="button"
                  className="note-action"
                  disabled={locked}
                  aria-label={t('Change {thread}', { thread: x })}
                  onClick={() => setEditing({ was: x, text: x })}
                >
                  <Pencil aria-hidden={true} size={15} />
                </button>
                <button
                  type="button"
                  className="note-action danger-action"
                  disabled={locked}
                  aria-label={t('Remove {thread}', { thread: x })}
                  onClick={() => void save({ open: without(open, x) }, x)}
                >
                  <Trash2 aria-hidden={true} size={15} />
                </button>
              </li>
            ),
          )}
        </ul>
      )}
      {open.length < MAX_OPEN && (
        <div className="thread-add">
          <label htmlFor={`${id}-add`} className="visually-hidden">
            {t('New thread')}
          </label>
          <input
            id={`${id}-add`}
            value={adding}
            maxLength={MAX_TEXT}
            disabled={locked}
            placeholder={t('A promise, a mystery, a goal…')}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void add();
              }
            }}
          />
          <button type="button" disabled={locked || !oneLine(adding)} onClick={add}>
            {t('Add a thread')}
          </button>
        </div>
      )}
      {done.length > 0 && (
        <details className="thread-done">
          <summary>{t('Settled ({n})', { n: done.length })}</summary>
          <ul className="thread-list" aria-label={t('Settled threads')}>
            {[...done].reverse().map((x) => (
              <li key={x} className="thread done">
                <CircleCheck aria-hidden={true} size={16} className="thread-done-icon" />
                <span className="thread-text">{x}</span>
                <button
                  type="button"
                  className="note-action"
                  disabled={locked}
                  aria-label={t('Reopen {thread}', { thread: x })}
                  title={t('Reopen')}
                  onClick={() => void reopen(x)}
                >
                  <RotateCcw aria-hidden={true} size={15} />
                </button>
                <button
                  type="button"
                  className="note-action danger-action"
                  disabled={locked}
                  aria-label={t('Remove {thread}', { thread: x })}
                  onClick={() => void save({ done: without(done, x) }, x)}
                >
                  <Trash2 aria-hidden={true} size={15} />
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

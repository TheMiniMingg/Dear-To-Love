import { useEffect, useRef, useState } from 'react';
import { CommandError, commands, errorMessage } from '../../api/commands';
import type { ChapterRecapDraft, RouteView } from '../../types';
import { intlLocale, joinSentences, t, tKnown } from '../../i18n';
import { TidyReview, tidyEdits, type TidyDraft } from './TidyReview';

/** Longest recap the app keeps (matches the backend limit). */
const MAX_RECAP = 6000;

type Props = {
  view: RouteView;
  onCancel: () => void;
  /** The chapter ended; `saveLabel` names the save made for it. */
  onEnded: (view: RouteView, saveLabel: string) => void;
};

type Draft =
  | { status: 'writing' }
  | { status: 'ready'; draft: ChapterRecapDraft }
  /** The recap could not be written; the player can write their own. */
  | { status: 'failed'; message: string }
  /** This chapter cannot end yet (no finished turn). */
  | { status: 'blocked'; message: string }
  | { status: 'manual' };

/**
 * End chapter: the storyteller writes a recap of the chapter, the player
 * reads and edits it, then the chapter is saved and the next one starts
 * carrying the recap, so later chapters remember what happened.
 */
export function EndChapterPanel({ view, onCancel, onEnded }: Props) {
  const chapter = view.state.activeChapter;
  const ordinal = chapter?.ordinal ?? 1;
  const title = chapter?.title ?? t('Chapter {n}', { n: ordinal });
  const [draft, setDraft] = useState<Draft>({ status: 'writing' });
  const [attempt, setAttempt] = useState(0);
  const [recap, setRecap] = useState('');
  const [nextTitle, setNextTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tidy, setTidy] = useState<TidyDraft>({ status: 'working' });
  /** The changes the player undid. */
  const [undone, setUndone] = useState<ReadonlySet<number>>(new Set());
  /** The route head after the kept changes were saved, so a retry saves them once. */
  const tidiedHead = useRef<string | null>(null);
  /** The player chose to write the recap; a late draft is ignored. */
  const manual = useRef(false);
  const recapBox = useRef<HTMLTextAreaElement>(null);
  const keepPlaying = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    commands
      .draftChapterRecap(view.route.id)
      .then((d) => {
        if (cancelled || manual.current) return;
        setDraft({ status: 'ready', draft: d });
        setRecap((cur) => cur || d.recap);
        setNextTitle((cur) => cur || d.nextTitle);
      })
      .catch((e: unknown) => {
        if (cancelled || manual.current) return;
        const message = errorMessage(e);
        const blocked = e instanceof CommandError && e.code === 'INVALID_INPUT';
        setDraft({ status: blocked ? 'blocked' : 'failed', message });
      });
    return () => {
      cancelled = true;
    };
  }, [view.route.id, attempt]);

  useEffect(() => {
    let cancelled = false;
    commands
      .draftNotebookTidy(view.route.id)
      .then((d) => {
        if (!cancelled) setTidy({ status: 'ready', tidy: d });
      })
      .catch((e: unknown) => {
        if (!cancelled) setTidy({ status: 'failed', message: errorMessage(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [view.route.id]);

  // The waiting message is replaced; keep focus inside the dialog.
  const editing = draft.status !== 'writing' && draft.status !== 'blocked';
  useEffect(() => {
    if (editing) recapBox.current?.focus();
    else if (draft.status === 'blocked') keepPlaying.current?.focus();
  }, [editing, draft.status]);

  if (draft.status === 'blocked') {
    return (
      <div className="panel">
        <p role="alert" className="error">
          {joinSentences([t("Chapter {n} can't end yet.", { n: ordinal }), draft.message])}
        </p>
        <div className="button-row">
          <button ref={keepPlaying} type="button" onClick={onCancel}>
            {t('Keep playing')}
          </button>
        </div>
      </div>
    );
  }

  if (draft.status === 'writing') {
    return (
      <div className="panel">
        <p role="status" aria-live="polite">
          {t('{name} is writing a recap of Chapter {n}: {title}…', {
            name: tKnown(view.storyteller.label),
            n: ordinal,
            title,
          })}
        </p>
        <div className="button-row">
          <button id="end-chapter-first" type="button" onClick={onCancel}>
            {t('Keep playing')}
          </button>
          <button
            type="button"
            onClick={() => {
              manual.current = true;
              setDraft({ status: 'manual' });
            }}
          >
            {t('Write it myself')}
          </button>
        </div>
      </div>
    );
  }

  const nextOrdinal = draft.status === 'ready' ? draft.draft.nextOrdinal : ordinal + 1;
  // Only while the box still holds what the storyteller suggested.
  const suggestedTitle =
    draft.status === 'ready' &&
    draft.draft.nextTitleSuggested &&
    nextTitle.trim() === draft.draft.nextTitle.trim();
  const tooLong = recap.length > MAX_RECAP;

  const end = async () => {
    setSaving(true);
    setError(null);
    try {
      // The kept notebook changes are saved in this chapter, just before it ends.
      const edits =
        tidy.status === 'ready' && !tidiedHead.current
          ? tidyEdits(tidy.tidy.changes, (i) => !undone.has(i))
          : [];
      if (edits.length) {
        const tidied = await commands.editStoryDetails({
          storyId: view.story.id,
          routeId: view.route.id,
          expectedHeadId: view.route.headEventId ?? '',
          changes: edits,
          note: t('tidied the notebook'),
        });
        tidiedHead.current = tidied.route.headEventId ?? null;
      }
      const v = await commands.endChapter({
        storyId: view.story.id,
        routeId: view.route.id,
        expectedHeadId: tidiedHead.current ?? view.route.headEventId ?? '',
        recap,
        nextTitle: nextTitle.trim() || null,
      });
      onEnded(v, t('End of Chapter {n}: {title}', { n: ordinal, title }));
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  };

  return (
    <form
      className="form end-chapter"
      onSubmit={(e) => {
        e.preventDefault();
        if (!saving && !tooLong) void end();
      }}
    >
      {draft.status === 'failed' && (
        <div role="alert" className="error">
          <p>{joinSentences([t("The recap couldn't be written."), draft.message])}</p>
          <p>{t('Write your own below, or try again.')}</p>
        </div>
      )}
      <p className="muted small">
        {t(
          'The recap takes the place of this chapter’s turns in what the storyteller reads, so a long story keeps its shape and costs less per reply. Keep the names, promises and secrets that matter.',
        )}
      </p>
      <div className="field">
        <label htmlFor="end-chapter-recap">
          {t('What happened in Chapter {n}: {title}', { n: ordinal, title })}
        </label>
        <p className="muted small" id="end-chapter-recap-hint">
          {joinSentences([
            ...(draft.status === 'ready'
              ? [t('Written by {name}.', { name: tKnown(draft.draft.writtenBy) })]
              : []),
            t(
              'Change anything you like. The storyteller reads this recap in every later chapter on this route. Leave it empty to end the chapter without one.',
            ),
          ])}
        </p>
        <textarea
          id="end-chapter-recap"
          ref={recapBox}
          value={recap}
          rows={8}
          aria-describedby="end-chapter-recap-hint"
          aria-invalid={tooLong}
          onChange={(e) => setRecap(e.target.value)}
        />
        {tooLong && (
          <p className="error small">
            {t('The recap can be at most {max} characters (now {now}).', {
              max: MAX_RECAP.toLocaleString(intlLocale()),
              now: recap.length.toLocaleString(intlLocale()),
            })}
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor="end-chapter-next-title">{t('Chapter {n} title', { n: nextOrdinal })}</label>
        <input
          id="end-chapter-next-title"
          value={nextTitle}
          maxLength={120}
          placeholder={t('Chapter {n}', { n: nextOrdinal })}
          aria-describedby={suggestedTitle ? 'end-chapter-next-title-hint' : undefined}
          onChange={(e) => setNextTitle(e.target.value)}
        />
        {suggestedTitle && (
          <p id="end-chapter-next-title-hint" className="muted small">
            {t('The storyteller suggests this from how the chapter ended. Change it if you like.')}
          </p>
        )}
      </div>
      <TidyReview
        draft={tidy}
        storyteller={view.storyteller.label}
        undone={undone}
        onChoose={(i, keep) =>
          setUndone((cur) => {
            const next = new Set(cur);
            if (keep) next.delete(i);
            else next.add(i);
            return next;
          })
        }
      />
      <p className="muted small">
        {t('Ending the chapter saves your place as “{save}” in Save / Load.', {
          save: t('End of Chapter {n}: {title}', { n: ordinal, title }),
        })}
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="button-row">
        <button type="button" onClick={onCancel}>
          {t('Keep playing')}
        </button>
        {draft.status !== 'ready' && (
          <button
            type="button"
            onClick={() => {
              manual.current = false;
              setDraft({ status: 'writing' });
              setAttempt((n) => n + 1);
            }}
          >
            {draft.status === 'failed' ? t('Try again') : t('Write a recap for me')}
          </button>
        )}
        <button type="submit" className="primary" disabled={saving || tooLong}>
          {saving ? t('Saving…') : t('Save and start Chapter {n}', { n: nextOrdinal })}
        </button>
      </div>
    </form>
  );
}

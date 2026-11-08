/**
 * End chapter: the notebook's suggested tidy-up (`services::tidy` in Rust),
 * each change kept or undone by the player before the chapter ends.
 */
import type { NotebookTidy, StateEdit, TidyChange } from '../../types';
import { joinSentences, t, tKnown } from '../../i18n';

export type TidyDraft =
  | { status: 'working' }
  | { status: 'ready'; tidy: NotebookTidy }
  | { status: 'failed'; message: string };

/**
 * The edits that make the kept changes: every replaced note is removed
 * first, then the new notes are written, so a merge never trips over the
 * note it replaces.
 */
export function tidyEdits(changes: TidyChange[], kept: (i: number) => boolean): StateEdit[] {
  const chosen = changes.filter((_, i) => kept(i));
  return [
    ...chosen.flatMap((c) =>
      c.replaces.map((n): StateEdit => ({ op: 'removeNote', kind: n.kind, name: n.name })),
    ),
    ...chosen.map((c): StateEdit => ({ op: 'upsertNote', note: c.note })),
  ];
}

function changeTitle(c: TidyChange): string {
  return c.replaces.length > 1
    ? t('Merge {count} notes into “{name}”', { count: c.replaces.length, name: c.note.name })
    : t('Shorten “{name}”', { name: c.note.name });
}

/** The suggested changes with Keep or Undo on each. */
export function TidyReview({
  draft,
  storyteller,
  undone,
  onChoose,
}: {
  draft: TidyDraft;
  storyteller: string;
  undone: ReadonlySet<number>;
  onChoose: (index: number, keep: boolean) => void;
}) {
  if (draft.status === 'working') {
    return (
      <p className="muted small" role="status">
        {t('{name} is tidying the notebook…', { name: tKnown(storyteller) })}
      </p>
    );
  }
  if (draft.status === 'failed') {
    return (
      <p className="muted small">
        {joinSentences([
          t("The notebook couldn't be tidied, so it stays as it is."),
          draft.message,
        ])}
      </p>
    );
  }
  const { changes, writtenBy } = draft.tidy;
  if (!changes.length) return null;
  return (
    <fieldset className="field tidy-review">
      <legend>{t('Tidy the notebook')}</legend>
      <p className="muted small">
        {joinSentences([
          t(
            '{name} suggests merging and shortening these memory notes, so the storyteller reads less before every reply.',
            { name: tKnown(writtenBy) },
          ),
          t('Keep the changes you like. Undo leaves a note as it is.'),
        ])}
      </p>
      <ul className="tidy-list">
        {changes.map((c, i) => {
          const title = changeTitle(c);
          const keep = !undone.has(i);
          return (
            <li key={i} className={keep ? 'tidy-change' : 'tidy-change undone'}>
              <div className="tidy-head">
                <span className="tidy-title">{title}</span>
                <div className="segmented" role="radiogroup" aria-label={title}>
                  <label>
                    <input
                      type="radio"
                      name={`tidy-${i}`}
                      checked={keep}
                      onChange={() => onChoose(i, true)}
                    />
                    <span>{t('Keep')}</span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name={`tidy-${i}`}
                      checked={!keep}
                      onChange={() => onChoose(i, false)}
                    />
                    <span>{t('Undo')}</span>
                  </label>
                </div>
              </div>
              <p className="tidy-text">{keep ? c.note.text : t('Left as it is.')}</p>
              <details className="tidy-before">
                <summary>
                  {c.replaces.length > 1
                    ? t('The {count} notes now', { count: c.replaces.length })
                    : t('The note now')}
                </summary>
                <ul>
                  {c.replaces.map((n) => (
                    <li key={`${n.kind}:${n.name}`}>
                      <strong>{n.name}</strong> {n.text}
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

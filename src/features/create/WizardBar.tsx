import { useId } from 'react';
import {
  BookOpen,
  Check,
  ClipboardCheck,
  Feather,
  Globe,
  ImageIcon,
  Sparkles,
  User,
  type LucideIcon,
} from 'lucide-react';
import type { CreateStoryDraft, DraftStep, FillField } from '../../types';
import { joinList, msg, t } from '../../i18n';
import { withStoryType } from './ContentFields';
import { COVER_SLOT, portraitOf } from './PicturesStep';
import { PLAYER, STEP_NAMES } from './WizardSteps';
import { StoryCover } from './StoryCover';

const STEP_ICONS: Record<DraftStep, LucideIcon> = {
  world: Globe,
  character: User,
  story: BookOpen,
  narration: Feather,
  pictures: ImageIcon,
  review: ClipboardCheck,
};

/**
 * The wizard's steps as a bar: each step's icon and name, joined by a
 * line, with the steps before the current one ticked. Any step can be
 * opened at any time.
 */
export function StepBar({
  steps,
  step,
  onGoTo,
  disabled,
}: {
  steps: DraftStep[];
  step: DraftStep;
  onGoTo: (s: DraftStep) => void;
  disabled?: boolean;
}) {
  const at = steps.indexOf(step);
  return (
    <nav aria-label={t('Steps')} className="step-bar-wrap">
      <ol className="step-bar">
        {steps.map((s, i) => {
          const Icon = i < at ? Check : STEP_ICONS[s];
          const state = i < at ? 'done' : i === at ? 'current' : 'next';
          return (
            <li key={s} data-state={state}>
              <button
                type="button"
                aria-current={s === step ? 'step' : undefined}
                aria-label={`${i + 1}. ${t(STEP_NAMES[s])}`}
                disabled={disabled}
                onClick={() => onGoTo(s)}
              >
                <span className="step-dot" aria-hidden="true">
                  <Icon size={16} strokeWidth={2} />
                </span>
                <span className="step-name">{t(STEP_NAMES[s])}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="step-count muted small" aria-hidden="true">
        {t('Step {n} of {total}', { n: at + 1, total: steps.length })}
      </p>
    </nav>
  );
}

/** The label each filled field is listed by, as the wizard names it. */
export const FILL_LABELS: Record<FillField, string> = {
  setting: msg('Setting'),
  era: msg('Era'),
  worldDescription: msg('About this world'),
  worldRules: msg('Rules the storyteller follows'),
  name: msg('Name'),
  pronouns: msg('Pronouns'),
  age: msg('Age'),
  role: msg('Role'),
  appearance: msg('Appearance'),
  personality: msg('Personality'),
  goals: msg('Goals'),
  about: msg('About you'),
  title: msg('Title'),
  startingLocation: msg('Starting location'),
  openingScene: msg('Opening scene'),
  premise: msg('What the story is about'),
  firstChapterTitle: msg('First chapter title'),
  threads: msg('Threads to follow'),
  cast: msg('Others in the story'),
  tone: msg('Tone'),
};

/** Who filled the fields in when no connection was used (the core's `OFFLINE_FILL_BY`). */
export const OFFLINE_FILL_BY = 'the offline storyteller';

/** What the last Fill in the rest did, for the line under its button. */
export type FillNote =
  | { kind: 'filled'; fields: FillField[]; by: string; offline: boolean }
  | { kind: 'nothing-empty' }
  | { kind: 'no-preset' }
  | { kind: 'error'; message: string; offline: boolean };

/**
 * "Fill in the rest": the storyteller fills this step's empty fields (on
 * Review, every step's) to fit what was written. Says what it filled, with
 * Undo, or why it couldn't.
 */
export function FillRest({
  step,
  busy,
  note,
  onFill,
  onUndo,
  onCancel,
}: {
  step: DraftStep;
  busy: boolean;
  note: FillNote | null;
  onFill: (offline: boolean) => void;
  onUndo: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  const all = step === 'review';
  return (
    <div className="fill-rest" role="group" aria-labelledby={`${id}-button`}>
      <div className="fill-rest-row">
        <button
          type="button"
          id={`${id}-button`}
          className="fill-rest-button"
          disabled={busy}
          aria-describedby={`${id}-hint`}
          onClick={() => onFill(false)}
        >
          <Sparkles className="btn-icon" aria-hidden={true} />
          {busy ? t('Filling in…') : all ? t('Fill in everything left') : t('Fill in the rest')}
        </button>
        {busy && (
          <button type="button" className="link-button" onClick={onCancel}>
            {t('Cancel')}
          </button>
        )}
        <p id={`${id}-hint`} className="muted small">
          {all
            ? t(
                'The storyteller fills every empty field to fit what you wrote. You can change anything afterwards.',
              )
            : t(
                'The storyteller fills the empty fields on this step to fit what you wrote. You can change anything afterwards.',
              )}
        </p>
      </div>
      <div role="status" className="fill-rest-note small">
        {note?.kind === 'filled' && (
          <p className="note-ok">
            {note.offline
              ? t('Filled in from a preset story: {fields}.', {
                  fields: joinList(note.fields.map((f) => t(FILL_LABELS[f]))),
                })
              : t('{who} filled in {fields}.', {
                  who: note.by,
                  fields: joinList(note.fields.map((f) => t(FILL_LABELS[f]))),
                })}{' '}
            <button type="button" className="link-button" onClick={onUndo}>
              {t('Undo')}
            </button>
          </p>
        )}
        {note?.kind === 'nothing-empty' && (
          <p className="muted">
            {all
              ? t('Every field is filled in already.')
              : t('Every field on this step is filled in already.')}
          </p>
        )}
        {note?.kind === 'no-preset' && (
          <p className="note-warn">
            {t(
              'The offline storyteller only knows the preset stories, and none of them fits what you wrote. Add an AI connection in Settings for ideas that follow your own words, or fill the fields in yourself.',
            )}
          </p>
        )}
        {note?.kind === 'error' && (
          <p className="error">
            {note.message}{' '}
            {!note.offline && (
              <button type="button" className="link-button" onClick={() => onFill(true)}>
                {t('Fill in from the preset stories instead')}
              </button>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

/** Custom Story's live preview: the draft as a cover and first page. */
export function DraftCover({ draft }: { draft: CreateStoryDraft }) {
  const picture = (slot: string) => draft.pictures?.find((p) => p.slot === slot)?.assetId;
  const where = [draft.world.setting.trim(), draft.world.era.trim()].filter(Boolean).join(' · ');
  const toYou = (id: string) =>
    draft.relationships.find(
      (r) => (r.fromId === id && r.toId === PLAYER) || (r.fromId === PLAYER && r.toId === id),
    )?.label;
  return (
    <StoryCover
      label={t('Preview of your story')}
      title={draft.title}
      genres={withStoryType(draft.narration.genres, draft.storyType ?? '')}
      premise={draft.description}
      coverId={picture(COVER_SLOT)}
      cast={[
        {
          id: PLAYER,
          name: draft.player.name,
          you: true,
          portraitId: picture(portraitOf(PLAYER)),
        },
        ...draft.npcs.map((c) => ({
          id: c.id,
          name: c.name,
          role: c.role || toYou(c.id),
          color: c.color,
          portraitId: picture(portraitOf(c.id)),
        })),
      ]}
      chapterTitle={draft.firstChapterTitle}
      opening={draft.scene.summary}
    >
      {(where || draft.narration.tone.trim()) && (
        <dl className="cover-facts">
          {where && (
            <>
              <dt>{t('Setting')}</dt>
              <dd>{where}</dd>
            </>
          )}
          {draft.narration.tone.trim() && (
            <>
              <dt>{t('Tone')}</dt>
              <dd>{draft.narration.tone.trim()}</dd>
            </>
          )}
        </dl>
      )}
      {!draft.title.trim() && !draft.scene.summary.trim() && (
        <p className="muted small cover-empty">
          {t('Your story takes shape here as you fill it in.')}
        </p>
      )}
    </StoryCover>
  );
}

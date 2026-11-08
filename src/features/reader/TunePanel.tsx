import { useState } from 'react';
import { commands, errorMessage } from '../../api/commands';
import { ArrowPicker } from '../../components/ArrowPicker';
import type { Narration, RouteView } from '../../types';
import { DETAILS, PACINGS, PERSPECTIVES, SURPRISES } from '../create/StyleFields';
import { diffState, summarize } from './stateDiff';
import { t, tOptions } from '../../i18n';

/**
 * Tune: the four settings people most often want to change while a story is
 * under way (how much detail, how fast, how many twists, whose eyes), applied
 * from the next reply on. The full set is in Story details → Narration.
 */
export function TunePanel({
  view,
  onApplied,
  onCancel,
  onMore,
}: {
  view: RouteView;
  onApplied: (v: RouteView) => void;
  onCancel: () => void;
  /** Open Story details → Narration for everything else. */
  onMore: () => void;
}) {
  const original = view.state.state;
  const [narration, setNarration] = useState<Narration>(() => ({ ...original.narration }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Narration>) => setNarration((n) => ({ ...n, ...patch }));
  const { changes, lines } = diffState(original, { ...original, narration });
  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      onApplied(
        await commands.editStoryDetails({
          storyId: view.story.id,
          routeId: view.route.id,
          expectedHeadId: view.route.headEventId ?? '',
          changes,
          note: summarize(lines),
        }),
      );
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  return (
    <div className="panel form tune-panel">
      <p className="muted small">
        {t(
          'How the story is told from the next reply on. Earlier replies stay as they are; other routes are not changed.',
        )}
      </p>
      <ArrowPicker
        label={t('Detail')}
        options={tOptions(DETAILS)}
        value={narration.detail}
        onChange={(detail) => set({ detail })}
      />
      <ArrowPicker
        label={t('Pacing')}
        options={tOptions(PACINGS)}
        value={narration.pacing}
        onChange={(pacing) => set({ pacing })}
      />
      <ArrowPicker
        label={t('Twists')}
        options={tOptions(SURPRISES)}
        value={narration.surprises ?? 'sometimes'}
        onChange={(surprises) => set({ surprises })}
      />
      <ArrowPicker
        label={t('Point of view')}
        options={tOptions(PERSPECTIVES)}
        value={narration.perspective}
        onChange={(perspective) => set({ perspective })}
      />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="button-row">
        <button type="button" onClick={onMore}>
          {t('More in Story details…')}
        </button>
        <button type="button" onClick={onCancel}>
          {t('Cancel')}
        </button>
        <button
          type="button"
          className="primary"
          disabled={busy || changes.length === 0}
          onClick={() => void apply()}
        >
          {t('Apply from now')}
        </button>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { commands, errorMessage } from '../../api/commands';
import type { SaveDto } from '../../types';
import { formatWhen, msg, t } from '../../i18n';
import { routeName, saveName } from '../../i18n/names';

type Props = {
  storyId: string;
  routeId: string;
  onView: (saveId: string) => void;
  onResume: (saveId: string) => void;
  onSaved: (save: SaveDto) => void;
  /** A name to start from, such as where and when the story is. */
  suggestedName?: string;
};

const TYPE_LABEL: Record<string, string> = {
  manual: msg('Save'),
  quick: msg('Quick save'),
  auto: msg('Autosave'),
};

export function SavesPanel({
  storyId,
  routeId,
  onView,
  onResume,
  onSaved,
  suggestedName = '',
}: Props) {
  const [saves, setSaves] = useState<SaveDto[] | null>(null);
  const [label, setLabel] = useState(suggestedName);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    commands
      .listSaves(storyId)
      .then((s) => !cancelled && setSaves(s))
      .catch((e: unknown) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [storyId, reload]);

  const save = async () => {
    try {
      const s = await commands.createSave({ storyId, routeId, label: label.trim() || t('Save') });
      setLabel(suggestedName);
      onSaved(s);
      setReload((n) => n + 1);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const remove = async (s: SaveDto) => {
    try {
      await commands.deleteSave(storyId, s.id);
      setReload((n) => n + 1);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className="panel">
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label htmlFor="save-label">{t('Save name')}</label>
        <input
          id="save-label"
          value={label}
          maxLength={120}
          placeholder={t('e.g. Before the dance')}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setLabel(e.target.value)}
        />
        <button type="submit" className="primary">
          {t('Save here')}
        </button>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <ul className="item-list" aria-label={t('Saves')}>
        {saves?.length === 0 && <li className="muted">{t('No saves yet.')}</li>}
        {saves?.map((s) => (
          <li key={s.id} className="item-row">
            <div>
              <strong>{saveName(s.label)}</strong>
              <div className="muted small">
                {t(TYPE_LABEL[s.saveType] ?? s.saveType)} · {routeName(s.routeLabel)} ·{' '}
                {formatWhen(s.updatedAt)}
                {s.isRouteHead ? ` · ${t('latest on its route')}` : ''}
              </div>
            </div>
            <div className="button-row">
              <button type="button" onClick={() => onView(s.id)}>
                {t('View')}
              </button>
              <button type="button" onClick={() => onResume(s.id)}>
                {s.isRouteHead ? t('Continue') : t('Continue as new branch')}
              </button>
              {s.saveType !== 'auto' && (
                <button
                  type="button"
                  className="danger-link"
                  aria-label={t('Delete save {name}', { name: s.label })}
                  onClick={() => void remove(s)}
                >
                  {t('Delete')}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

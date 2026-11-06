import { useEffect, useState } from 'react';
import { commands, errorMessage } from '../../api/commands';
import type { SaveDto } from '../../types';

type Props = {
  storyId: string;
  routeId: string;
  onView: (saveId: string) => void;
  onResume: (saveId: string) => void;
  onSaved: (save: SaveDto) => void;
};

const TYPE_LABEL: Record<string, string> = {
  manual: 'Save',
  quick: 'Quick save',
  auto: 'Autosave',
};

export function SavesPanel({ storyId, routeId, onView, onResume, onSaved }: Props) {
  const [saves, setSaves] = useState<SaveDto[] | null>(null);
  const [label, setLabel] = useState('');
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
      const s = await commands.createSave({ storyId, routeId, label: label.trim() || 'Save' });
      setLabel('');
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
        <label htmlFor="save-label">Save name</label>
        <input
          id="save-label"
          value={label}
          maxLength={120}
          placeholder="e.g. Before the dance"
          onChange={(e) => setLabel(e.target.value)}
        />
        <button type="submit" className="primary">
          Save here
        </button>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <ul className="item-list" aria-label="Saves">
        {saves?.length === 0 && <li className="muted">No saves yet.</li>}
        {saves?.map((s) => (
          <li key={s.id} className="item-row">
            <div>
              <strong>{s.label}</strong>
              <div className="muted small">
                {TYPE_LABEL[s.saveType] ?? s.saveType} · {s.routeLabel} ·{' '}
                {new Date(s.updatedAt).toLocaleString()}
                {s.isRouteHead ? ' · latest on its route' : ''}
              </div>
            </div>
            <div className="button-row">
              <button type="button" onClick={() => onView(s.id)}>
                View
              </button>
              <button type="button" onClick={() => onResume(s.id)}>
                {s.isRouteHead ? 'Continue' : 'Continue as new branch'}
              </button>
              {s.saveType !== 'auto' && (
                <button
                  type="button"
                  className="danger-link"
                  aria-label={`Delete save ${s.label}`}
                  onClick={() => void remove(s)}
                >
                  Delete
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

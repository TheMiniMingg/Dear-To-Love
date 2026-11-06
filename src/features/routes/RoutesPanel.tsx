import { useState } from 'react';
import { commands, errorMessage } from '../../api/commands';
import type { RouteDto } from '../../types';

type Props = {
  storyId: string;
  currentRouteId: string;
  routes: RouteDto[];
  onSwitch: (routeId: string) => void;
  onChanged: () => void;
};

export function RoutesPanel({ storyId, currentRouteId, routes, onSwitch, onChanged }: Props) {
  const [showHidden, setShowHidden] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const visible = routes.filter((r) => showHidden || !r.hidden || r.id === currentRouteId);
  const hiddenCount = routes.filter((r) => r.hidden).length;

  const act = async (f: () => Promise<unknown>) => {
    try {
      await f();
      setError(null);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className="panel">
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <ul className="item-list" aria-label="Routes">
        {visible.map((r) => (
          <li key={r.id} className="item-row">
            {renaming === r.id ? (
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act(() => commands.renameRoute({ storyId, routeId: r.id, label })).then(() =>
                    setRenaming(null),
                  );
                }}
              >
                <label htmlFor={`rename-${r.id}`} className="visually-hidden">
                  Route name
                </label>
                <input
                  id={`rename-${r.id}`}
                  value={label}
                  maxLength={80}
                  onChange={(e) => setLabel(e.target.value)}
                  autoFocus
                />
                <button type="submit">Rename</button>
                <button type="button" onClick={() => setRenaming(null)}>
                  Cancel
                </button>
              </form>
            ) : (
              <div>
                <strong>{r.label}</strong>
                {r.id === currentRouteId && <span className="badge">Current</span>}
                {r.isMain && <span className="badge">Main</span>}
                {r.hidden && <span className="badge">Hidden</span>}
              </div>
            )}
            <div className="button-row">
              {r.id !== currentRouteId && (
                <button type="button" onClick={() => onSwitch(r.id)}>
                  Switch
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setRenaming(r.id);
                  setLabel(r.label);
                }}
              >
                Rename
              </button>
              {!r.isMain && (
                <button
                  type="button"
                  onClick={() =>
                    void act(() =>
                      commands.setRouteHidden({ storyId, routeId: r.id, hidden: !r.hidden }),
                    )
                  }
                >
                  {r.hidden ? 'Show' : 'Hide'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {hiddenCount > 0 && (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={showHidden}
            onChange={(e) => setShowHidden(e.target.checked)}
          />
          Show {hiddenCount} hidden {hiddenCount === 1 ? 'route' : 'routes'}
        </label>
      )}
    </div>
  );
}

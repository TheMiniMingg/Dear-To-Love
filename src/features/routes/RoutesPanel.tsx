import { useEffect, useId, useState } from 'react';
import { commands, errorMessage } from '../../api/commands';
import type { RouteDto, RouteNode } from '../../types';
import { RouteMap } from './RouteMap';
import { RouteTimeline } from './RouteTimeline';
import { branchText, layoutRoutes, originText, statsText } from './routeLayout';
import { msg, t, tn } from '../../i18n';

type Props = {
  storyId: string;
  currentRouteId: string;
  routes: RouteDto[];
  onSwitch: (routeId: string) => void;
  onChanged: () => void;
};

type View = 'list' | 'map' | 'timeline';

const VIEWS: { id: View; label: string }[] = [
  { id: 'list', label: msg('List') },
  { id: 'map', label: msg('Map') },
  { id: 'timeline', label: msg('Timeline') },
];

const VIEW_KEY = 'dtl.routesView';

function loadView(): View {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === 'map' || v === 'timeline' ? v : 'list';
  } catch {
    return 'list';
  }
}

/** Until the map loads (or if it can't), the routes alone. */
const bare = (r: RouteDto): RouteNode => ({ route: r, turns: 0 });

/**
 * Reader -> Routes, as a list, a map of how the routes branch, or a
 * timeline of how far each one got. Any view can switch, rename, hide and
 * show routes.
 */
export function RoutesPanel({ storyId, currentRouteId, routes, onSwitch, onChanged }: Props) {
  const id = useId();
  const [view, setViewState] = useState<View>(loadView);
  const [nodes, setNodes] = useState<RouteNode[] | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [selected, setSelected] = useState(currentRouteId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    commands
      .getRouteMap(storyId)
      .then((m) => {
        if (live) setNodes(m);
      })
      .catch(() => {
        if (live) setNodes(null);
      });
    return () => {
      live = false;
    };
  }, [storyId, routes]);

  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // Remembering the view is only a convenience.
    }
  };

  // Route changes (rename, hide) arrive through `routes`; the map adds the rest.
  const all: RouteNode[] = routes.map((r) => {
    const n = nodes?.find((x) => x.route.id === r.id);
    return n ? { ...n, route: r } : bare(r);
  });
  const shown = (n: RouteNode) => showHidden || !n.route.hidden || n.route.id === currentRouteId;
  const placed = layoutRoutes(all, shown);
  const hiddenCount = routes.filter((r) => r.hidden).length;
  const labelOf = (rid: string) => routes.find((r) => r.id === rid)?.label;
  const detailed = nodes !== null;

  const act = async (f: () => Promise<unknown>) => {
    try {
      await f();
      setError(null);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const details = (n: RouteNode) => (
    <RouteDetails
      key={n.route.id}
      node={n}
      current={n.route.id === currentRouteId}
      detailed={detailed}
      origin={originText(n, labelOf)}
      onSwitch={() => onSwitch(n.route.id)}
      onRename={(label) => act(() => commands.renameRoute({ storyId, routeId: n.route.id, label }))}
      onHide={() =>
        void act(() =>
          commands.setRouteHidden({ storyId, routeId: n.route.id, hidden: !n.route.hidden }),
        )
      }
    />
  );

  const chosen = placed.find((p) => p.node.route.id === selected) ?? placed[0];

  return (
    <div className="panel routes-panel">
      <div role="radiogroup" aria-label={t('Show routes as')} className="segmented">
        {VIEWS.map((v) => (
          <label key={v.id}>
            <input
              type="radio"
              name={`${id}-view`}
              checked={view === v.id}
              onChange={() => setView(v.id)}
            />
            <span>{t(v.label)}</span>
          </label>
        ))}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {view === 'list' && (
        <ul className="item-list route-list" aria-label={t('Routes')}>
          {placed.map((p) => (
            <li
              key={p.node.route.id}
              className="item-row"
              style={{ paddingLeft: `${Math.min(p.depth, 6) * 1.25}rem` }}
            >
              {details(p.node)}
            </li>
          ))}
        </ul>
      )}
      {view !== 'list' && (
        <>
          {view === 'map' ? (
            <RouteMap
              placed={placed}
              currentRouteId={currentRouteId}
              selectedId={chosen?.node.route.id ?? null}
              onSelect={setSelected}
            />
          ) : (
            <RouteTimeline
              placed={placed}
              currentRouteId={currentRouteId}
              selectedId={chosen?.node.route.id ?? null}
              onSelect={setSelected}
            />
          )}
          {chosen && (
            <section className="route-chosen" aria-label={t('Chosen route')}>
              {details(chosen.node)}
            </section>
          )}
        </>
      )}
      {hiddenCount > 0 && (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={showHidden}
            onChange={(e) => setShowHidden(e.target.checked)}
          />
          {tn(hiddenCount, 'Show {n} hidden route', 'Show {n} hidden routes')}
        </label>
      )}
    </div>
  );
}

function RouteDetails({
  node,
  current,
  detailed,
  origin,
  onSwitch,
  onRename,
  onHide,
}: {
  node: RouteNode;
  current: boolean;
  detailed: boolean;
  origin: string;
  onSwitch: () => void;
  onRename: (label: string) => Promise<void>;
  onHide: () => void;
}) {
  const r = node.route;
  const [renaming, setRenaming] = useState(false);
  const [label, setLabel] = useState(r.label);
  const branch = branchText(node);
  return (
    <>
      {renaming ? (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            void onRename(label).then(() => setRenaming(false));
          }}
        >
          <label htmlFor={`rename-${r.id}`} className="visually-hidden">
            {t('Route name')}
          </label>
          <input
            id={`rename-${r.id}`}
            value={label}
            maxLength={80}
            onChange={(e) => setLabel(e.target.value)}
            autoFocus
          />
          <button type="submit">{t('Rename')}</button>
          <button type="button" onClick={() => setRenaming(false)}>
            {t('Cancel')}
          </button>
        </form>
      ) : (
        <div className="route-details">
          <div>
            <strong>{r.label}</strong>
            {current && <span className="badge">{t('Current')}</span>}
            {r.isMain && (
              <span className="badge" title={t('The route the story started on')}>
                {t('Original')}
              </span>
            )}
            {r.hidden && <span className="badge">{t('Hidden')}</span>}
          </div>
          {detailed && (
            <>
              <span className="muted small">{origin}</span>
              {branch && <span className="small">{branch}</span>}
              <span className="muted small">{statsText(node)}</span>
              {node.latest && (
                <span className="muted small route-latest">
                  {t('Now: {text}', { text: node.latest })}
                </span>
              )}
            </>
          )}
        </div>
      )}
      <div className="button-row">
        {!current && (
          <button type="button" onClick={onSwitch}>
            {t('Switch')}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setRenaming(true);
            setLabel(r.label);
          }}
        >
          {t('Rename')}
        </button>
        {!r.isMain && (
          <button type="button" onClick={onHide}>
            {r.hidden ? t('Show') : t('Hide')}
          </button>
        )}
      </div>
    </>
  );
}

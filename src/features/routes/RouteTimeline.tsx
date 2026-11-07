import type { Placed } from './routeLayout';
import { turnCount } from './routeLayout';
import { joinList, t } from '../../i18n';
import { routeName } from '../../i18n/names';

type Props = {
  placed: Placed[];
  currentRouteId: string;
  selectedId: string | null;
  onSelect: (routeId: string) => void;
};

/**
 * Routes along the story's turns: one row per route, its bar running from
 * where it branched to how far it has got, with a line up to the route it
 * branched from.
 */
export function RouteTimeline({ placed, currentRouteId, selectedId, onSelect }: Props) {
  const max = Math.max(1, ...placed.map((p) => p.node.turns));
  const at = (turn: number) => (turn / max) * 100;
  const rowOf = new Map(placed.map((p) => [p.node.route.id, p.row]));
  const rows = Math.max(1, placed.length);
  return (
    <div className="route-timeline">
      <ul className="timeline-rows" aria-label={t('Route timeline')}>
        {placed.map((p) => {
          const r = p.node.route;
          const start = p.node.forkTurn ?? 0;
          const current = r.id === currentRouteId;
          const span =
            p.node.forkTurn == null
              ? t('turns {from} to {to}', { from: 1, to: p.node.turns })
              : p.node.turns > start
                ? t('turns {from} to {to}', { from: start + 1, to: p.node.turns })
                : t('branched after turn {n}, nothing new yet', { n: start });
          return (
            <li key={r.id} className="timeline-row">
              <button
                type="button"
                className={`timeline-label${current ? ' current' : ''}`}
                aria-pressed={r.id === selectedId}
                aria-label={joinList(
                  [routeName(r.label), current ? t('current') : '', span].filter(Boolean),
                )}
                title={routeName(r.label)}
                onClick={() => onSelect(r.id)}
              >
                {routeName(r.label)}
              </button>
              <div className="timeline-track">
                <span
                  className={`timeline-bar${current ? ' current' : ''}${r.id === selectedId ? ' selected' : ''}${r.hidden ? ' hidden-route' : ''}`}
                  style={{
                    left: `${at(start)}%`,
                    width: `max(0.5rem, ${at(p.node.turns) - at(start)}%)`,
                  }}
                  title={`${routeName(r.label)}: ${span}`}
                  aria-hidden="true"
                  onClick={() => onSelect(r.id)}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <div
        className="timeline-overlay"
        aria-hidden="true"
        style={{ height: `calc(var(--timeline-row) * ${rows})` }}
      >
        <svg viewBox={`0 0 100 ${rows}`} preserveAspectRatio="none">
          {placed.map((p) => {
            const parentRow = p.parentId ? rowOf.get(p.parentId) : undefined;
            if (parentRow === undefined || p.node.forkTurn == null) return null;
            const x = at(p.node.forkTurn);
            return (
              <line
                key={p.node.route.id}
                x1={x}
                x2={x}
                y1={parentRow + 0.5}
                y2={p.row + 0.5}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>
      </div>
      <div className="timeline-axis" aria-hidden="true">
        <span>{t('Start')}</span>
        <span>{turnCount(max)}</span>
      </div>
    </div>
  );
}

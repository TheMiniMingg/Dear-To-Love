import type { Placed } from './routeLayout';
import { plural } from './routeLayout';

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
      <ul className="timeline-rows" aria-label="Route timeline">
        {placed.map((p) => {
          const r = p.node.route;
          const start = p.node.forkTurn ?? 0;
          const current = r.id === currentRouteId;
          const span =
            p.node.forkTurn == null
              ? `turns 1 to ${p.node.turns}`
              : p.node.turns > start
                ? `turns ${start + 1} to ${p.node.turns}`
                : `branched after turn ${start}, nothing new yet`;
          return (
            <li key={r.id} className="timeline-row">
              <button
                type="button"
                className={`timeline-label${current ? ' current' : ''}`}
                aria-pressed={r.id === selectedId}
                aria-label={`${r.label}${current ? ', current' : ''}, ${span}`}
                title={r.label}
                onClick={() => onSelect(r.id)}
              >
                {r.label}
              </button>
              <div className="timeline-track">
                <span
                  className={`timeline-bar${current ? ' current' : ''}${r.id === selectedId ? ' selected' : ''}${r.hidden ? ' hidden-route' : ''}`}
                  style={{
                    left: `${at(start)}%`,
                    width: `max(0.5rem, ${at(p.node.turns) - at(start)}%)`,
                  }}
                  title={`${r.label}: ${span}`}
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
        <span>Start</span>
        <span>{plural(max, 'turn')}</span>
      </div>
    </div>
  );
}

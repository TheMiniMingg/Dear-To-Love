import type { Placed } from './routeLayout';
import { turnCount } from './routeLayout';
import { joinList, t } from '../../i18n';

const NODE_W = 168;
const NODE_H = 48;
const COL = 208;
const ROW = 64;
const PAD = 8;

type Props = {
  placed: Placed[];
  currentRouteId: string;
  selectedId: string | null;
  onSelect: (routeId: string) => void;
};

/**
 * Routes as a branching diagram: the original route on the left, each
 * branch one column to the right of the route it left, joined where it
 * branched ("after turn 3").
 */
export function RouteMap({ placed, currentRouteId, selectedId, onSelect }: Props) {
  const depth = Math.max(0, ...placed.map((p) => p.depth));
  const width = PAD * 2 + depth * COL + NODE_W;
  const height = PAD * 2 + Math.max(1, placed.length) * ROW - (ROW - NODE_H);
  const pos = new Map(
    placed.map((p) => [p.node.route.id, { x: PAD + p.depth * COL, y: PAD + p.row * ROW }]),
  );
  return (
    <div className="route-map-scroll">
      <div className="route-map" style={{ width, height }}>
        <svg width={width} height={height} aria-hidden="true" className="route-map-lines">
          {placed.map((p) => {
            const from = p.parentId ? pos.get(p.parentId) : undefined;
            const to = pos.get(p.node.route.id);
            if (!from || !to) return null;
            const sx = from.x + NODE_W;
            const sy = from.y + NODE_H / 2;
            const ex = to.x;
            const ey = to.y + NODE_H / 2;
            const mx = sx + (ex - sx) / 2;
            return (
              <g key={p.node.route.id}>
                <path d={`M ${sx} ${sy} H ${mx} V ${ey} H ${ex}`} />
                {p.node.forkTurn != null && (
                  // A branch always sits below its parent, so the parent's
                  // column is free on this row.
                  <text x={mx - 6} y={ey + 4} textAnchor="end">
                    {p.node.forkTurn === 0
                      ? t('at the start')
                      : t('after turn {n}', { n: p.node.forkTurn })}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        <ul aria-label={t('Route map')} className="route-map-nodes">
          {placed.map((p) => {
            const r = p.node.route;
            const at = pos.get(r.id)!;
            const current = r.id === currentRouteId;
            return (
              <li key={r.id} style={{ left: at.x, top: at.y, width: NODE_W, height: NODE_H }}>
                <button
                  type="button"
                  className={`route-node${current ? ' current' : ''}${r.hidden ? ' hidden-route' : ''}`}
                  aria-pressed={r.id === selectedId}
                  aria-label={joinList(
                    [r.label, current ? t('current') : '', turnCount(p.node.turns)].filter(Boolean),
                  )}
                  onClick={() => onSelect(r.id)}
                >
                  <span className="route-node-label">{r.label}</span>
                  <span className="route-node-meta">
                    {current ? `${t('Current')} · ` : ''}
                    {turnCount(p.node.turns)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

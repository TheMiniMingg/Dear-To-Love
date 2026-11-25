import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Placed } from './routeLayout';
import { turnCount } from './routeLayout';
import { chartRoutes } from './routeChart';
import type { ChartNode } from './routeChart';
import { joinList, t } from '../../i18n';
import { routeName } from '../../i18n/names';

const NODE_W = 152;
const NODE_H = 54;
const COL = 196;
const ROW = 68;
const PAD = 14;
const ZOOMS = [0.6, 0.8, 1, 1.2];
const ZOOM_KEY = 'dtl.routeMapZoom';

type Props = {
  placed: Placed[];
  currentRouteId: string;
  selectedId: string | null;
  onSelect: (routeId: string) => void;
};

/** The zoom the player picked, or null to fit the chart to the panel. */
function loadZoom(): number | null {
  try {
    const z = Number(localStorage.getItem(ZOOM_KEY));
    return ZOOMS.includes(z) ? z : null;
  } catch {
    return null;
  }
}

/** "After turn 3", or "At the start" for a route that left before any turn. */
const splitWhen = (turn: number) =>
  turn === 0 ? t('At the start') : t('After turn {n}', { n: turn });

/**
 * Routes as a dating-sim route chart: splits where the story parted, each
 * labelled with the in-story time, branching left to right into one box per
 * route. The way to the current route is drawn brighter.
 */
export function RouteMap({ placed, currentRouteId, selectedId, onSelect }: Props) {
  const chart = chartRoutes(placed, currentRouteId);
  const [picked, setZoomState] = useState(loadZoom);
  const scroller = useRef<HTMLDivElement>(null);
  const here = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  const width = PAD * 2 + Math.max(0, chart.cols - 1) * COL + NODE_W;
  const height = PAD * 2 + (chart.rows - 1) * ROW + NODE_H;
  const pos = (n: ChartNode) => ({ x: PAD + n.col * COL, y: PAD + n.row * ROW });
  const byKey = new Map(chart.nodes.map((n) => [n.key, n]));

  // Until the player zooms, the chart shrinks (down to 60%) to fit across.
  const [room, setRoom] = useState(0);
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(() => setRoom(el.clientWidth));
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  const fit = room
    ? ([...ZOOMS].reverse().find((z) => z <= 1 && width * z <= room) ?? ZOOMS[0]!)
    : 1;
  const zoom = picked ?? fit;

  // Open on the current route, with a little room around it.
  useEffect(() => {
    const el = scroller.current;
    const btn = here.current;
    if (!el || !btn) return;
    const box = btn.getBoundingClientRect();
    const view = el.getBoundingClientRect();
    const margin = 24;
    if (box.right + margin > view.right) el.scrollLeft += box.right + margin - view.right;
    if (box.bottom + margin > view.bottom) el.scrollTop += box.bottom + margin - view.bottom;
  }, [zoom]);

  const setZoom = (z: number) => {
    setZoomState(z);
    try {
      localStorage.setItem(ZOOM_KEY, String(z));
    } catch {
      // Remembering the zoom is only a convenience.
    }
  };
  const zi = ZOOMS.indexOf(zoom);

  // Drag the empty chart to move around it.
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = scroller.current;
    if (!el || e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
    el.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = scroller.current;
    if (!d || !el) return;
    el.scrollLeft = d.left - (e.clientX - d.x);
    el.scrollTop = d.top - (e.clientY - d.y);
  };
  const endDrag = () => {
    drag.current = null;
  };

  return (
    <div className="route-chart">
      <div className="route-chart-bar">
        <ul className="route-chart-legend" aria-label={t('Key')}>
          <li>
            <span className="swatch split" aria-hidden="true" />
            {t('Split: where routes part')}
          </li>
          <li>
            <span className="swatch route" aria-hidden="true" />
            {t('Route: how far it got')}
          </li>
        </ul>
        <div className="route-chart-zoom" role="group" aria-label={t('Zoom')}>
          <button
            type="button"
            className="icon-button"
            aria-label={t('Zoom out')}
            disabled={zi <= 0}
            onClick={() => setZoom(ZOOMS[zi - 1]!)}
          >
            −
          </button>
          <span className="muted small" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label={t('Zoom in')}
            disabled={zi >= ZOOMS.length - 1}
            onClick={() => setZoom(ZOOMS[zi + 1]!)}
          >
            +
          </button>
        </div>
      </div>
      <div
        className="route-map-scroll"
        ref={scroller}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="route-map-sizer" style={{ width: width * zoom, height: height * zoom }}>
          <div
            className="route-map"
            style={{ width, height, transform: `scale(${zoom})`, transformOrigin: '0 0' }}
          >
            <svg width={width} height={height} aria-hidden="true" className="route-map-lines">
              <defs>
                <marker
                  id="route-arrow"
                  viewBox="0 0 8 8"
                  refX="7"
                  refY="4"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto"
                >
                  <path d="M0 0 L8 4 L0 8 z" className="arrow" />
                </marker>
                <marker
                  id="route-arrow-on"
                  viewBox="0 0 8 8"
                  refX="7"
                  refY="4"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto"
                >
                  <path d="M0 0 L8 4 L0 8 z" className="arrow on" />
                </marker>
              </defs>
              {/* Lines on the way to the current route are drawn last, on top. */}
              {[...chart.nodes]
                .sort((a, b) => Number(a.onPath) - Number(b.onPath))
                .map((n) => {
                  const parent = n.parentKey ? byKey.get(n.parentKey) : undefined;
                  if (!parent) return null;
                  const from = pos(parent);
                  const to = pos(n);
                  const sx = from.x + NODE_W;
                  const sy = from.y + NODE_H / 2;
                  const ex = to.x - 2;
                  const ey = to.y + NODE_H / 2;
                  const mx = sx + (COL - NODE_W) / 2;
                  return (
                    <path
                      key={n.key}
                      className={n.onPath ? 'on' : undefined}
                      d={`M ${sx} ${sy} H ${mx} V ${ey} H ${ex}`}
                      markerEnd={`url(#${n.onPath ? 'route-arrow-on' : 'route-arrow'})`}
                    />
                  );
                })}
            </svg>
            <ul aria-label={t('Route map')} className="route-map-nodes">
              {chart.nodes.map((n) => {
                const at = pos(n);
                const box = { left: at.x, top: at.y, width: NODE_W, height: NODE_H };
                if (n.kind === 'split') {
                  const time = n.scene?.time;
                  const full = joinList(
                    [
                      t('Split {letter}', { letter: n.letter }),
                      splitWhen(n.turn),
                      time ?? '',
                      n.scene?.place ?? '',
                    ].filter(Boolean),
                  );
                  return (
                    <li key={n.key} style={box}>
                      <div
                        className={`route-split${n.onPath ? ' on-path' : ''}`}
                        title={full}
                        aria-label={full}
                        role="img"
                      >
                        <span className="route-node-label">
                          {t('Split {letter}', { letter: n.letter })}
                        </span>
                        <span className="route-node-meta">{time || splitWhen(n.turn)}</span>
                      </div>
                    </li>
                  );
                }
                const p = n.placed;
                const r = p.node.route;
                const current = r.id === currentRouteId;
                const now = p.node.scene;
                return (
                  <li key={n.key} style={box}>
                    <button
                      type="button"
                      ref={current ? here : undefined}
                      className={`route-node${current ? ' current' : ''}${r.hidden ? ' hidden-route' : ''}`}
                      aria-pressed={r.id === selectedId}
                      aria-label={joinList(
                        [
                          routeName(r.label),
                          current ? t('current') : '',
                          turnCount(p.node.turns),
                        ].filter(Boolean),
                      )}
                      // The full name (the box may cut it short) and where it is now.
                      title={[routeName(r.label), now?.place, now?.time]
                        .filter(Boolean)
                        .join(' · ')}
                      onClick={() => onSelect(r.id)}
                    >
                      <span className="route-node-label">{routeName(r.label)}</span>
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
      </div>
    </div>
  );
}

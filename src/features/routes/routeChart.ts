import type { RouteNode } from '../../types';
import type { Placed } from './routeLayout';

/**
 * The route chart, laid out like a dating sim's route map: a split where
 * routes part, then the route that carries on and each route that left
 * there, until every route ends in its own box on the right.
 */
export type ChartNode =
  | {
      kind: 'split';
      key: string;
      /** "A", "B", ... in reading order. */
      letter: string;
      /** The route the others left. */
      routeId: string;
      /** Player turns before the split. */
      turn: number;
      /** Where and when the story was at the split, if known. */
      scene?: RouteNode['forkScene'];
      /** The routes that left here (not the one that carries on). */
      branchIds: string[];
      col: number;
      row: number;
      /** On the way to the current route. */
      onPath: boolean;
      parentKey: string | null;
    }
  | {
      kind: 'route';
      key: string;
      routeId: string;
      placed: Placed;
      col: number;
      row: number;
      onPath: boolean;
      parentKey: string | null;
    };

export type Chart = { nodes: ChartNode[]; cols: number; rows: number };

/** 0 -> A, 25 -> Z, 26 -> AA. */
export function splitLetter(i: number): string {
  let s = '';
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

type Draft =
  | { kind: 'split'; routeId: string; turn: number; branchIds: string[]; kids: Draft[] }
  | { kind: 'route'; routeId: string };

export function chartRoutes(placed: Placed[], currentRouteId: string): Chart {
  const byId = new Map(placed.map((p) => [p.node.route.id, p]));
  const kids = new Map<string | null, Placed[]>();
  for (const p of placed) {
    const list = kids.get(p.parentId) ?? [];
    list.push(p);
    kids.set(p.parentId, list);
  }

  // A route becomes a chain of splits, one per turn where others left it.
  const build = (p: Placed, depth = 0): Draft => {
    const id = p.node.route.id;
    const leaving = kids.get(id) ?? [];
    const turns = [...new Set(leaving.map((c) => c.node.forkTurn ?? 0))].sort((a, b) => a - b);
    const chain = (i: number): Draft => {
      if (i >= turns.length || depth > 200) return { kind: 'route', routeId: id };
      const here = leaving.filter((c) => (c.node.forkTurn ?? 0) === turns[i]);
      return {
        kind: 'split',
        routeId: id,
        turn: turns[i]!,
        branchIds: here.map((c) => c.node.route.id),
        kids: [chain(i + 1), ...here.map((c) => build(c, depth + 1))],
      };
    };
    return chain(0);
  };
  const roots = (kids.get(null) ?? []).map((p) => build(p));

  const nodes: ChartNode[] = [];
  let leafRow = 0;
  let letters = 0;
  let cols = 0;
  // Leaves take the next row; a split sits halfway between its first and last child.
  const place = (
    d: Draft,
    col: number,
    parentKey: string | null,
  ): { row: number; on: boolean; at: number } => {
    cols = Math.max(cols, col + 1);
    if (d.kind === 'route') {
      const row = leafRow++;
      const on = d.routeId === currentRouteId;
      nodes.push({
        kind: 'route',
        key: `r:${d.routeId}`,
        routeId: d.routeId,
        placed: byId.get(d.routeId)!,
        col,
        row,
        onPath: on,
        parentKey,
      });
      return { row, on, at: nodes.length - 1 };
    }
    const key = `s:${d.routeId}:${d.turn}`;
    const at = nodes.length;
    const first = byId.get(d.branchIds[0]!)?.node;
    nodes.push({
      kind: 'split',
      key,
      letter: splitLetter(letters++),
      routeId: d.routeId,
      turn: d.turn,
      scene: first?.forkScene,
      branchIds: d.branchIds,
      col,
      row: 0,
      onPath: false,
      parentKey,
    });
    const placedKids = d.kids.map((k) => place(k, col + 1, key));
    const self = nodes[at]!;
    self.row = (placedKids[0]!.row + placedKids[placedKids.length - 1]!.row) / 2;
    self.onPath = placedKids.some((k) => k.on);
    return { row: self.row, on: self.onPath, at };
  };
  for (const r of roots) place(r, 0, null);
  return { nodes, cols, rows: Math.max(1, leafRow) };
}

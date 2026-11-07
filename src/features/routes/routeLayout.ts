import type { RouteNode } from '../../types';
import { formatWhen, t, tn } from '../../i18n';
import { chapterHeading, plainStoryText } from '../../i18n/names';

/** A route placed in the tree: its shown parent, generation and row. */
export type Placed = {
  node: RouteNode;
  /** The nearest shown route it branched from (a hidden parent is skipped). */
  parentId: string | null;
  depth: number;
  row: number;
};

const byBranchPoint = (a: RouteNode, b: RouteNode) =>
  Number(b.route.isMain) - Number(a.route.isMain) ||
  (a.forkTurn ?? 0) - (b.forkTurn ?? 0) ||
  a.route.createdAt.localeCompare(b.route.createdAt) ||
  a.route.id.localeCompare(b.route.id);

/**
 * Routes in tree order: each route is followed by the routes that branched
 * from it, earliest branch point first. Routes left out by `shown` are
 * skipped, and their branches hang from the nearest shown route instead.
 */
export function layoutRoutes(nodes: RouteNode[], shown: (n: RouteNode) => boolean): Placed[] {
  const byId = new Map(nodes.map((n) => [n.route.id, n]));
  const visible = nodes.filter(shown);
  const visibleIds = new Set(visible.map((n) => n.route.id));
  const parentOf = (n: RouteNode): string | null => {
    let p = n.route.parentRouteId;
    const seen = new Set<string>();
    while (p && !visibleIds.has(p)) {
      if (seen.has(p)) return null;
      seen.add(p);
      p = byId.get(p)?.route.parentRouteId ?? null;
    }
    return p ?? null;
  };
  const children = new Map<string | null, RouteNode[]>();
  for (const n of visible) {
    const p = parentOf(n);
    const list = children.get(p) ?? [];
    list.push(n);
    children.set(p, list);
  }
  const out: Placed[] = [];
  const placed = new Set<string>();
  const visit = (n: RouteNode, parentId: string | null, depth: number) => {
    if (placed.has(n.route.id)) return;
    placed.add(n.route.id);
    out.push({ node: n, parentId, depth, row: out.length });
    for (const c of (children.get(n.route.id) ?? []).sort(byBranchPoint)) {
      visit(c, n.route.id, depth + 1);
    }
  };
  for (const root of (children.get(null) ?? []).sort(byBranchPoint)) visit(root, null, 0);
  return out;
}

/** "1 turn", "12 turns", in the chosen language. */
export const turnCount = (n: number) => tn(n, '{n} turn', '{n} turns');

/** "Branched from Main after turn 3", or where the story began. */
export function originText(n: RouteNode, labelOf: (id: string) => string | undefined): string {
  if (n.forkTurn == null || !n.route.parentRouteId) return t('Where the story began.');
  const from = labelOf(n.route.parentRouteId) ?? t('another route');
  return n.forkTurn === 0
    ? t('Branched from {route} before the first turn.', { route: from })
    : t('Branched from {route} after turn {n}.', { route: from, n: n.forkTurn });
}

/** What the route did differently first, e.g. "Another reply: “The door…”". */
export function branchText(n: RouteNode): string | null {
  const b = n.branch;
  if (!b) return n.forkTurn == null ? null : t('Nothing different yet.');
  switch (b.kind) {
    case 'action':
      return t('A different action: “{text}”', { text: plainStoryText(b.text) });
    case 'reply':
      return t('Another reply: “{text}”', { text: plainStoryText(b.text) });
    case 'chapter':
      return t('A new chapter: {title}', { title: b.text });
    case 'edit':
      return b.text ? t('Changed: {what}', { what: b.text }) : t('Changed the story details.');
  }
}

/** "12 turns (9 since it branched) · Chapter 2: The Storm · Played 6 Nov 2026, 21:40". */
export function statsText(n: RouteNode): string {
  const parts = [turnCount(n.turns)];
  if (n.forkTurn != null && n.turns > n.forkTurn) {
    parts[0] += ` ${t('({n} since it branched)', { n: n.turns - n.forkTurn })}`;
  }
  if (n.chapter) {
    parts.push(chapterHeading(n.chapter.ordinal, n.chapter.title));
  }
  parts.push(t('Played {when}', { when: formatWhen(n.route.updatedAt) }));
  return parts.join(' · ');
}

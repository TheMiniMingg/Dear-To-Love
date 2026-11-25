// Routes as a list, a map and a timeline.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RouteDto, RouteNode } from '../types';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  Channel: class {},
}));

import { RoutesPanel } from '../features/routes/RoutesPanel';
import { layoutRoutes } from '../features/routes/routeLayout';
import { chartRoutes, splitLetter } from '../features/routes/routeChart';

const route = (id: string, label: string, parent: string | null, extra: Partial<RouteDto> = {}) =>
  ({
    id,
    storyId: 's1',
    label,
    parentRouteId: parent,
    forkEventId: parent ? `fork-${id}` : null,
    headEventId: `head-${id}`,
    isMain: parent === null,
    hidden: false,
    version: 1,
    createdAt: `2026-11-06T10:0${id.length}:00Z`,
    updatedAt: '2026-11-06T12:00:00Z',
    ...extra,
  }) satisfies RouteDto;

const main = route('m', 'Main', null);
const alt = route('aa', 'Alt', 'm');
const late = route('bbb', 'Late night', 'aa', { hidden: true });
const pier = route('cccc', 'Pier', 'bbb');

const nodes: RouteNode[] = [
  {
    route: main,
    turns: 12,
    latest: 'The flame steadies.',
    chapter: { ordinal: 2, title: 'The Storm' },
  },
  {
    route: alt,
    turns: 9,
    forkTurn: 3,
    branch: { kind: 'reply', text: 'The flame gutters out.' },
    latest: 'Dark again.',
  },
  {
    route: late,
    turns: 6,
    forkTurn: 5,
    branch: { kind: 'action', text: 'I read the logbook.' },
  },
  { route: pier, turns: 6, forkTurn: 6 },
];

describe('Routes', () => {
  beforeEach(() => {
    localStorage.clear();
    invoke.mockReset();
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_route_map') return nodes;
      throw { code: 'NOT_FOUND', message: cmd };
    });
  });

  it('branches hang from the nearest shown route', () => {
    const shown = layoutRoutes(nodes, (n) => !n.route.hidden);
    expect(shown.map((p) => [p.node.route.label, p.parentId, p.depth])).toEqual([
      ['Main', null, 0],
      ['Alt', 'm', 1],
      ['Pier', 'aa', 2],
    ]);
    const all = layoutRoutes(nodes, () => true);
    expect(all.map((p) => [p.node.route.label, p.depth, p.row])).toEqual([
      ['Main', 0, 0],
      ['Alt', 1, 1],
      ['Late night', 2, 2],
      ['Pier', 3, 3],
    ]);
  });

  it('the chart parts routes at splits, like a dating sim route map', () => {
    const withScene = nodes.map((n) =>
      n.route.id === 'aa'
        ? { ...n, forkScene: { place: 'The lamp room', time: 'Day 2, dusk' } }
        : n,
    );
    const chart = chartRoutes(
      layoutRoutes(withScene, () => true),
      'cccc',
    );
    const shape = chart.nodes.map((n) =>
      n.kind === 'split'
        ? [`Split ${n.letter}`, n.routeId, n.turn, n.col, n.row, n.onPath]
        : [n.routeId, n.col, n.row, n.onPath],
    );
    // Main splits after turn 3 into Main and Alt; Alt splits after turn 5
    // into Alt and Late night, which splits after turn 6 into itself and Pier.
    expect(shape).toEqual([
      ['Split A', 'm', 3, 0, 0.875, true],
      ['m', 1, 0, false],
      ['Split B', 'aa', 5, 1, 1.75, true],
      ['aa', 2, 1, false],
      ['Split C', 'bbb', 6, 2, 2.5, true],
      ['bbb', 3, 2, false],
      ['cccc', 3, 3, true],
    ]);
    const a = chart.nodes[0]!;
    expect(a.kind === 'split' && a.scene?.time).toBe('Day 2, dusk');
    expect([chart.cols, chart.rows]).toEqual([4, 4]);
    expect([splitLetter(0), splitLetter(25), splitLetter(26)]).toEqual(['A', 'Z', 'AA']);
  });

  it('two routes leaving at the same turn share one split', () => {
    const twin = route('dd', 'Twin', 'm');
    const more = [...nodes, { route: twin, turns: 4, forkTurn: 3 }];
    const chart = chartRoutes(
      layoutRoutes(more, (n) => !n.route.hidden),
      'm',
    );
    const splits = chart.nodes.filter((n) => n.kind === 'split');
    expect(splits.map((s) => s.kind === 'split' && [s.letter, s.turn, s.branchIds])).toEqual([
      ['A', 3, ['aa', 'dd']],
      ['B', 6, ['cccc']],
    ]);
  });

  it('the map shows each split with when it happened', async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_route_map')
        return nodes.map((n) =>
          n.route.id === 'aa' ? { ...n, forkScene: { place: 'The lamp room', time: 'Dusk' } } : n,
        );
      throw { code: 'NOT_FOUND', message: cmd };
    });
    render(
      <RoutesPanel
        storyId="s1"
        currentRouteId="m"
        routes={[main, alt, late, pier]}
        onSwitch={() => {}}
        onChanged={() => {}}
      />,
    );
    const map = await screen.findByRole('list', { name: 'Route map' });
    expect(
      await within(map).findByRole('img', { name: 'Split A, After turn 3, Dusk, The lamp room' }),
    ).toBeInTheDocument();
    expect(within(map).getByText('Dusk')).toBeInTheDocument();
    expect(within(map).getByText('After turn 6')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(screen.getByText('80%')).toBeInTheDocument();
  });

  it('the list says where each route branched and what it did differently', async () => {
    const onSwitch = vi.fn();
    render(
      <RoutesPanel
        storyId="s1"
        currentRouteId="aa"
        routes={[main, alt, late, pier]}
        onSwitch={onSwitch}
        onChanged={() => {}}
      />,
    );
    expect(invoke).toHaveBeenCalledWith('get_route_map', { storyId: 's1' });
    await userEvent.click(screen.getByRole('radio', { name: 'List' }));
    const list = screen.getByRole('list', { name: 'Routes' });
    expect(await within(list).findByText('Branched from Main after turn 3.')).toBeInTheDocument();
    expect(within(list).getByText('Another reply: “The flame gutters out.”')).toBeInTheDocument();
    expect(within(list).getByText(/9 turns \(6 since it branched\)/)).toBeInTheDocument();
    expect(within(list).getByText(/Chapter 2: The Storm/)).toBeInTheDocument();
    expect(within(list).getByText('Where the story began.')).toBeInTheDocument();
    // The hidden route is left out, and its branch hangs from Alt.
    expect(within(list).queryByText('Late night')).toBeNull();
    expect(within(list).getByText('Branched from Late night after turn 6.')).toBeInTheDocument();
    expect(within(list).getByText('Nothing different yet.')).toBeInTheDocument();
    await userEvent.click(within(list).getAllByRole('button', { name: 'Switch' })[0]!);
    expect(onSwitch).toHaveBeenCalledWith('m');

    await userEvent.click(screen.getByRole('checkbox', { name: /Show 1 hidden route/ }));
    expect(within(list).getByText('A different action: “I read the logbook.”')).toBeInTheDocument();
  });

  it('the map and the timeline pick a route to look at, and the choice is kept', async () => {
    const onSwitch = vi.fn();
    const { unmount } = render(
      <RoutesPanel
        storyId="s1"
        currentRouteId="aa"
        routes={[main, alt, late, pier]}
        onSwitch={onSwitch}
        onChanged={() => {}}
      />,
    );
    // The map is the first view.
    expect(screen.getByRole('radio', { name: 'Map' })).toBeChecked();
    const map = await screen.findByRole('list', { name: 'Route map' });
    const altNode = within(map).getByRole('button', { name: 'Alt, current, 9 turns' });
    expect(altNode).toHaveAttribute('aria-pressed', 'true');
    const chosen = screen.getByRole('region', { name: 'Chosen route' });
    expect(within(chosen).getByText('Alt')).toBeInTheDocument();
    expect(within(chosen).queryByRole('button', { name: 'Switch' })).toBeNull();

    await userEvent.click(within(map).getByRole('button', { name: 'Main, 12 turns' }));
    expect(within(chosen).getByText('Main')).toBeInTheDocument();
    await userEvent.click(within(chosen).getByRole('button', { name: 'Switch' }));
    expect(onSwitch).toHaveBeenCalledWith('m');

    await userEvent.click(screen.getByRole('radio', { name: 'Timeline' }));
    const rows = screen.getByRole('list', { name: 'Route timeline' });
    expect(within(rows).getByRole('button', { name: 'Main, turns 1 to 12' })).toBeInTheDocument();
    await userEvent.click(within(rows).getByRole('button', { name: 'Alt, current, turns 4 to 9' }));
    expect(within(chosen).getByText('Branched from Main after turn 3.')).toBeInTheDocument();
    expect(within(rows).getByRole('button', { name: /Pier, branched after turn 6/ })).toBeTruthy();

    unmount();
    render(
      <RoutesPanel
        storyId="s1"
        currentRouteId="aa"
        routes={[main, alt, late, pier]}
        onSwitch={onSwitch}
        onChanged={() => {}}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Timeline' })).toBeChecked();
  });

  it('still lists the routes when their details cannot be read', async () => {
    invoke.mockRejectedValue({ code: 'INTERNAL', message: 'boom' });
    render(
      <RoutesPanel
        storyId="s1"
        currentRouteId="m"
        routes={[main, alt]}
        onSwitch={() => {}}
        onChanged={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole('radio', { name: 'List' }));
    const list = screen.getByRole('list', { name: 'Routes' });
    expect(within(list).getByText('Alt')).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: 'Switch' })).toBeInTheDocument();
  });
});

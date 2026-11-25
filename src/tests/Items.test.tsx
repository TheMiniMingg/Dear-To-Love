// RPG items: rarity, items that change dice, loot odds, starter kits, and
// the Use button in Status and inventory.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventDto, RouteView, StoryStateV1, Tracking } from '../types';
import { fakeRouteView } from './fakeBackend';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  Channel: class {
    onmessage: (m: unknown) => void = () => undefined;
  },
}));

import { TrackingFields } from '../features/create/TrackingFields';
import {
  addKit,
  effectFits,
  leastRarity,
  parseEffect,
  shownRarity,
  STARTER_KITS,
} from '../features/reader/items';
import { RichText } from '../features/reader/RichText';
import { RollResult } from '../features/reader/DiceCards';
import { ReaderScreen } from '../features/reader/ReaderScreen';
import { useUiStore } from '../app/store';

describe('item powers', () => {
  it('read the dice effects the core writes, and rarer ones need rarer items', () => {
    expect(parseEffect('+2')).toEqual({ kind: 'bonus', n: 2 });
    expect(parseEffect('1–2')).toEqual({ kind: 'faces', low: 1, high: 2 });
    expect(parseEffect('odd')).toEqual({ kind: 'odd' });
    expect(parseEffect('+11')).toBeNull();
    expect(parseEffect('lucky')).toBeNull();
    expect(leastRarity({ kind: 'faces', low: 1, high: 2 })).toBe('legendary');
    expect(leastRarity({ kind: 'odd' })).toBe('rare');
    expect(leastRarity({ kind: 'bonus', n: 1 })).toBe('common');
    expect(shownRarity({ name: 'Moon Die', qty: 1, rarity: 'common', dice: '1-2' })).toBe(
      'legendary',
    );
    expect(effectFits({ kind: 'faces', low: 18, high: 20 }, '1d6')).toBe(false);
    expect(effectFits({ kind: 'faces', low: 1, high: 2 }, '1d20')).toBe(true);
  });

  it('come in starter kits that add to what you have', () => {
    const rogue = STARTER_KITS.find((k) => k.name === 'Rogue')!;
    const items = addKit([{ name: 'Lucky coin', qty: 1 }], rogue.items);
    expect(items.find((i) => i.name === 'Lucky coin')?.qty).toBe(2);
    expect(items.find((i) => i.name === 'Lockpicks')?.keep).toBe(true);
    expect(items).toHaveLength(5);
  });
});

describe('setting up items', () => {
  it('adds a starter kit in one click, and folds rarity, dice and odds away', async () => {
    const seen: Tracking[] = [];
    function Host() {
      const [tr, setTr] = useState<Tracking | undefined>({ meters: [], inventory: true });
      return (
        <TrackingFields
          tracking={tr}
          genres={['Fantasy']}
          onChange={(next) => {
            if (next) seen.push(next);
            setTr(next);
          }}
        />
      );
    }
    render(<Host />);
    const items = screen.getByRole('group', { name: 'Starting items' });
    await userEvent.click(within(items).getByRole('button', { name: '+ Warrior' }));
    expect(seen.at(-1)?.items?.map((i) => i.name)).toEqual([
      'Iron sword',
      'Wooden shield',
      'Leather armor',
      'Healing potion',
      'Rations',
    ]);

    // A dice effect raises the rarity to what it needs.
    await userEvent.click(within(items).getAllByText('Rarity and effect')[0]!);
    await userEvent.selectOptions(
      within(items).getByRole('combobox', { name: 'Iron sword dice effect' }),
      'Only some numbers',
    );
    expect(seen.at(-1)?.items?.[0]).toMatchObject({ dice: '1-2', rarity: 'legendary' });
    const rarity = within(items).getByRole('combobox', { name: 'Iron sword rarity' });
    expect(within(rarity).getByRole('option', { name: 'Rare' })).toBeDisabled();

    await userEvent.click(screen.getByText('Loot rarity odds'));
    await userEvent.click(screen.getByRole('button', { name: 'Generous' }));
    expect(seen.at(-1)?.lootOdds).toEqual([30, 28, 20, 12, 7, 3]);
    await userEvent.click(screen.getByRole('button', { name: 'Balanced' }));
    expect(seen.at(-1)?.lootOdds).toBeUndefined();
  });
});

describe('items in the story', () => {
  it('shows rarity on what you find, and when an item could not be used', () => {
    const { container } = render(
      <RichText
        text={
          'You pry the chest open. <item gain="Moon Die" rarity="legendary">Pale bone.</item> ' +
          '<item use="Rope" result="not-now">Nothing to tie it to.</item> ' +
          '<item use="Torch" result="used"/>'
        }
        playerName="Sam"
      />,
    );
    expect(container.querySelector('.rarity-legendary')).toHaveTextContent('Legendary');
    expect(screen.getByRole('note')).toHaveTextContent(
      "Can't use Rope now: Nothing to tie it to. · You still have it",
    );
    expect(screen.getByText('Used Torch')).toBeInTheDocument();
  });

  it('shows the item a roll used', () => {
    render(
      <RollResult
        roll={{
          label: 'Block',
          dice: '1d20',
          faces: [1],
          total: 1,
          item: 'Moon Die',
          effect: '1-2',
        }}
      />,
    );
    expect(screen.getByRole('group')).toHaveTextContent('Moon Die: Only 1 to 2 on a roll');
  });
});

describe('the Use button', () => {
  const sent = () =>
    invoke.mock.calls.filter(([cmd]) => cmd === 'submit_action').map(([, args]) => args);

  const reply = (text: string): EventDto => ({
    id: 'ev-2',
    originRouteId: 'route-1',
    parentEventId: 'ev-1',
    generationRunId: null,
    createdAt: '2026-11-06T00:00:01Z',
    kind: 'assistant',
    payload: { text },
  });

  function viewWith(text: string): RouteView {
    const v = fakeRouteView([reply(text)]);
    v.state = {
      ...v.state,
      state: {
        ...v.state.state,
        narration: { dice: true },
        tracking: {
          meters: [],
          inventory: true,
          items: [
            { name: 'Moon Die', qty: 1, rarity: 'legendary', dice: '1-2' },
            { name: 'Rope', qty: 1 },
          ],
        },
      } as unknown as StoryStateV1,
    };
    return v;
  }

  beforeEach(() => {
    invoke.mockReset();
    useUiStore.setState({
      drafts: {},
      screen: { name: 'reader', routeId: 'route-1' },
      history: [],
    });
  });

  async function open(text: string) {
    const view = viewWith(text);
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_route_view') return view;
      if (cmd === 'submit_action') return { runId: 'run-1', view };
      if (cmd === 'generate_reply') return new Promise(() => undefined);
      if (cmd === 'get_picture_maker') return null;
      if (cmd === 'list_connections') return [];
      throw { code: 'NOT_FOUND', message: `unknown ${cmd}` };
    });
    render(<ReaderScreen routeId="route-1" />);
    const hud = await screen.findByRole('group', { name: 'Your status' });
    await userEvent.click(within(hud).getByRole('button', { name: 'Inventory (2)' }));
    return screen.findByRole('dialog', { name: 'Status and inventory' });
  }

  it('tells you when a dice item has no roll to change', async () => {
    const dialog = await open('The guard eyes you.');
    expect(dialog).toHaveTextContent('Legendary');
    expect(dialog).toHaveTextContent('Only 1 to 2 on a roll');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Use Moon Die' }));
    expect(within(dialog).getByRole('status')).toHaveTextContent('No roll is waiting.');
    expect(sent()).toEqual([]);
  });

  it('puts a dice item on the roll the storyteller asked for', async () => {
    const dialog = await open('He swings. <roll for="Block the blow" dice="1d20" target="1"/>');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Use Moon Die' }));
    expect(sent()).toEqual([
      expect.objectContaining({
        text: '',
        roll: expect.objectContaining({ label: 'Block the blow', item: 'Moon Die' }),
      }),
    ]);
  });

  it('sends anything else to the storyteller to judge', async () => {
    const dialog = await open('A cliff blocks the way.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Use Rope' }));
    expect(sent()).toEqual([expect.objectContaining({ useItem: 'Rope' })]);
  });
});

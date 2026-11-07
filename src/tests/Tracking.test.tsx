// RPG tracking: bars, counters and an inventory set when a story is made,
// changed by the storyteller's tags, shown above the action box and in
// Status and inventory, with a picture for each item if one is made.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AssetDto,
  ProviderProfile,
  RouteView,
  StoryStateV1,
  StoryVisual,
  Tracking,
} from '../types';
import { fakeRouteView } from './fakeBackend';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  Channel: class {
    onmessage: (m: unknown) => void = () => undefined;
  },
}));

import {
  TrackingFields,
  defaultTracking,
  trackingSummary,
} from '../features/create/TrackingFields';
import { RichText } from '../features/reader/RichText';
import { ReaderScreen } from '../features/reader/ReaderScreen';
import { diffState } from '../features/reader/stateDiff';
import { itemSlot } from '../features/reader/pictures';
import { useUiStore } from '../app/store';

const tracking: Tracking = {
  meters: [
    { name: 'Health', value: 18, max: 100 },
    { name: 'Gold', value: 35 },
    { name: 'Health', value: 40, max: 60, who: 'Kira' },
  ],
  inventory: true,
  items: [
    { name: 'Rusty Key', qty: 1, description: 'Opens something old.' },
    { name: 'Potion', qty: 3 },
  ],
};

function viewWith(t: Tracking | undefined): RouteView {
  const v = fakeRouteView();
  v.state = {
    ...v.state,
    state: {
      ...v.state.state,
      world: { era: 'Age of swords', setting: 'Goblin warrens', description: '', rules: [] },
      tracking: t,
    } as StoryStateV1,
  };
  return v;
}

describe('what a story starts tracking', () => {
  it('fits the kind of story', () => {
    expect(defaultTracking(['Fantasy']).meters.map((m) => m.name)).toEqual([
      'Health',
      'Mana',
      'Gold',
    ]);
    expect(defaultTracking(['Romance']).meters).toEqual([
      { name: 'Affection', value: 20, max: 100 },
    ]);
    expect(defaultTracking(['Cyberpunk']).meters.map((m) => m.name)).toEqual(['Health', 'Credits']);
    // Romance stories keep an inventory too.
    expect(defaultTracking(['Romance']).inventory).toBe(true);
  });

  it('sums itself up for the review', () => {
    expect(trackingSummary(tracking)).toBe(
      'Health 18/100, Gold 35, Kira: Health 40/60, an inventory with 2 items',
    );
    expect(trackingSummary(undefined)).toBe('');
  });

  it('turns on with defaults, and every bar, counter and item can change', async () => {
    const seen: (Tracking | undefined)[] = [];
    function Host() {
      const [tr, setTr] = useState<Tracking | undefined>(undefined);
      return (
        <TrackingFields
          tracking={tr}
          genres={['Fantasy']}
          onChange={(next) => {
            seen.push(next);
            setTr(next);
          }}
        />
      );
    }
    render(<Host />);
    expect(screen.queryByRole('group', { name: 'Bars and counters' })).toBeNull();
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Keep track of health, items and more' }),
    );
    const bars = screen.getByRole('group', { name: 'Bars and counters' });
    expect(within(bars).getByRole('combobox', { name: 'Bar 2 name' })).toHaveValue('Mana');

    // A bar's value stays within its maximum.
    const now = within(bars).getByRole('spinbutton', { name: 'Health now' });
    await userEvent.clear(now);
    await userEvent.type(now, '250');
    expect(seen.at(-1)?.meters[0]).toEqual({ name: 'Health', value: 100, max: 100 });

    await userEvent.click(within(bars).getByRole('button', { name: 'Add a counter' }));
    await userEvent.type(within(bars).getByRole('combobox', { name: 'Bar 4 name' }), 'Arrows');
    await userEvent.type(within(bars).getByRole('textbox', { name: 'Whose Arrows' }), 'Kira');
    expect(seen.at(-1)?.meters[3]).toEqual({ name: 'Arrows', value: 0, who: 'Kira' });

    const items = screen.getByRole('group', { name: 'Starting items' });
    await userEvent.click(within(items).getByRole('button', { name: 'Add an item' }));
    await userEvent.type(within(items).getByRole('textbox', { name: 'Item 1 name' }), 'Rope');
    await userEvent.type(
      within(items).getByRole('textbox', { name: 'Rope description' }),
      'Fifty feet of it.',
    );
    expect(seen.at(-1)?.items).toEqual([
      { name: 'Rope', qty: 1, description: 'Fifty feet of it.' },
    ]);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Keep an inventory' }));
    expect(screen.queryByRole('group', { name: 'Starting items' })).toBeNull();
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Keep track of health, items and more' }),
    );
    expect(seen.at(-1)).toBeUndefined();
  });
});

describe('changes in the story', () => {
  it('shows each change where the storyteller made it', () => {
    render(
      <RichText
        playerName="Sam"
        text={
          'The goblin\'s blade bites. <meter name="Health" change="-12"/>\n\n' +
          'In the chest, a key. <item gain="Rusty Key">Opens something old.</item> ' +
          '<meter name="Gold" change="+35"/> <meter name="Mana" who="Kira" set="5"/>'
        }
      />,
    );
    expect(screen.getByText('Health −12')).toHaveClass('tracker-chip', 'down');
    expect(screen.getByText('Gold +35')).toHaveClass('up');
    expect(screen.getByText('Kira · Mana → 5')).toBeInTheDocument();
    expect(screen.getByLabelText('Got Rusty Key: Opens something old.')).toHaveTextContent(
      '+1 Rusty Key',
    );
    expect(screen.queryByText(/<meter/)).toBeNull();
  });

  it("leaves typed tags out of the player's own words", () => {
    render(
      <RichText
        playerName="Sam"
        rolls={false}
        text={'I take it. <item gain="Crown of Ages"/> <meter name="Gold" set="9999"/>'}
      />,
    );
    expect(screen.queryByText(/Crown of Ages/)).toBeNull();
    expect(screen.queryByText(/Gold/)).toBeNull();
    expect(screen.getByText('I take it.')).toBeInTheDocument();
  });

  it('is a story detail like any other', () => {
    const before: StoryStateV1 = {
      schemaVersion: 1,
      playerCharacterId: 'pc',
      world: { era: 'Age of swords', setting: 'Goblin warrens', description: '', rules: [] },
      narration: { perspective: 'second', detail: 'balanced', tone: 'Grim', pacing: 'normal' },
      characters: {
        pc: { id: 'pc', name: 'Sam', control: 'player', personality: [], goals: [], abilities: [] },
      },
      relationships: [],
      knownFacts: [],
      scene: { location: 'The gate', summary: '', participantIds: ['pc'] },
      openThreads: [],
      visualRefs: {},
    };
    const on = diffState(before, { ...before, tracking });
    expect(on.changes).toEqual([{ op: 'setTracking', tracking }]);
    expect(on.lines).toEqual([
      { what: 'Tracking', before: 'Off', after: trackingSummary(tracking) },
    ]);
    expect(diffState({ ...before, tracking }, before).changes).toEqual([{ op: 'setTracking' }]);
    expect(diffState({ ...before, tracking }, { ...before, tracking }).changes).toEqual([]);
  });
});

const painter: ProviderProfile = {
  id: 'p2',
  label: 'Pictures',
  adapter: 'openai_images',
  baseUrl: 'https://api.openai.com/v1',
  modelId: 'gpt-image-1',
  billing: 'paid',
  hasKey: true,
  settings: { temperature: 0.9, maxOutputTokens: 700, timeoutMs: 300000, maxContextTokens: 16000 },
  createdAt: '',
  updatedAt: '',
};

const keyPicture: AssetDto = {
  id: 'a7',
  mime: 'image/png',
  width: 1024,
  height: 1024,
  byteSize: 2000,
  label: 'Rusty Key',
  tags: ['Item'],
  createdAt: '',
  shared: false,
  stories: [{ id: 'story-1', title: 'The Unsigned Letter' }],
};

describe('Status and inventory', () => {
  beforeEach(() => {
    invoke.mockReset();
    useUiStore.setState({
      drafts: {},
      screen: { name: 'reader', routeId: 'route-1' },
      history: [],
    });
  });

  it('shows your bars above the action box and everything in the inventory', async () => {
    invoke.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
      if (cmd === 'get_route_view') return viewWith(tracking);
      if (cmd === 'get_picture_maker') return 'p2';
      if (cmd === 'list_connections') return [painter];
      if (cmd === 'make_item_picture') return keyPicture;
      if (cmd === 'set_story_picture') {
        return [{ slot: args.slot, assetId: args.assetId }] as StoryVisual[];
      }
      throw { code: 'NOT_FOUND', message: `unknown ${cmd}` };
    });
    render(<ReaderScreen routeId="route-1" />);
    const hud = await screen.findByRole('group', { name: 'Your status' });
    expect(hud).toHaveTextContent('Health18/100');
    expect(hud).toHaveTextContent('Gold35');
    // Kira's bars are hers, so they wait in the full list.
    expect(hud).not.toHaveTextContent('40/60');
    expect(within(hud).getByText('18/100').closest('.hud-meter')).toHaveClass('low');

    await userEvent.click(within(hud).getByRole('button', { name: 'Inventory (2)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Status and inventory' });
    expect(within(dialog).getByRole('heading', { name: 'Kira' })).toBeInTheDocument();
    expect(dialog).toHaveTextContent('40/60');
    expect(dialog).toHaveTextContent('Potion × 3');
    expect(dialog).toHaveTextContent('Opens something old.');

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Make a picture of Rusty Key' }),
    );
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Make picture' }));
    expect(invoke).toHaveBeenCalledWith('make_item_picture', {
      input: {
        name: 'Rusty Key',
        description: 'Opens something old.',
        world: { era: 'Age of swords', setting: 'Goblin warrens', description: '', rules: [] },
        style: 'painted',
        storyId: 'story-1',
      },
    });
    expect(invoke).toHaveBeenCalledWith('set_story_picture', {
      storyId: 'story-1',
      slot: itemSlot('Rusty Key'),
      assetId: 'a7',
    });
    expect(itemSlot(' Rusty   Key ')).toBe('item:rusty key');
    expect(
      await within(dialog).findByRole('img', { name: 'Picture of Rusty Key' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Picture of Rusty Key set for the story');
  });

  it('only shows up in stories that keep track', async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_route_view') return viewWith(undefined);
      throw { code: 'NOT_FOUND', message: `unknown ${cmd}` };
    });
    render(<ReaderScreen routeId="route-1" />);
    await screen.findByLabelText('What do you do?');
    expect(screen.queryByRole('group', { name: 'Your status' })).toBeNull();
    await userEvent.keyboard('{Escape}');
    await screen.findByRole('button', { name: 'Story details' });
    expect(screen.queryByRole('button', { name: 'Status and inventory' })).toBeNull();
  });
});

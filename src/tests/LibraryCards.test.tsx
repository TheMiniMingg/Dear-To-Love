// The library as cards (search, sort, pin, the "…" menu), and the small
// helpers the cards and the reader's header lean on.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StorySummary } from '../types';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  Channel: class {
    onmessage: (m: unknown) => void = () => undefined;
  },
}));

import { arrange, useLibraryPrefs } from '../app/library';
import { useUiStore } from '../app/store';
import { LibraryScreen } from '../features/library/LibraryScreen';
import { lastLine } from '../features/reader/messages';
import { formatAgo } from '../i18n';

const story = (id: string, title: string, more: Partial<StorySummary> = {}): StorySummary => ({
  id,
  title,
  description: '',
  createdAt: '2026-11-06T00:00:00Z',
  updatedAt: '2026-11-06T00:00:00Z',
  routeCount: 1,
  mainRouteId: `${id}-main`,
  lastRouteId: `${id}-main`,
  coverAssetId: null,
  writing: false,
  genres: [],
  chapter: 1,
  turns: 0,
  lastReply: null,
  place: '',
  setting: '',
  cast: [],
  ...more,
});

beforeEach(() => {
  invoke.mockReset();
  localStorage.clear();
  useUiStore.setState({ drafts: {}, screen: { name: 'library' }, history: [] });
  useLibraryPrefs.setState({ sort: 'played', pinned: [] });
});

describe('Finding a story', () => {
  const deep = story('a', 'The Shifting Deep', {
    genres: ['fantasy'],
    updatedAt: '2026-11-06T03:00:00Z',
    createdAt: '2026-11-01T00:00:00Z',
  });
  const air = story('b', 'Dead Air', {
    genres: ['horror', 'mystery'],
    description: 'A night shift at a small radio station.',
    updatedAt: '2026-11-06T01:00:00Z',
    createdAt: '2026-11-03T00:00:00Z',
  });
  const cafe = story('c', 'First Week at the Café', {
    genres: ['romance'],
    updatedAt: '2026-11-06T02:00:00Z',
    createdAt: '2026-11-02T00:00:00Z',
    place: 'The café kitchen',
    setting: 'A seaside town',
    cast: ['Noor', 'Teodor'],
  });
  const all = [deep, air, cafe];
  const titles = (list: StorySummary[]) => list.map((s) => s.title);

  it('searches every word in the title, premise, genres, cast, place and setting', () => {
    expect(titles(arrange(all, 'horror', 'played', []))).toEqual(['Dead Air']);
    expect(titles(arrange(all, 'radio NIGHT', 'played', []))).toEqual(['Dead Air']);
    expect(titles(arrange(all, 'week café', 'played', []))).toEqual(['First Week at the Café']);
    expect(arrange(all, 'radio café', 'played', [])).toEqual([]);
    expect(titles(arrange(all, 'teodor', 'played', []))).toEqual(['First Week at the Café']);
    expect(titles(arrange(all, 'kitchen', 'played', []))).toEqual(['First Week at the Café']);
    expect(titles(arrange(all, 'seaside', 'played', []))).toEqual(['First Week at the Café']);
  });

  it('sorts by last played, title or newest, with pinned stories first', () => {
    expect(titles(arrange(all, '', 'played', []))).toEqual([
      'The Shifting Deep',
      'First Week at the Café',
      'Dead Air',
    ]);
    expect(titles(arrange(all, '', 'title', []))).toEqual([
      'Dead Air',
      'First Week at the Café',
      'The Shifting Deep',
    ]);
    expect(titles(arrange(all, '', 'created', []))).toEqual([
      'Dead Air',
      'First Week at the Café',
      'The Shifting Deep',
    ]);
    expect(titles(arrange(all, '', 'title', ['c']))).toEqual([
      'First Week at the Café',
      'Dead Air',
      'The Shifting Deep',
    ]);
  });
});

describe('Story cards', () => {
  const played = story('s1', 'The Shifting Deep', {
    chapter: 2,
    turns: 5,
    routeCount: 3,
    lastReply: 'The door groans.\n\n*Dorn raises his lantern toward the **stairs**.*',
    place: 'The lighthouse stairs',
    cast: ['Dorn', 'Mira'],
  });
  const fresh = story('s2', 'Dead Air', { description: 'The snow has closed the road.' });

  const mount = () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'list_stories') return [played, fresh];
      if (cmd === 'rename_story') return 'The Deep';
      return null;
    });
    render(<LibraryScreen />);
  };

  it('shows how far each story got and its last line', async () => {
    mount();
    const card = (await screen.findByText('The Shifting Deep')).closest('li')!;
    expect(within(card).getByText(/Chapter 2 · 5 turns · 3 routes/)).toBeInTheDocument();
    expect(
      within(card).getByText('Dorn raises his lantern toward the stairs.'),
    ).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Continue The Shifting Deep' })).toBeVisible();
    expect(within(card).getByTestId('story-place')).toHaveTextContent('The lighthouse stairs');
    const other = screen.getByText('Dead Air').closest('li')!;
    expect(within(other).queryByTestId('story-place')).toBeNull();
    expect(within(other).getByText(/Not started/)).toBeInTheDocument();
    expect(within(other).getByText('The snow has closed the road.')).toBeInTheDocument();
    expect(within(other).getByRole('button', { name: 'Begin Dead Air' })).toBeVisible();
  });

  it('pins and renames from the card menu, by keyboard too', async () => {
    mount();
    const more = await screen.findByRole('button', { name: 'More for Dead Air' });
    more.focus();
    await userEvent.keyboard('{ArrowDown}');
    const menu = screen.getByRole('menu', { name: 'More for Dead Air' });
    expect(within(menu).getByRole('menuitem', { name: 'Pin to the top' })).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(within(menu).getByRole('menuitem', { name: 'Delete' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(more).toHaveFocus();

    await userEvent.click(more);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Pin to the top' }));
    expect(useLibraryPrefs.getState().pinned).toEqual(['s2']);
    const cards = screen.getAllByRole('listitem');
    expect(within(cards[0]!).getByText('Dead Air')).toBeInTheDocument();
    expect(within(cards[0]!).getByText('Pinned')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'More for The Shifting Deep' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const box = screen.getByLabelText('Title');
    expect(box).toHaveValue('The Shifting Deep');
    await userEvent.clear(box);
    await userEvent.type(box, '  The   Deep ');
    await userEvent.click(screen.getByRole('button', { name: 'Rename' }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('rename_story', {
        storyId: 's1',
        title: '  The   Deep ',
      }),
    );
    expect(await screen.findByText('Renamed to The Deep.')).toBeInTheDocument();
  });
});

describe('Small helpers', () => {
  it('finds the last line of a reply without its markup', () => {
    expect(lastLine('First.\n\n*She **smiles**.*')).toBe('She smiles.');
    expect(lastLine('Hello.\n\n<text from="Mina">see you at six</text>')).toBe(
      'Mina: see you at six',
    );
  });

  it('says "just now" for the last minute', () => {
    const now = Date.parse('2026-11-06T10:00:30Z');
    expect(formatAgo('2026-11-06T10:00:00Z', now)).toBe('just now');
    expect(formatAgo('2026-11-06T09:55:00Z', now)).toBe('5 minutes ago');
    expect(formatAgo('2026-11-06T07:00:00Z', now)).toBe('3 hours ago');
  });
});

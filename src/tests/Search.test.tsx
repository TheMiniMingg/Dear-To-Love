// T37: search this route, jump to a result, and bookmark places to find again.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookmarkDto, EventDto, SearchResults } from '../types';
import { fakeRouteView } from './fakeBackend';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  Channel: class {
    onmessage: (m: unknown) => void = () => undefined;
  },
}));

import { ReaderScreen } from '../features/reader/ReaderScreen';
import { useUiStore } from '../app/store';

const ev = (id: string, parent: string, kind: 'player' | 'assistant', text: string): EventDto =>
  ({
    id,
    originRouteId: 'route-1',
    parentEventId: parent,
    generationRunId: null,
    createdAt: '2026-11-06T00:00:01Z',
    kind,
    payload: { text },
  }) as EventDto;

const history = [
  ev('ev-2', 'ev-1', 'player', 'I light the lamp.'),
  ev('ev-3', 'ev-2', 'assistant', 'The lamp hums like a hive.'),
];

const results: SearchResults = {
  routeId: 'route-1',
  query: 'lamp',
  total: 2,
  hits: [
    {
      eventId: 'ev-2',
      kind: 'player',
      chapterOrdinal: 1,
      chapterTitle: 'The Lamp Room',
      snippet: [
        { text: 'I light the ', mark: false },
        { text: 'lamp', mark: true },
        { text: '.', mark: false },
      ],
    },
    {
      eventId: 'ev-3',
      kind: 'assistant',
      chapterOrdinal: 1,
      chapterTitle: 'The Lamp Room',
      snippet: [
        { text: 'The ', mark: false },
        { text: 'lamp', mark: true },
        { text: ' hums like a hive.', mark: false },
      ],
    },
  ],
};

const mark = (label: string): BookmarkDto => ({
  id: 'bm-1',
  routeId: 'route-1',
  eventId: 'ev-3',
  label,
  kind: 'assistant',
  excerpt: 'The lamp hums like a hive.',
  chapterOrdinal: 1,
  chapterTitle: 'The Lamp Room',
  createdAt: '2026-11-06T00:00:03Z',
  updatedAt: '2026-11-06T00:00:03Z',
});

let marks: BookmarkDto[] = [];

beforeEach(() => {
  invoke.mockReset();
  marks = [];
  useUiStore.setState({ drafts: {} });
  invoke.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
    if (cmd === 'get_route_view') return fakeRouteView(history);
    if (cmd === 'search_route') return results;
    if (cmd === 'list_bookmarks') return marks;
    if (cmd === 'add_bookmark') {
      marks = [mark('The lamp hums like a hive.')];
      return marks[0];
    }
    if (cmd === 'rename_bookmark') {
      marks = [mark(args.label as string)];
      return marks[0];
    }
    if (cmd === 'delete_bookmark') {
      marks = [];
      return null;
    }
    throw { code: 'NOT_FOUND', message: `unknown ${cmd}` };
  });
});

function block(eventId: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-event-id="${eventId}"]`);
  if (!el) throw new Error(`no event ${eventId}`);
  return el;
}

describe('Story search', () => {
  it('Ctrl+F searches the route and shows the chosen place', async () => {
    render(<ReaderScreen routeId="route-1" />);
    await screen.findByText('The lamp hums like a hive.');
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true });
    const dialog = await screen.findByRole('dialog', { name: 'Story search' });
    const input = within(dialog).getByLabelText('Search Main');
    expect(input).toHaveFocus();

    await userEvent.type(input, 'lamp{Enter}');
    expect(invoke).toHaveBeenCalledWith('search_route', { routeId: 'route-1', query: 'lamp' });
    expect(await within(dialog).findByRole('status')).toHaveTextContent(
      '2 places on Main match “lamp”.',
    );
    const list = within(dialog).getByRole('list', { name: 'Search results' });
    const hits = within(list).getAllByRole('button');
    expect(hits).toHaveLength(2);
    expect(hits[0]).toHaveTextContent('Chapter 1: The Lamp Room · Sam Ashby');
    expect(hits[1]).toHaveTextContent('Chapter 1: The Lamp Room · Story');
    expect(hits[1]!.querySelector('mark')).toHaveTextContent('lamp');

    await userEvent.click(hits[1]!);
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(block('ev-3')).toHaveFocus());
    expect(block('ev-3')).toHaveClass('event-focus');

    // The last search is still there when the panel opens again.
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    const again = await screen.findByRole('dialog', { name: 'Story search' });
    expect(within(again).getByLabelText('Search Main')).toHaveValue('lamp');
    expect(within(again).getAllByRole('listitem').length).toBeGreaterThanOrEqual(2);
  });

  it('bookmarks a reply, then goes to, renames and removes it', async () => {
    render(<ReaderScreen routeId="route-1" />);
    await screen.findByText('The lamp hums like a hive.');
    await userEvent.click(within(block('ev-3')).getByRole('button', { name: 'Bookmark' }));
    expect(invoke).toHaveBeenCalledWith('add_bookmark', {
      storyId: 'story-1',
      routeId: 'route-1',
      eventId: 'ev-3',
      label: null,
    });
    const pressed = await within(block('ev-3')).findByRole('button', { name: 'Bookmarked' });
    expect(pressed).toHaveAttribute('aria-pressed', 'true');
    expect(within(block('ev-2')).getByRole('button', { name: 'Bookmark' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    // Pause menu -> Story search lists it.
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Story search' }));
    let dialog = await screen.findByRole('dialog', { name: 'Story search' });
    const list = within(dialog).getByRole('list', { name: 'Bookmarks on Main' });
    expect(list).toHaveTextContent('The lamp hums like a hive.');
    expect(list).toHaveTextContent('Chapter 1: The Lamp Room · Story');
    await userEvent.click(
      within(list).getByRole('button', { name: 'Go to bookmark The lamp hums like a hive.' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(block('ev-3')).toHaveFocus());

    // Rename, then remove.
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    dialog = await screen.findByRole('dialog', { name: 'Story search' });
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Rename bookmark The lamp hums like a hive.' }),
    );
    const name = within(dialog).getByLabelText('Bookmark name');
    await userEvent.clear(name);
    await userEvent.type(name, 'The hum{Enter}');
    expect(invoke).toHaveBeenCalledWith('rename_bookmark', {
      storyId: 'story-1',
      bookmarkId: 'bm-1',
      label: 'The hum',
    });
    await userEvent.click(
      await within(dialog).findByRole('button', { name: 'Remove bookmark The hum' }),
    );
    expect(invoke).toHaveBeenCalledWith('delete_bookmark', {
      storyId: 'story-1',
      bookmarkId: 'bm-1',
    });
    expect(await within(dialog).findByText(/No bookmarks yet/)).toBeInTheDocument();
  });

  it('pressing Bookmarked again removes the bookmark', async () => {
    marks = [mark('The hum')];
    render(<ReaderScreen routeId="route-1" />);
    const pressed = await within(await waitFor(() => block('ev-3'))).findByRole('button', {
      name: 'Bookmarked',
    });
    await userEvent.click(pressed);
    expect(invoke).toHaveBeenCalledWith('delete_bookmark', {
      storyId: 'story-1',
      bookmarkId: 'bm-1',
    });
    expect(await within(block('ev-3')).findByRole('button', { name: 'Bookmark' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('explains a search that finds nothing', async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_route_view') return fakeRouteView(history);
      if (cmd === 'list_bookmarks') return [];
      if (cmd === 'search_route') return { ...results, query: 'ferry', total: 0, hits: [] };
      throw { code: 'NOT_FOUND', message: cmd };
    });
    render(<ReaderScreen routeId="route-1" />);
    await screen.findByText('The lamp hums like a hive.');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    const dialog = await screen.findByRole('dialog', { name: 'Story search' });
    await userEvent.type(within(dialog).getByLabelText('Search Main'), 'ferry{Enter}');
    expect(await within(dialog).findByRole('status')).toHaveTextContent(
      'Nothing on Main matches “ferry”.',
    );
    expect(within(dialog).queryByRole('list', { name: 'Search results' })).toBeNull();
  });
});

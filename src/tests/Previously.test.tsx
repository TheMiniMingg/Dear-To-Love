// Previously…: the card that greets a player who comes back to a story.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventDto, StoryMemory } from '../types';
import { fakeRouteView } from './fakeBackend';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  Channel: class {
    onmessage: (m: unknown) => void = () => undefined;
  },
}));

import { ReaderScreen } from '../features/reader/ReaderScreen';
// The test setup turns the card off for every other test; here is the real gate.
import { shouldShowPreviously as gate } from '../features/reader/PreviouslyCard';
import { useUiStore } from '../app/store';

const actual = await vi.importActual<typeof import('../features/reader/PreviouslyCard')>(
  '../features/reader/PreviouslyCard',
);

const ev = (id: string, parent: string, kind: 'player' | 'assistant', text: string, at: string) =>
  ({
    id,
    originRouteId: 'route-1',
    parentEventId: parent,
    generationRunId: null,
    createdAt: at,
    kind,
    payload: { text },
  }) as EventDto;

const played = () =>
  fakeRouteView([
    ev('ev-2', 'ev-1', 'player', 'I open the letter.', '2026-11-06T00:01:00Z'),
    ev(
      'ev-3',
      'ev-2',
      'assistant',
      'The seal breaks. Inside, one line: *come alone*.',
      '2026-11-06T00:02:00Z',
    ),
    ev('ev-4', 'ev-3', 'player', 'I read it again.', '2026-11-06T00:03:00Z'),
    ev(
      'ev-5',
      'ev-4',
      'assistant',
      'The words do not change. Mara is watching you.',
      '2026-11-06T00:04:00Z',
    ),
  ]);

const memory: StoryMemory = {
  routeId: 'route-1',
  turns: 2,
  summary: {
    text: 'Sam found an unsigned letter in the lamp room and opened it.',
    coveredTurns: 2,
    createdAt: '2026-11-06T00:05:00Z',
  },
  recaps: [],
  recapsRead: 1,
  recapsBriefed: 0,
  firstSummaryAfter: 16,
};

describe('when the card is shown', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('greets a story with some play behind it, left a while ago', () => {
    const view = played();
    const later = Date.parse('2026-11-06T00:04:00Z') + actual.AWAY_MS;
    expect(actual.shouldShowPreviously(view, later)).toBe(true);
    // Just left: no greeting.
    expect(actual.shouldShowPreviously(view, later - 60_000)).toBe(false);
    // A reply on the way, or barely any story yet: no greeting either.
    expect(
      actual.shouldShowPreviously(
        { ...view, awaitingReply: { inputEventId: 'ev-4', activeRun: null, lastRun: null } },
        later,
      ),
    ).toBe(false);
    expect(actual.shouldShowPreviously(fakeRouteView(view.history.slice(1, 4)), later)).toBe(false);
    // Turned off: never.
    actual.setPreviouslyEnabled(false);
    expect(actual.shouldShowPreviously(view, later)).toBe(false);
    expect(localStorage.getItem('dtl.previously')).toBe('off');
    actual.setPreviouslyEnabled(true);
    expect(actual.shouldShowPreviously(view, later)).toBe(true);
  });

  it('cuts an excerpt at a sentence, else a word, and leaves short text alone', () => {
    expect(actual.excerpt('Short.  Two lines\nhere.')).toBe('Short. Two lines here.');
    const long = `${'The lamp hums. '.repeat(50)}End`;
    const cut = actual.excerpt(long, 100);
    expect(cut.endsWith('.…')).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(101);
    const words = actual.excerpt('word '.repeat(40), 100);
    expect(words.endsWith('word…')).toBe(true);
  });
});

describe('the Previously card in the reader', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    invoke.mockReset();
    useUiStore.setState({ drafts: {} });
    vi.mocked(gate).mockReturnValue(true);
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_route_view') return played();
      if (cmd === 'get_story_memory') return memory;
      if (cmd === 'list_bookmarks') return [];
      throw { code: 'NOT_FOUND', message: cmd };
    });
  });
  afterEach(() => {
    vi.mocked(gate).mockReturnValue(false);
  });

  it('shows the story so far and the last reply, and can stay away for good', async () => {
    render(<ReaderScreen routeId="route-1" />);
    const card = await screen.findByRole('dialog', { name: 'Previously in The Unsigned Letter' });
    expect(card).toHaveTextContent('Chapter 1: The Lamp Room');
    expect(card).toHaveTextContent('The lamp room');
    expect(await within(card).findByText('The story so far')).toBeInTheDocument();
    expect(within(card).getByText(memory.summary!.text)).toBeInTheDocument();
    expect(within(card).getByText('Where you left off')).toBeInTheDocument();
    expect(
      within(card).getByText('The words do not change. Mara is watching you.'),
    ).toBeInTheDocument();
    // Keep reading lands on the composer.
    expect(within(card).getByRole('button', { name: 'Keep reading' })).toHaveFocus();

    await userEvent.click(
      within(card).getByRole('checkbox', { name: 'Show this when I come back to a story' }),
    );
    await userEvent.click(within(card).getByRole('button', { name: 'Keep reading' }));
    expect(screen.queryByRole('dialog', { name: 'Previously in The Unsigned Letter' })).toBeNull();
    expect(localStorage.getItem('dtl.previously')).toBe('off');
    expect(sessionStorage.getItem('dtl.previously.route-1')).toBe('1');
    expect(screen.getByLabelText('What do you do?')).toBeInTheDocument();
  });

  it('falls back to the newest chapter recap, and opens Story memory', async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_route_view') return played();
      if (cmd === 'get_story_memory')
        return {
          ...memory,
          summary: undefined,
          recaps: [
            { ordinal: 1, title: 'The Lamp Room', text: 'A letter came by the evening ferry.' },
          ],
        };
      if (cmd === 'list_bookmarks') return [];
      if (cmd === 'list_memory_notes') return [];
      throw { code: 'NOT_FOUND', message: cmd };
    });
    render(<ReaderScreen routeId="route-1" />);
    const card = await screen.findByRole('dialog', { name: 'Previously in The Unsigned Letter' });
    expect(await within(card).findByText('Last chapter')).toBeInTheDocument();
    expect(within(card).getByText('A letter came by the evening ferry.')).toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: 'Story memory' }));
    expect(await screen.findByRole('dialog', { name: 'Story memory' })).toBeVisible();
    // Closed once, it does not come back for this story until the app restarts.
    expect(sessionStorage.getItem('dtl.previously.route-1')).toBe('1');
  });
});

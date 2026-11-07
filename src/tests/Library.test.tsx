// The library: several stories at once, each opening where it was left.
import { render, screen, waitFor } from '@testing-library/react';
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

import { useUiStore } from '../app/store';
import { LibraryScreen } from '../features/library/LibraryScreen';
import { ReaderRail } from '../features/reader/ReaderRail';

const story = (id: string, title: string, writing = false): StorySummary => ({
  id,
  title,
  description: '',
  createdAt: '2026-11-06T00:00:00Z',
  updatedAt: '2026-11-06T00:00:00Z',
  routeCount: 1,
  mainRouteId: `${id}-main`,
  lastRouteId: `${id}-main`,
  coverAssetId: null,
  writing,
  genres: [],
  chapter: 1,
  turns: 0,
  lastReply: null,
});

beforeEach(() => {
  invoke.mockReset();
  useUiStore.setState({ drafts: {}, screen: { name: 'library' }, history: [] });
});

describe('Several stories at once', () => {
  it('shows which story is still writing a reply, until it is done', async () => {
    let calls = 0;
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'list_stories') {
        calls += 1;
        return [story('s1', 'The Shifting Deep', calls < 2), story('s2', 'Last Free Radio')];
      }
      return null;
    });
    render(<LibraryScreen />);
    expect(await screen.findByText('Writing a reply…')).toBeInTheDocument();
    // The library looks again on its own and the note goes once the reply is in.
    await waitFor(() => expect(screen.queryByText('Writing a reply…')).not.toBeInTheDocument(), {
      timeout: 3000,
    });
    expect(screen.getByText('Last Free Radio')).toBeInTheDocument();
  });

  it('goes back to the library from beside the story in one click', async () => {
    useUiStore.setState({ screen: { name: 'reader', routeId: 's1-main' } });
    render(<ReaderRail storyId="s1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Stories' }));
    expect(useUiStore.getState().screen).toEqual({ name: 'library' });
  });
});

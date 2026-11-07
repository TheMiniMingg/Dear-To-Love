// What the story remembers, shown so a reader can see it survives a new storyteller.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RouteView, StoryMemory } from '../types';
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

const remembered: StoryMemory = {
  routeId: 'route-1',
  turns: 20,
  summary: {
    text: 'Sam climbed the tower and found the unsigned letter.',
    coveredTurns: 8,
    writtenBy: { label: 'Cloud model', modelId: 'story-model' },
    createdAt: '2026-11-06T10:00:00Z',
  },
  recaps: [{ ordinal: 1, title: 'The Lamp Room', text: 'The lamp was lit at last.' }],
  recapsRead: 10,
  recapsBriefed: 40,
  firstSummaryAfter: 16,
};

function withState(view: RouteView): RouteView {
  const s = view.state.state;
  s.characters.mara = { ...s.characters.pc!, id: 'mara', name: 'Mara' };
  s.knownFacts = [
    { id: 'f1', text: 'The letter is in Mara’s hand.', knownBy: ['pc', 'mara'], confirmed: true },
    { id: 'f2', text: 'A guess not yet confirmed.', knownBy: [], confirmed: false },
  ];
  s.relationships = [{ fromId: 'pc', toId: 'mara', label: 'old friends', status: 'wary' }];
  s.openThreads = ['Who wrote the letter?'];
  return view;
}

async function openMemory(memory: StoryMemory | Error, view = withState(fakeRouteView())) {
  invoke.mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case 'get_route_view':
        return view;
      case 'get_story_memory':
        if (memory instanceof Error) throw { code: 'INTERNAL', message: memory.message };
        return memory;
      case 'list_connections':
        return [];
      case 'get_storyteller':
        return view.storyteller;
      default:
        throw { code: 'NOT_FOUND', message: cmd };
    }
  });
  render(<ReaderScreen routeId="route-1" />);
  await userEvent.click(await screen.findByRole('button', { name: 'Menu' }));
  await userEvent.click(screen.getByRole('button', { name: 'Story memory' }));
  return screen.findByRole('dialog', { name: 'Story memory' });
}

describe('Story memory', () => {
  beforeEach(() => {
    invoke.mockReset();
    useUiStore.setState({ screen: { name: 'reader', routeId: 'route-1' }, history: [] });
  });

  it('shows the summary, chapter recaps and facts the storyteller reads', async () => {
    const dialog = await openMemory(remembered);
    expect(invoke).toHaveBeenCalledWith('get_story_memory', { routeId: 'route-1' });
    expect(within(dialog).getByText(/None of it is kept by an AI service/)).toBeInTheDocument();
    expect(
      await within(dialog).findByText('Sam climbed the tower and found the unsigned letter.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/Covers turns 1 to 8 of 20/)).toHaveTextContent(
      'reads the 12 newer turns word for word. Written by Cloud model (story-model)',
    );
    expect(within(dialog).getByText('Chapter 1: The Lamp Room')).toBeInTheDocument();
    expect(within(dialog).getByText('The lamp was lit at last.')).toBeInTheDocument();

    const facts = within(dialog).getByRole('list', { name: 'Facts' });
    expect(facts).toHaveTextContent('The letter is in Mara’s hand. (known to Sam Ashby, Mara)');
    expect(facts).not.toHaveTextContent('not yet confirmed');
    expect(within(dialog).getByRole('list', { name: 'Relationships' })).toHaveTextContent(
      'Sam Ashby → Mara: old friends (wary)',
    );
    expect(within(dialog).getByRole('list', { name: 'Open threads' })).toHaveTextContent(
      'Who wrote the letter?',
    );
  });

  it('leads to the storyteller and back', async () => {
    const dialog = await openMemory(remembered);
    expect(within(dialog).getByText(/Now writing:/)).toHaveTextContent(
      'Now writing: Offline storyteller',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Change storyteller' }));
    const teller = await screen.findByRole('dialog', { name: 'Storyteller' });
    await userEvent.click(
      within(teller).getByRole('button', { name: 'See what the story remembers' }),
    );
    const again = await screen.findByRole('dialog', { name: 'Story memory' });
    expect(within(again).getByRole('button', { name: 'Edit in Story details' })).toBeEnabled();
  });

  it('explains when no summary is needed yet', async () => {
    const view = fakeRouteView();
    const dialog = await openMemory(
      { ...remembered, turns: 3, summary: undefined, recaps: [] },
      view,
    );
    expect(
      await within(dialog).findByText(/Not needed yet: the storyteller still reads all 3 turns/),
    ).toHaveTextContent('After 16 turns, the earlier ones are summarized here.');
    expect(within(dialog).getByText(/When you end a chapter/)).toBeInTheDocument();
    expect(within(dialog).getByText('None yet.')).toBeInTheDocument();
  });

  it('says so when the memory cannot be read, and still shows the facts', async () => {
    const dialog = await openMemory(new Error('disk trouble'));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/disk trouble/i);
    expect(within(dialog).getByRole('list', { name: 'Open threads' })).toBeInTheDocument();
  });
});

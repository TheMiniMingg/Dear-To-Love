// Details the storyteller fills in as it writes, each one the player's to
// change: open threads (with a list to tick off in Story memory), a card for
// someone new, ideas for the next move above the box, where and when the
// story is, and a save name to start from.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventDto, RouteView, StateEdit, StoryMemory, StoryStateV1 } from '../types';
import { fakeRouteView } from './fakeBackend';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  Channel: class {
    onmessage: (m: unknown) => void = () => undefined;
  },
}));

import { ReaderScreen } from '../features/reader/ReaderScreen';
import { RichText } from '../features/reader/RichText';
import { newCharacters, nextMoves, threadChanges } from '../features/reader/messages';
import { joinCast, useSkippedCharacters } from '../features/reader/NewCharacterCard';
import { diffState } from '../features/reader/stateDiff';
import { useUiStore } from '../app/store';

const ev = (id: string, parent: string, kind: 'player' | 'assistant', text: string): EventDto =>
  ({
    id,
    originRouteId: 'route-1',
    parentEventId: parent,
    generationRunId: null,
    createdAt: '2026-11-07T00:00:01Z',
    kind,
    payload: { text },
  }) as EventDto;

const reply = [
  '<scene place="The pier" time="Dawn"/>',
  'Gulls wheel over the boats. A woman in a yellow coat waves from the ferry.',
  '<thread>Find out who sent the letter</thread>',
  '<thread done>Meet Mara at the harbor</thread>',
  '<character name="Rowan Ellis" role="ferry pilot" pronouns="she/her" age="40s">Weathered, quick to laugh, a yellow coat.</character>',
  '<character name="Sam">Already in the story.</character>',
  '<next>Wave back at Rowan</next>',
  '<next>Ask about the letter</next>',
].join('\n');

const memory: StoryMemory = {
  routeId: 'route-1',
  turns: 2,
  recaps: [],
  recapsRead: 10,
  recapsBriefed: 40,
  firstSummaryAfter: 16,
};

function viewWith(
  opts: { narration?: Partial<StoryStateV1['narration']>; open?: string[]; done?: string[] } = {},
): RouteView {
  const v = fakeRouteView([
    ev('ev-2', 'ev-1', 'player', 'I walk down to the pier.'),
    ev('ev-3', 'ev-2', 'assistant', reply),
  ]);
  const s = v.state.state;
  s.schemaVersion = 1;
  s.world = { era: 'Present day', setting: 'A harbor town', description: '', rules: [] };
  s.visualRefs = {};
  s.characters = {
    pc: {
      id: 'pc',
      name: 'Sam Ashby',
      control: 'player',
      personality: [],
      goals: [],
      abilities: [],
    },
  };
  s.narration = {
    perspective: 'second',
    detail: 'balanced',
    tone: 'Warm',
    pacing: 'normal',
    ...opts.narration,
  };
  s.scene = { location: 'The pier', time: 'Dawn', summary: '', participantIds: ['pc'] };
  s.openThreads = opts.open ?? ['Find out who sent the letter'];
  s.doneThreads = opts.done ?? ['Meet Mara at the harbor'];
  return v;
}

let edits: { changes: StateEdit[]; note: string | null; expectedHeadId: string }[] = [];

function setup(view: RouteView) {
  edits = [];
  invoke.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
    switch (cmd) {
      case 'get_route_view':
        return view;
      case 'get_story_memory':
        return memory;
      case 'list_connections':
        return [];
      case 'list_bookmarks':
        return [];
      case 'list_saves':
        return [];
      case 'get_storyteller':
        return view.storyteller;
      case 'edit_story_details': {
        const edit = args as (typeof edits)[number];
        edits.push(edit);
        // Thread lists change as asked, so the reader shows the result.
        const next = structuredClone(view);
        for (const c of edit.changes) {
          if (c.op === 'setOpenThreads') next.state.state.openThreads = c.openThreads;
          if (c.op === 'setDoneThreads') next.state.state.doneThreads = c.doneThreads;
        }
        return next;
      }
      default:
        throw { code: 'NOT_FOUND', message: cmd };
    }
  });
  return render(<ReaderScreen routeId="route-1" />);
}

beforeEach(() => {
  invoke.mockReset();
  localStorage.clear();
  useSkippedCharacters.setState({ skipped: {} });
  useUiStore.setState({ screen: { name: 'reader', routeId: 'route-1' }, history: [], drafts: {} });
});

describe('what a reply suggests', () => {
  it('is read from its tags and never shown as story text', () => {
    expect(threadChanges(reply)).toEqual([
      { done: false, text: 'Find out who sent the letter' },
      { done: true, text: 'Meet Mara at the harbor' },
    ]);
    expect(newCharacters(reply).map((c) => c.name)).toEqual(['Rowan Ellis', 'Sam']);
    expect(newCharacters(reply)[0]).toEqual({
      name: 'Rowan Ellis',
      role: 'ferry pilot',
      pronouns: 'she/her',
      age: '40s',
      appearance: 'Weathered, quick to laugh, a yellow coat.',
    });
    expect(nextMoves(reply)).toEqual(['Wave back at Rowan', 'Ask about the letter']);
    // Still being written: nothing yet.
    expect(nextMoves('<next>Wave ba')).toEqual([]);
    expect(newCharacters('<character name="Rowan">Weath')).toEqual([]);
  });

  it('shows the place and time heading only when the story has headings on', () => {
    const { rerender } = render(<RichText text={reply} playerName="Sam" />);
    expect(screen.getByRole('heading', { name: 'The pier — Dawn' })).toBeInTheDocument();
    rerender(<RichText text={reply} playerName="Sam" sceneHeadings={false} />);
    expect(screen.queryByRole('heading', { name: 'The pier — Dawn' })).toBeNull();
    expect(screen.getByText(/Gulls wheel over the boats/)).toBeInTheDocument();
    expect(screen.queryByText(/Wave back at Rowan|Already in the story/)).toBeNull();
  });
});

describe('Threads under a reply', () => {
  it('name what the reply opened and settled, and can be taken back', async () => {
    setup(viewWith());
    const line = (await screen.findByText('Memory updated')).closest('p')!;
    expect(
      within(line).getByLabelText('New thread: Find out who sent the letter'),
    ).toBeInTheDocument();
    expect(
      within(line).getByLabelText('Thread settled: Meet Mara at the harbor'),
    ).toBeInTheDocument();
    await userEvent.click(within(line).getByRole('button', { name: 'Undo' }));
    expect(invoke).toHaveBeenCalledWith(
      'undo_reply_notes',
      expect.objectContaining({
        assistantEventId: 'ev-3',
        note: 'took back Find out who sent the letter, Meet Mara at the harbor',
      }),
    );
  });

  it('offer no Undo once the player changed them', async () => {
    setup(viewWith({ open: ['Find the lighthouse key'], done: [] }));
    const line = (await screen.findByText('Memory updated')).closest('p')!;
    expect(within(line).queryByRole('button', { name: 'Undo' })).toBeNull();
  });
});

async function openThreads() {
  await userEvent.click(await screen.findByRole('button', { name: 'Menu' }));
  await userEvent.click(screen.getByRole('button', { name: 'Story memory' }));
  const dialog = await screen.findByRole('dialog', { name: 'Story memory' });
  return within(dialog).getByRole('region', { name: 'Threads to follow' });
}

describe('Threads to follow in Story memory', () => {
  it('ticks one off, and reopens a settled one', async () => {
    setup(viewWith());
    const log = await openThreads();
    expect(within(log).getByRole('list', { name: 'Open threads' })).toHaveTextContent(
      'Find out who sent the letter',
    );
    await userEvent.click(
      within(log).getByRole('button', { name: 'Settle: Find out who sent the letter' }),
    );
    expect(edits.at(-1)).toMatchObject({
      expectedHeadId: 'ev-3',
      note: 'Find out who sent the letter',
      changes: [
        { op: 'setOpenThreads', openThreads: [] },
        {
          op: 'setDoneThreads',
          doneThreads: ['Meet Mara at the harbor', 'Find out who sent the letter'],
        },
      ],
    });
    // Its button is gone with it; the focus stays in the list.
    await waitFor(() =>
      expect(within(log).getByRole('heading', { name: 'Threads to follow' })).toHaveFocus(),
    );

    expect(within(log).getByText('Nothing open right now.')).toBeInTheDocument();
    await userEvent.click(within(log).getByText('Settled (2)'));
    await userEvent.click(
      within(log).getByRole('button', { name: 'Reopen Meet Mara at the harbor' }),
    );
    expect(edits.at(-1)?.changes).toEqual([
      { op: 'setOpenThreads', openThreads: ['Meet Mara at the harbor'] },
      { op: 'setDoneThreads', doneThreads: ['Find out who sent the letter'] },
    ]);
  });

  it('adds, rewords and removes threads, one of each at a time', async () => {
    setup(viewWith());
    const log = await openThreads();
    const box = within(log).getByLabelText('New thread');
    await userEvent.type(box, 'find out who sent the letter.{Enter}');
    expect(within(log).getByRole('alert')).toHaveTextContent('That thread is already open.');
    expect(edits).toHaveLength(0);

    await userEvent.clear(box);
    await userEvent.type(box, '  Pay   Rowan back {Enter}');
    expect(edits.at(-1)?.changes).toEqual([
      {
        op: 'setOpenThreads',
        openThreads: ['Find out who sent the letter', 'Pay Rowan back'],
      },
      { op: 'setDoneThreads', doneThreads: ['Meet Mara at the harbor'] },
    ]);

    await userEvent.click(
      within(log).getByRole('button', { name: 'Change Find out who sent the letter' }),
    );
    const edit = within(log).getByLabelText('Thread');
    await userEvent.clear(edit);
    await userEvent.type(edit, 'Find out who sealed the letter{Enter}');
    expect(edits.at(-1)?.changes).toEqual([
      { op: 'setOpenThreads', openThreads: ['Find out who sealed the letter', 'Pay Rowan back'] },
    ]);

    await userEvent.click(within(log).getByRole('button', { name: 'Remove Pay Rowan back' }));
    expect(edits.at(-1)?.changes).toEqual([
      { op: 'setOpenThreads', openThreads: ['Find out who sealed the letter'] },
    ]);
  });

  it('says who keeps the list when the player keeps the notes', async () => {
    setup(viewWith({ narration: { manualMemory: true } }));
    const log = await openThreads();
    expect(within(log).getByText(/You keep this list/)).toBeInTheDocument();
  });
});

describe('Someone new', () => {
  it('offers a card for a named newcomer, not for someone in the cast', async () => {
    setup(viewWith());
    const card = await screen.findByRole('region', { name: 'Someone new: Rowan Ellis' });
    expect(card).toHaveTextContent('Rowan Ellis · ferry pilot, she/her, 40s');
    expect(card).toHaveTextContent('Weathered, quick to laugh, a yellow coat.');
    expect(screen.queryByRole('region', { name: 'Someone new: Sam' })).toBeNull();

    await userEvent.click(within(card).getByRole('button', { name: 'Add to the cast' }));
    expect(edits.at(-1)).toEqual({
      storyId: 'story-1',
      routeId: 'route-1',
      expectedHeadId: 'ev-3',
      note: 'added Rowan Ellis to the cast',
      changes: [
        {
          op: 'upsertCharacter',
          character: {
            id: 'custom:npc-1',
            name: 'Rowan Ellis',
            control: 'npc',
            role: 'ferry pilot',
            pronouns: 'she/her',
            age: '40s',
            appearance: 'Weathered, quick to laugh, a yellow coat.',
            personality: [],
            goals: [],
            abilities: [],
          },
        },
        {
          op: 'setScene',
          scene: {
            location: 'The pier',
            time: 'Dawn',
            summary: '',
            participantIds: ['pc', 'custom:npc-1'],
          },
        },
      ],
    });
    expect(await screen.findByText(/Rowan Ellis joined the cast/)).toBeInTheDocument();
  });

  it('can be changed first', async () => {
    setup(viewWith());
    const card = await screen.findByRole('region', { name: 'Someone new: Rowan Ellis' });
    await userEvent.click(within(card).getByRole('button', { name: 'Change first' }));
    const name = within(card).getByRole('textbox', { name: /Name/ });
    await userEvent.clear(name);
    await userEvent.type(name, 'Ro');
    await userEvent.clear(within(card).getByLabelText('Role'));
    await userEvent.click(within(card).getByRole('button', { name: 'Add to the cast' }));
    const added = edits.at(-1)?.changes[0];
    expect(added).toMatchObject({ op: 'upsertCharacter', character: { name: 'Ro' } });
    expect(added?.op === 'upsertCharacter' && added.character.role).toBeUndefined();
  });

  it('stays away after Not now, on this computer', async () => {
    const first = setup(viewWith());
    const card = await screen.findByRole('region', { name: 'Someone new: Rowan Ellis' });
    await userEvent.click(within(card).getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('region', { name: 'Someone new: Rowan Ellis' })).toBeNull();
    expect(JSON.parse(localStorage.getItem('dtl.skippedCharacters') ?? '{}')).toEqual({
      'story-1': ['rowan ellis'],
    });
    first.unmount();
    setup(viewWith());
    expect(await screen.findByText('Memory updated')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Someone new: Rowan Ellis' })).toBeNull();
  });

  it('will not add someone under 18 to an adults-only story', async () => {
    const v = viewWith({ narration: { rating: 'explicit' } });
    v.history[2] = ev('ev-3', 'ev-2', 'assistant', reply.replace('age="40s"', 'age="17"'));
    setup(v);
    const card = await screen.findByRole('region', { name: 'Someone new: Rowan Ellis' });
    expect(card).toHaveTextContent('Rowan Ellis is under 18.');
    expect(within(card).getByRole('button', { name: 'Add to the cast' })).toBeDisabled();
  });

  it('joins under an id no one has, in the scene now', () => {
    const s = viewWith().state.state;
    s.characters['custom:npc-1'] = { ...s.characters.pc!, id: 'custom:npc-1', control: 'npc' };
    const changes = joinCast(s, {
      name: ' Rowan ',
      role: '',
      pronouns: '',
      age: '',
      appearance: '',
    });
    expect(changes).toEqual([
      {
        op: 'upsertCharacter',
        character: {
          id: 'custom:npc-2',
          name: 'Rowan',
          control: 'npc',
          personality: [],
          goals: [],
          abilities: [],
        },
      },
      { op: 'setScene', scene: { ...s.scene, participantIds: ['pc', 'custom:npc-2'] } },
    ]);
  });
});

describe('Ideas for the next move', () => {
  it('sit above the empty box and put the one picked in it', async () => {
    setup(viewWith());
    const ideas = await screen.findByRole('group', { name: 'Ideas for what to do next' });
    expect(
      within(ideas)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Wave back at Rowan', 'Ask about the letter']);
    await userEvent.click(within(ideas).getByRole('button', { name: 'Ask about the letter' }));
    const box = screen.getByLabelText('What do you do?');
    expect(box).toHaveValue('Ask about the letter');
    // Out of the way while the box has words in it.
    expect(screen.queryByRole('group', { name: 'Ideas for what to do next' })).toBeNull();
    await userEvent.clear(box);
    expect(screen.getByRole('group', { name: 'Ideas for what to do next' })).toBeInTheDocument();
    // Only for actions, not texts or thoughts.
    await userEvent.click(screen.getByRole('radio', { name: 'Think' }));
    expect(screen.queryByRole('group', { name: 'Ideas for what to do next' })).toBeNull();
  });

  it('are not offered when the story turned them off', async () => {
    setup(viewWith({ narration: { noSuggestions: true } }));
    expect(await screen.findByText(/Gulls wheel over the boats/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Ideas for what to do next' })).toBeNull();
  });
});

describe('Where and when', () => {
  it('shows the place and time the story is at, and starts a save name from them', async () => {
    setup(viewWith());
    expect(await screen.findByText('Dawn', { selector: '.scene-time' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save / Load' }));
    expect(await screen.findByLabelText('Save name')).toHaveValue('The pier, Dawn');
  });

  it('are story details like the others', () => {
    const before = viewWith().state.state;
    const after = structuredClone(before);
    after.scene = { ...after.scene, time: 'Noon' };
    after.doneThreads = [];
    after.narration = { ...after.narration, noSuggestions: true };
    const { changes, lines } = diffState(before, after);
    expect(changes).toContainEqual({ op: 'setScene', scene: after.scene });
    expect(changes).toContainEqual({ op: 'setDoneThreads', doneThreads: [] });
    expect(changes).toContainEqual({
      op: 'setNarration',
      narration: expect.objectContaining({ noSuggestions: true }),
    });
    expect(lines).toContainEqual({ what: 'Scene · When', before: 'Dawn', after: 'Noon' });
    expect(lines).toContainEqual({
      what: 'Narration · Suggest what you could do next',
      before: 'On',
      after: 'Off',
    });
  });
});

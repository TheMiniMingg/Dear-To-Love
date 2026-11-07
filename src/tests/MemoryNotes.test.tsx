// Memory notes: the storyteller notes lasting changes as it writes, the
// reader shows them under the reply (with a way to take them back), and the
// notebook in Story memory lets the player add, change and remove them.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  EventDto,
  MemoryNote,
  RouteView,
  StateEdit,
  StoryMemory,
  StoryStateV1,
} from '../types';
import { fakeRouteView } from './fakeBackend';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  Channel: class {
    onmessage: (m: unknown) => void = () => undefined;
  },
}));

import { ReaderScreen } from '../features/reader/ReaderScreen';
import { noteChanges, parseBlocks, plainText } from '../features/reader/messages';
import { diffState } from '../features/reader/stateDiff';
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

const reply = [
  'Erika turns the ring in the lamplight and smiles.',
  '<remember person="Erika">Your girlfriend since chapter 4. Wears the silver ring you gave her.</remember>',
  '<remember item="Silver ring">Given to Erika on the lighthouse stairs.</remember>',
  '<forget place="Old flat"/>',
].join('\n');

const notes: MemoryNote[] = [
  { kind: 'person', name: 'Erika', text: 'Your girlfriend. Wears the silver ring.', chapter: 4 },
  { kind: 'place', name: 'Suburban house', text: 'Two floors, a blue door, a lemon tree.' },
  { kind: 'event', name: 'The ring', text: 'You gave Erika a silver ring.', chapter: 4 },
  { kind: 'event', name: 'First meeting', text: 'You met Erika at the office.', chapter: 1 },
];

const full: StoryStateV1 = {
  schemaVersion: 1,
  playerCharacterId: 'pc',
  world: { era: 'Present day', setting: 'New York', description: '', rules: [] },
  narration: { perspective: 'second', detail: 'balanced', tone: 'Warm', pacing: 'normal' },
  characters: {},
  relationships: [],
  knownFacts: [],
  scene: { location: 'The office', summary: '', participantIds: [] },
  openThreads: [],
  visualRefs: {},
};

const memory: StoryMemory = {
  routeId: 'route-1',
  turns: 2,
  recaps: [],
  recapsRead: 10,
  recapsBriefed: 40,
  firstSummaryAfter: 16,
};

function viewWith(opts: { manual?: boolean; notes?: MemoryNote[] } = {}): RouteView {
  const v = fakeRouteView([
    ev('ev-2', 'ev-1', 'player', 'I give her the ring.'),
    ev('ev-3', 'ev-2', 'assistant', reply),
  ]);
  v.state.state.notes = opts.notes ?? notes;
  if (opts.manual) v.state.state.narration = { ...full.narration, manualMemory: true };
  return v;
}

let edits: { changes: StateEdit[]; note: string | null }[] = [];

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
      case 'get_storyteller':
        return view.storyteller;
      case 'edit_story_details':
        edits.push(args as (typeof edits)[number]);
        return view;
      case 'undo_reply_notes':
        return view;
      default:
        throw { code: 'NOT_FOUND', message: cmd };
    }
  });
  render(<ReaderScreen routeId="route-1" />);
}

async function openNotebook() {
  await userEvent.click(await screen.findByRole('button', { name: 'Menu' }));
  await userEvent.click(screen.getByRole('button', { name: 'Story memory' }));
  const dialog = await screen.findByRole('dialog', { name: 'Story memory' });
  return within(dialog).getByRole('region', { name: 'Notebook' });
}

describe('memory notes in a reply', () => {
  it('are read like Rust reads them, and never shown as story text', () => {
    expect(noteChanges(reply)).toEqual([
      {
        forget: false,
        kind: 'person',
        name: 'Erika',
        text: 'Your girlfriend since chapter 4. Wears the silver ring you gave her.',
      },
      {
        forget: false,
        kind: 'item',
        name: 'Silver ring',
        text: 'Given to Erika on the lighthouse stairs.',
      },
      { forget: true, kind: 'place', name: 'Old flat', text: '' },
    ]);
    expect(noteChanges('<remember kind="thing" name="Key">Opens the gate.</remember>')).toEqual([
      { forget: false, kind: 'item', name: 'Key', text: 'Opens the gate.' },
    ]);
    // Still being written: not a note yet.
    expect(noteChanges('<remember person="Erika">Your girl')).toEqual([]);
    expect(plainText(reply)).toBe('Erika turns the ring in the lamplight and smiles.\n');
    expect(plainText('A <remember fact="x">y</remember> B')).toBe('A B');
    expect(parseBlocks(reply).filter((b) => b.kind === 'prose' && b.text.trim())).toHaveLength(1);
  });
});

describe('Memory updated line', () => {
  beforeEach(() => {
    invoke.mockReset();
    useUiStore.setState({ screen: { name: 'reader', routeId: 'route-1' }, history: [] });
  });

  it('names what the reply noted, opens the notes and can take them back', async () => {
    setup(viewWith());
    expect(
      await screen.findByText('Erika turns the ring in the lamplight and smiles.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Wears the silver ring you gave her/)).not.toBeInTheDocument();
    const line = screen.getByText('Memory updated').closest('p')!;
    expect(within(line).getByText('Erika')).toHaveAttribute(
      'title',
      'Your girlfriend since chapter 4. Wears the silver ring you gave her.',
    );
    expect(within(line).getByText('Silver ring')).toBeInTheDocument();
    expect(within(line).getByText('Forgot Old flat')).toBeInTheDocument();

    await userEvent.click(within(line).getByRole('button', { name: 'Undo' }));
    expect(invoke).toHaveBeenCalledWith('undo_reply_notes', {
      storyId: 'story-1',
      routeId: 'route-1',
      expectedHeadId: 'ev-3',
      assistantEventId: 'ev-3',
      // Only what still stands as the reply left it is taken back.
      note: 'took back Old flat',
    });
    expect(await screen.findByText(/Memory changed/)).toBeInTheDocument();

    await userEvent.click(within(line).getByRole('button', { name: 'See notes' }));
    expect(await screen.findByRole('dialog', { name: 'Story memory' })).toBeInTheDocument();
  });

  it("offers no Undo once none of the reply's notes stand as it left them", async () => {
    setup(
      viewWith({
        notes: [
          { kind: 'person', name: 'Erika', text: 'Changed by the player since.' },
          { kind: 'place', name: 'Old flat', text: 'Back in the story.' },
        ],
      }),
    );
    const line = (await screen.findByText('Memory updated')).closest('p')!;
    expect(within(line).getByRole('button', { name: 'See notes' })).toBeInTheDocument();
    expect(within(line).queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('is not shown when the player keeps the notes by hand', async () => {
    setup(viewWith({ manual: true }));
    expect(
      await screen.findByText('Erika turns the ring in the lamplight and smiles.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Memory updated')).not.toBeInTheDocument();
  });
});

describe('Notebook', () => {
  beforeEach(() => {
    invoke.mockReset();
    useUiStore.setState({ screen: { name: 'reader', routeId: 'route-1' }, history: [] });
  });

  it('lists the notes by kind, with the timeline in chapter order', async () => {
    setup(viewWith());
    const book = await openNotebook();
    expect(book).toHaveTextContent('adds to them as the story goes');
    expect(within(book).getByRole('list', { name: 'People' })).toHaveTextContent(
      'Your girlfriend. Wears the silver ring.',
    );
    expect(within(book).getByRole('list', { name: 'Places' })).toHaveTextContent('Suburban house');
    expect(within(book).queryByRole('list', { name: 'Things' })).not.toBeInTheDocument();
    const timeline = within(within(book).getByRole('list', { name: 'Timeline' })).getAllByRole(
      'listitem',
    );
    expect(timeline.map((li) => li.querySelector('strong')?.textContent)).toEqual([
      'First meeting',
      'The ring',
    ]);
    expect(timeline[0]).toHaveTextContent('Chapter 1');
  });

  it('adds a note the storyteller reads from the next reply on', async () => {
    setup(viewWith());
    const book = await openNotebook();
    await userEvent.click(within(book).getByRole('button', { name: 'Add a note' }));
    const form = within(book).getByRole('form', { name: 'New note' });
    await userEvent.selectOptions(within(form).getByLabelText('Kind'), 'place');
    await userEvent.type(within(form).getByLabelText('Name'), '  Skyscraper   office ');
    await userEvent.type(
      within(form).getByLabelText('What to remember'),
      'Forty floors up, glass walls.',
    );
    await userEvent.click(within(form).getByRole('button', { name: 'Save note' }));
    // Focus stays in the window, so Escape still closes it.
    expect(book).toContainElement(document.activeElement as HTMLElement);
    expect(edits).toEqual([
      {
        storyId: 'story-1',
        routeId: 'route-1',
        expectedHeadId: 'ev-3',
        changes: [
          {
            op: 'upsertNote',
            note: {
              kind: 'place',
              name: 'Skyscraper office',
              text: 'Forty floors up, glass walls.',
            },
          },
        ],
        note: 'Skyscraper office',
      },
    ]);
  });

  it('will not add a second note with the same name', async () => {
    setup(viewWith());
    const book = await openNotebook();
    await userEvent.click(within(book).getByRole('button', { name: 'Add a note' }));
    const form = within(book).getByRole('form', { name: 'New note' });
    await userEvent.type(within(form).getByLabelText('Name'), 'erika');
    await userEvent.type(within(form).getByLabelText('What to remember'), 'Likes tea.');
    await userEvent.click(within(form).getByRole('button', { name: 'Save note' }));
    expect(within(book).getByRole('alert')).toHaveTextContent(
      'People already has a note called erika. Change that one instead.',
    );
    expect(edits).toEqual([]);
  });

  it('changes a note, and renaming it replaces the old one', async () => {
    setup(viewWith());
    const book = await openNotebook();
    await userEvent.click(within(book).getByRole('button', { name: 'Change note: The ring' }));
    const form = within(book).getByRole('form', { name: 'Change note: The ring' });
    expect(within(form).getByLabelText('Chapter')).toHaveValue(4);
    const name = within(form).getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'The silver ring');
    await userEvent.click(within(form).getByRole('button', { name: 'Save note' }));
    expect(document.activeElement).toBe(within(book).getByRole('heading', { name: 'Notebook' }));
    expect(edits[0]!.changes).toEqual([
      { op: 'removeNote', kind: 'event', name: 'The ring' },
      {
        op: 'upsertNote',
        note: {
          kind: 'event',
          name: 'The silver ring',
          text: 'You gave Erika a silver ring.',
          chapter: 4,
        },
      },
    ]);
  });

  it('asks before removing a note', async () => {
    setup(viewWith());
    const book = await openNotebook();
    await userEvent.click(
      within(book).getByRole('button', { name: 'Remove note: Suburban house' }),
    );
    expect(edits).toEqual([]);
    const confirm = within(book).getByRole('group', { name: 'Remove note: Suburban house' });
    expect(confirm).toHaveTextContent('The storyteller will no longer read it.');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Remove' }));
    expect(edits[0]).toMatchObject({
      changes: [{ op: 'removeNote', kind: 'place', name: 'Suburban house' }],
      note: 'removed Suburban house',
    });
  });

  it('says who writes the notes when the player keeps them by hand', async () => {
    setup(viewWith({ manual: true, notes: [] }));
    const book = await openNotebook();
    expect(book).toHaveTextContent('In this story only you write them');
    expect(book).toHaveTextContent('No notes yet. Add the things that must stay true');
  });
});

describe('Keep memory notes option', () => {
  it('is a story detail like the others', () => {
    const before = { ...full, notes };
    const after = { ...before, narration: { ...before.narration, manualMemory: true } };
    const { changes, lines } = diffState(before, after);
    expect(changes).toEqual([
      { op: 'setNarration', narration: expect.objectContaining({ manualMemory: true }) },
    ]);
    expect(lines).toEqual([
      {
        what: 'Narration · Let the storyteller keep memory notes',
        before: 'On',
        after: 'Off',
      },
    ]);
  });
});

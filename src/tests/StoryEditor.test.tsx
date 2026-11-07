// In-story changes (M7): story details apply from now on this route only
// and say so before anything is written (T29); another reply and changing
// an earlier action each start a new route and leave the original alone.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventDto, RouteView, StateEdit, StoryStateV1 } from '../types';
import { diffState } from '../features/reader/stateDiff';
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

const state: StoryStateV1 = {
  schemaVersion: 1,
  playerCharacterId: 'pc',
  world: {
    era: 'Present day',
    setting: 'Wrenmouth',
    description: 'A harbor.',
    rules: ['No magic'],
  },
  narration: { perspective: 'second', detail: 'balanced', tone: 'Warm', pacing: 'normal' },
  characters: {
    pc: {
      id: 'pc',
      name: 'Sam Ashby',
      control: 'player',
      personality: [],
      goals: [],
      abilities: [],
    },
    mara: {
      id: 'mara',
      name: 'Mara Quill',
      control: 'npc',
      role: 'Ferry captain',
      personality: ['wry'],
      goals: [],
      abilities: [],
    },
  },
  relationships: [{ fromId: 'mara', toId: 'pc', label: 'Neighbor', status: 'Curious' }],
  knownFacts: [],
  scene: { location: 'The lamp room', summary: 'Evening.', participantIds: ['pc'] },
  openThreads: ['Who wrote the letter?'],
  visualRefs: {},
};

const action: EventDto = {
  id: 'ev-2',
  originRouteId: 'route-1',
  parentEventId: 'ev-1',
  generationRunId: null,
  createdAt: '2026-11-06T00:00:01Z',
  kind: 'player',
  payload: { text: 'Read the letter' },
};
const reply: EventDto = {
  id: 'ev-3',
  originRouteId: 'route-1',
  parentEventId: 'ev-2',
  generationRunId: 'run-1',
  createdAt: '2026-11-06T00:00:02Z',
  kind: 'assistant',
  payload: { text: 'The ink is still wet.' },
};

function viewWith(events: EventDto[] = [], s: StoryStateV1 = state): RouteView {
  const v = fakeRouteView(events);
  v.state = { ...v.state, state: s };
  return v;
}

describe('Story details', () => {
  beforeEach(() => {
    invoke.mockReset();
    useUiStore.setState({
      drafts: {},
      screen: { name: 'reader', routeId: 'route-1' },
      history: [],
    });
  });

  it('T29: previews what changes, where and from when, then applies', async () => {
    invoke.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
      if (cmd === 'get_route_view') return viewWith();
      if (cmd === 'edit_story_details') {
        const changes = args.changes as StateEdit[];
        const mara = changes[0]?.op === 'upsertCharacter' ? changes[0].character : null;
        return viewWith([], {
          ...state,
          characters: { ...state.characters, ...(mara ? { mara } : {}) },
        });
      }
      throw { code: 'NOT_FOUND', message: `unknown ${cmd}` };
    });
    render(<ReaderScreen routeId="route-1" />);
    await screen.findByLabelText('What do you do?');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(await screen.findByRole('button', { name: 'Story details' }));
    const dialog = await screen.findByRole('dialog', { name: 'Story details' });

    expect(within(dialog).getByRole('button', { name: /Review changes/ })).toBeDisabled();
    await userEvent.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Character' }),
      'mara',
    );
    const role = within(dialog).getByRole('textbox', { name: 'Role' });
    await userEvent.clear(role);
    await userEvent.type(role, 'Harbor master');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Review changes (1)' }));

    const where = within(dialog).getByLabelText('Where this applies');
    expect(where).toHaveTextContent('Main only');
    expect(where).toHaveTextContent('After the start of Chapter 1: The Lamp Room');
    const changes = within(dialog).getByRole('list', { name: 'Changes' });
    expect(changes).toHaveTextContent('Mara Quill · Role Ferry captain → Harbor master');
    expect(invoke).not.toHaveBeenCalledWith('edit_story_details', expect.anything());

    await userEvent.click(within(dialog).getByRole('button', { name: 'Apply from now' }));
    const call = invoke.mock.calls.find((c) => c[0] === 'edit_story_details')?.[1] as {
      changes: StateEdit[];
      note: string;
      expectedHeadId: string;
    };
    expect(call.expectedHeadId).toBe('ev-1');
    expect(call.changes).toEqual([
      { op: 'upsertCharacter', character: { ...state.characters.mara, role: 'Harbor master' } },
    ]);
    expect(call.note).toBe('Mara Quill · Role');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Story details changed');
  });

  it('is unavailable while an action waits for its reply', async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_route_view') return viewWith([action]);
      throw { code: 'NOT_FOUND', message: `unknown ${cmd}` };
    });
    render(<ReaderScreen routeId="route-1" />);
    await screen.findByRole('region', { name: 'Reply needed' });
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(await screen.findByRole('button', { name: 'Story details' })).toBeDisabled();
    expect(screen.getByText(/once the waiting action has its reply/)).toBeInTheDocument();
  });
});

describe('New routes from earlier turns', () => {
  beforeEach(() => {
    invoke.mockReset();
    useUiStore.setState({
      drafts: {},
      screen: { name: 'reader', routeId: 'route-1' },
      history: [],
    });
  });

  function backend() {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_route_view') return viewWith([action, reply]);
      if (cmd === 'regenerate_reply' || cmd === 'edit_action') {
        const v = viewWith([action]);
        v.route = { ...v.route, id: 'route-2', label: 'Alt 1' };
        return { runId: 'run-2', view: v };
      }
      throw { code: 'NOT_FOUND', message: `unknown ${cmd}` };
    });
  }

  it('Another reply explains the new route, then switches to it', async () => {
    backend();
    render(<ReaderScreen routeId="route-1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Another reply' }));
    const dialog = await screen.findByRole('dialog', { name: 'Another reply' });
    expect(dialog).toHaveTextContent('different reply to Read the letter on a new route');
    expect(dialog).toHaveTextContent('Main keeps this reply');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Write another reply' }));
    expect(invoke).toHaveBeenCalledWith('regenerate_reply', {
      storyId: 'story-1',
      routeId: 'route-1',
      assistantEventId: 'ev-3',
    });
    expect(useUiStore.getState().screen).toEqual({ name: 'reader', routeId: 'route-2' });
  });

  it('Change this action works on an answered action', async () => {
    backend();
    render(<ReaderScreen routeId="route-1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Change this action' }));
    const dialog = await screen.findByRole('dialog', { name: 'Change your action' });
    expect(dialog).toHaveTextContent('Main keeps the original and everything after it');
    const box = within(dialog).getByRole('textbox');
    expect(box).toHaveValue('Read the letter');
    await userEvent.clear(box);
    await userEvent.type(box, 'Burn the letter');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send changed action' }));
    expect(invoke).toHaveBeenCalledWith('edit_action', {
      storyId: 'story-1',
      routeId: 'route-1',
      playerEventId: 'ev-2',
      text: 'Burn the letter',
    });
    expect(useUiStore.getState().screen).toEqual({ name: 'reader', routeId: 'route-2' });
  });
});

describe('diffState', () => {
  it('turns edits into the fewest operations and ignores blank entries', () => {
    expect(diffState(state, structuredClone(state)).changes).toEqual([]);
    const after = structuredClone(state);
    after.openThreads = ['Who wrote the letter?', '  '];
    after.world.rules = [' No magic ', ''];
    expect(diffState(state, after).changes).toEqual([]);

    const characters = { ...after.characters };
    delete characters.mara;
    after.characters = characters;
    after.knownFacts = [
      { id: 'fact:1', text: ' The letter is unsigned ', knownBy: ['pc'], confirmed: false },
    ];
    after.narration = { ...after.narration, detail: 'cinematic' };
    const { changes, lines } = diffState(state, after);
    expect(changes.map((c) => c.op)).toEqual(['setNarration', 'removeCharacter', 'upsertFact']);
    expect(changes[2]).toEqual({
      op: 'upsertFact',
      fact: { id: 'fact:1', text: 'The letter is unsigned', knownBy: ['pc'], confirmed: true },
    });
    expect(lines.map((l) => l.what)).toEqual([
      'Narration · Detail',
      'Removed from the story: Mara Quill',
      'New fact',
    ]);
  });

  it('keeps the style, thoughts, cards and language when narration changes', () => {
    const after = structuredClone(state);
    after.narration = {
      ...after.narration,
      style: 'messages',
      innerThoughts: true,
      messageCards: true,
      language: ' Korean ',
    };
    const { changes, lines } = diffState(state, after);
    expect(changes).toEqual([
      {
        op: 'setNarration',
        narration: {
          ...state.narration,
          style: 'messages',
          innerThoughts: true,
          messageCards: true,
          language: 'Korean',
        },
      },
    ]);
    expect(lines).toContainEqual({
      what: 'Narration · Style',
      before: 'Narrated',
      after: 'Messages',
    });
    expect(lines).toContainEqual({
      what: 'Narration · Story language',
      before: 'Not set',
      after: 'Korean',
    });
  });

  it('keeps every feature and dice setting, with the usual ones left out', () => {
    const after = structuredClone(state);
    after.narration = {
      ...after.narration,
      perspective: 'first',
      tense: 'past',
      surprises: 'sometimes',
      autopilot: true,
      quietPhones: true,
      sceneHeadings: true,
      dice: true,
      diceRules: { dice: ' 2d6 ', frequency: 'normal', odds: 'tough', crits: true, noStats: false },
    };
    const { changes, lines } = diffState(state, after);
    expect(changes).toEqual([
      {
        op: 'setNarration',
        narration: {
          ...state.narration,
          perspective: 'first',
          dice: true,
          sceneHeadings: true,
          tense: 'past',
          autopilot: true,
          quietPhones: true,
          diceRules: { dice: '2d6', odds: 'tough', crits: true },
        },
      },
    ]);
    expect(lines).toContainEqual({
      what: 'Narration · Point of view',
      before: 'Second person (you)',
      after: 'First person (I)',
    });
    expect(lines).toContainEqual({
      what: 'Narration · Dice settings',
      before: 'Usual',
      after: '2d6, tough odds, critical rolls',
    });
    expect(lines).toContainEqual({
      what: 'Narration · Characters can text or call you first',
      before: 'On',
      after: 'Off',
    });
  });

  it("keeps the story's own style notes when something else changes", () => {
    const before = structuredClone(state);
    before.narration = { ...before.narration, styleNotes: 'Lots of banter' };
    const after = structuredClone(before);
    after.narration = { ...after.narration, tone: 'Wistful' };
    const { changes } = diffState(before, after);
    expect(changes).toEqual([
      {
        op: 'setNarration',
        narration: { ...before.narration, tone: 'Wistful', styleNotes: 'Lots of banter' },
      },
    ]);

    after.narration = { ...after.narration, styleNotes: '  Short replies ' };
    expect(diffState(before, after).lines).toContainEqual({
      what: 'Narration · Your own style (optional)',
      before: 'Lots of banter',
      after: 'Short replies',
    });
  });
});

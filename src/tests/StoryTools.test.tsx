// Storytelling tools: Keep going, the length of the next reply, Another
// reply with a hint, editing the latest reply, taking back a turn, a note to
// the storyteller, and "Remember this" for words picked in the story.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventDto, RouteView, StoryMemory } from '../types';
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
import { withoutAsides } from '../features/reader/messages';
import { useLanguage } from '../i18n';
import { plainStoryText, routeName } from '../i18n/names';
import { diffState } from '../features/reader/stateDiff';

const NOTE = '<remember person="Mara">Likes tea</remember>';

function ev(id: string, parent: string, kind: 'player' | 'assistant', text: string): EventDto {
  return {
    id,
    originRouteId: 'route-1',
    parentEventId: parent,
    generationRunId: null,
    createdAt: '2026-11-07T00:00:01Z',
    kind,
    payload: { text },
  } as EventDto;
}

/** A story with one turn: an action and a reply that wrote a memory note. */
function played(note?: string): RouteView {
  const v = fakeRouteView([
    ev('ev-2', 'ev-1', 'player', 'Knock on the door'),
    ev('ev-3', 'ev-2', 'assistant', `Mara opens the door and smiles.\n\n${NOTE}`),
  ]);
  const s = v.state.state;
  s.characters.mara = { ...s.characters.pc!, id: 'mara', name: 'Mara Quill', control: 'npc' };
  s.narration = {
    perspective: 'second',
    detail: 'balanced',
    tone: 'warm',
    pacing: 'normal',
    ...(note ? { storytellerNote: note } : {}),
  };
  s.notes = [];
  return v;
}

const memory: StoryMemory = {
  routeId: 'route-1',
  turns: 1,
  summary: undefined,
  recaps: [],
  recapsRead: 10,
  recapsBriefed: 40,
  firstSummaryAfter: 16,
};

function backend(view: RouteView, more: Record<string, (args: never) => unknown> = {}) {
  invoke.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
    if (more[cmd]) return (more[cmd] as (a: unknown) => unknown)(args);
    switch (cmd) {
      case 'get_route_view':
        return view;
      case 'list_bookmarks':
        return [];
      case 'get_budget_status':
        throw { code: 'NOT_FOUND', message: cmd };
      case 'get_story_memory':
        return memory;
      case 'list_connections':
        return [];
      case 'get_storyteller':
        return view.storyteller;
      default:
        throw { code: 'NOT_FOUND', message: `unknown ${cmd}` };
    }
  });
}

const calls = (cmd: string) =>
  invoke.mock.calls.filter(([c]) => c === cmd).map(([, a]) => a as Record<string, unknown>);

describe('Storytelling tools', () => {
  beforeEach(() => {
    invoke.mockReset();
    useUiStore.setState({
      drafts: {},
      screen: { name: 'reader', routeId: 'route-1' },
      history: [],
    });
  });

  it('Keep going sends an empty action, with the length chosen for that reply only', async () => {
    const view = played();
    backend(view, {
      submit_action: () => ({
        runId: 'run-1',
        view: fakeRouteView([...view.history, ev('ev-4', 'ev-3', 'player', '')]),
      }),
      generate_reply: () => new Promise(() => undefined),
    });
    render(<ReaderScreen routeId="route-1" />);
    await screen.findByLabelText('What do you do?');
    const length = screen.getByRole('radiogroup', { name: 'Length of the next reply' });
    await userEvent.click(within(length).getByRole('radio', { name: 'Short' }));
    await userEvent.click(screen.getByRole('button', { name: 'Keep going' }));
    expect(calls('submit_action')).toEqual([
      expect.objectContaining({ text: '', options: { length: 'short' } }),
    ]);
    expect(within(length).getByRole('radio', { name: 'Normal' })).toBeChecked();
    expect(await screen.findByText('You let the story go on.')).toBeInTheDocument();
  });

  it('typing turns Keep going back into Send, and Normal asks nothing extra', async () => {
    backend(played(), {
      submit_action: () => ({ runId: 'run-1', view: played() }),
      generate_reply: () => new Promise(() => undefined),
    });
    render(<ReaderScreen routeId="route-1" />);
    const box = await screen.findByLabelText('What do you do?');
    await userEvent.type(box, 'Wave');
    expect(screen.queryByRole('button', { name: 'Keep going' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(calls('submit_action')[0]).toMatchObject({ text: 'Wave' });
    expect(calls('submit_action')[0]!.options).toBeUndefined();
  });

  it('Another reply asks for a length and a hint', async () => {
    backend(played(), {
      regenerate_reply: () => ({ runId: 'run-2', view: played() }),
    });
    render(<ReaderScreen routeId="route-1" />);
    await screen.findByLabelText('What do you do?');
    await userEvent.click(screen.getByRole('button', { name: 'Another reply' }));
    const dialog = await screen.findByRole('dialog', { name: 'Another reply' });
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Long' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'More romantic' }));
    expect(within(dialog).getByLabelText('What should be different? (optional)')).toHaveValue(
      'More romantic',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Write another reply' }));
    expect(calls('regenerate_reply')).toEqual([
      expect.objectContaining({
        assistantEventId: 'ev-3',
        options: { length: 'long', hint: 'More romantic' },
      }),
    ]);
  });

  it('the latest reply is edited in place, without its memory notes in the way', async () => {
    const view = played();
    const edited = played();
    edited.history[2] = ev(
      'ev-5',
      'ev-2',
      'assistant',
      `Mara opens the door and laughs.\n\n${NOTE}`,
    );
    backend(view, { edit_reply: () => edited });
    render(<ReaderScreen routeId="route-1" />);
    await screen.findByLabelText('What do you do?');
    await userEvent.click(screen.getByRole('button', { name: 'Edit this reply' }));
    const editor = screen.getByLabelText('The reply');
    expect(editor).toHaveValue('Mara opens the door and smiles.');
    const save = screen.getByRole('button', { name: 'Save reply' });
    expect(save).toBeDisabled();
    await userEvent.clear(editor);
    await userEvent.type(editor, 'Mara opens the door and laughs.');
    await userEvent.click(save);
    expect(calls('edit_reply')).toEqual([
      {
        storyId: 'story-1',
        routeId: 'route-1',
        expectedHeadId: 'ev-3',
        assistantEventId: 'ev-3',
        text: 'Mara opens the door and laughs.',
      },
    ]);
    expect(await screen.findByText('Mara opens the door and laughs.')).toBeInTheDocument();
    expect(screen.queryByLabelText('The reply')).not.toBeInTheDocument();
    expect(screen.getByText(/Reply changed/)).toBeInTheDocument();
  });

  it('Escape closes the reply editor without opening the pause menu', async () => {
    backend(played());
    render(<ReaderScreen routeId="route-1" />);
    await screen.findByLabelText('What do you do?');
    await userEvent.click(screen.getByRole('button', { name: 'Edit this reply' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByLabelText('The reply')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Paused' })).not.toBeInTheDocument();
  });

  it('an earlier reply is not offered for editing', async () => {
    const view = fakeRouteView([
      ev('ev-2', 'ev-1', 'player', 'Knock'),
      ev('ev-3', 'ev-2', 'assistant', 'The door opens.'),
      ev('ev-4', 'ev-3', 'player', 'Go in'),
    ]);
    backend(view);
    render(<ReaderScreen routeId="route-1" />);
    await screen.findByLabelText('What do you do?');
    expect(screen.queryByRole('button', { name: 'Edit this reply' })).not.toBeInTheDocument();
  });

  it('takes back the last turn from the pause menu and puts the words back in the box', async () => {
    const view = played();
    const back = fakeRouteView();
    const kept = { ...back.route, id: 'route-2', label: 'Taken back: Knock on the door' };
    back.routes = [back.route, kept];
    backend(view, { take_back_turn: () => ({ view: back, keptRouteId: 'route-2' }) });
    render(<ReaderScreen routeId="route-1" />);
    const box = await screen.findByLabelText('What do you do?');
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    await userEvent.click(screen.getByRole('button', { name: /Take back my last turn/ }));
    expect(calls('take_back_turn')).toEqual([
      { storyId: 'story-1', routeId: 'route-1', expectedHeadId: 'ev-3' },
    ]);
    expect(await screen.findByText(/Turn taken back/)).toHaveTextContent(
      '“Taken back: Knock on the door”',
    );
    expect(box).toHaveValue('Knock on the door');
    expect(screen.queryByText('Mara opens the door and smiles.')).not.toBeInTheDocument();
  });

  it('Mod+U takes back the turn too, but not while there is none', async () => {
    backend(fakeRouteView());
    render(<ReaderScreen routeId="route-1" />);
    await screen.findByLabelText('What do you do?');
    await userEvent.keyboard('{Control>}u{/Control}');
    expect(calls('take_back_turn')).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.getByRole('button', { name: /Take back my last turn/ })).toBeDisabled();
    expect(screen.getByText(/Nothing to take back in this chapter/)).toBeInTheDocument();
  });

  it('keeps a note to the storyteller and shows it above the box', async () => {
    const view = played();
    backend(view, {
      edit_story_details: () => played('Keep Mara shy'),
    });
    render(<ReaderScreen routeId="route-1" />);
    await screen.findByLabelText('What do you do?');
    await userEvent.click(screen.getByRole('button', { name: 'Note to the storyteller' }));
    const dialog = await screen.findByRole('dialog', { name: 'Note to the storyteller' });
    await userEvent.type(within(dialog).getByRole('textbox'), 'Keep Mara shy');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep this note' }));
    const [edit] = calls('edit_story_details');
    expect(edit).toMatchObject({
      expectedHeadId: 'ev-3',
      changes: [
        {
          op: 'setNarration',
          narration: expect.objectContaining({ storytellerNote: 'Keep Mara shy', tone: 'warm' }),
        },
      ],
      note: 'note to the storyteller',
    });
    expect(await screen.findByText('Keep Mara shy')).toBeInTheDocument();
    expect(screen.getByText('Your note to the storyteller:')).toBeInTheDocument();
  });

  it('removes the note to the storyteller', async () => {
    backend(played('Keep Mara shy'), { edit_story_details: () => played() });
    render(<ReaderScreen routeId="route-1" />);
    await screen.findByLabelText('What do you do?');
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    const dialog = await screen.findByRole('dialog', { name: 'Note to the storyteller' });
    expect(within(dialog).getByRole('textbox')).toHaveValue('Keep Mara shy');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove note' }));
    const [edit] = calls('edit_story_details');
    const change = (edit!.changes as { narration: Record<string, unknown> }[])[0]!;
    expect(change.narration.storytellerNote).toBeUndefined();
    expect(await screen.findByText(/Note to the storyteller removed/)).toBeInTheDocument();
    expect(screen.queryByText('Your note to the storyteller:')).not.toBeInTheDocument();
  });

  it('Remember this opens a note about the person the picked words name', async () => {
    backend(played());
    render(<ReaderScreen routeId="route-1" />);
    await screen.findByLabelText('What do you do?');
    const words = screen.getByText('Mara opens the door and smiles.');
    act(() => {
      document.getSelection()!.selectAllChildren(words);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Remember this' }));
    const dialog = await screen.findByRole('dialog', { name: 'Story memory' });
    const form = within(dialog).getByRole('form', { name: 'New note' });
    expect(within(form).getByLabelText('Kind')).toHaveValue('person');
    expect(within(form).getByLabelText('Name')).toHaveValue('Mara Quill');
    expect(within(form).getByLabelText('What to remember')).toHaveValue(
      'Mara opens the door and smiles.',
    );
    await waitFor(() => expect(within(form).getByLabelText('Name')).toHaveFocus());
  });
});

describe('Storytelling tools, the small parts', () => {
  it('a reply loses only its asides for editing', () => {
    expect(withoutAsides(`Hello.\n\n${NOTE}\n<thread>The letter</thread>`)).toBe('Hello.');
    expect(withoutAsides('A <text from="Mara">hi</text> B')).toBe(
      'A <text from="Mara">hi</text> B',
    );
    expect(withoutAsides('Half <remember person="x">open')).toBe('Half <remember person="x">open');
    expect(withoutAsides('One\n<next>Wave</next>\nTwo')).toBe('One\nTwo');
  });

  it('names the app’s new routes and the Keep going line in every language', () => {
    useLanguage.getState().setChoice('ja');
    try {
      expect(routeName('Taken back: Keep going')).toBe('取り消し：続ける');
      expect(routeName('Before your edit')).toBe('編集前');
      expect(plainStoryText('(lets the story go on)')).toBe('(物語の流れに任せる)');
    } finally {
      useLanguage.getState().setChoice('en');
    }
  });

  it('story details changes keep the note to the storyteller', () => {
    const before = played('Keep Mara shy').state.state;
    before.world = { era: 'Now', setting: 'Harbor', description: '', rules: [] };
    before.characters = {};
    const after = structuredClone(before);
    after.narration.tone = 'stormy';
    const { changes } = diffState(before, after);
    const narration = changes.find((c) => c.op === 'setNarration');
    expect(narration).toMatchObject({
      narration: { storytellerNote: 'Keep Mara shy', tone: 'stormy' },
    });
  });
});

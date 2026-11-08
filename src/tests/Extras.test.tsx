// Batch 6 extras: the command palette, the chapter list in the header, read
// aloud, the first-time tips, and how people feel about the player.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventDto, StoryStateV1 } from '../types';
import { fakeRouteView } from './fakeBackend';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  Channel: class {
    onmessage: (m: unknown) => void = () => undefined;
  },
}));

import { foldText, searchPalette, usePalette, type PaletteEntry } from '../app/palette';
import { speechParts, speechLang, useReadAloud } from '../app/readAloud';
import { useUiStore } from '../app/store';
import { CommandPalette } from '../components/CommandPalette';
import {
  BondBar,
  characterIdByName,
  standingBonds,
  withFeeling,
} from '../features/reader/feelings';
import { bondChanges } from '../features/reader/messages';
import { ReaderScreen } from '../features/reader/ReaderScreen';
import { diffState } from '../features/reader/stateDiff';
import { tidyEdits } from '../features/reader/TidyReview';
import { useTour } from '../features/reader/Tour';

const event = (id: string, kind: 'player' | 'assistant', text: string): EventDto =>
  ({
    id,
    originRouteId: 'route-1',
    parentEventId: null,
    generationRunId: null,
    createdAt: '2026-11-06T00:00:01Z',
    kind,
    payload: { text },
  }) as EventDto;

function chapterTwo(): EventDto {
  return {
    id: 'ev-ch2',
    originRouteId: 'route-1',
    parentEventId: 'ev-3',
    generationRunId: null,
    createdAt: '2026-11-06T00:00:03Z',
    kind: 'chapter_start',
    payload: { chapterInstanceId: 'ch-2', title: 'Low Tide', ordinal: 2 },
  };
}

function backend(view = fakeRouteView()) {
  invoke.mockImplementation(async (cmd: string) => {
    if (cmd === 'get_route_view') return view;
    if (cmd === 'get_budget_status') throw { code: 'NOT_FOUND', message: 'none' };
    if (cmd === 'list_bookmarks') return [];
    if (cmd === 'list_stories') return [];
    if (cmd === 'list_saves') return [];
    throw { code: 'NOT_FOUND', message: `unknown ${cmd}` };
  });
}

beforeEach(() => {
  invoke.mockReset();
  localStorage.setItem('dtl.tourDone', '1');
  useTour.setState({ step: null });
  usePalette.setState({ open: false });
  useUiStore.setState({ drafts: {}, screen: { name: 'reader', routeId: 'route-1' }, history: [] });
});

describe('Command palette', () => {
  const entry = (label: string, extra: Partial<PaletteEntry> = {}): PaletteEntry => ({
    id: label,
    group: 'Go to',
    label,
    run: () => undefined,
    ...extra,
  });

  it('finds by any words, best match first, without minding accents', () => {
    const all = [
      entry('Usage & budget'),
      entry('Save / Load'),
      entry('Quick save'),
      entry('The Lighthouse Café', { keywords: 'cozy romance' }),
    ];
    expect(searchPalette(all, 'save').map((e) => e.label)).toEqual(['Save / Load', 'Quick save']);
    expect(searchPalette(all, 'cafe cozy').map((e) => e.label)).toEqual(['The Lighthouse Café']);
    expect(searchPalette(all, 'zebra')).toEqual([]);
    expect(searchPalette(all, '')).toHaveLength(4);
    expect(foldText('  Café  ÉCLAIR ')).toBe('cafe eclair');
  });

  it('opens with Ctrl+K in a story and goes to a window by typing', async () => {
    backend();
    render(
      <>
        <ReaderScreen routeId="route-1" />
        <CommandPalette />
      </>,
    );
    await screen.findByLabelText('What do you do?');
    await userEvent.keyboard('{Control>}k{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'Go to' });
    const box = within(dialog).getByRole('combobox', {
      name: 'Find a story, chapter, window or setting',
    });
    expect(box).toHaveFocus();
    // The story's own places come first.
    const first = within(dialog).getAllByRole('option')[0]!;
    expect(first).toHaveTextContent('Chapter 1: The Lamp Room');
    expect(first).toHaveTextContent('In this story');

    await userEvent.type(box, 'save / load');
    expect(within(dialog).getAllByRole('option')[0]).toHaveTextContent('Save / Load');
    await userEvent.keyboard('{Enter}');
    expect(screen.queryByRole('dialog', { name: 'Go to' })).toBeNull();
    expect(await screen.findByRole('dialog', { name: 'Save / Load' })).toBeInTheDocument();
  });

  it('says when nothing matches', async () => {
    backend();
    render(<CommandPalette />);
    act(() => usePalette.getState().setOpen(true));
    const dialog = await screen.findByRole('dialog', { name: 'Go to' });
    await userEvent.type(within(dialog).getByRole('combobox'), 'zebra crossing');
    expect(dialog).toHaveTextContent('Nothing matches “zebra crossing”.');
  });
});

describe('Chapter list in the header', () => {
  it('lists every chapter and offers to replay one', async () => {
    const view = fakeRouteView([
      event('ev-2', 'player', 'Hold the letter up to the lamp.'),
      event('ev-3', 'assistant', 'A gull crest shows.'),
      chapterTwo(),
    ]);
    view.chapters.push({
      eventId: 'ev-ch2',
      chapterInstanceId: 'ch-2',
      title: 'Low Tide',
      ordinal: 2,
    });
    view.state.activeChapter = view.chapters[1]!;
    backend(view);
    render(<ReaderScreen routeId="route-1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Go to a chapter' }));
    const menu = screen.getByRole('menu');
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual([
      'Chapter 1: The Lamp Room',
      'Chapter 2: Low Tide',
      'Replay a chapter…',
    ]);
    await userEvent.click(items[2]!);
    expect(await screen.findByRole('dialog', { name: /chapter/i })).toBeInTheDocument();
  });
});

describe('Read aloud', () => {
  const spoken: { text: string; lang: string; rate: number }[] = [];
  beforeEach(() => {
    spoken.length = 0;
    class Utterance {
      voice: unknown = null;
      lang = '';
      rate = 1;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public text: string) {}
    }
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      getVoices: () => [],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      speak: (u: Utterance) => spoken.push({ text: u.text, lang: u.lang, rate: u.rate }),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    useReadAloud.setState({ reading: null });
  });

  it('splits long replies at sentences and keeps short ones whole', () => {
    expect(speechParts('Hello there.\n\nMara waves.')).toEqual(['Hello there.', 'Mara waves.']);
    const long = 'The bell rings. '.repeat(30).trim();
    const parts = speechParts(long, 60);
    expect(parts.every((p) => p.length <= 60)).toBe(true);
    expect(parts.join(' ')).toBe(long);
    expect(speechLang('Japanese')).toBe('ja-JP');
    expect(speechLang('Klingon')).toBeUndefined();
  });

  it('reads a reply in the story language, and the same button stops it', async () => {
    const view = fakeRouteView([
      event('ev-2', 'player', 'Wave to Mara.'),
      event('ev-3', 'assistant', 'Mara waves back. <remember person="Mara">Friendly.</remember>'),
    ]);
    (view.state.state as StoryStateV1).narration = {
      language: 'French',
    } as StoryStateV1['narration'];
    backend(view);
    render(<ReaderScreen routeId="route-1" />);
    const button = await screen.findByRole('button', { name: 'Read aloud' });
    await userEvent.click(button);
    expect(spoken).toEqual([{ text: 'Mara waves back.', lang: 'fr-FR', rate: 1 }]);
    const stop = screen.getByRole('button', { name: 'Stop reading' });
    expect(stop).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(stop);
    expect(screen.getByRole('button', { name: 'Read aloud' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

describe('First-time tips', () => {
  it('shows five tips once, and Skip ends them for good', async () => {
    localStorage.removeItem('dtl.tourDone');
    useTour.setState({ step: 0 });
    backend();
    render(<ReaderScreen routeId="route-1" />);
    const tips = await screen.findByRole('region', { name: 'Tips for your first story' });
    expect(tips).toHaveTextContent('Tip 1 of 5');
    // The box can be drawn just after the tips; they look again shortly.
    await waitFor(() =>
      expect(document.querySelector('#composer-input')).toHaveClass('tour-target'),
    );
    await userEvent.click(within(tips).getByRole('button', { name: 'Next tip' }));
    expect(tips).toHaveTextContent('Tip 2 of 5');
    await userEvent.click(within(tips).getByRole('button', { name: 'Skip tips' }));
    expect(screen.queryByRole('region', { name: 'Tips for your first story' })).toBeNull();
    expect(localStorage.getItem('dtl.tourDone')).toBe('1');
    expect(document.querySelector('.tour-target')).toBeNull();
  });

  it('moves past the first tip once the player sends an action', () => {
    useTour.setState({ step: 0 });
    useTour.getState().acted();
    expect(useTour.getState().step).toBe(1);
    // Later tips wait for Next.
    useTour.getState().acted();
    expect(useTour.getState().step).toBe(1);
    useTour.setState({ step: null });
  });
});

describe('Feelings', () => {
  const state = (): StoryStateV1 => ({
    schemaVersion: 1,
    playerCharacterId: 'pc',
    world: { era: '', setting: 'Larkport', description: '', rules: [] },
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
        personality: [],
        goals: [],
        abilities: [],
      },
    },
    relationships: [],
    knownFacts: [],
    scene: { location: 'The ferry', summary: '', participantIds: ['pc'] },
    openThreads: [],
    visualRefs: {},
  });

  it('reads bond tags as the storyteller writes them', () => {
    expect(
      bondChanges(
        '<bond name="Mara" heart="+10">Warmer since the lamp</bond><bond who="Mara" trust="−5"/>' +
          '<bond name="Mara">Wary</bond><bond name="">nobody</bond><bond name="Mara" heart="lots"/>',
      ),
    ).toEqual([
      { name: 'Mara', kind: 'heart', change: '+10', line: 'Warmer since the lamp' },
      { name: 'Mara', kind: 'trust', change: '-5', line: '' },
      { name: 'Mara', kind: undefined, change: undefined, line: 'Wary' },
    ]);
    expect(bondChanges('<bond name="Mara" heart="up"/>')[0]?.change).toBe('+5');
  });

  it('finds people by a first name only they have, and never the player', () => {
    const s = state();
    expect(characterIdByName(s, 'mara')).toBe('mara');
    expect(characterIdByName(s, 'Sam')).toBeNull();
    const changed = withFeeling(s, 'mara', {
      status: 'Warmer since the lamp',
      bond: { kind: 'heart', value: 60 },
    });
    expect(changed.relationships).toEqual([
      {
        fromId: 'mara',
        toId: 'pc',
        label: '',
        status: 'Warmer since the lamp',
        bond: { kind: 'heart', value: 60 },
      },
    ]);
    // What the reply wrote still stands, so its Undo would take it back.
    expect(standingBonds('<bond name="Mara">Warmer since the lamp</bond>', changed)).toHaveLength(
      1,
    );
    expect(standingBonds('<bond name="Mara">Cold</bond>', changed)).toHaveLength(0);
    // Story details save the change as the whole list.
    const { changes, lines } = diffState(s, changed);
    expect(changes).toEqual([{ op: 'setRelationships', relationships: changed.relationships }]);
    expect(lines).toContainEqual({
      what: 'Mara Quill → you · Bar',
      before: 'No bar',
      after: 'Heart 60',
    });
    // No bar leaves no bar behind.
    expect(withFeeling(changed, 'mara', { bond: undefined }).relationships[0]).not.toHaveProperty(
      'bond',
    );
  });

  it('shows the bar as a meter people can read', () => {
    render(<BondBar bond={{ kind: 'trust', value: 35 }} name="Mara" />);
    const meter = screen.getByRole('meter', { name: 'Mara: Trust 35 of 100' });
    expect(meter).toHaveAttribute('aria-valuenow', '35');
  });
});

describe('Tidying the notebook', () => {
  it('removes every replaced note before writing the new ones', () => {
    const n = (name: string) => ({ kind: 'person' as const, name, text: name });
    const changes = [
      { replaces: [n('Mara'), n('Mara Quill')], note: n('Mara Quill') },
      { replaces: [n('Rowan')], note: n('Rowan') },
    ];
    expect(tidyEdits(changes, () => true)).toEqual([
      { op: 'removeNote', kind: 'person', name: 'Mara' },
      { op: 'removeNote', kind: 'person', name: 'Mara Quill' },
      { op: 'removeNote', kind: 'person', name: 'Rowan' },
      { op: 'upsertNote', note: n('Mara Quill') },
      { op: 'upsertNote', note: n('Rowan') },
    ]);
    expect(tidyEdits(changes, (i) => i === 1)).toEqual([
      { op: 'removeNote', kind: 'person', name: 'Rowan' },
      { op: 'upsertNote', note: n('Rowan') },
    ]);
    expect(tidyEdits(changes, () => false)).toEqual([]);
  });
});

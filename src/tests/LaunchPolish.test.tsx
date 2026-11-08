// Launch polish: How to play, Tune the telling, bookmarks in the chapter
// menu, the stage caption, the story typeface and skipping a voice.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookmarkDto, EventDto, RouteView, StateEdit } from '../types';
import { fakeRouteView } from './fakeBackend';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  Channel: class {
    onmessage: (m: unknown) => void = () => undefined;
  },
}));

import { HelpScreen } from '../features/help/HelpScreen';
import { ReaderScreen } from '../features/reader/ReaderScreen';
import { StoryDetailsPanel } from '../features/reader/StoryDetailsPanel';
import { ReadingControls } from '../components/ReadingControls';
import { readingStyle, useLook } from '../app/look';
import { isMuted, unmutedSegments, useReadAloud } from '../app/readAloud';
import { useUiStore } from '../app/store';
import { usePictureView } from '../features/reader/stage';
import { useVoicePacks } from '../app/voicePacks';

const narration = { perspective: 'second', detail: 'balanced', tone: 'Warm', pacing: 'normal' };

const ev = (id: string, parent: string, kind: 'player' | 'assistant', text: string) =>
  ({
    id,
    originRouteId: 'route-1',
    parentEventId: parent,
    generationRunId: null,
    createdAt: '2026-11-06T00:00:02Z',
    kind,
    payload: { text },
  }) as EventDto;

function view(): RouteView {
  const v = fakeRouteView([
    ev('ev-2', 'ev-1', 'player', 'I climb.'),
    ev('ev-3', 'ev-2', 'assistant', 'The lamp hums like a hive.'),
  ]);
  v.state.state = {
    ...v.state.state,
    world: { era: 'Present day', setting: 'A harbor town', description: '', rules: [] },
    narration,
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
    scene: { location: 'The lamp room', time: 'Dusk', summary: '', participantIds: ['pc', 'mara'] },
  } as unknown as RouteView['state']['state'];
  return v;
}

const mark: BookmarkDto = {
  id: 'bm-1',
  routeId: 'route-1',
  eventId: 'ev-3',
  label: 'The hive',
  kind: 'assistant',
  excerpt: 'The lamp hums like a hive.',
  chapterOrdinal: 1,
  chapterTitle: 'The Lamp Room',
  createdAt: '2026-11-06T00:00:03Z',
  updatedAt: '2026-11-06T00:00:03Z',
};

describe('How to play', () => {
  it('lists every section, links to each, and opens the Setup guide', async () => {
    useUiStore.setState({ screen: { name: 'help' } });
    render(<HelpScreen />);
    expect(screen.getByRole('heading', { level: 1, name: 'How to play' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'On this page' });
    const links = within(nav).getAllByRole('link');
    expect(links).toHaveLength(11);
    expect(links.map((l) => l.textContent)).toEqual([
      'Playing a turn',
      'Three ways to steer the storyteller',
      'Changing your mind',
      'Chapters and memory',
      'When a story gets long',
      'Your story, your way',
      'Pictures',
      'Reading aloud',
      'Dice and RPG mode',
      'Saving, sharing and presets',
      'Cost and privacy',
    ]);
    for (const l of links) {
      const id = l.getAttribute('href')!.slice(1);
      expect(document.getElementById(id), id).not.toBeNull();
    }
    expect(
      screen.getByRole('heading', { level: 2, name: 'Three ways to steer the storyteller' }),
    ).toBeVisible();
    expect(screen.getByText(/Note to the storyteller/)).toBeInTheDocument();
    expect(screen.getByText(/Remember this/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Setup guide' }));
    expect(useUiStore.getState().screen).toEqual({ name: 'guide' });
  });
});

describe('Tune the telling', () => {
  beforeEach(() => {
    invoke.mockReset();
    useUiStore.setState({ drafts: {} });
    invoke.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
      if (cmd === 'get_route_view') return view();
      if (cmd === 'list_bookmarks') return [mark];
      if (cmd === 'edit_story_details') {
        const v = view();
        const changes = args.changes as StateEdit[];
        const edit = changes[0];
        if (edit?.op === 'setNarration') {
          v.state.state = {
            ...v.state.state,
            narration: edit.narration,
          } as RouteView['state']['state'];
        }
        return v;
      }
      throw { code: 'NOT_FOUND', message: cmd };
    });
  });

  it('changes detail and twists from the tool bar, from the next reply on', async () => {
    render(<ReaderScreen routeId="route-1" />);
    await screen.findByLabelText('What do you do?');
    await userEvent.click(screen.getByRole('button', { name: 'Tune the telling' }));
    const panel = await screen.findByRole('dialog', { name: 'Tune the telling' });
    const apply = within(panel).getByRole('button', { name: 'Apply from now' });
    expect(apply).toBeDisabled();
    await userEvent.selectOptions(
      within(panel).getByRole('combobox', { name: 'Detail' }),
      'cinematic',
    );
    await userEvent.selectOptions(within(panel).getByRole('combobox', { name: 'Twists' }), 'often');
    expect(apply).toBeEnabled();
    await userEvent.click(apply);
    const call = invoke.mock.calls.find((c) => c[0] === 'edit_story_details')?.[1] as {
      changes: StateEdit[];
      note: string;
      expectedHeadId: string;
    };
    expect(call.expectedHeadId).toBe('ev-3');
    expect(call.changes).toHaveLength(1);
    expect(call.changes[0]).toMatchObject({
      op: 'setNarration',
      narration: { ...narration, detail: 'cinematic', surprises: 'often' },
    });
    expect(call.note).toMatch(/Detail/);
    expect(screen.queryByRole('dialog', { name: 'Tune the telling' })).toBeNull();
  });

  it('offers the full set in Story details, and lists bookmarks under the chapters', async () => {
    render(<ReaderScreen routeId="route-1" />);
    await screen.findByLabelText('What do you do?');
    await userEvent.click(screen.getByRole('button', { name: 'Tune the telling' }));
    const panel = await screen.findByRole('dialog', { name: 'Tune the telling' });
    await userEvent.click(within(panel).getByRole('button', { name: 'More in Story details…' }));
    expect(await screen.findByRole('dialog', { name: 'Story details' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Narration', selected: true })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');

    await userEvent.click(await screen.findByRole('button', { name: 'Go to a chapter' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /Chapter 1/ })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Bookmark: The hive' })).toBeInTheDocument();
  });
});

describe('the stage caption', () => {
  beforeEach(() => {
    invoke.mockReset();
    useUiStore.setState({ drafts: {} });
    usePictureView.getState().setShown(true);
  });

  it('names the place and time over a background that is not the place’s own', async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_route_view') {
        const v = view();
        v.visuals = [{ slot: 'background', assetId: 'img-bg' }];
        return v;
      }
      if (cmd === 'list_bookmarks') return [];
      throw { code: 'NOT_FOUND', message: cmd };
    });
    render(<ReaderScreen routeId="route-1" />);
    const caption = await screen.findByTestId('stage-caption');
    expect(caption).toHaveTextContent('The lamp room');
    expect(caption).toHaveTextContent('Dusk');
  });

  it('is left out when the place has a picture of its own', async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_route_view') {
        const v = view();
        v.visuals = [
          { slot: 'background', assetId: 'img-bg' },
          { slot: 'place:the lamp room', assetId: 'img-lamp' },
        ];
        return v;
      }
      if (cmd === 'list_bookmarks') return [];
      throw { code: 'NOT_FOUND', message: cmd };
    });
    render(<ReaderScreen routeId="route-1" />);
    await screen.findByTestId('scene-pictures');
    expect(screen.queryByTestId('stage-caption')).toBeNull();
  });
});

describe('the story typeface', () => {
  beforeEach(() => {
    localStorage.clear();
    useLook.setState({ font: 'theme', width: 'medium', spacing: 'normal' });
  });

  it('is chosen in Settings → Look and goes into the reader’s stylesheet', async () => {
    render(<ReadingControls />);
    const group = screen.getByRole('radiogroup', { name: 'Story typeface' });
    expect(within(group).getByLabelText('Theme’s choice')).toBeChecked();
    await userEvent.click(within(group).getByLabelText('Easy to read'));
    expect(useLook.getState().font).toBe('easy');
    expect(JSON.parse(localStorage.getItem('dtl.look') ?? '{}').font).toBe('easy');
    expect(readingStyle({ width: 'medium', spacing: 'normal', font: 'easy' })).toMatchObject({
      '--font-story': "'Atkinson Hyperlegible', var(--font-ui)",
    });
    expect(readingStyle({ width: 'medium', spacing: 'normal', font: 'serif' })).toMatchObject({
      '--font-story': 'var(--font-story-serif)',
    });
    // The theme's own choice sets nothing, so Terminal keeps its monospace.
    expect(readingStyle({ width: 'medium', spacing: 'normal', font: 'theme' })).not.toHaveProperty(
      '--font-story',
    );
  });
});

describe('skipping a character when reading aloud', () => {
  beforeEach(() => {
    localStorage.clear();
    useReadAloud.setState({ muted: [] });
    useVoicePacks.setState({ packs: [], active: null });
  });

  it('drops the muted speaker’s lines and keeps the rest', () => {
    const text = 'Mara: "Go home."\nThe wind rises.\nSam: "Not yet."';
    expect(unmutedSegments(text, ['Mara', 'Sam'], ['mara'])).toEqual([
      { who: null, text: 'The wind rises.' },
      { who: 'Sam', text: '"Not yet."' },
    ]);
    // No pack: the muted name is still found and left out.
    expect(unmutedSegments(text, [], ['Mara']).map((s) => s.who)).toEqual([null]);
    expect(unmutedSegments(text, [], [])).toEqual([{ who: null, text }]);
  });

  it('is a checkbox in Story details that is remembered on this computer', async () => {
    const v = view();
    render(
      <StoryDetailsPanel
        view={v}
        playerName="Sam"
        onApplied={() => undefined}
        onCancel={() => undefined}
      />,
    );
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Character' }), 'mara');
    const skip = screen.getByRole('checkbox', {
      name: 'Skip this character’s lines when reading aloud',
    });
    expect(skip).not.toBeChecked();
    await userEvent.click(skip);
    expect(isMuted('mara quill')).toBe(true);
    expect(JSON.parse(localStorage.getItem('dtl.readAloud') ?? '{}').muted).toEqual(['Mara Quill']);
    expect(screen.getByText(/With a voice pack/)).toBeInTheDocument();
    await userEvent.click(skip);
    expect(isMuted('Mara Quill')).toBe(false);
  });
});

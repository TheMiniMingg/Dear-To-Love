// The review pass: a welcome when the library is empty, ways in at a
// chapter's start, Surprise me on Preset Story, and jump links in Settings.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoryStateV1, TemplateCatalog } from '../types';
import { fakeRouteView } from './fakeBackend';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  Channel: class {
    onmessage: (m: unknown) => void = () => undefined;
  },
}));

import { useUiStore } from '../app/store';
import { QuickStartScreen } from '../features/create/QuickStartScreen';
import { LibraryScreen } from '../features/library/LibraryScreen';
import { openingIdeas } from '../features/reader/messages';
import { ReaderScreen } from '../features/reader/ReaderScreen';
import { SettingsScreen } from '../features/settings/SettingsScreen';

const narration = { perspective: 'second', detail: 'balanced', tone: 'Warm', pacing: 'normal' };
const world = (id: string, label: string, genres: string[]) => ({
  templateSchemaVersion: 1,
  id,
  label,
  summary: '',
  world: { era: '', setting: label, description: '', rules: [] },
  narration: { ...narration, genres },
});
const scenario = (id: string, title: string, worlds: string[]) => ({
  templateSchemaVersion: 1,
  id,
  label: title,
  summary: '',
  worlds,
  title,
  description: '',
  firstChapterTitle: 'One',
  chapterOutlines: [],
  scene: { location: 'Here', summary: '' },
  openThreads: [],
  npcs: [],
  relationships: [],
});
const catalog = {
  worlds: [
    world('w:harbor', 'Harbor Town', ['Mystery', 'Romance']),
    world('w:station', 'Meridian Station', ['Science fiction']),
  ],
  scenarios: [
    scenario('s:letter', 'The Letter', ['w:harbor']),
    scenario('s:night', 'Night Shift', ['w:station']),
  ],
  characters: [
    {
      templateSchemaVersion: 1,
      id: 'c:keeper',
      label: 'The Keeper',
      summary: '',
      character: { id: 'c:keeper', name: 'Sam', personality: [], goals: [], abilities: [] },
    },
  ],
} as unknown as TemplateCatalog;

beforeEach(() => {
  invoke.mockReset();
  useUiStore.setState({ drafts: {}, screen: { name: 'library' }, history: [] });
});

describe('the empty library', () => {
  it('welcomes you with the two ways to start a story', async () => {
    invoke.mockImplementation(async (cmd: string) => (cmd === 'list_stories' ? [] : null));
    render(<LibraryScreen />);
    const welcome = await screen.findByRole('region', { name: 'Start your first story' });
    expect(within(welcome).getByText('No stories yet.')).toBeInTheDocument();
    await userEvent.click(within(welcome).getByRole('button', { name: /^Preset Story/ }));
    expect(useUiStore.getState().screen).toEqual({ name: 'quickstart' });
  });
});

describe('ways in at a chapter start', () => {
  const state = (participantIds: string[]) =>
    ({
      playerCharacterId: 'pc',
      characters: {
        pc: { id: 'pc', name: 'Sam Ashby' },
        mara: { id: 'mara', name: 'Mara Quill' },
      },
      scene: { location: 'The lamp room', summary: '', participantIds },
    }) as unknown as StoryStateV1;

  it('talks to someone in the scene, or asks who is there', () => {
    expect(openingIdeas(state(['pc', 'mara']))).toEqual([
      'Look around',
      'Talk to Mara',
      'Wait and listen',
    ]);
    expect(openingIdeas(state(['pc']))).toEqual([
      'Look around',
      'Ask who is there',
      'Wait and listen',
    ]);
  });

  it('shows above the box before the first move, and puts one in the box', async () => {
    const view = fakeRouteView();
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_route_view' || cmd === 'open_route') return view;
      if (cmd === 'list_bookmarks') return [];
      return null;
    });
    useUiStore.setState({ screen: { name: 'reader', routeId: 'route-1' }, history: [] });
    render(<ReaderScreen routeId="route-1" />);
    const ideas = await screen.findByRole('group', { name: 'Ideas for what to do next' });
    expect(
      screen.getByText(
        'Write what you do in the box below to begin, or pick an idea just above it.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(within(ideas).getByRole('button', { name: 'Look around' }));
    expect(screen.getByRole('textbox', { name: /What do you do/ })).toHaveValue('Look around');
  });
});

describe('Preset Story', () => {
  it('Surprise me picks another world with a story that fits it', async () => {
    invoke.mockImplementation(async (cmd: string) =>
      cmd === 'get_template_catalog' ? catalog : null,
    );
    render(<QuickStartScreen />);
    const preview = await screen.findByRole('complementary', { name: 'Story preview' });
    expect(within(preview).getByRole('heading', { name: 'The Letter' })).toBeInTheDocument();
    expect(within(preview).getByRole('list', { name: 'Genre' })).toHaveTextContent(
      'MysteryRomance',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Surprise me' }));
    expect(within(preview).getByRole('heading', { name: 'Night Shift' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'World' })).toHaveValue('w:station');
  });
});

describe('Settings', () => {
  it('jumps to a section from the links at the top', async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'list_connections') return [];
      if (cmd === 'get_storyteller')
        return { profileId: null, label: 'Offline storyteller', modelId: null, billing: 'local' };
      return null;
    });
    useUiStore.setState({ screen: { name: 'settings' }, history: [] });
    render(<SettingsScreen />);
    const jump = screen.getByRole('navigation', { name: 'Settings sections' });
    await userEvent.click(within(jump).getByRole('button', { name: 'AI connections' }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('region', { name: 'AI connections' })),
    );
  });
});

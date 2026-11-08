// A player's own presets: saved from a story card, listed under Preset
// Story, begun, changed first, shared as a file, imported and deleted.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CreateStoryDraft,
  Narration,
  StorySummary,
  TemplateCatalog,
  UserPreset,
} from '../types';

const invoke = vi.fn();
const openDialog = vi.fn();
const saveDialog = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  Channel: class {
    onmessage: (m: unknown) => void = () => undefined;
  },
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...args: unknown[]) => openDialog(...args),
  save: (...args: unknown[]) => saveDialog(...args),
}));

import { useUiStore } from '../app/store';
import { QuickStartScreen } from '../features/create/QuickStartScreen';
import { LibraryScreen } from '../features/library/LibraryScreen';

const narration: Narration = {
  perspective: 'second',
  detail: 'balanced',
  tone: 'Warm',
  pacing: 'normal',
};
const catalog = {
  worlds: [
    {
      templateSchemaVersion: 1,
      id: 'starter:harbor',
      label: 'Harbor Town',
      summary: 'A seaside town.',
      world: { era: 'Present day', setting: 'Wrenmouth', description: 'A harbor.', rules: [] },
      narration: { ...narration, genres: ['Mystery'] },
    },
  ],
  scenarios: [
    {
      templateSchemaVersion: 1,
      id: 'starter:letter',
      label: 'The Letter',
      summary: 'A letter.',
      worlds: ['starter:harbor'],
      title: 'The Unsigned Letter',
      description: 'A love letter.',
      firstChapterTitle: 'The Lamp Room',
      chapterOutlines: [],
      scene: { location: 'The lighthouse', summary: 'The lamp flickers.' },
      openThreads: [],
      npcs: [],
      relationships: [],
    },
  ],
  characters: [
    {
      templateSchemaVersion: 1,
      id: 'starter:keeper',
      label: 'The Keeper',
      summary: 'New in town.',
      suits: [],
      character: {
        id: 'starter:keeper',
        name: 'Sam Ashby',
        control: 'player',
        personality: [],
        goals: [],
        abilities: [],
      },
    },
  ],
} as TemplateCatalog;

const draft: CreateStoryDraft = {
  draftSchemaVersion: 1,
  worldTemplateId: null,
  scenarioTemplateId: null,
  characterTemplateId: null,
  title: 'Harbor Town',
  description: 'A letter arrives.',
  world: { era: '1890s', setting: 'A fishing town', description: 'Fog.', rules: [] },
  narration,
  player: {
    id: 'custom:player',
    name: 'Ada',
    control: 'player',
    personality: [],
    goals: [],
    abilities: [],
  },
  npcs: [{ id: 'n1', name: 'Tomas', control: 'npc', personality: [], goals: [], abilities: [] }],
  relationships: [],
  scene: { location: 'The inn', summary: '' },
  openThreads: [],
  firstChapterTitle: 'The Letter',
  chapterOutlines: [],
};

const preset: UserPreset = {
  id: 'preset-1',
  name: 'Harbor Town',
  fromStoryTitle: 'The Lamp at Harbor Town',
  createdAt: '2026-11-08T12:00:00Z',
  draft,
};

const story: StorySummary = {
  id: 's1',
  title: 'The Lamp at Harbor Town',
  description: 'A letter arrives.',
  createdAt: '2026-11-06T00:00:00Z',
  updatedAt: '2026-11-06T00:00:00Z',
  routeCount: 1,
  mainRouteId: 's1-main',
  lastRouteId: 's1-main',
  coverAssetId: null,
  writing: false,
  genres: ['Mystery'],
  chapter: 2,
  turns: 9,
  lastReply: null,
  place: 'The inn',
  setting: 'A fishing town',
  cast: ['Ada', 'Tomas'],
};

describe('Your presets under Preset Story', () => {
  let presets: UserPreset[];
  beforeEach(() => {
    presets = [preset];
    invoke.mockReset();
    openDialog.mockReset();
    saveDialog.mockReset();
    useUiStore.setState({ screen: { name: 'quickstart' } });
    invoke.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
      switch (cmd) {
        case 'get_template_catalog':
          return catalog;
        case 'list_user_presets':
          return presets;
        case 'create_story':
          return { storyId: 'new', mainRouteId: 'new-main', headEventId: 'e', routeVersion: 1 };
        case 'save_wizard_draft':
          return null;
        case 'export_user_preset':
          return args.path;
        case 'import_user_preset':
          presets = [
            ...presets,
            { ...preset, id: 'preset-2', name: 'Imported Town', fromStoryTitle: '' },
          ];
          return presets[1];
        case 'delete_user_preset':
          presets = presets.filter((p) => p.id !== args.presetId);
          return null;
        default:
          throw { code: 'NOT_FOUND', message: cmd };
      }
    });
  });

  it('lists what was saved, and begins a story from it as the wizard would', async () => {
    render(<QuickStartScreen />);
    const list = await screen.findByRole('list', { name: 'Your presets' });
    const card = within(list).getByRole('listitem');
    expect(card).toHaveTextContent('Harbor Town');
    expect(card).toHaveTextContent('from The Lamp at Harbor Town');
    expect(card).toHaveTextContent('2 characters');
    expect(card).toHaveTextContent('A fishing town');
    await userEvent.click(within(card).getByRole('button', { name: 'Begin Harbor Town' }));
    const call = invoke.mock.calls.find((c) => c[0] === 'create_story')?.[1] as {
      draft: CreateStoryDraft;
    };
    expect(call.draft).toEqual(draft);
    expect(useUiStore.getState().screen).toEqual({ name: 'reader', routeId: 'new-main' });
  });

  it('opens the preset in Custom Story to change first', async () => {
    render(<QuickStartScreen />);
    const list = await screen.findByRole('list', { name: 'Your presets' });
    await userEvent.click(within(list).getByRole('button', { name: 'Change first' }));
    expect(invoke).toHaveBeenCalledWith(
      'save_wizard_draft',
      expect.objectContaining({
        wizard: expect.objectContaining({ mode: 'custom', step: 'review', draft }),
      }),
    );
    expect(useUiStore.getState().screen).toEqual({ name: 'create' });
  });

  it('saves a preset to a file, imports one, and deletes one after asking', async () => {
    saveDialog.mockResolvedValue('/home/me/Harbor Town.dtlpreset');
    openDialog.mockResolvedValue('/home/me/Imported Town.dtlpreset');
    render(<QuickStartScreen />);
    const list = await screen.findByRole('list', { name: 'Your presets' });
    await userEvent.click(within(list).getByRole('button', { name: 'Save as file…' }));
    expect(saveDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: 'Harbor Town.dtlpreset',
        filters: [{ name: 'Dear to Love preset', extensions: ['dtlpreset'] }],
      }),
    );
    expect(invoke).toHaveBeenCalledWith('export_user_preset', {
      presetId: 'preset-1',
      path: '/home/me/Harbor Town.dtlpreset',
    });
    expect(
      await screen.findByText('Saved Harbor Town to /home/me/Harbor Town.dtlpreset.'),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Import a preset file…' }));
    expect(invoke).toHaveBeenCalledWith('import_user_preset', {
      path: '/home/me/Imported Town.dtlpreset',
    });
    expect(await screen.findByText('Imported the preset Imported Town.')).toBeInTheDocument();
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);

    const second = within(list).getAllByRole('listitem')[1]!;
    expect(second).toHaveTextContent('imported');
    await userEvent.click(within(second).getByRole('button', { name: 'Delete' }));
    const ask = await screen.findByRole('dialog', { name: 'Delete preset?' });
    expect(ask).toHaveTextContent('Imported Town will be gone for good.');
    await userEvent.click(within(ask).getByRole('button', { name: 'Delete preset' }));
    expect(invoke).toHaveBeenCalledWith('delete_user_preset', { presetId: 'preset-2' });
    expect(await screen.findByText('Deleted the preset Imported Town.')).toBeInTheDocument();
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  });

  it('says so when there are none yet, and holds no secrets in the explanation', async () => {
    presets = [];
    render(<QuickStartScreen />);
    expect(await screen.findByText('None yet.')).toBeInTheDocument();
    expect(screen.getByText(/holds no keys, pictures or settings/)).toBeInTheDocument();
  });
});

describe('Save as a preset from a story card', () => {
  beforeEach(() => {
    invoke.mockReset();
    useUiStore.setState({ screen: { name: 'library' } });
    invoke.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
      switch (cmd) {
        case 'list_stories':
          return [story];
        case 'preset_from_route':
          return draft;
        case 'save_user_preset':
          return {
            ...preset,
            name: args.name as string,
            fromStoryTitle: args.fromStoryTitle as string,
          };
        default:
          return null;
      }
    });
  });

  it('names the preset after the story and keeps it without the turns', async () => {
    render(<LibraryScreen />);
    const card = (await screen.findByText('The Lamp at Harbor Town')).closest('li')!;
    await userEvent.click(
      within(card).getByRole('button', { name: 'More for The Lamp at Harbor Town' }),
    );
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Save as a preset…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Save as a preset' });
    expect(dialog).toHaveTextContent(/without its turns, memory or pictures/);
    const name = within(dialog).getByLabelText('Preset name');
    expect(name).toHaveValue('The Lamp at Harbor Town');
    await userEvent.clear(name);
    await userEvent.type(name, 'Harbor Town');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save preset' }));
    expect(invoke).toHaveBeenCalledWith('preset_from_route', { routeId: 's1-main' });
    expect(invoke).toHaveBeenCalledWith('save_user_preset', {
      name: 'Harbor Town',
      draft,
      fromStoryTitle: 'The Lamp at Harbor Town',
    });
    expect(
      await screen.findByText('Saved as a preset: Harbor Town. Find it under Preset Story.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Save as a preset' })).toBeNull();
  });
});

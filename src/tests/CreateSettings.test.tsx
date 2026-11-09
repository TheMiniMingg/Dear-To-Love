// Batch 5: Fill in the rest, the step bar, the cover-style previews in
// Preset Story and Custom Story, and Settings → Look's reading options.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CreateStoryDraft,
  FilledDraft,
  QuickStartInput,
  TemplateCatalog,
  WizardDraft,
} from '../types';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  Channel: class {
    onmessage: (m: unknown) => void = () => undefined;
  },
}));

import { CreateWizardScreen } from '../features/create/CreateWizardScreen';
import { QuickStartScreen } from '../features/create/QuickStartScreen';
import { LookSection } from '../features/settings/LookSection';
import { readingStyle, useLook } from '../app/look';
import { useUiStore } from '../app/store';

const narration = { perspective: 'second', detail: 'balanced', tone: 'Warm', pacing: 'normal' };
const catalog = {
  worlds: [
    {
      templateSchemaVersion: 1,
      id: 'starter:harbor',
      label: 'Harbor Town',
      summary: 'A seaside town.',
      world: { era: 'Present day', setting: 'Wrenmouth', description: 'A harbor.', rules: [] },
      narration: { ...narration, genres: ['Mystery', 'Romance'] },
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
      description: 'A love letter, addressed to the keeper.',
      firstChapterTitle: 'The Lamp Room',
      chapterOutlines: [],
      scene: { location: 'The lighthouse', summary: 'The lamp flickers as you climb.' },
      openThreads: [],
      npcs: [
        {
          id: 'starter:npc-mara',
          name: 'Mara Quill',
          role: 'Ferry captain',
          control: 'npc',
          personality: [],
          goals: [],
          abilities: [],
        },
      ],
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
        role: 'Lighthouse keeper',
        personality: [],
        goals: [],
        abilities: [],
      },
    },
  ],
} as TemplateCatalog;

function blank(): CreateStoryDraft {
  return {
    draftSchemaVersion: 1,
    worldTemplateId: null,
    scenarioTemplateId: null,
    characterTemplateId: null,
    title: '',
    description: '',
    world: { era: '', setting: '', description: '', rules: [] },
    narration: { perspective: 'second', detail: 'balanced', tone: '', pacing: 'normal' },
    player: {
      id: 'custom:player',
      name: '',
      control: 'player',
      personality: [],
      goals: [],
      abilities: [],
    },
    npcs: [],
    relationships: [],
    scene: { location: '', summary: '' },
    openThreads: [],
    firstChapterTitle: '',
    chapterOutlines: [],
  };
}

function lastCall(cmd: string): Record<string, unknown> | undefined {
  const calls = invoke.mock.calls.filter((c) => c[0] === cmd);
  return calls[calls.length - 1]?.[1] as Record<string, unknown> | undefined;
}

describe('Custom Story: Fill in the rest, step bar and preview', () => {
  let fill: (draft: CreateStoryDraft, step: string | null, offline: boolean) => unknown;

  beforeEach(() => {
    invoke.mockReset();
    useUiStore.setState({ screen: { name: 'create' }, history: [] });
    fill = (draft) =>
      ({
        draft: {
          ...draft,
          world: { ...draft.world, setting: 'A lighthouse island', era: 'Present day' },
        },
        filled: ['setting', 'era'],
        writtenBy: 'Home server',
      }) satisfies FilledDraft;
    invoke.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
      switch (cmd) {
        case 'get_template_catalog':
          return catalog;
        case 'get_wizard_draft':
          return null;
        case 'compose_story_draft':
          return { ...blank(), title: (args.input as QuickStartInput).worldId };
        case 'save_wizard_draft':
          return { ...(args.wizard as WizardDraft), savedAt: '2026-11-07T12:00:00.000Z' };
        case 'check_story_draft':
          return [];
        case 'list_connections':
          return [];
        case 'get_storyteller':
          return { profileId: null, label: 'Offline storyteller', model: null };
        case 'fill_story_draft':
          return fill(
            args.draft as CreateStoryDraft,
            args.step as string | null,
            args.offline as boolean,
          );
        default:
          return null;
      }
    });
  });

  it('fills the empty fields of a step, says which, and Undo takes them back', async () => {
    render(<CreateWizardScreen />);
    await screen.findByRole('heading', { name: 'Where does it take place?' });
    await userEvent.click(screen.getByRole('button', { name: 'Fill in the rest' }));
    expect(lastCall('fill_story_draft')).toMatchObject({ step: 'world', offline: false });
    await waitFor(() => expect(screen.getByLabelText('Era')).toHaveValue('Present day'));
    expect(document.querySelector('.fill-rest-note')?.textContent).toBe(
      'Home server filled in Setting, Era. Undo',
    );
    expect(screen.getByLabelText('Setting')).toHaveValue('A lighthouse island');
    expect(screen.getByLabelText('Era')).toHaveValue('Present day');
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByLabelText('Setting')).toHaveValue('');
    expect(screen.queryByText(/filled in/)).not.toBeInTheDocument();
  });

  it('Review fills every step; a failure offers the preset stories instead', async () => {
    fill = (_draft, _step, offline) => {
      if (!offline) throw { code: 'PROVIDER_UNREACHABLE', message: 'no route to host' };
      return { draft: blank(), filled: [], writtenBy: 'the offline storyteller' };
    };
    render(<CreateWizardScreen />);
    await userEvent.click(await screen.findByRole('button', { name: '6. Review' }));
    await userEvent.click(screen.getByRole('button', { name: 'Fill in everything left' }));
    expect(lastCall('fill_story_draft')).toMatchObject({ step: null });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Fill in from the preset stories instead' }),
    );
    expect(lastCall('fill_story_draft')).toMatchObject({ step: null, offline: true });
    expect(await screen.findByText(/only knows the preset stories/)).toBeInTheDocument();
  });

  it('the step bar ticks the steps behind and the preview follows what you type', async () => {
    render(<CreateWizardScreen />);
    await screen.findByRole('heading', { name: 'Where does it take place?' });
    expect(screen.getByRole('button', { name: '1. World' })).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(screen.getByText('Step 1 of 6')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '3. Story' }));
    const bar = screen.getByRole('navigation', { name: 'Steps' });
    expect(within(bar).getAllByRole('listitem')[0]).toHaveAttribute('data-state', 'done');
    expect(within(bar).getAllByRole('listitem')[2]).toHaveAttribute('data-state', 'current');

    const preview = screen.getByRole('complementary', { name: 'Preview of your story' });
    expect(within(preview).getByRole('heading', { level: 2 })).toHaveTextContent('Untitled story');
    await userEvent.type(screen.getByLabelText('Title'), 'Salt and Lamplight');
    await userEvent.type(screen.getByLabelText('Opening scene'), 'Fog rolls in.');
    expect(within(preview).getByRole('heading', { level: 2 })).toHaveTextContent(
      'Salt and Lamplight',
    );
    expect(within(preview).getByText('Fog rolls in.')).toBeInTheDocument();
  });
});

describe('Preset Story cover', () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockImplementation(async (cmd: string) =>
      cmd === 'get_template_catalog' ? catalog : null,
    );
  });

  it('shows the title, genres, cast and first page in the story’s look', async () => {
    useLook.setState({ theme: 'rose', fitGenre: true });
    render(<QuickStartScreen />);
    const cover = await screen.findByRole('complementary', { name: 'Story preview' });
    expect(within(cover).getByRole('heading', { level: 2 })).toHaveTextContent(
      'The Unsigned Letter',
    );
    // A mystery reads in Gothic when stories fit their genre.
    expect(cover).toHaveAttribute('data-theme-preview', 'gothic');
    const cast = within(cover).getByRole('list', { name: 'Cast' });
    expect(within(cast).getByText('Sam Ashby')).toBeInTheDocument();
    expect(within(cast).getByText('You')).toBeInTheDocument();
    expect(within(cast).getByText('Ferry captain')).toBeInTheDocument();
    expect(within(cover).getByText('The Lamp Room')).toBeInTheDocument();
    expect(within(cover).getByText('The lamp flickers as you climb.')).toBeInTheDocument();
    expect(within(cover).getByRole('button', { name: 'Start story' })).toBeEnabled();
  });

  it('starts with choices A to D when picked, and keeps the pick for next time', async () => {
    localStorage.clear();
    const { unmount } = render(<QuickStartScreen />);
    const pick = await screen.findByRole('combobox', { name: 'Help with your next move' });
    expect(pick).toHaveValue('ideas');
    await userEvent.selectOptions(pick, 'choices');
    await userEvent.click(screen.getByRole('button', { name: 'Start story' }));
    await waitFor(() =>
      expect(lastCall('quick_start')?.input).toMatchObject({ nextMove: 'choices' }),
    );
    unmount();
    render(<QuickStartScreen />);
    expect(await screen.findByRole('combobox', { name: 'Help with your next move' })).toHaveValue(
      'choices',
    );
  });
});

describe('Settings → Look: reading', () => {
  beforeEach(() => {
    localStorage.clear();
    useLook.setState({ theme: 'rose', fitGenre: true, width: 'medium', spacing: 'normal' });
    useUiStore.setState({ textSize: 1 });
  });

  it('text size, width and spacing show on the sample and are remembered', async () => {
    render(<LookSection />);
    const sample = screen.getByRole('figure', { name: 'Sample of how stories look' });
    expect(sample.style.getPropertyValue('--reading-width')).toBe('41rem');
    await userEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Column width' })).getByLabelText('Wide'),
    );
    await userEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Line spacing' })).getByLabelText('Roomy'),
    );
    await userEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Text size' })).getByLabelText('Larger'),
    );
    await waitFor(() => expect(sample.style.getPropertyValue('--reading-width')).toBe('52rem'));
    expect(sample.style.getPropertyValue('--reading-leading')).toBe('2');
    expect(sample.style.fontSize).toBe('1.3rem');
    expect(JSON.parse(localStorage.getItem('dtl.look') ?? '{}')).toMatchObject({
      width: 'wide',
      spacing: 'roomy',
    });
    expect(localStorage.getItem('dtl.textSize')).toBe('1.3');
  });

  it('turns choices into the reader’s stylesheet values', () => {
    expect(readingStyle({ width: 'narrow', spacing: 'compact' })).toEqual({
      '--reading-width': '34rem',
      '--reading-leading': '1.55',
    });
  });
});

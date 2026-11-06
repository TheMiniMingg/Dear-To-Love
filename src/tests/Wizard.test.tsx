// Creation wizard: Guided needs no typing (M6), arrow + menu + typed
// override land on the same value (T23), and a half-made story comes back
// on reopen (T28).
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CreateStoryDraft,
  DraftProblem,
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
import { applyCharacter, applyScenario, applyWorld } from '../features/create/WizardSteps';
import { useUiStore } from '../app/store';

const narration = { perspective: 'second', detail: 'balanced', tone: 'Warm', pacing: 'normal' };
const catalog = {
  worlds: [
    {
      templateSchemaVersion: 1,
      id: 'starter:harbor',
      label: 'Harbor Town',
      summary: 'A seaside town.',
      world: {
        era: 'Present day',
        setting: 'Wrenmouth',
        description: 'A harbor.',
        rules: ['No magic'],
      },
      narration,
    },
    {
      templateSchemaVersion: 1,
      id: 'starter:station',
      label: 'Meridian Station',
      summary: 'In orbit.',
      world: {
        era: 'Far future',
        setting: 'Meridian',
        description: 'A ring.',
        rules: ['No aliens'],
      },
      narration: { ...narration, tone: 'Wistful' },
    },
  ],
  scenarios: [
    {
      templateSchemaVersion: 1,
      id: 'starter:letter',
      label: 'The Letter',
      summary: 'A letter.',
      worlds: ['starter:harbor'],
      title: 'The Letter',
      description: '',
      firstChapterTitle: 'The Lamp Room',
      chapterOutlines: [],
      scene: { location: 'The lighthouse', summary: '' },
      openThreads: [],
      npcs: [
        {
          id: 'starter:npc-mara',
          name: 'Mara',
          control: 'npc',
          personality: [],
          goals: [],
          abilities: [],
        },
      ],
      relationships: [
        { fromId: 'starter:npc-mara', toId: '@player', label: 'Neighbor', status: '' },
      ],
    },
    {
      templateSchemaVersion: 1,
      id: 'starter:night',
      label: 'Night Shift',
      summary: 'Nights.',
      worlds: ['starter:station'],
      title: 'Night Shift',
      description: '',
      firstChapterTitle: 'Shift Change',
      chapterOutlines: [],
      scene: { location: 'Corridor C', summary: '' },
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
      character: {
        id: 'starter:keeper',
        name: 'Sam',
        control: 'player',
        pronouns: 'they/them',
        role: 'Keeper',
        personality: ['kind'],
        goals: [],
        abilities: [],
      },
    },
    {
      templateSchemaVersion: 1,
      id: 'starter:detective',
      label: 'The Detective',
      summary: 'Notices things.',
      character: {
        id: 'starter:detective',
        name: 'Rin',
        control: 'player',
        pronouns: 'she/her',
        role: 'Investigator',
        personality: ['patient'],
        goals: [],
        abilities: [],
      },
    },
  ],
} as TemplateCatalog;

function compose(input: QuickStartInput): CreateStoryDraft {
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
    ...applyWorld(catalog, input.worldId),
    ...applyScenario(catalog, input.scenarioId),
    ...applyCharacter(catalog, input.characterId),
  };
}

let saved: WizardDraft | null;
let problems: DraftProblem[];

function lastCall(cmd: string): Record<string, unknown> | undefined {
  const calls = invoke.mock.calls.filter((c) => c[0] === cmd);
  return calls[calls.length - 1]?.[1] as Record<string, unknown> | undefined;
}

describe('Create a story', () => {
  beforeEach(() => {
    saved = null;
    problems = [];
    invoke.mockReset();
    useUiStore.setState({ screen: { name: 'create' }, history: [] });
    invoke.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
      switch (cmd) {
        case 'get_template_catalog':
          return catalog;
        case 'get_wizard_draft':
          return saved;
        case 'compose_story_draft':
          return compose(args.input as QuickStartInput);
        case 'save_wizard_draft':
          saved = { ...(args.wizard as WizardDraft), savedAt: '2026-11-06T12:00:00.000Z' };
          return saved;
        case 'clear_wizard_draft':
          saved = null;
          return null;
        case 'check_story_draft':
          return problems;
        case 'create_story':
          return { storyId: 's', mainRouteId: 'route-9', headEventId: 'e', routeVersion: 1 };
        default:
          throw { code: 'NOT_FOUND', message: `unknown ${cmd}` };
      }
    });
  });

  it('Guided: a whole story from presets without typing', async () => {
    render(<CreateWizardScreen />);
    const world = await screen.findByRole('combobox', { name: 'Start from a world' });
    // Arrow keys move through presets.
    world.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(world).toHaveDisplayValue('Meridian Station');
    expect(screen.getByRole('combobox', { name: 'Setting' })).toHaveDisplayValue('Meridian');

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    const who = await screen.findByRole('combobox', { name: 'Start from a character' });
    await userEvent.selectOptions(who, 'starter:detective');
    await userEvent.click(screen.getByRole('checkbox', { name: 'kind' }));

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    const scenario = await screen.findByRole('combobox', { name: 'Start from a scenario' });
    // The old scenario was written for Harbor Town; only Night Shift fits.
    expect(
      within(scenario).getByRole('option', { name: /written for another world/ }),
    ).toBeTruthy();
    await userEvent.selectOptions(scenario, 'starter:night');
    await userEvent.click(screen.getByRole('checkbox', { name: /Sam/ }));
    expect(screen.queryByRole('textbox')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: '5. Review' }));
    expect(await screen.findByLabelText('Story summary')).toHaveTextContent('Night Shift');
    await userEvent.click(await screen.findByRole('button', { name: 'Create story' }));

    const draft = lastCall('create_story')?.draft as CreateStoryDraft;
    expect(draft.worldTemplateId).toBe('starter:station');
    expect(draft.player.id).toBe('starter:detective');
    expect(draft.player.personality).toEqual(['patient', 'kind']);
    expect(draft.npcs.map((n) => n.id)).toEqual(['starter:keeper']);
    expect(draft.npcs[0]?.control).toBe('npc');
    expect(useUiStore.getState().screen).toEqual({ name: 'reader', routeId: 'route-9' });
  });

  it('T23: arrows, the menu and typing set the same field', async () => {
    render(<CreateWizardScreen />);
    await userEvent.click(await screen.findByRole('button', { name: '2. You' }));
    const pronouns = await screen.findByRole('combobox', { name: 'Pronouns' });
    await userEvent.selectOptions(pronouns, 'he/him');
    await userEvent.click(screen.getByRole('radio', { name: 'Custom' }));
    const typed = screen.getByRole('textbox', { name: 'Pronouns' });
    expect(typed).toHaveValue('he/him');
    await userEvent.clear(typed);
    await userEvent.type(typed, 'xe/xem');
    await userEvent.click(screen.getByRole('radio', { name: 'Guided' }));
    expect(screen.getByRole('combobox', { name: 'Pronouns' })).toHaveDisplayValue(
      'Your own: xe/xem',
    );
    await userEvent.click(screen.getByRole('button', { name: '5. Review' }));
    expect(await screen.findByLabelText('Story summary')).toHaveTextContent('(xe/xem)');
  });

  it('T28: saves as you go and picks up where you left off', async () => {
    const first = render(<CreateWizardScreen />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Custom' }));
    await userEvent.click(screen.getByRole('button', { name: '3. Story' }));
    const title = await screen.findByRole('textbox', { name: /^Title/ });
    await userEvent.clear(title);
    await userEvent.type(title, 'Half made');
    await waitFor(() => expect(saved?.draft.title).toBe('Half made'), { timeout: 2000 });
    expect(saved?.step).toBe('story');
    first.unmount();

    render(<CreateWizardScreen />);
    expect(await screen.findByRole('note')).toHaveTextContent('Picked up your unfinished story');
    expect(screen.getByRole('textbox', { name: /^Title/ })).toHaveValue('Half made');
    expect(screen.getByRole('radio', { name: 'Custom' })).toBeChecked();

    await userEvent.click(screen.getByRole('button', { name: 'Start over' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard and start over' }),
    );
    await waitFor(() => expect(screen.queryByRole('note')).toBeNull());
    expect(saved).toBeNull();
  });

  it('genre, content rating, themes and limits reach the new story', async () => {
    localStorage.clear();
    render(<CreateWizardScreen />);
    await userEvent.click(await screen.findByRole('button', { name: '4. Narration' }));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Romance' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Horror' }));

    // Adults only asks once whether the player is 18 or older.
    const rating = screen.getByRole('combobox', { name: 'Content rating' });
    await userEvent.selectOptions(rating, 'explicit');
    const ask = await screen.findByRole('dialog', { name: 'Adults only' });
    await userEvent.click(within(ask).getByRole('button', { name: 'Cancel' }));
    expect(rating).toHaveDisplayValue('Not set');
    await userEvent.selectOptions(rating, 'explicit');
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'I am 18 or older' }),
    );
    expect(rating).toHaveDisplayValue('Adults only (explicit)');
    await userEvent.selectOptions(rating, 'mature');
    await userEvent.selectOptions(rating, 'explicit');
    expect(screen.queryByRole('dialog')).toBeNull();

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Themes and elements you want' }),
      'slow burn{Enter}{Enter}rivals',
    );
    await userEvent.type(screen.getByRole('textbox', { name: 'Hard limits' }), 'gore');
    await userEvent.click(screen.getByRole('button', { name: '5. Review' }));
    expect(await screen.findByLabelText('Story summary')).toHaveTextContent(
      'Romance, Horror · Adults only',
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Create story' }));
    const draft = lastCall('create_story')?.draft as CreateStoryDraft;
    expect(draft.narration.genres).toEqual(['Romance', 'Horror']);
    expect(draft.narration.rating).toBe('explicit');
    expect(draft.narration.themes?.filter(Boolean)).toEqual(['slow burn', 'rivals']);
    expect(draft.narration.limits).toEqual(['gore']);
  });

  it('Review lists problems and links to the step that fixes them', async () => {
    problems = [{ step: 'character', message: 'Give your character a name.' }];
    render(<CreateWizardScreen />);
    await userEvent.click(await screen.findByRole('button', { name: '5. Review' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Give your character a name.');
    expect(screen.getByRole('button', { name: 'Create story' })).toBeDisabled();
    await userEvent.click(within(alert).getByRole('button', { name: 'Go to You' }));
    const heading = await screen.findByRole('heading', { name: 'Who do you play?' });
    await waitFor(() => expect(heading).toHaveFocus());
  });
});

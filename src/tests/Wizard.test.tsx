// Creation wizard: Guided needs no typing (M6), arrow + menu + typed
// override land on the same value (T23), and a half-made story comes back
// on reopen (T28).
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AssetDto,
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

const openDialog = vi.fn();
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...args: unknown[]) => openDialog(...args),
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
      narration: { ...narration, tone: 'Wistful', genres: ['Science fiction'] },
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
const picture = (id: string, label: string, shared: boolean): AssetDto => ({
  id,
  mime: 'image/png',
  width: 64,
  height: 64,
  byteSize: 2048,
  label,
  tags: [],
  createdAt: '2026-11-06T00:00:00Z',
  shared,
  stories: [],
});
let library: AssetDto[];

function lastCall(cmd: string): Record<string, unknown> | undefined {
  const calls = invoke.mock.calls.filter((c) => c[0] === cmd);
  return calls[calls.length - 1]?.[1] as Record<string, unknown> | undefined;
}

describe('Create a story', () => {
  beforeEach(() => {
    saved = null;
    problems = [];
    library = [picture('img-harbor', 'Harbor', true)];
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
        case 'list_images':
          return library;
        case 'import_images': {
          const mine = picture('img-me', 'Me', false);
          library = [mine, ...library];
          return [{ fileName: 'me.png', asset: mine, alreadyInLibrary: false, error: null }];
        }
        case 'list_connections':
          return [
            {
              id: 'p1',
              label: 'Home server',
              adapter: 'openai_compatible',
              baseUrl: 'http://127.0.0.1:8080/v1',
              modelId: 'story-model',
              billing: 'local',
              hasKey: false,
              settings: {},
              createdAt: '',
              updatedAt: '',
            },
            {
              id: 'p9',
              label: 'Picture maker',
              adapter: 'stable_diffusion',
              baseUrl: 'http://127.0.0.1:7860',
              modelId: 'default',
              billing: 'local',
              hasKey: false,
              settings: {},
              createdAt: '',
              updatedAt: '',
            },
          ];
        case 'get_picture_maker':
          return 'p9';
        case 'make_portrait': {
          const made = picture('img-made', 'Portrait of Juno', false);
          library = [made, ...library];
          return made;
        }
        case 'get_storyteller':
          return { profileId: null, label: 'Offline storyteller', modelId: null, billing: 'local' };
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
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Add to personality from the list' }),
      'kind',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    const scenario = await screen.findByRole('combobox', { name: 'Start from a scenario' });
    // The old scenario was written for Harbor Town; only Night Shift fits.
    expect(
      within(scenario).getByRole('option', { name: /written for another world/ }),
    ).toBeTruthy();
    await userEvent.selectOptions(scenario, 'starter:night');
    await userEvent.click(screen.getByRole('checkbox', { name: /Sam/ }));
    expect(screen.queryByRole('textbox')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: '6. Review' }));
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
    await userEvent.click(screen.getByRole('button', { name: '6. Review' }));
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

  it('Custom: no presets, every field written from empty', async () => {
    render(<CreateWizardScreen />);
    await screen.findByRole('combobox', { name: 'Start from a world' });
    await userEvent.click(screen.getByRole('radio', { name: 'Custom' }));
    expect(screen.queryByRole('combobox', { name: 'Start from a world' })).toBeNull();
    const setting = screen.getByRole('textbox', { name: /^Setting/ });
    expect(setting).toHaveValue('');
    await userEvent.type(setting, 'A floating market');

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    const name = await screen.findByRole('textbox', { name: /^Name/ });
    expect(screen.queryByRole('combobox', { name: 'Start from a character' })).toBeNull();
    expect(name).toHaveValue('');
    await userEvent.type(name, 'Ivo');
    await userEvent.type(screen.getByRole('textbox', { name: 'Age' }), '34');

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    const title = await screen.findByRole('textbox', { name: /^Title/ });
    expect(screen.queryByRole('combobox', { name: 'Start from a scenario' })).toBeNull();
    expect(screen.queryByText('Bring in a preset character')).toBeNull();
    await userEvent.type(title, 'Lanterns');
    await userEvent.type(
      screen.getByRole('textbox', { name: /^Starting location/ }),
      'The east pier',
    );
    expect(screen.getByRole('textbox', { name: /^First chapter title/ })).toHaveValue('Chapter 1');
    await userEvent.click(screen.getByRole('button', { name: 'Add a character' }));
    await userEvent.type(screen.getByRole('textbox', { name: /^Name/ }), 'Oona');
    await userEvent.type(screen.getByRole('textbox', { name: 'Age' }), '41');

    await userEvent.click(screen.getByRole('button', { name: '6. Review' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Create story' }));
    const draft = lastCall('create_story')?.draft as CreateStoryDraft;
    expect(draft.worldTemplateId).toBeNull();
    expect(draft.scenarioTemplateId).toBeNull();
    expect(draft.characterTemplateId).toBeNull();
    expect(draft.world).toEqual({
      era: '',
      setting: 'A floating market',
      description: '',
      rules: [],
    });
    expect(draft.player).toMatchObject({ name: 'Ivo', age: '34', personality: [] });
    expect(draft.scene.location).toBe('The east pier');
    expect(draft.npcs.map((n) => [n.name, n.age])).toEqual([['Oona', '41']]);
    expect(draft.narration.tone).toBe('');
  });

  it('Custom before changing anything, then Guided, brings the presets back', async () => {
    render(<CreateWizardScreen />);
    await screen.findByRole('combobox', { name: 'Start from a world' });
    await userEvent.click(screen.getByRole('radio', { name: 'Custom' }));
    expect(screen.getByRole('textbox', { name: /^Setting/ })).toHaveValue('');
    await userEvent.click(screen.getByRole('radio', { name: 'Guided' }));
    expect(screen.getByRole('combobox', { name: 'Start from a world' })).toHaveDisplayValue(
      'Harbor Town',
    );
    expect(screen.getByRole('combobox', { name: 'Setting' })).toHaveDisplayValue('Wrenmouth');
  });

  it('Clear all fields empties what Guided filled in', async () => {
    render(<CreateWizardScreen />);
    const world = await screen.findByRole('combobox', { name: 'Start from a world' });
    await userEvent.selectOptions(world, 'starter:station');
    await userEvent.click(screen.getByRole('radio', { name: 'Custom' }));
    // A preset picked in Guided carries over into Custom.
    expect(screen.getByRole('textbox', { name: /^Setting/ })).toHaveValue('Meridian');
    await userEvent.click(screen.getByRole('button', { name: 'Clear all fields' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Clear all fields' }),
    );
    expect(screen.getByRole('textbox', { name: /^Setting/ })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Era' })).toHaveValue('');
    await userEvent.click(screen.getByRole('button', { name: '3. Story' }));
    expect(await screen.findByRole('textbox', { name: /^Title/ })).toHaveValue('');
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
    await userEvent.click(screen.getByRole('button', { name: '6. Review' }));
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

  it('type of story, style, thoughts, cards and language reach the new story', async () => {
    render(<CreateWizardScreen />);
    const type = await screen.findByRole('combobox', { name: 'Type of story' });
    await userEvent.selectOptions(type, 'Science fiction');
    // Only the science fiction world is offered, and it is chosen.
    const world = screen.getByRole('combobox', { name: 'Start from a world' });
    expect(world).toHaveDisplayValue('Meridian Station');
    expect(within(world).queryByRole('option', { name: 'Harbor Town' })).toBeNull();
    await userEvent.selectOptions(type, 'School life');
    expect(screen.getByText(/No preset world is tagged School life yet/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '4. Narration' }));
    const cards = await screen.findByRole('checkbox', {
      name: 'Show texts, calls and letters as cards',
    });
    expect(cards).toBeChecked();
    const thoughts = screen.getByRole('checkbox', {
      name: "Show other characters' inner thoughts",
    });
    expect(thoughts).not.toBeChecked();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Style' }), 'thoughts');
    expect(thoughts).toBeChecked();
    expect(thoughts).toBeDisabled();
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Story language' }),
      'Japanese',
    );

    await userEvent.click(screen.getByRole('button', { name: '6. Review' }));
    const summary = await screen.findByLabelText('Story summary');
    expect(summary).toHaveTextContent('Thoughts and dialogue, no narrator');
    expect(summary).toHaveTextContent('in 日本語 (Japanese)');
    expect(summary).toHaveTextContent('School life, Science fiction');
    await userEvent.click(await screen.findByRole('button', { name: 'Create story' }));
    const draft = lastCall('create_story')?.draft as CreateStoryDraft;
    expect(draft.storyType).toBe('School life');
    expect(draft.narration).toMatchObject({
      style: 'thoughts',
      messageCards: true,
      language: 'Japanese',
    });
  });

  it('an adventure rolls dice, and the player gets stats', async () => {
    render(<CreateWizardScreen />);
    const type = await screen.findByRole('combobox', { name: 'Type of story' });
    await userEvent.selectOptions(type, 'Adventure');
    await userEvent.click(screen.getByRole('button', { name: '2. You' }));
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Race or species' }),
      'Lizardfolk',
    );
    const stats = await screen.findByRole('group', { name: 'Stats' });
    await userEvent.click(within(stats).getByRole('button', { name: 'Add a stat' }));
    await userEvent.type(within(stats).getByLabelText('Stat 1 name'), 'Nerve');
    const value = within(stats).getByLabelText('Nerve value');
    await userEvent.clear(value);
    await userEvent.type(value, '3');

    await userEvent.click(screen.getByRole('button', { name: '4. Narration' }));
    const dice = await screen.findByRole('checkbox', { name: 'Roll dice for uncertain moments' });
    expect(dice).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: '6. Review' }));
    const summary = await screen.findByLabelText('Story summary');
    expect(summary).toHaveTextContent('Dice rolls');
    expect(summary).toHaveTextContent('Nerve 3');
    await userEvent.click(await screen.findByRole('button', { name: 'Create story' }));
    const draft = lastCall('create_story')?.draft as CreateStoryDraft;
    expect(draft.narration.dice).toBe(true);
    expect(draft.player.stats).toEqual([{ name: 'Nerve', value: 3 }]);
    expect(draft.player.species).toBe('Lizardfolk');

    // Another type turns dice off again.
    await userEvent.click(screen.getByRole('button', { name: '1. World' }));
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Type of story' }),
      'Romance',
    );
    await userEvent.click(screen.getByRole('button', { name: '4. Narration' }));
    expect(
      await screen.findByRole('checkbox', { name: 'Roll dice for uncertain moments' }),
    ).not.toBeChecked();
  });

  it('shows an example of each style and sets every feature, down to the dice', async () => {
    render(<CreateWizardScreen />);
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Type of story' }),
      'Adventure',
    );
    await userEvent.click(screen.getByRole('button', { name: '4. Narration' }));
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Style' }), 'script');
    const example = screen.getByRole('figure', { name: 'Example of this style' });
    expect(within(example).getByText('Theo:', { selector: 'strong' })).toBeInTheDocument();
    expect(within(example).getByRole('heading', { name: 'Café Lumen — Friday, 7:14 AM' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Tense' }), 'past');
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Let the storyteller add your small reactions' }),
    );
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Characters can text or call you first' }),
    );
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Twists and surprises' }),
      'off',
    );
    await userEvent.click(screen.getByText('Dice settings'));
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Who asks for rolls' }),
      'player',
    );
    expect(screen.queryByRole('combobox', { name: 'Odds' })).not.toBeInTheDocument();
    const dice = screen.getByRole('combobox', { name: 'Dice for every roll' });
    await userEvent.type(dice, '2d');
    expect(dice).toHaveAttribute('aria-invalid', 'true');
    await userEvent.type(dice, '6');
    expect(dice).toHaveAttribute('aria-invalid', 'false');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Add your stats to rolls' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Critical rolls' }));
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Show the number needed before you roll' }),
    );

    await userEvent.click(screen.getByRole('button', { name: '6. Review' }));
    const summary = await screen.findByLabelText('Story summary');
    expect(summary).toHaveTextContent('Your small reactions');
    expect(summary).toHaveTextContent('only when you roll');
    await userEvent.click(await screen.findByRole('button', { name: 'Create story' }));
    const draft = lastCall('create_story')?.draft as CreateStoryDraft;
    expect(draft.narration).toMatchObject({
      style: 'script',
      tense: 'past',
      surprises: 'off',
      autopilot: true,
      quietPhones: true,
      dice: true,
      diceRules: { dice: '2d6', playerOnly: true, noStats: true, crits: true, hideTarget: true },
    });
  });

  it('Review lists problems and links to the step that fixes them', async () => {
    problems = [{ step: 'character', message: 'Give your character a name.' }];
    render(<CreateWizardScreen />);
    await userEvent.click(await screen.findByRole('button', { name: '6. Review' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Give your character a name.');
    expect(screen.getByRole('button', { name: 'Create story' })).toBeDisabled();
    await userEvent.click(within(alert).getByRole('button', { name: 'Go to You' }));
    const heading = await screen.findByRole('heading', { name: 'Who do you play?' });
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it('pictures for this story, a portrait and a storyteller reach the new story', async () => {
    render(<CreateWizardScreen />);
    await userEvent.click(await screen.findByRole('button', { name: '5. Pictures' }));
    await screen.findByRole('heading', { name: 'Pictures and storyteller' });

    // A picture added here belongs to this story only.
    await userEvent.click(await screen.findByRole('button', { name: /Choose Your portrait/ }));
    openDialog.mockResolvedValue(['/p/me.png']);
    await userEvent.click(screen.getByRole('button', { name: 'Add for this story' }));
    expect(invoke).toHaveBeenCalledWith('import_images', {
      paths: ['/p/me.png'],
      scope: { newStory: true },
    });
    const own = await screen.findByRole('list', { name: "This story's pictures" });
    expect(within(own).getByRole('button', { name: 'Me' })).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(screen.getByRole('list', { name: 'Pictures for all stories' })).getByRole('button', {
        name: 'Harbor',
      }),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Use this picture' }));

    // A shared picture as the cover.
    await userEvent.click(await screen.findByRole('button', { name: 'Choose Cover' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Harbor' }));
    await userEvent.click(screen.getByRole('button', { name: 'Use this picture' }));
    expect(await screen.findByRole('button', { name: 'Remove Cover' })).toBeTruthy();

    // This story uses its own connection.
    await userEvent.click(await screen.findByRole('radio', { name: /Home server/ }));
    expect(screen.getByRole('radio', { name: /Same as the app/ })).not.toBeChecked();
    expect(screen.queryByRole('textbox')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: '6. Review' }));
    const summary = await screen.findByLabelText('Story summary');
    expect(summary).toHaveTextContent('Cover and 1 portrait');
    await waitFor(() => expect(summary).toHaveTextContent('Home server'));
    await userEvent.click(await screen.findByRole('button', { name: 'Create story' }));

    const draft = lastCall('create_story')?.draft as CreateStoryDraft;
    expect(draft.pictures).toEqual([
      { slot: 'portrait:@player', assetId: 'img-me' },
      { slot: 'cover', assetId: 'img-harbor' },
    ]);
    expect(draft.storyImages).toEqual(['img-me']);
    expect(draft.storyteller).toEqual({ kind: 'connection', id: 'p1' });
  });

  it('a portrait made from the description belongs to the new story', async () => {
    render(<CreateWizardScreen />);
    await userEvent.click(await screen.findByRole('button', { name: '5. Pictures' }));
    await screen.findByRole('heading', { name: 'Pictures and storyteller' });
    // Picture connections never write replies.
    expect(await screen.findByRole('radio', { name: /Home server/ })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Picture maker/ })).toBeNull();

    await userEvent.click(await screen.findByRole('button', { name: /Choose Your portrait/ }));
    expect(await screen.findByText(/Uses Picture maker \(default\)/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Make portrait' }));
    const input = lastCall('make_portrait')?.input as Record<string, unknown>;
    expect(input).toMatchObject({ newStory: true, style: 'painted' });
    expect(input.storyId).toBeUndefined();
    const own = await screen.findByRole('list', { name: "This story's pictures" });
    expect(within(own).getByRole('button', { name: 'Portrait of Juno' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Use this picture' }));
    await userEvent.click(screen.getByRole('button', { name: '6. Review' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Create story' }));
    const draft = lastCall('create_story')?.draft as CreateStoryDraft;
    expect(draft.pictures).toEqual([{ slot: 'portrait:@player', assetId: 'img-made' }]);
    expect(draft.storyImages).toEqual(['img-made']);
  });
});

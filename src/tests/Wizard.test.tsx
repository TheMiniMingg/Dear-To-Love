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
import {
  applyCharacter,
  applyScenario,
  applyWorld,
  problemText,
} from '../features/create/WizardSteps';
import { useLanguage } from '../i18n';
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
      suits: ['starter:harbor'],
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
      suits: [],
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
  madeFrom: null,
});
let library: AssetDto[];

function lastCall(cmd: string): Record<string, unknown> | undefined {
  const calls = invoke.mock.calls.filter((c) => c[0] === cmd);
  return calls[calls.length - 1]?.[1] as Record<string, unknown> | undefined;
}

/** Opens a folded "More options" section if it is closed; -1 picks the last. */
async function unfold(label = 'More options', index = 0, scope: HTMLElement = document.body) {
  const all = [...scope.querySelectorAll<HTMLDetailsElement>('details.more-options')].filter((d) =>
    d.querySelector('summary')?.textContent?.startsWith(label),
  );
  const d = all.at(index);
  if (!d) throw new Error(`no "${label}" section`);
  if (!d.open) await userEvent.click(d.querySelector('summary')!);
  return d;
}

/** Picks an entry from a type-or-pick field's list, opened with its button. */
async function pick(label: string, option: string) {
  await userEvent.click(screen.getByRole('button', { name: `Choices for ${label}` }));
  const list = screen.getByRole('listbox', { name: label });
  await userEvent.click(within(list).getByRole('option', { name: option }));
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
    await userEvent.click(await screen.findByRole('radio', { name: 'Guided' }));
    const world = await screen.findByRole('combobox', { name: 'Start from a world' });
    expect(world).toHaveDisplayValue('Harbor Town');
    // Arrow keys move through presets.
    world.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(world).toHaveDisplayValue('Meridian Station');
    expect(screen.getByRole('combobox', { name: 'Setting' })).toHaveValue('Meridian');

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    const who = await screen.findByRole('combobox', { name: 'Start from a character' });
    await userEvent.selectOptions(who, 'starter:detective');
    // The preset's personality is filled in, so its section starts open.
    expect((await unfold()).querySelector('summary')).toHaveTextContent(
      'More options · 1 filled in',
    );
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

  it('T23: arrows, the list and typing set the same field', async () => {
    render(<CreateWizardScreen />);
    await userEvent.click(await screen.findByRole('button', { name: '2. You' }));
    const pronouns = await screen.findByRole('combobox', { name: 'Pronouns' });
    expect(pronouns).toHaveValue('');
    // Arrow keys open the list and Enter picks.
    pronouns.focus();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(pronouns).toHaveValue('he/him');
    // The list, opened with its button.
    await pick('Pronouns', 'they/them');
    expect(pronouns).toHaveValue('they/them');
    // Any choice can be cleared again.
    await userEvent.click(screen.getByRole('button', { name: 'Clear Pronouns' }));
    expect(pronouns).toHaveValue('');
    // Typing narrows the list, or writes your own.
    await userEvent.type(pronouns, 'him');
    expect(
      within(screen.getByRole('listbox', { name: 'Pronouns' }))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['he/him']);
    await userEvent.clear(pronouns);
    await userEvent.type(pronouns, 'xe/xem');
    await userEvent.click(screen.getByRole('button', { name: '6. Review' }));
    expect(await screen.findByLabelText('Story summary')).toHaveTextContent('(xe/xem)');
    await userEvent.click(screen.getByRole('button', { name: 'Create story' }));
    expect((lastCall('create_story')?.draft as CreateStoryDraft).player.pronouns).toBe('xe/xem');
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

  it('Custom comes first, starts blank, and every field is written from empty', async () => {
    render(<CreateWizardScreen />);
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Custom Story');
    expect(await screen.findByRole('radio', { name: 'Custom' })).toBeChecked();
    expect(screen.queryByRole('combobox', { name: 'Start from a world' })).toBeNull();
    const setting = screen.getByRole('combobox', { name: 'Setting' });
    expect(setting).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Era' })).toHaveValue('');
    const type = screen.getByRole('combobox', { name: 'Type of story' });
    expect(type).toHaveValue('');
    expect(screen.getByRole('switch', { name: 'RPG mode' })).not.toBeChecked();
    await userEvent.type(setting, 'A floating market');
    await userEvent.type(type, 'Heist');

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    const name = await screen.findByRole('combobox', { name: /^Name/ });
    expect(screen.queryByRole('combobox', { name: 'Start from a character' })).toBeNull();
    expect(name).toHaveValue('');
    expect(screen.queryByRole('group', { name: 'Stats' })).toBeNull();
    await userEvent.type(name, 'Ivo');
    // Age and the rest are folded away until wanted.
    const more = await unfold();
    expect(more.querySelector('summary')).toHaveTextContent('More options · optional');
    await userEvent.type(screen.getByRole('textbox', { name: 'Age' }), '34');

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    const title = await screen.findByRole('textbox', { name: /^Title/ });
    expect(title).toHaveValue('');
    expect(screen.queryByRole('combobox', { name: 'Start from a scenario' })).toBeNull();
    expect(screen.queryByText('Bring in a preset character')).toBeNull();
    await userEvent.type(title, 'Lanterns');
    await userEvent.type(
      screen.getByRole('textbox', { name: /^Starting location/ }),
      'The east pier',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add a character' }));
    const oona = screen.getByRole('textbox', { name: /^Name/ });
    await userEvent.type(oona, 'Oona');
    await userEvent.type(screen.getByRole('textbox', { name: 'How they know you' }), 'Rival');
    await unfold('More options', 0, oona.closest('li')!);
    await userEvent.type(screen.getByRole('textbox', { name: 'Age' }), '41');
    await unfold('More options', -1);
    const chapter = screen.getByRole('textbox', { name: /^First chapter title/ });
    expect(chapter).toHaveValue('');
    expect(chapter).toHaveAttribute('placeholder', 'Chapter 1');

    await userEvent.click(screen.getByRole('button', { name: '4. Narration' }));
    expect(await screen.findByRole('combobox', { name: 'Style' })).toHaveValue('mixed');
    await userEvent.type(
      screen.getByRole('textbox', { name: /^Your own style/ }),
      'Lots of banter',
    );

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
    expect(draft.storyType).toBe('Heist');
    expect(draft.title).toBe('Lanterns');
    expect(draft.player).toMatchObject({ name: 'Ivo', age: '34', personality: [] });
    expect(draft.scene.location).toBe('The east pier');
    expect(draft.npcs.map((n) => [n.name, n.age])).toEqual([['Oona', '41']]);
    expect(draft.relationships).toEqual([
      { fromId: 'custom:npc-1', toId: '@player', label: 'Rival', status: '' },
    ]);
    expect(draft.firstChapterTitle).toBe('');
    expect(draft.narration).toMatchObject({
      tone: '',
      style: 'mixed',
      styleNotes: 'Lots of banter',
    });
    expect(draft.narration.dice).toBeUndefined();
    expect(draft.tracking).toBeUndefined();
  });

  it('a story can begin with only a name; the rest is left open', async () => {
    render(<CreateWizardScreen />);
    await userEvent.click(await screen.findByRole('button', { name: '2. You' }));
    await userEvent.type(await screen.findByRole('combobox', { name: /^Name/ }), 'Ivo');
    await userEvent.click(screen.getByRole('button', { name: '6. Review' }));
    const summary = await screen.findByLabelText('Story summary');
    expect(summary).toHaveTextContent('Untitled story');
    expect(summary).toHaveTextContent('Left open');
    expect(summary).toHaveTextContent('Chapter 1');
    expect(summary).toHaveTextContent('Mixed: whatever fits the moment');
    await userEvent.click(screen.getByRole('button', { name: 'Create story' }));
    const draft = lastCall('create_story')?.draft as CreateStoryDraft;
    expect(draft.title).toBe('Untitled story');
    expect(draft.world).toEqual({ era: '', setting: '', description: '', rules: [] });
    expect(draft.scene).toEqual({ location: '', summary: '' });
    expect(draft.player).toMatchObject({ name: 'Ivo', personality: [], goals: [] });
    expect(draft.player.species).toBeUndefined();
    expect(draft.player.pronouns).toBeUndefined();
    expect(draft.npcs).toEqual([]);
    expect(draft.storyType).toBeUndefined();
  });

  it('Custom before changing anything, then Guided, brings the presets back', async () => {
    render(<CreateWizardScreen />);
    expect(await screen.findByRole('combobox', { name: 'Setting' })).toHaveValue('');
    await userEvent.click(screen.getByRole('radio', { name: 'Guided' }));
    expect(screen.getByRole('combobox', { name: 'Start from a world' })).toHaveDisplayValue(
      'Harbor Town',
    );
    expect(screen.getByRole('combobox', { name: 'Setting' })).toHaveValue('Wrenmouth');
    // And back to Custom: blank again.
    await userEvent.click(screen.getByRole('radio', { name: 'Custom' }));
    expect(screen.getByRole('combobox', { name: 'Setting' })).toHaveValue('');
  });

  it('None takes back a preset world, character and opening', async () => {
    render(<CreateWizardScreen />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Guided' }));
    const world = await screen.findByRole('combobox', { name: 'Start from a world' });
    await userEvent.selectOptions(world, 'None (start blank)');
    expect(world).toHaveDisplayValue('None (start blank)');
    expect(screen.getByRole('combobox', { name: 'Setting' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Era' })).toHaveValue('');

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    const who = await screen.findByRole('combobox', { name: 'Start from a character' });
    const more = await unfold();
    expect(more.querySelector('summary')).toHaveTextContent('1 filled in');
    await userEvent.selectOptions(who, 'None (start blank)');
    expect(screen.getByRole('combobox', { name: /^Name/ })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Pronouns' })).toHaveValue('');
    expect(more.querySelector('summary')).toHaveTextContent('More options · optional');

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    const scenario = await screen.findByRole('combobox', { name: 'Start from a scenario' });
    expect(screen.getByRole('textbox', { name: /^Name/ })).toHaveValue('Mara');
    await userEvent.selectOptions(scenario, 'None (start blank)');
    expect(screen.getByRole('textbox', { name: /^Title/ })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: /^Starting location/ })).toHaveValue('');
    expect(screen.queryByRole('textbox', { name: /^Name/ })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: '6. Review' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Create story' }));
    const draft = lastCall('create_story')?.draft as CreateStoryDraft;
    expect(draft.worldTemplateId).toBeNull();
    expect(draft.characterTemplateId).toBeNull();
    expect(draft.scenarioTemplateId).toBeNull();
    expect(draft.npcs).toEqual([]);
    expect(draft.relationships).toEqual([]);
  });

  it('Clear all fields empties what Guided filled in', async () => {
    render(<CreateWizardScreen />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Guided' }));
    const world = await screen.findByRole('combobox', { name: 'Start from a world' });
    await userEvent.selectOptions(world, 'starter:station');
    await userEvent.click(screen.getByRole('radio', { name: 'Custom' }));
    // A preset picked in Guided carries over into Custom.
    expect(screen.getByRole('combobox', { name: 'Setting' })).toHaveValue('Meridian');
    await userEvent.click(screen.getByRole('button', { name: 'Clear all fields' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Clear all fields' }),
    );
    expect(screen.getByRole('combobox', { name: 'Setting' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Era' })).toHaveValue('');
    await userEvent.click(screen.getByRole('button', { name: '3. Story' }));
    expect(await screen.findByRole('textbox', { name: /^Title/ })).toHaveValue('');
  });

  it('genre, content rating, themes and limits reach the new story', async () => {
    localStorage.clear();
    render(<CreateWizardScreen />);
    await screen.findByRole('combobox', { name: 'Type of story' });
    await pick('Type of story', 'Romance');
    await userEvent.click(screen.getByRole('button', { name: '4. Narration' }));
    await unfold('More ways to shape it');
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Add to more genres from the list' }),
      'Horror',
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Add your own to more genres' }),
      'Cozy{Enter}',
    );

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
      'Romance, Horror, Cozy · Adults only',
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Create story' }));
    const draft = lastCall('create_story')?.draft as CreateStoryDraft;
    expect(draft.storyType).toBe('Romance');
    expect(draft.narration.genres).toEqual(['Horror', 'Cozy']);
    expect(draft.narration.rating).toBe('explicit');
    expect(draft.narration.themes?.filter(Boolean)).toEqual(['slow burn', 'rivals']);
    expect(draft.narration.limits).toEqual(['gore']);
  });

  it('type of story, style, thoughts, cards and language reach the new story', async () => {
    render(<CreateWizardScreen />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Guided' }));
    await screen.findByRole('combobox', { name: 'Start from a world' });
    await pick('Type of story', 'Science fiction');
    // Only the science fiction world is offered, and it is chosen.
    const world = screen.getByRole('combobox', { name: 'Start from a world' });
    expect(world).toHaveDisplayValue('Meridian Station');
    expect(within(world).queryByRole('option', { name: 'Harbor Town' })).toBeNull();
    await pick('Type of story', 'School life');
    expect(screen.getByText(/No preset world is tagged School life yet/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '4. Narration' }));
    await unfold('More ways to shape it');
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

  it('RPG mode: an adventure rolls dice, and the player sets stats, bars and items', async () => {
    render(<CreateWizardScreen />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Guided' }));
    await screen.findByRole('combobox', { name: 'Start from a world' });
    await pick('Type of story', 'Adventure');
    const rpg = screen.getByRole('switch', { name: 'RPG mode' });
    expect(rpg).toBeChecked();

    await userEvent.click(screen.getByRole('button', { name: '2. You' }));
    const stats = await screen.findByRole('group', { name: 'Stats' });
    expect(within(stats).getByText(/A stat is a bonus added to dice rolls/)).toBeInTheDocument();
    // Each stat says what it is for: Strength and Fitness are not the same.
    expect(
      within(stats).getByRole('button', { name: /^Add Strength: Raw power/ }),
    ).toBeInTheDocument();
    expect(
      within(stats).getByRole('button', { name: /^Add Fitness: Stamina and athletics/ }),
    ).toBeInTheDocument();
    await userEvent.click(within(stats).getByRole('button', { name: /^Add Nerve:/ }));
    expect(within(stats).getByText(/^Courage under pressure/)).toBeInTheDocument();
    expect(within(stats).queryByRole('button', { name: /^Add Nerve:/ })).toBeNull();
    const value = within(stats).getByLabelText('Nerve value');
    await userEvent.clear(value);
    await userEvent.type(value, '3');
    // Health, mana and items are set up here too, starting from the usual ones.
    expect(screen.getByLabelText('Bar 2 name')).toHaveValue('Mana');
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Add a bar or counter' })).getByRole('button', {
        name: '+ Stamina',
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add an item' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Item 1 name' }), 'Rope');
    await unfold();
    await pick('Race or species', 'Lizardfolk');

    await userEvent.click(screen.getByRole('button', { name: '6. Review' }));
    const summary = await screen.findByLabelText('Story summary');
    expect(summary).toHaveTextContent('Dice rolls');
    expect(summary).toHaveTextContent('Nerve 3');
    expect(summary).toHaveTextContent('Mana 50/50');
    expect(summary).toHaveTextContent('Stamina 100/100');
    await userEvent.click(await screen.findByRole('button', { name: 'Create story' }));
    const draft = lastCall('create_story')?.draft as CreateStoryDraft;
    expect(draft.narration.dice).toBe(true);
    expect(draft.player.stats).toEqual([{ name: 'Nerve', value: 3 }]);
    expect(draft.player.species).toBe('Lizardfolk');
    expect(draft.tracking?.meters).toContainEqual({ name: 'Stamina', value: 100, max: 100 });
    expect(draft.tracking?.items?.map((i) => i.name)).toEqual(['Rope']);

    // Another type turns RPG mode off again.
    await userEvent.click(screen.getByRole('button', { name: '1. World' }));
    await screen.findByRole('combobox', { name: 'Type of story' });
    await pick('Type of story', 'Romance');
    expect(screen.getByRole('switch', { name: 'RPG mode' })).not.toBeChecked();
  });

  it('RPG mode in Custom starts empty, and switched off leaves no numbers', async () => {
    render(<CreateWizardScreen />);
    await userEvent.click(await screen.findByRole('switch', { name: 'RPG mode' }));
    expect(screen.getByText(/^On: you set your stats/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '2. You' }));
    const stats = await screen.findByRole('group', { name: 'Stats' });
    expect(within(stats).queryByRole('spinbutton')).toBeNull();
    // In RPG mode, bars and items are simply there, without a box to turn them on.
    expect(
      screen.queryByRole('checkbox', { name: 'Keep track of health, items and more' }),
    ).toBeNull();
    await userEvent.click(within(stats).getByRole('button', { name: '+ Your own' }));
    await userEvent.type(within(stats).getByLabelText('Stat 1 name'), 'Cooking');
    expect(screen.queryByRole('spinbutton', { name: /now$/ })).toBeNull();
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Add a bar or counter' })).getByRole('button', {
        name: '+ Health',
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: '6. Review' }));
    const summary = await screen.findByLabelText('Story summary');
    expect(summary).toHaveTextContent('Cooking 1');
    expect(summary).toHaveTextContent('Health 100/100');

    await userEvent.click(screen.getByRole('button', { name: '1. World' }));
    await userEvent.click(await screen.findByRole('switch', { name: 'RPG mode' }));
    await userEvent.click(screen.getByRole('button', { name: '2. You' }));
    await screen.findByRole('combobox', { name: /^Name/ });
    expect(screen.queryByRole('group', { name: 'Stats' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '6. Review' }));
    expect(await screen.findByLabelText('Story summary')).not.toHaveTextContent('Cooking');
    await userEvent.click(screen.getByRole('button', { name: 'Create story' }));
    const draft = lastCall('create_story')?.draft as CreateStoryDraft;
    expect(draft.narration.dice).toBeUndefined();
    expect(draft.player.stats).toBeUndefined();
    expect(draft.tracking).toBeUndefined();
  });

  it('shows an example of each style and sets every feature, down to the dice', async () => {
    render(<CreateWizardScreen />);
    // Mixed is the usual way: narration, talk, a thought and a text, each where it fits.
    await userEvent.click(await screen.findByRole('button', { name: '4. Narration' }));
    const style = await screen.findByRole('combobox', { name: 'Style' });
    expect(style).toHaveValue('mixed');
    let example = screen.getByRole('figure', { name: 'Example of this style' });
    expect(within(example).getByText(/They actually came back/)).toBeInTheDocument();
    expect(within(example).getByText(/did you make it/)).toBeInTheDocument();
    expect(screen.queryByText(/A starting point, not a rule/)).toBeNull();
    await userEvent.selectOptions(style, 'script');
    // Any other style is where it starts, not a lock.
    expect(screen.getByText(/A starting point, not a rule/)).toBeInTheDocument();
    example = screen.getByRole('figure', { name: 'Example of this style' });
    expect(within(example).getByText('Theo:', { selector: 'strong' })).toBeInTheDocument();
    expect(within(example).getByRole('heading', { name: 'Café Lumen — Friday, 7:14 AM' }));
    await unfold('More ways to shape it');
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
    expect(screen.queryByRole('checkbox', { name: 'Roll dice for uncertain moments' })).toBeNull();

    // Dice settings sit with RPG mode.
    await userEvent.click(screen.getByRole('button', { name: '1. World' }));
    await userEvent.click(await screen.findByRole('switch', { name: 'RPG mode' }));
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

  it('names the problems in the chosen language', () => {
    // The core's English comes through unchanged in English.
    for (const text of [
      'Give your character a name.',
      'Rin is also your character. Remove them from the story or choose a different character to play.',
      'Rin must be 18 or older in an adults-only story. Change their age or remove them.',
      'The relationship "rivals" refers to a character who is no longer in the story.',
      'Your character\'s id "bad" must look like namespace:name.',
      'Rin\'s id "bad" must look like namespace:name.',
    ])
      expect(problemText(text)).toBe(text);
    useLanguage.getState().setChoice('ja');
    try {
      expect(problemText('Give your character a name.')).toBe(
        'キャラクターに名前を付けてください。',
      );
      expect(problemText('Rin is in the story twice. Remove one.')).toBe(
        'Rin がストーリーに 2 回登場しています。片方を削除してください。',
      );
      expect(problemText('Something new.')).toBe('Something new.');
    } finally {
      useLanguage.getState().setChoice('en');
    }
  });

  it('pictures for this story, a portrait and a storyteller reach the new story', async () => {
    render(<CreateWizardScreen />);
    await userEvent.click(await screen.findByRole('button', { name: '5. Pictures' }));
    await screen.findByRole('heading', { name: 'Pictures and storyteller' });

    // A picture added here belongs to this story only.
    await userEvent.click(await screen.findByRole('button', { name: /Choose Your portrait/ }));
    expect(screen.getByText(/"Your library" shares it with every story/)).toBeInTheDocument();
    openDialog.mockResolvedValue(['/p/me.png']);
    await userEvent.click(screen.getByRole('button', { name: 'Add for this story only' }));
    expect(invoke).toHaveBeenCalledWith('import_images', {
      paths: ['/p/me.png'],
      scope: { newStory: true },
    });
    const own = await screen.findByRole('list', { name: 'This story only' });
    expect(within(own).getByRole('button', { name: 'Me' })).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(screen.getByRole('list', { name: 'Your library (any story)' })).getByRole('button', {
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
    await userEvent.click(await screen.findByRole('radio', { name: 'Guided' }));
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
    const own = await screen.findByRole('list', { name: 'This story only' });
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

  it('brings someone from another story, and plays as someone already made', async () => {
    const base = invoke.getMockImplementation()!;
    const mara = {
      id: 'starter:npc-mara',
      name: 'Mara Quill',
      control: 'npc',
      role: 'Ferry captain',
      description: 'Keeps the lighthouse.',
      personality: ['stubborn'],
      goals: [],
      abilities: [],
    };
    const ivo = { ...mara, id: 'pc', name: 'Ivo Brand', control: 'player', role: 'Diver' };
    invoke.mockImplementation(async (cmd: string, args: Record<string, unknown>) =>
      cmd === 'list_story_characters'
        ? [
            { storyId: 's1', storyTitle: 'The Letter', wasPlayer: true, character: ivo },
            { storyId: 's1', storyTitle: 'The Letter', wasPlayer: false, character: mara },
          ]
        : base(cmd, args),
    );
    render(<CreateWizardScreen />);
    await userEvent.click(await screen.findByRole('button', { name: '2. You' }));
    await userEvent.click(await screen.findByRole('button', { name: 'From your stories' }));
    const list = await screen.findByRole('list', { name: 'Characters in your stories' });
    expect(
      within(list).getByRole('button', { name: /Ivo Brand.*you, in “The Letter”/ }),
    ).toBeTruthy();
    await userEvent.click(within(list).getByRole('button', { name: /Ivo Brand/ }));
    expect(screen.getByRole('combobox', { name: /^Name/ })).toHaveValue('Ivo Brand');
    expect(screen.getByText(/^Ivo Brand from “The Letter” is in this story now/)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: '3. Story' }));
    await userEvent.click(await screen.findByRole('button', { name: 'From your stories' }));
    await userEvent.click(
      within(await screen.findByRole('list', { name: 'Characters in your stories' })).getByRole(
        'button',
        { name: /Mara Quill/ },
      ),
    );
    await userEvent.click(screen.getByRole('button', { name: '6. Review' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Create story' }));
    const draft = lastCall('create_story')?.draft as CreateStoryDraft;
    // They keep this story's place for the player, not the old story's id.
    expect(draft.player).toMatchObject({ name: 'Ivo Brand', role: 'Diver', control: 'player' });
    expect(draft.player.id).not.toBe('pc');
    expect(draft.npcs).toEqual([{ ...mara, id: 'custom:npc-1', control: 'npc' }]);
  });

  it('a character card brings its character, opening and picture', async () => {
    const base = invoke.getMockImplementation()!;
    invoke.mockImplementation(async (cmd: string, args: Record<string, unknown>) =>
      cmd === 'read_character_card'
        ? {
            character: {
              id: '',
              name: 'Mara Quill',
              control: 'npc',
              description: 'Keeps the lighthouse.',
              personality: ['kind'],
              goals: [],
              abilities: [],
            },
            scenario: 'Juno arrives on the last ferry.',
            greeting: '*Mara looks up.* "You are late."',
            hasPicture: true,
          }
        : base(cmd, args),
    );
    render(<CreateWizardScreen />);
    await userEvent.click(await screen.findByRole('button', { name: '2. You' }));
    await userEvent.type(await screen.findByRole('combobox', { name: /^Name/ }), 'Juno');
    await userEvent.click(screen.getByRole('button', { name: '3. Story' }));
    openDialog.mockResolvedValue('/cards/mara.png');
    await userEvent.click(await screen.findByRole('button', { name: /From a character card/ }));
    expect(lastCall('read_character_card')).toEqual({
      path: '/cards/mara.png',
      playerName: 'Juno',
    });
    expect(lastCall('import_images')).toEqual({
      paths: ['/cards/mara.png'],
      scope: { newStory: true },
    });
    const note = await screen.findByText(/^Mara Quill is in this story now/);
    expect(note).toHaveTextContent('Mara Quill is in this story now.');
    expect(note).toHaveTextContent('The card’s picture is their portrait.');
    expect(note).toHaveTextContent('Its first message is the opening scene.');
    expect(screen.getByRole('textbox', { name: 'Opening scene' })).toHaveValue(
      '*Mara looks up.* "You are late."',
    );
    await userEvent.click(screen.getByRole('button', { name: '6. Review' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Create story' }));
    const draft = lastCall('create_story')?.draft as CreateStoryDraft;
    expect(draft.npcs[0]).toMatchObject({ id: 'custom:npc-1', name: 'Mara Quill', control: 'npc' });
    expect(draft.description).toBe('Juno arrives on the last ferry.');
    expect(draft.pictures).toEqual([{ slot: 'portrait:custom:npc-1', assetId: 'img-me' }]);
    expect(draft.storyImages).toEqual(['img-me']);
  });

  it('a card that is not a card, or reads as under 18, says so', async () => {
    const base = invoke.getMockImplementation()!;
    let reply = 'this file is not a character card';
    invoke.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
      if (cmd === 'read_character_card') throw { code: 'INVALID_INPUT', message: reply };
      return base(cmd, args);
    });
    render(<CreateWizardScreen />);
    await userEvent.click(await screen.findByRole('button', { name: '3. Story' }));
    openDialog.mockResolvedValue('/cards/notes.json');
    await userEvent.click(await screen.findByRole('button', { name: /From a character card/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This file is not a character card. Choose a card saved as .png or .json.',
    );
    reply = "this character reads as under 18, so it can't be used";
    await userEvent.click(screen.getByRole('button', { name: /From a character card/ }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'This character reads as under 18, so they can’t be brought into a story.',
      ),
    );
    expect(screen.queryByRole('textbox', { name: /^Name/ })).toBeNull();
  });
});

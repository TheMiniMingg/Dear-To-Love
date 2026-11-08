// Sound on or off, and voice packs: a narrator and a voice per character,
// from the computer or an AI voice connection, saved to a file and back.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Character, ProviderProfile, StoryCharacter, VoicePackFile } from '../types';

const invoke = vi.fn();
const openDialog = vi.fn();
const saveDialog = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  Channel: class {},
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...args: unknown[]) => openDialog(...args),
  save: (...args: unknown[]) => saveDialog(...args),
}));

import { useReadAloud } from '../app/readAloud';
import { playChime } from '../app/replyWatch';
import { useSound } from '../app/sound';
import { speakerSegments } from '../app/speakers';
import { useVoicePacks, type VoicePack } from '../app/voicePacks';
import { SoundSection } from '../features/settings/SoundSection';

const eleven: ProviderProfile = {
  id: 'v1',
  label: 'My ElevenLabs',
  adapter: 'elevenlabs',
  baseUrl: 'https://api.elevenlabs.io/v1',
  modelId: 'eleven_flash_v2_5',
  billing: 'paid',
  hasKey: true,
  settings: { temperature: 0.9, maxOutputTokens: 700, timeoutMs: 120000, maxContextTokens: 16000 },
  createdAt: '',
  updatedAt: '',
};

const person = (name: string): Character => ({
  id: name.toLowerCase(),
  name,
  control: 'npc',
  personality: [],
  goals: [],
  abilities: [],
});

const people: StoryCharacter[] = [
  { storyId: 's1', storyTitle: 'Lighthouse', wasPlayer: false, character: person('Mina Park') },
  { storyId: 's1', storyTitle: 'Lighthouse', wasPlayer: false, character: person('Old Tom') },
  { storyId: 's1', storyTitle: 'Lighthouse', wasPlayer: true, character: person('You') },
];

describe('Who says what', () => {
  it('reads script lines and quoted speech in the speaker’s voice', () => {
    const text = [
      'The lamp flickers. **Mina** looks up from the logbook.',
      '"You came back," Mina says, "after all this time."',
      'Old Tom: "Took you long enough."',
      '"Tom?" you ask. Nobody answers.',
      'Stranger: "Who are you?"',
    ].join('\n\n');
    expect(speakerSegments(text, ['Mina Park', 'Old Tom'])).toEqual([
      { who: null, text: 'The lamp flickers. Mina looks up from the logbook.' },
      { who: 'Mina Park', text: '"You came back,"' },
      { who: null, text: 'Mina says,' },
      { who: 'Mina Park', text: '"after all this time."' },
      { who: 'Old Tom', text: '"Took you long enough."' },
      // A name inside the quote is being spoken to: the narrator reads it.
      { who: null, text: '"Tom?" you ask. Nobody answers.\nStranger: "Who are you?"' },
    ]);
  });

  it('finds names in scripts without letter case, and joins the narrator’s pieces', () => {
    const text = 'エリカは窓を開けた。「おかえり」とエリカが言う。\n\n波の音がする。';
    expect(speakerSegments(text, ['エリカ'])).toEqual([
      { who: null, text: 'エリカは窓を開けた。' },
      { who: 'エリカ', text: '「おかえり」' },
      { who: null, text: 'とエリカが言う。\n波の音がする。' },
    ]);
    expect(speakerSegments('"Hello."', [])).toEqual([{ who: null, text: '"Hello."' }]);
  });
});

describe('Sound on or off', () => {
  afterEach(() => {
    useSound.getState().setOn(true);
    vi.unstubAllGlobals();
  });

  it('one switch silences the chime and reading aloud, and is remembered', async () => {
    const made = vi.fn();
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          made();
        }
      },
    );
    invoke.mockResolvedValue([]);
    render(<SoundSection />);
    const toggle = screen.getByRole('switch', { name: 'Sound on' });
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);
    expect(useSound.getState().on).toBe(false);
    expect(JSON.parse(localStorage.getItem('dtl.sound') ?? '{}')).toEqual({ on: false });
    expect(screen.getByText(/Sound is off/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Chime when a reply is ready/ })).toBeDisabled();
    playChime();
    expect(made).not.toHaveBeenCalled();
    useReadAloud.getState().read('ev-1', 'Hello.', undefined, { pack: null });
    expect(useReadAloud.getState().reading).toBeNull();
  });

  it('reading each new reply aloud is a choice kept on this computer', async () => {
    invoke.mockResolvedValue([]);
    render(<SoundSection />);
    const auto = screen.getByRole('checkbox', { name: 'Read each new reply aloud' });
    expect(auto).not.toBeChecked();
    await userEvent.click(auto);
    expect(useReadAloud.getState().autoRead).toBe(true);
    expect(JSON.parse(localStorage.getItem('dtl.readAloud') ?? '{}').autoRead).toBe(true);
    await userEvent.click(auto);
    expect(useReadAloud.getState().autoRead).toBe(false);
  });
});

describe('Voice packs', () => {
  const spoken: { connectionId: string; voice: string; text: string; allowUnpriced: boolean }[] =
    [];
  let budget = false;
  let imported: VoicePackFile | null = null;

  beforeEach(() => {
    spoken.length = 0;
    budget = false;
    localStorage.removeItem('dtl.voicePacks');
    useVoicePacks.setState({ packs: [], active: null });
    useReadAloud.setState({ reading: null, problem: null, fetching: false });
    vi.stubGlobal(
      'Audio',
      class {
        playbackRate = 1;
        onended: (() => void) | null = null;
        onerror: (() => void) | null = null;
        play() {
          setTimeout(() => this.onended?.(), 0);
          return Promise.resolve();
        }
        pause() {}
      },
    );
    URL.createObjectURL = vi.fn(() => 'blob:voice');
    URL.revokeObjectURL = vi.fn();
    invoke.mockReset();
    invoke.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
      switch (cmd) {
        case 'list_connections':
          return [eleven];
        case 'list_voices':
          return [
            { id: 'rachel1', name: 'Rachel', note: 'american, female' },
            { id: 'mine9', name: 'My voice', note: 'cloned' },
          ];
        case 'list_story_characters':
          return people;
        case 'speak_text': {
          const input = args.input as (typeof spoken)[number];
          if (budget && !input.allowUnpriced)
            throw { code: 'BUDGET_OVERRIDE_REQUIRED', message: 'budget' };
          spoken.push(input);
          return new ArrayBuffer(8);
        }
        case 'export_voice_pack':
          return null;
        case 'import_voice_pack':
          return imported;
        default:
          throw { code: 'NOT_FOUND', message: cmd };
      }
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('makes a pack of AI voices with the people from a story, and reads with it', async () => {
    render(<SoundSection />);
    await userEvent.click(screen.getByRole('button', { name: 'New voice pack' }));
    const dialog = await screen.findByRole('dialog', { name: 'New voice pack' });
    const name = within(dialog).getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Lighthouse cast');
    await userEvent.selectOptions(within(dialog).getByLabelText('Voices from'), 'v1');
    expect(within(dialog).getByText(/sent to this voice service/)).toBeInTheDocument();
    const narrator = within(dialog).getByRole('combobox', { name: 'Narrator' });
    await waitFor(() =>
      expect(within(narrator).getByText('Rachel (american, female)')).toBeTruthy(),
    );
    await userEvent.selectOptions(narrator, 'rachel1');
    // The player's own character is left out.
    await userEvent.selectOptions(
      await within(dialog).findByRole('combobox', { name: 'Add the people from a story' }),
      's1',
    );
    expect(within(dialog).getByDisplayValue('Mina Park')).toBeInTheDocument();
    expect(within(dialog).queryByDisplayValue('You')).toBeNull();
    await userEvent.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Voice for Mina Park' }),
      'mine9',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save voice pack' }));

    const pack = useVoicePacks.getState().packs[0]!;
    expect(useVoicePacks.getState().active).toBe(pack.id);
    expect(pack.narrator).toEqual({ voice: 'rachel1', label: 'Rachel' });
    expect(pack.characters.map((c) => [c.name, c.voice])).toEqual([
      ['Mina Park', 'mine9'],
      ['Old Tom', ''],
    ]);
    expect(screen.getByText(/1 character has a voice of their own/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Try it' }));
    await waitFor(() => expect(useReadAloud.getState().reading).toBeNull());
    expect(spoken.map((s) => [s.voice, s.text])).toEqual([
      ['rachel1', 'The bell over the door rings.'],
      ['mine9', '"You came back,"'],
      ['rachel1', 'Mina Park says.'],
    ]);
    expect(spoken.every((s) => s.connectionId === 'v1' && !s.allowUnpriced)).toBe(true);
  });

  const stored: VoicePack = {
    id: 'pack-1',
    name: 'Cast',
    source: 'elevenlabs',
    connectionId: 'v1',
    // Other voices than above: what was read before is played again, unasked.
    narrator: { voice: 'rachel2', label: 'Rachel' },
    speed: 'normal',
    characters: [{ name: 'Mina', voice: 'mine8', label: 'My voice' }],
  };

  it('asks before AI voices the budget can’t price, then reads this once', async () => {
    budget = true;
    useVoicePacks.setState({ packs: [stored], active: 'pack-1' });
    render(<SoundSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Try it' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/can’t price AI voices/);
    expect(spoken).toEqual([]);
    await userEvent.click(within(alert).getByRole('button', { name: 'Read aloud anyway' }));
    await waitFor(() => expect(spoken.length).toBe(3));
    expect(spoken.every((s) => s.allowUnpriced)).toBe(true);
  });

  it('saves a pack to a file with no connection, and imports one for this computer', async () => {
    useVoicePacks.setState({ packs: [stored], active: 'pack-1' });
    saveDialog.mockResolvedValue('/home/me/Cast.dtlvoices');
    render(<SoundSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Save to a file…' }));
    expect(saveDialog).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: 'Cast.dtlvoices' }),
    );
    expect(invoke).toHaveBeenCalledWith('export_voice_pack', {
      path: '/home/me/Cast.dtlvoices',
      pack: {
        name: 'Cast',
        source: 'elevenlabs',
        narrator: stored.narrator,
        speed: 'normal',
        characters: stored.characters,
      },
    });
    expect(await screen.findByText(/no keys and no connections/)).toBeInTheDocument();

    imported = {
      name: 'Shared cast',
      source: 'elevenlabs',
      narrator: { voice: 'abc', label: 'Adam' },
      speed: 'fast',
      characters: [],
    };
    openDialog.mockResolvedValue('/home/me/Shared.dtlvoices');
    await userEvent.click(screen.getByRole('button', { name: 'Import voice pack…' }));
    await screen.findByText(/Imported Shared cast, and replies are read with it now/);
    const added = useVoicePacks.getState().packs.find((p) => p.name === 'Shared cast')!;
    expect(added.connectionId).toBe('v1');
    expect(useVoicePacks.getState().active).toBe(added.id);
    expect(JSON.parse(localStorage.getItem('dtl.voicePacks') ?? '{}').packs).toHaveLength(2);
  });
});

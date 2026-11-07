// Making a character's portrait from their description with the picture
// connection chosen in Settings.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetDto, Character, ProviderProfile, World } from '../types';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  Channel: class {},
}));

import { MakePortrait } from '../features/images/MakePortrait';

const painter: ProviderProfile = {
  id: 'p2',
  label: 'Pictures',
  adapter: 'openai_images',
  baseUrl: 'https://api.openai.com/v1',
  modelId: 'gpt-image-1',
  billing: 'paid',
  hasKey: true,
  settings: { temperature: 0.9, maxOutputTokens: 700, timeoutMs: 300000, maxContextTokens: 16000 },
  createdAt: '',
  updatedAt: '',
};

const mara: Character = {
  id: 'c1',
  name: 'Mara',
  control: 'npc',
  species: 'Lizardfolk',
  appearance: 'green scales',
  personality: ['wry'],
  goals: [],
  abilities: [],
};

const world: World = { era: 'Age of sail', setting: 'a harbor town', description: '', rules: [] };

const portrait: AssetDto = {
  id: 'a9',
  mime: 'image/png',
  width: 1024,
  height: 1024,
  byteSize: 2000,
  label: 'Portrait of Mara',
  tags: ['Portrait'],
  createdAt: '',
  shared: false,
  stories: [{ id: 's1', title: 'Harbor' }],
};

describe('Make a portrait', () => {
  let maker: string | null;

  beforeEach(() => {
    maker = 'p2';
    invoke.mockReset();
    invoke.mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case 'get_picture_maker':
          return maker;
        case 'list_connections':
          return [painter];
        case 'preview_portrait':
          return {
            text: 'Head-and-shoulders portrait of a lizardfolk (person). No text.',
            avoid: 'nudity, text',
          };
        case 'make_portrait':
          return portrait;
        default:
          throw { code: 'NOT_FOUND', message: cmd };
      }
    });
  });

  it('says how to turn it on when no picture connection is chosen', async () => {
    maker = null;
    render(<MakePortrait character={mara} world={world} storyId="s1" onMade={() => {}} />);
    expect(await screen.findByText(/add a picture connection in Settings/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Make portrait' })).toBeNull();
  });

  it('shows what is sent, then makes the portrait for this story', async () => {
    const onMade = vi.fn();
    render(<MakePortrait character={mara} world={world} storyId="s1" onMade={onMade} />);
    expect(await screen.findByText(/Uses Pictures \(gpt-image-1\)/)).toBeInTheDocument();
    expect(screen.getByText(/charges for each picture/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Show what is sent' }));
    expect(await screen.findByText(/portrait of a lizardfolk/)).toBeInTheDocument();
    expect(screen.getByText('Avoid: nudity, text')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Style'), 'anime');
    await userEvent.click(screen.getByRole('button', { name: 'Make portrait' }));
    expect(invoke).toHaveBeenCalledWith('make_portrait', {
      input: { character: mara, world, style: 'anime', storyId: 's1' },
    });
    expect(onMade).toHaveBeenCalledWith(portrait);
    expect(await screen.findByText(/Made “Portrait of Mara”/)).toBeInTheDocument();
  });

  it('a story being created asks for a picture that waits for it', async () => {
    render(<MakePortrait character={mara} world={world} onMade={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Make portrait' }));
    expect(invoke).toHaveBeenCalledWith('make_portrait', {
      input: { character: mara, world, style: 'painted', newStory: true },
    });
  });

  it('asks before an unpriced picture when the budget pauses paid requests', async () => {
    let calls = 0;
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_picture_maker') return 'p2';
      if (cmd === 'list_connections') return [painter];
      if (cmd === 'make_portrait') {
        calls += 1;
        if (calls === 1) throw { code: 'BUDGET_OVERRIDE_REQUIRED', message: 'needs override' };
        return portrait;
      }
      throw { code: 'NOT_FOUND', message: cmd };
    });
    const onMade = vi.fn();
    render(<MakePortrait character={mara} world={world} storyId="s1" onMade={onMade} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Make portrait' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/can't price pictures/);
    expect(onMade).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Make it anyway' }));
    expect(invoke).toHaveBeenLastCalledWith('make_portrait', {
      input: expect.objectContaining({ budgetOverride: true }),
    });
    expect(onMade).toHaveBeenCalledWith(portrait);
  });

  it('a nameless character waits for a name', async () => {
    render(<MakePortrait character={{ ...mara, name: ' ' }} world={world} onMade={() => {}} />);
    expect(await screen.findByRole('button', { name: 'Make portrait' })).toBeDisabled();
    expect(screen.getByText('Give the character a name first.')).toBeInTheDocument();
  });
});

// AI connections: add one (key goes to the backend, never shown again),
// choose the storyteller, and test the connection.
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderProfile, StorytellerInfo } from '../types';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  Channel: class {},
}));

import { App } from '../app/App';
import { useBackdrop } from '../app/backdropStore';
import { useUiStore } from '../app/store';
import { SettingsScreen } from '../features/settings/SettingsScreen';

const offline: StorytellerInfo = {
  profileId: null,
  label: 'Offline storyteller',
  modelId: null,
  billing: 'local',
};

const saved: ProviderProfile = {
  id: 'p1',
  label: 'OpenAI',
  adapter: 'openai_compatible',
  baseUrl: 'https://api.openai.com/v1',
  modelId: 'story-model',
  billing: 'paid',
  hasKey: true,
  settings: { temperature: 0.9, maxOutputTokens: 700, timeoutMs: 120000, maxContextTokens: 16000 },
  createdAt: '',
  updatedAt: '',
};

const painter: ProviderProfile = {
  ...saved,
  id: 'p2',
  label: 'Stable Diffusion WebUI',
  adapter: 'stable_diffusion',
  baseUrl: 'http://127.0.0.1:7860',
  modelId: 'default',
  billing: 'local',
  hasKey: false,
};

describe('Settings: AI connections', () => {
  let connections: ProviderProfile[];
  let storyteller: StorytellerInfo;
  let pictureMaker: string | null;

  beforeEach(() => {
    connections = [];
    storyteller = offline;
    pictureMaker = null;
    invoke.mockReset();
    invoke.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
      switch (cmd) {
        case 'list_connections':
          return connections;
        case 'get_storyteller':
          return storyteller;
        case 'save_connection': {
          const input = args.input as { adapter: string };
          const made = input.adapter === 'stable_diffusion' ? painter : saved;
          connections = [...connections.filter((c) => c.id !== made.id), made];
          return made;
        }
        case 'get_picture_maker':
          return pictureMaker;
        case 'set_picture_maker':
          pictureMaker = (args.profileId as string | null) ?? null;
          return pictureMaker;
        case 'list_images':
          return [
            {
              id: 'img-sea',
              mime: 'image/png',
              width: 1600,
              height: 900,
              byteSize: 1000,
              label: 'Sea at dawn',
              tags: [],
              createdAt: '',
              shared: true,
              stories: [],
            },
          ];
        case 'set_storyteller':
          storyteller = args.profileId
            ? { profileId: 'p1', label: 'OpenAI', modelId: 'story-model', billing: 'paid' }
            : offline;
          return storyteller;
        case 'test_connection':
          return {
            ok: false,
            code: 'AUTH_FAILED',
            message: 'The AI service refused the API key.',
            modelListed: null,
            models: [],
          };
        default:
          throw { code: 'NOT_FOUND', message: cmd };
      }
    });
  });

  it('adds a connection from a preset and makes it the storyteller', async () => {
    render(<SettingsScreen />);
    expect(await screen.findByRole('radio', { name: /Offline storyteller/ })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Add connection' }));
    await userEvent.selectOptions(screen.getByLabelText('Service'), 'openai');
    expect(screen.getByLabelText('Address')).toHaveValue('https://api.openai.com/v1');
    await userEvent.type(screen.getByLabelText('Model'), 'story-model');
    await userEvent.type(screen.getByLabelText('API key'), 'sk-live-123');
    await userEvent.click(screen.getByRole('button', { name: 'Save connection' }));

    expect(invoke).toHaveBeenCalledWith('save_connection', {
      input: expect.objectContaining({
        label: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        modelId: 'story-model',
        billing: 'paid',
        adapter: 'openai_compatible',
        apiKey: 'sk-live-123',
      }),
    });
    // First connection becomes the storyteller.
    expect(invoke).toHaveBeenCalledWith('set_storyteller', { profileId: 'p1' });
    expect(await screen.findByRole('radio', { name: /OpenAI/ })).toBeChecked();
    expect(screen.getByText(/key saved/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('sk-live-123');
  });

  it('the Ollama preset uses the native type, no key and a local context', async () => {
    render(<SettingsScreen />);
    await userEvent.click(await screen.findByRole('button', { name: 'Add connection' }));
    await userEvent.selectOptions(screen.getByLabelText('Service'), 'ollama');
    expect(screen.getByLabelText('Type')).toHaveValue('ollama');
    expect(screen.getByLabelText('Address')).toHaveValue('http://localhost:11434');
    expect(screen.getByText(/ollama pull/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Model'), 'llama3.2');
    await userEvent.click(screen.getByRole('button', { name: 'Save connection' }));
    const input = invoke.mock.calls.find((c) => c[0] === 'save_connection')?.[1].input;
    expect(input).toMatchObject({
      adapter: 'ollama',
      baseUrl: 'http://localhost:11434',
      billing: 'local',
      settings: { maxContextTokens: 8192 },
    });
    expect('apiKey' in input).toBe(false);
  });

  it('offers the big labs, hosted open models and local servers, Claude natively', async () => {
    render(<SettingsScreen />);
    await userEvent.click(await screen.findByRole('button', { name: 'Add connection' }));
    const service = screen.getByLabelText('Service');
    for (const name of [
      'Anthropic (Claude)',
      'Google Gemini',
      'xAI (Grok)',
      'Mistral AI',
      'DeepSeek',
      'Groq',
      'Hugging Face',
      'llama.cpp server',
      'KoboldCpp',
      'vLLM',
    ]) {
      expect(within(service).getByRole('option', { name })).toBeInTheDocument();
    }
    await userEvent.selectOptions(service, 'anthropic');
    expect(screen.getByLabelText('Type')).toHaveValue('anthropic');
    expect(screen.getByLabelText('Address')).toHaveValue('https://api.anthropic.com/v1');
    expect(screen.getByLabelText('Model')).toHaveAttribute(
      'placeholder',
      'For example claude-opus-5-5',
    );
    await userEvent.type(screen.getByLabelText('Model'), 'claude-opus-5-5');
    await userEvent.type(screen.getByLabelText('API key'), 'sk-ant-1');
    await userEvent.click(screen.getByRole('button', { name: 'Save connection' }));
    const input = invoke.mock.calls.find((c) => c[0] === 'save_connection')?.[1].input;
    expect(input).toMatchObject({
      label: 'Anthropic (Claude)',
      adapter: 'anthropic',
      billing: 'paid',
      settings: { maxOutputTokens: 4000, maxContextTokens: 128000 },
    });
  });

  it('editing keeps the saved key unless a new one is typed', async () => {
    connections = [saved];
    render(<SettingsScreen />);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('API key')).toHaveAttribute(
      'placeholder',
      'Saved. Leave empty to keep it.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    const input = invoke.mock.calls.find((c) => c[0] === 'save_connection')?.[1].input;
    expect(input.id).toBe('p1');
    expect('apiKey' in input).toBe(false);
    expect(input.settings.maxContextTokens).toBe(16000);
  });

  it('shows a typed result for a failed connection test', async () => {
    connections = [saved];
    render(<SettingsScreen />);
    await userEvent.click(await screen.findByRole('button', { name: 'Test connection' }));
    expect(await screen.findByText('The AI service refused the API key.')).toBeInTheDocument();
  });

  it('adds a picture connection for portraits, never as a storyteller', async () => {
    connections = [saved];
    render(<SettingsScreen />);
    const pictures = await screen.findByRole('radiogroup', { name: 'Pictures' });
    expect(within(pictures).getByRole('radio', { name: /Don.t make pictures/ })).toBeChecked();
    expect(screen.getByText(/add a picture connection/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Add connection' }));
    await userEvent.selectOptions(screen.getByLabelText('Service'), 'sd-webui');
    expect(screen.getByLabelText('Type')).toHaveValue('stable_diffusion');
    expect(screen.getByLabelText('Address')).toHaveValue('http://127.0.0.1:7860');
    expect(screen.getByLabelText('Model')).toHaveValue('default');
    expect(screen.queryByLabelText('Temperature')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save connection' }));
    const input = invoke.mock.calls.find((c) => c[0] === 'save_connection')?.[1].input;
    expect(input).toMatchObject({
      adapter: 'stable_diffusion',
      billing: 'local',
      modelId: 'default',
      settings: { timeoutMs: 300000 },
    });

    // The first picture connection makes the portraits; it never writes replies.
    expect(invoke).toHaveBeenCalledWith('set_picture_maker', { profileId: 'p2' });
    expect(invoke).not.toHaveBeenCalledWith('set_storyteller', { profileId: 'p2' });
    expect(
      await within(pictures).findByRole('radio', { name: /Stable Diffusion WebUI/ }),
    ).toBeChecked();
    const tellers = screen.getByRole('radiogroup', { name: 'Storyteller' });
    expect(within(tellers).queryByRole('radio', { name: /Stable Diffusion/ })).toBeNull();
    expect(within(tellers).getByRole('radio', { name: /OpenAI/ })).toBeInTheDocument();
    // Picture connections can be checked for free, but not sent a story message.
    const cards = screen.getAllByRole('listitem');
    const card = cards.find((li) => li.textContent?.includes('Stable Diffusion WebUI ·'));
    expect(card).toBeDefined();
    expect(within(card!).getByRole('button', { name: 'Test connection' })).toBeInTheDocument();
    expect(within(card!).queryByRole('button', { name: 'Send test message' })).toBeNull();
  });

  it('sets a background picture behind every screen, and how much of it shows', async () => {
    localStorage.clear();
    useBackdrop.getState().update({ assetId: null, veil: 'soft' });
    useUiStore.setState({ screen: { name: 'settings' }, history: [] });
    render(<App />);
    const section = await screen.findByRole('region', { name: 'Background picture' });
    expect(within(section).getByText('No background picture.')).toBeInTheDocument();
    expect(screen.queryByTestId('app-backdrop')).toBeNull();

    await userEvent.click(within(section).getByRole('button', { name: 'Choose a picture…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Choose a background picture' });
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Sea at dawn' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    const backdrop = screen.getByTestId('app-backdrop');
    expect(backdrop).toHaveClass('veil-soft');
    expect(backdrop.querySelector('img')?.getAttribute('src')).toContain('full/img-sea');
    expect(JSON.parse(localStorage.getItem('dtl.backdrop')!)).toEqual({
      assetId: 'img-sea',
      veil: 'soft',
    });

    await userEvent.selectOptions(
      within(section).getByLabelText('How much of the picture shows'),
      'A lot',
    );
    expect(screen.getByTestId('app-backdrop')).toHaveClass('veil-clear');

    // A picture that no longer loads (deleted from the library) is forgotten.
    fireEvent.error(screen.getByTestId('app-backdrop').querySelector('img')!);
    expect(screen.queryByTestId('app-backdrop')).toBeNull();
    expect(within(section).getByText('No background picture.')).toBeInTheDocument();
  });
});

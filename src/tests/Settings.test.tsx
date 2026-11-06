// AI connections: add one (key goes to the backend, never shown again),
// choose the storyteller, and test the connection.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderProfile, StorytellerInfo } from '../types';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  Channel: class {},
}));

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

describe('Settings: AI connections', () => {
  let connections: ProviderProfile[];
  let storyteller: StorytellerInfo;

  beforeEach(() => {
    connections = [];
    storyteller = offline;
    invoke.mockReset();
    invoke.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
      switch (cmd) {
        case 'list_connections':
          return connections;
        case 'get_storyteller':
          return storyteller;
        case 'save_connection':
          connections = [saved];
          return saved;
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
});

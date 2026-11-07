// The setup guide: reached from the library, it opens each service's pages
// by name (never an address of its own) and sets up a connection prefilled.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  Channel: class {},
}));

import { App } from '../app/App';
import { useUiStore } from '../app/store';
import { HOSTED, LABS, LOCAL, PICTURES } from '../features/guide/guide';
import links from '../features/guide/links.json';
import { PRESETS, retiredPictureModel } from '../features/settings/presets';

describe('the setup guide', () => {
  beforeEach(() => {
    invoke.mockReset();
    useUiStore.setState({ screen: { name: 'library' }, history: [], newConnection: null });
    invoke.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
      if (cmd === 'list_stories') return [];
      if (cmd === 'take_restore_result') return null;
      if (cmd === 'list_connections') return [];
      if (cmd === 'get_storyteller')
        return { profileId: null, label: 'Offline storyteller', modelId: null, billing: 'local' };
      if (cmd === 'get_picture_maker') return null;
      if (cmd === 'open_guide_link') return String(args.id) in links ? null : Promise.reject('no');
      throw { code: 'NOT_FOUND', message: cmd };
    });
  });

  it('suggests a picture model OpenAI still offers', () => {
    const images = PRESETS.find((p) => p.id === 'openai-images')!;
    // gpt-image-1 and DALL·E were retired in 2026.
    expect(images.model).toMatch(/^gpt-image-2/);
    expect(images.suggestions?.every((m) => /^gpt-image-2/.test(m))).toBe(true);
    expect(retiredPictureModel('gpt-image-1')).toBe(true);
    expect(retiredPictureModel(' DALL-E-3 ')).toBe(true);
    expect(retiredPictureModel('gpt-image-1-mini')).toBe(false);
    expect(retiredPictureModel('gpt-image-2.6-flare')).toBe(false);
  });

  it('covers every service with a preset, with pages that exist', () => {
    const guides = [...LOCAL, ...LABS, ...HOSTED, ...PICTURES];
    const covered = new Set(guides.map((g) => g.preset));
    const missing = PRESETS.filter((p) => p.id !== 'custom' && !covered.has(p.id));
    expect(missing.map((p) => p.id)).toEqual([]);
    for (const g of guides) {
      expect(PRESETS.some((p) => p.id === g.preset)).toBe(true);
      for (const l of g.links) expect(links[l.id]).toMatch(/^https:\/\//);
    }
  });

  it('is reached from the library, opens key pages and sets up a connection', async () => {
    render(<App />);
    await screen.findByText('No stories yet.');
    await userEvent.click(screen.getByRole('button', { name: 'Open the setup guide' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Setup guide' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '3. Connect a service' })).toBeInTheDocument();

    const openai = screen.getByTestId('guide-openai');
    await userEvent.click(within(openai).getByText('OpenAI'));
    expect(within(openai).getByText(/Make an account at platform\.openai\.com/)).toBeVisible();
    await userEvent.click(within(openai).getByRole('button', { name: /Get a key/ }));
    expect(invoke).toHaveBeenCalledWith('open_guide_link', { id: 'openai-keys' });

    const ollama = screen.getByTestId('guide-ollama');
    await userEvent.click(within(ollama).getByText('Ollama'));
    expect(within(ollama).getByText('ollama pull llama3.2')).toBeVisible();

    // Model suggestions stay folded away until someone opens them.
    const picks = screen.getByTestId('guide-models');
    expect(picks).not.toHaveAttribute('open');
    expect(within(picks).getByText('gpt-6.1-terra')).not.toBeVisible();
    await userEvent.click(within(picks).getByText('Which model should I use?'));
    expect(within(picks).getByText('gpt-6.1-terra')).toBeVisible();
    expect(within(picks).getByText('claude-opus-5-5')).toBeVisible();
    await userEvent.click(within(picks).getByRole('button', { name: /OpenRouter/ }));
    expect(invoke).toHaveBeenCalledWith('open_guide_link', { id: 'openrouter-roleplay' });

    await userEvent.click(within(openai).getByRole('button', { name: 'Set it up here' }));
    const form = await screen.findByRole('dialog', { name: 'Add AI connection' });
    // The Model field offers current names without filling one in.
    const model = within(form).getByLabelText('Model');
    expect(model).toHaveValue('');
    expect(model).toHaveAttribute('placeholder', 'For example gpt-6.1-terra');
    const listed = [
      ...document.querySelectorAll(`#${CSS.escape(model.getAttribute('list')!)} option`),
    ];
    expect(listed.map((o) => o.getAttribute('value'))).toContain('gpt-6.1-sol');
    expect(within(form).getByLabelText('Service')).toHaveValue('openai');
    expect(within(form).getByLabelText('Address')).toHaveValue('https://api.openai.com/v1');
    expect(within(form).getByLabelText('Name')).toHaveValue('OpenAI');
    expect(within(form).getByText('Create a key at platform.openai.com.')).toBeInTheDocument();

    // Closing it leaves Settings as it was, and Back returns to the guide.
    await userEvent.click(within(form).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useUiStore.getState().newConnection).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Setup guide' })).toBeInTheDocument();
  });
});

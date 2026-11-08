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
import { HOSTED, LABS, LOCAL, PICTURES, VOICES } from '../features/guide/guide';
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
    const guides = [...LOCAL, ...LABS, ...HOSTED, ...PICTURES, ...VOICES];
    const covered = new Set(guides.map((g) => g.preset));
    const missing = PRESETS.filter((p) => p.id !== 'custom' && !covered.has(p.id));
    expect(missing.map((p) => p.id)).toEqual([]);
    for (const g of guides) {
      expect(PRESETS.some((p) => p.id === g.preset)).toBe(true);
      for (const l of g.links) expect(links[l.id]).toMatch(/^https:\/\//);
    }
  });

  it('puts the essentials first, then recommends models with their costs', async () => {
    render(<App />);
    await screen.findByText('No stories yet.');
    await userEvent.click(screen.getByRole('button', { name: 'Open the setup guide' }));
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings.slice(0, 4)).toEqual([
      '1. The short version',
      '2. Recommended models',
      '3. Costs and your budget',
      '4. Connect a service',
    ]);
    // The contents bar jumps to a section.
    const toc = screen.getByRole('navigation', { name: 'On this page' });
    await userEvent.click(within(toc).getByRole('button', { name: '3. Costs and your budget' }));
    expect(screen.getByRole('heading', { name: '3. Costs and your budget' })).toHaveFocus();

    // Each pick says what a reply costs; Set up fills in the service and model.
    const pick = screen.getByTestId('pick-openai');
    expect(within(pick).getByText('gpt-6.1-terra')).toBeInTheDocument();
    expect(within(pick).getByText('about 2¢ a reply')).toBeInTheDocument();
    expect(within(screen.getByTestId('pick-ollama')).getByText('free')).toBeInTheDocument();
    const prices = screen.getByRole('table');
    const luna = within(prices).getByText('gpt-6-luna').closest('tr')!;
    expect(within(luna).getByText('0.2¢')).toBeInTheDocument();
    expect(within(luna).getByText('$0.17')).toBeInTheDocument();

    await userEvent.click(within(pick).getByRole('button', { name: 'Set up gpt-6.1-terra' }));
    const form = await screen.findByRole('dialog', { name: 'Add AI connection' });
    expect(within(form).getByLabelText('Service')).toHaveValue('openai');
    expect(within(form).getByLabelText('Model')).toHaveValue('gpt-6.1-terra');
    // The form has the every-click steps too, folded away.
    const steps = within(form).getByTestId('steps-openai');
    expect(steps).not.toHaveAttribute('open');
    expect(within(steps).getByText(/Paste the key into/)).not.toBeVisible();
    await userEvent.click(within(steps).getByText(/Step by step, every click: OpenAI/));
    expect(within(steps).getByText(/Paste the key into/)).toBeVisible();
    // In the form there is no Set it up here step: the form is already open.
    expect(within(steps).queryByText(/Back in Dear to Love/)).toBeNull();
    await userEvent.click(within(steps).getByRole('button', { name: /Get a key/ }));
    expect(invoke).toHaveBeenCalledWith('open_guide_link', { id: 'openai-keys' });
  });

  it('spells out every click for each service, with nothing left unfilled', async () => {
    render(<App />);
    await screen.findByText('No stories yet.');
    await userEvent.click(screen.getByRole('button', { name: 'Open the setup guide' }));
    for (const g of [...LOCAL, ...LABS, ...HOSTED, ...PICTURES, ...VOICES]) {
      const box = screen.getByTestId(`guide-${g.preset}`);
      const steps = within(box).getByTestId(`steps-${g.preset}`);
      expect(steps.querySelectorAll('li').length).toBeGreaterThan(2);
      // Every {name} in a step is filled in.
      expect(steps.textContent).not.toMatch(/\{\w+\}/);
    }
    const ollama = screen.getByTestId('guide-ollama');
    await userEvent.click(within(ollama).getByText('Ollama'));
    const steps = within(ollama).getByTestId('steps-ollama');
    await userEvent.click(within(steps).getByText(/Step by step/));
    expect(within(steps).getByText(/Open a terminal/)).toBeVisible();
    expect(within(steps).getByText('ollama pull gemma4:12b')).toBeVisible();
    expect(within(steps).getByText('gemma4:e2b')).toBeVisible();
    expect(within(steps).getByText(/Back in Dear to Love/)).toBeVisible();
  });

  it('is reached from the library, opens key pages and sets up a connection', async () => {
    render(<App />);
    await screen.findByText('No stories yet.');
    await userEvent.click(screen.getByRole('button', { name: 'Open the setup guide' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Setup guide' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '4. Connect a service' })).toBeInTheDocument();

    const openai = screen.getByTestId('guide-openai');
    expect(within(openai).getByText('Recommended')).toBeInTheDocument();
    await userEvent.click(within(openai).getByText('OpenAI'));
    expect(within(openai).getByText(/Make an account at platform\.openai\.com/)).toBeVisible();
    await userEvent.click(
      within(openai)
        .getAllByRole('button', { name: /Get a key/ })
        .at(-1)!,
    );
    expect(invoke).toHaveBeenCalledWith('open_guide_link', { id: 'openai-keys' });

    const ollama = screen.getByTestId('guide-ollama');
    await userEvent.click(within(ollama).getByText('Ollama'));
    expect(within(ollama).getAllByText('ollama pull gemma4:12b')[0]).toBeVisible();

    await userEvent.click(
      within(screen.getByTestId('guide-picks-links')).getByRole('button', {
        name: /OpenRouter roleplay list/,
      }),
    );
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
    expect(within(form).getByRole('button', { name: /gpt-6-luna/ })).toHaveTextContent(
      'gpt-6-luna · cheapest',
    );
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

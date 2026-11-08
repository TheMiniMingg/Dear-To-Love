// Prompt Preview: read-only, local, shows the summary's source range.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContextPreview } from '../types';
import { fakeRouteView } from './fakeBackend';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  Channel: class {
    onmessage: (m: unknown) => void = () => undefined;
  },
}));

import { contextGauge, ReaderScreen } from '../features/reader/ReaderScreen';

const preview: ContextPreview = {
  routeId: 'route-1',
  forWaitingAction: false,
  storytellerLabel: 'Test cloud',
  modelId: 'story-model',
  live: true,
  messages: [
    {
      role: 'system',
      content: 'You are the narrator...\nSTORY SO FAR\nSam found the letter.',
      estimatedTokens: 420,
    },
    { role: 'user', content: 'Open the door', estimatedTokens: 8 },
    { role: 'assistant', content: 'The hinges groan.', estimatedTokens: 9 },
    { role: 'user', content: '(Your next action goes here.)', estimatedTokens: 12 },
  ],
  estimatedInputTokens: 452,
  reservedOutputTokens: 700,
  maxContextTokens: 16000,
  estimateMethod: 'approximate',
  promptSchemaVersion: 2,
  summary: {
    cacheId: 'm1',
    coveredTurns: 16,
    chunkFromTurn: 9,
    sourceStartEventId: 'ev-8',
    sourceEndEventId: 'ev-16',
    generator: 'model:Test cloud/story-model',
    createdAt: '2026-11-06T00:00:00Z',
    estimatedTokens: 30,
  },
  summaryDropped: false,
  verbatimMessages: 3,
  omittedMessages: 2,
  maxCostMicroUsd: 1152,
};

describe('Preview context', () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_route_view') return fakeRouteView();
      if (cmd === 'preview_context') return preview;
      throw { code: 'NOT_FOUND', message: `unknown ${cmd}` };
    });
  });

  it('opens from the pause menu and shows the exact prompt', async () => {
    render(<ReaderScreen routeId="route-1" />);
    await screen.findByLabelText('What do you do?');
    await userEvent.keyboard('{Escape}');
    // The memory banner offers the same window; take the pause menu's button.
    const buttons = await screen.findAllByRole('button', { name: 'Preview context' });
    await userEvent.click(buttons.find((b) => !b.closest('[role="status"]'))!);

    const dialog = await screen.findByRole('dialog', { name: 'Preview context' });
    expect(invoke).toHaveBeenCalledWith('preview_context', { routeId: 'route-1' });
    await within(dialog).findByText(/Nothing is sent until you play/);
    expect(within(dialog).getByText(/Summary of turns 1–16/)).toBeInTheDocument();
    expect(within(dialog).getByText(/turns 9–16 by Test cloud · story-model/)).toBeInTheDocument();
    expect(within(dialog).getByText(/2 older left out to fit/)).toBeInTheDocument();
    expect(within(dialog).getByText('Up to about $0.0012 for this reply')).toBeInTheDocument();
    const list = within(dialog).getByRole('list', { name: 'Prompt messages' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);
    expect(within(list).getByText('Open the door')).toBeInTheDocument();
    // Read-only: nothing to edit or send.
    expect(within(dialog).queryByRole('textbox')).toBeNull();
    expect(invoke.mock.calls.map((c) => c[0])).not.toContain('generate_reply');
  });

  it('explains a prompt that cannot fit', async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_route_view') return fakeRouteView();
      if (cmd === 'preview_context')
        throw {
          code: 'CONTEXT_TOO_LONG',
          message: 'the story setup and your latest action need about 9000 tokens',
        };
      throw { code: 'NOT_FOUND', message: `unknown ${cmd}` };
    });
    render(<ReaderScreen routeId="route-1" />);
    await screen.findByLabelText('What do you do?');
    // Nothing fits, so the memory gauge is red and says what helps: not a
    // recap, which only adds to the setup, but more room or a shorter setup.
    const banner = await screen.findByTestId('context-banner');
    expect(banner).toHaveTextContent(/setup alone no longer fits/);
    expect(within(banner).queryByRole('button', { name: 'End chapter' })).toBeNull();
    expect(within(banner).getByRole('button', { name: 'Story details' })).toBeInTheDocument();
    expect(screen.getByTestId('context-gauge')).toHaveTextContent('Memory 100%');
    await userEvent.keyboard('{Escape}');
    const buttons = await screen.findAllByRole('button', { name: 'Preview context' });
    await userEvent.click(buttons.find((b) => !b.closest('[data-testid="context-banner"]'))!);
    expect(await screen.findByRole('alert')).toHaveTextContent(/need about 9000 tokens/);
  });

  it('shows the memory gauge and warns when turns are being left out', async () => {
    render(<ReaderScreen routeId="route-1" />);
    const chip = await screen.findByTestId('context-gauge');
    // Two turns no longer fit, so the request is as full as it gets.
    expect(chip).toHaveTextContent('Memory 100%');
    expect(chip).toHaveClass('context-full');
    const banner = screen.getByTestId('context-banner');
    expect(banner).toHaveTextContent(/memory is full/);
    await userEvent.click(within(banner).getByRole('button', { name: 'End chapter' }));
    expect(await screen.findByRole('dialog', { name: 'End chapter' })).toBeVisible();
  });

  it('keeps quiet while the request has room, and says nothing for the offline storyteller', async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_route_view') return fakeRouteView();
      if (cmd === 'preview_context') return { ...preview, omittedMessages: 0 };
      throw { code: 'NOT_FOUND', message: `unknown ${cmd}` };
    });
    render(<ReaderScreen routeId="route-1" />);
    const chip = await screen.findByTestId('context-gauge');
    expect(chip).toHaveTextContent('Memory 3%');
    expect(chip).toHaveClass('context-ok');
    expect(screen.queryByTestId('context-banner')).toBeNull();
    expect(contextGauge({ ...preview, live: false })).toBeNull();
    expect(
      contextGauge({ ...preview, omittedMessages: 0, estimatedInputTokens: 13000 })?.level,
    ).toBe('high');
    expect(contextGauge({ ...preview, omittedMessages: 0, summaryDropped: true })?.level).toBe(
      'full',
    );
  });
});

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

import { ReaderScreen } from '../features/reader/ReaderScreen';

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
    await userEvent.click(await screen.findByRole('button', { name: 'Preview context' }));

    const dialog = await screen.findByRole('dialog', { name: 'Preview context' });
    expect(invoke).toHaveBeenCalledWith('preview_context', { routeId: 'route-1' });
    await within(dialog).findByText(/Nothing is sent until you play/);
    expect(within(dialog).getByText(/Summary of turns 1–16/)).toBeInTheDocument();
    expect(within(dialog).getByText(/turns 9–16 by Test cloud · story-model/)).toBeInTheDocument();
    expect(within(dialog).getByText(/2 older left out to fit/)).toBeInTheDocument();
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
    await userEvent.keyboard('{Escape}');
    await userEvent.click(await screen.findByRole('button', { name: 'Preview context' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/need about 9000 tokens/);
  });
});

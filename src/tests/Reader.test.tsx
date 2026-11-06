// T24 (composer keys), T25 (keyboard save, focus restored), T27 (Escape keeps the draft).
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeRouteView } from './fakeBackend';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

import { ReaderScreen } from '../features/reader/ReaderScreen';
import { useUiStore } from '../app/store';

function setup() {
  render(<ReaderScreen routeId="route-1" />);
  return screen.findByLabelText('What do you do?');
}

describe('Reader keyboard behaviour', () => {
  beforeEach(() => {
    invoke.mockReset();
    useUiStore.setState({ drafts: {} });
    invoke.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
      if (cmd === 'get_route_view') return fakeRouteView();
      if (cmd === 'quick_save') return { id: 'save-1' };
      if (cmd === 'play_mock_turn') {
        const text = args.text as string;
        return fakeRouteView([
          {
            id: 'ev-2',
            originRouteId: 'route-1',
            parentEventId: 'ev-1',
            generationRunId: null,
            createdAt: '2026-11-06T00:00:01Z',
            kind: 'player',
            payload: { text },
          },
          {
            id: 'ev-3',
            originRouteId: 'route-1',
            parentEventId: 'ev-2',
            generationRunId: null,
            createdAt: '2026-11-06T00:00:02Z',
            kind: 'assistant',
            payload: { text: `You decide: "${text}"` },
          },
        ]);
      }
      throw { code: 'NOT_FOUND', message: `unknown ${cmd}` };
    });
  });

  it('Enter sends, Shift+Enter adds a line', async () => {
    const box = await setup();
    await userEvent.click(box);
    await userEvent.keyboard('Look around{Shift>}{Enter}{/Shift}carefully');
    expect(box).toHaveValue('Look around\ncarefully');
    expect(invoke).not.toHaveBeenCalledWith('play_mock_turn', expect.anything());
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByText(/You decide: "Look around/)).toBeInTheDocument();
    expect(box).toHaveValue('');
  });

  it('Enter that confirms an IME composition does not send', async () => {
    const box = await setup();
    await userEvent.click(box);
    await userEvent.keyboard('nihon');
    fireEvent.keyDown(box, { key: 'Enter', keyCode: 229 });
    fireEvent.keyDown(box, { key: 'Enter', isComposing: true });
    expect(invoke).not.toHaveBeenCalledWith('play_mock_turn', expect.anything());
    expect(box).toHaveValue('nihon');
  });

  it('arrow keys inside the composer are left to the caret', async () => {
    const box = await setup();
    await userEvent.click(box);
    await userEvent.keyboard('abc');
    const up = fireEvent.keyDown(box, { key: 'ArrowUp' });
    expect(up).toBe(true); // not default-prevented by the scroll shortcut
  });

  it('Ctrl+S quick-saves from inside the composer without losing text', async () => {
    const box = await setup();
    await userEvent.click(box);
    await userEvent.keyboard('half a thought');
    await userEvent.keyboard('{Control>}s{/Control}');
    expect(invoke).toHaveBeenCalledWith('quick_save', {
      storyId: 'story-1',
      routeId: 'route-1',
    });
    expect(await screen.findByText(/Quick-saved/)).toBeInTheDocument();
    expect(box).toHaveValue('half a thought');
  });

  it('Escape opens the pause menu, keeps the draft and restores focus', async () => {
    const box = await setup();
    await userEvent.click(box);
    await userEvent.keyboard('unsent words');
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Paused' })).toBeInTheDocument();
    expect(document.activeElement).toHaveTextContent('Resume');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const again = screen.getByLabelText('What do you do?');
    expect(again).toHaveValue('unsent words');
    expect(document.activeElement).toBe(again);
  });

  it('keeps the draft when the reader is closed and reopened', async () => {
    const first = render(<ReaderScreen routeId="route-1" />);
    const box = await screen.findByLabelText('What do you do?');
    await userEvent.click(box);
    await userEvent.keyboard('keep me');
    first.unmount();
    render(<ReaderScreen routeId="route-1" />);
    expect(await screen.findByLabelText('What do you do?')).toHaveValue('keep me');
  });
});

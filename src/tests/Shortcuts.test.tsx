// Keyboard shortcuts: the key matcher, the reader's shortcuts, and the
// Keyboard shortcuts window that opens anywhere with F1.
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventDto } from '../types';
import { fakeRouteView } from './fakeBackend';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  Channel: class {
    onmessage: (m: unknown) => void = () => undefined;
  },
}));

import { App } from '../app/App';
import {
  ariaKeys,
  comboFromEvent,
  isCombo,
  isShortcut,
  keyLabel,
  useShortcutHelp,
  useShortcutKeys,
} from '../app/shortcuts';
import { useUiStore } from '../app/store';
import { ReaderScreen } from '../features/reader/ReaderScreen';
import { usePictureView } from '../features/reader/stage';

const key = (init: Partial<KeyboardEventInit>) => new KeyboardEvent('keydown', init);

describe('the key matcher', () => {
  it('matches Ctrl or Cmd, Shift only where it was asked for, and letters by position', () => {
    expect(isCombo(key({ key: 's', ctrlKey: true }), 'Mod+S')).toBe(true);
    expect(isCombo(key({ key: 's', metaKey: true }), 'Mod+S')).toBe(true);
    expect(isCombo(key({ key: 's' }), 'Mod+S')).toBe(false);
    expect(isCombo(key({ key: 'S', ctrlKey: true, shiftKey: true }), 'Mod+S')).toBe(false);
    expect(isCombo(key({ key: 's', ctrlKey: true, altKey: true }), 'Mod+S')).toBe(false);
    expect(isCombo(key({ key: 'M', ctrlKey: true, shiftKey: true }), 'Mod+Shift+M')).toBe(true);
    // A Korean layout types ㄴ on the S key.
    expect(isCombo(key({ key: 'ㄴ', code: 'KeyS', ctrlKey: true }), 'Mod+S')).toBe(true);
    // Punctuation that needs Shift on some keyboards still counts.
    expect(isCombo(key({ key: '+', ctrlKey: true, shiftKey: true }), 'Mod+=')).toBe(true);
    expect(isCombo(key({ key: '/', ctrlKey: true, shiftKey: true }), 'Mod+/')).toBe(true);
    expect(isCombo(key({ key: '-', ctrlKey: true }), 'Mod+-')).toBe(true);
    expect(isCombo(key({ key: 'F1' }), 'F1')).toBe(true);
    expect(isCombo(key({ key: 'Enter', shiftKey: true }), 'Shift+Enter')).toBe(true);
    expect(isCombo(key({ key: 'Enter' }), 'Shift+Enter')).toBe(false);
    // Alt counts where it is asked for; a digit matches by position too.
    expect(isCombo(key({ key: 'å', code: 'KeyA', altKey: true }), 'Alt+A')).toBe(true);
    expect(
      isCombo(key({ key: '!', code: 'Digit1', ctrlKey: true, shiftKey: true }), 'Mod+Shift+1'),
    ).toBe(true);
  });

  it('spells a key press the way the list does', () => {
    expect(comboFromEvent(key({ key: 'k', code: 'KeyK', ctrlKey: true, altKey: true }))).toBe(
      'Mod+Alt+K',
    );
    expect(comboFromEvent(key({ key: 'ㅏ', code: 'KeyK', metaKey: true }))).toBe('Mod+K');
    expect(comboFromEvent(key({ key: '?', code: 'Slash', ctrlKey: true, shiftKey: true }))).toBe(
      'Mod+?',
    );
    expect(comboFromEvent(key({ key: 'F5', code: 'F5' }))).toBe('F5');
    expect(comboFromEvent(key({ key: 'Shift', shiftKey: true }))).toBeNull();
    expect(keyLabel('Mod+Alt+K')).toBe('Ctrl+Alt+K');
  });

  it('names keys the way this computer shows them', () => {
    expect(keyLabel('Mod+S')).toBe('Ctrl+S');
    expect(keyLabel('Mod+Shift+M')).toBe('Ctrl+Shift+M');
    expect(keyLabel('Mod+-')).toBe('Ctrl+-');
    expect(keyLabel('Escape')).toBe('Esc');
    expect(ariaKeys('help')).toBe('F1 Control+/');
    const platform = vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    expect(keyLabel('Mod+S')).toBe('⌘S');
    expect(keyLabel('Mod+Shift+M')).toBe('⇧⌘M');
    expect(ariaKeys('quickSave')).toBe('Meta+S');
    platform.mockRestore();
  });
});

function reply(id: string, text: string): EventDto {
  return {
    id,
    originRouteId: 'route-1',
    parentEventId: null,
    generationRunId: null,
    createdAt: '2026-11-06T00:00:01Z',
    kind: 'assistant',
    payload: { text },
  } as EventDto;
}

describe('story shortcuts', () => {
  beforeEach(() => {
    localStorage.clear();
    invoke.mockReset();
    usePictureView.getState().setShown(true);
    useUiStore.setState({ drafts: {}, textSize: 1, screen: { name: 'library' }, history: [] });
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_route_view')
        return fakeRouteView([reply('ev-2', 'The gulls circle.'), reply('ev-3', 'A bell rings.')]);
      if (cmd === 'list_bookmarks') return [];
      if (cmd === 'add_bookmark') return { id: 'bm-1' };
      throw { code: 'NOT_FOUND', message: cmd };
    });
  });

  it('open windows, bookmark the latest reply and change the view from the keyboard', async () => {
    render(<ReaderScreen routeId="route-1" />);
    const box = await screen.findByLabelText('What do you do?');
    await userEvent.click(box);
    await userEvent.keyboard('half a thought');

    await userEvent.keyboard('{Control>}l{/Control}');
    expect(screen.getByRole('dialog', { name: 'Save / Load' })).toBeInTheDocument();
    // Another window is open, so Ctrl+G waits.
    await userEvent.keyboard('{Control>}g{/Control}');
    expect(screen.queryByRole('dialog', { name: 'Routes' })).toBeNull();
    // Opened with its key, the window closes back to the story.
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Paused' })).toBeInTheDocument();
    // From the pause menu, a shortcut goes straight to its window, and back.
    await userEvent.keyboard('{Control>}g{/Control}');
    expect(screen.getByRole('dialog', { name: 'Routes' })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    await userEvent.click(box);
    await userEvent.keyboard('{Control>}b{/Control}');
    expect(invoke).toHaveBeenCalledWith('add_bookmark', {
      storyId: 'story-1',
      routeId: 'route-1',
      eventId: 'ev-3',
      label: null,
    });

    await userEvent.keyboard('{Control>}p{/Control}');
    expect(usePictureView.getState().shown).toBe(false);
    await userEvent.keyboard('{Control>}={/Control}');
    expect(useUiStore.getState().textSize).toBeGreaterThan(1);
    expect(box).toHaveValue('half a thought');

    // While the Keyboard shortcuts window is open, the story leaves keys alone.
    useShortcutHelp.getState().setOpen(true);
    await userEvent.keyboard('{Control>}l{/Control}');
    expect(screen.queryByRole('dialog', { name: 'Save / Load' })).toBeNull();
    useShortcutHelp.getState().setOpen(false);

    // Ctrl+J comes back to the action box from anywhere.
    (document.activeElement as HTMLElement).blur();
    await userEvent.keyboard('{Control>}j{/Control}');
    await vi.waitFor(() => expect(document.activeElement).toBe(box));
  });

  it('shows the keys on the buttons', async () => {
    render(<ReaderScreen routeId="route-1" />);
    const save = await screen.findByRole('button', { name: 'Quick save' });
    expect(save).toHaveAttribute('title', 'Quick save (Ctrl+S)');
    expect(save).toHaveAttribute('aria-keyshortcuts', 'Control+S');
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    // The keys beside a menu item are not part of its name.
    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Save / Load' }),
    ).toHaveTextContent('Save / LoadCtrl+L');
  });
});

describe('the Keyboard shortcuts window', () => {
  beforeEach(() => {
    localStorage.removeItem('dtl.shortcuts');
    useShortcutKeys.setState({ custom: {} });
    invoke.mockReset();
    useUiStore.setState({ screen: { name: 'library' }, history: [] });
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'list_stories') return [];
      if (cmd === 'take_restore_result') return null;
      throw { code: 'NOT_FOUND', message: cmd };
    });
  });

  it('opens with F1 anywhere, lists the shortcuts, and Ctrl+N and Ctrl+, still work', async () => {
    render(<App />);
    await screen.findByText('No stories yet.');
    await userEvent.keyboard('{F1}');
    const help = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(within(help).getByRole('heading', { name: 'In a story' })).toBeInTheDocument();
    expect(within(help).getByText('Quick save').nextElementSibling).toHaveTextContent('Ctrl+S');
    expect(within(help).getByText('Show this list').nextElementSibling).toHaveTextContent(
      'F1 / Ctrl+/',
    );
    await userEvent.keyboard('{F1}');
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();

    await userEvent.keyboard('{Control>}n{/Control}');
    expect(useUiStore.getState().screen).toEqual({ name: 'quickstart' });
    await userEvent.keyboard('{Control>},{/Control}');
    expect(useUiStore.getState().screen).toEqual({ name: 'settings' });
  });

  it('changes a shortcut to keys the player presses, and puts them back', async () => {
    render(<App />);
    await screen.findByText('No stories yet.');
    await userEvent.keyboard('{F1}');
    const help = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    // Keys typing needs can't be changed.
    expect(within(help).queryByRole('button', { name: /Change the keys for Send/ })).toBeNull();

    await userEvent.click(
      within(help).getByRole('button', { name: 'Change the keys for Quick save' }),
    );
    const listen = within(help).getByRole('button', { name: /Press the new keys for Quick save/ });
    expect(listen).toHaveFocus();
    // A letter alone would go off while typing.
    await userEvent.keyboard('b');
    expect(within(help).getByRole('alert')).toHaveTextContent(/Hold Ctrl or Alt/);
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();

    await userEvent.click(
      within(help).getByRole('button', { name: 'Change the keys for Quick save' }),
    );
    await userEvent.keyboard('{Control>}c{/Control}');
    expect(within(help).getByRole('alert')).toHaveTextContent(/kept for the system or for editing/);

    await userEvent.click(
      within(help).getByRole('button', { name: 'Change the keys for Quick save' }),
    );
    await userEvent.keyboard('{Control>}{Alt>}k{/Alt}{/Control}');
    expect(within(help).getByText('Quick save').nextElementSibling).toHaveTextContent('Ctrl+Alt+K');
    expect(JSON.parse(localStorage.getItem('dtl.shortcuts') ?? '{}')).toEqual({
      quickSave: ['Mod+Alt+K'],
    });
    expect(
      isShortcut(key({ key: 'k', code: 'KeyK', ctrlKey: true, altKey: true }), 'quickSave'),
    ).toBe(true);
    expect(isShortcut(key({ key: 's', ctrlKey: true }), 'quickSave')).toBe(false);

    // Keys another shortcut has ask first, and leave that one without.
    await userEvent.click(
      within(help).getByRole('button', { name: 'Change the keys for Story search' }),
    );
    await userEvent.keyboard('{Control>}g{/Control}');
    const ask = within(help).getByRole('alert');
    expect(ask).toHaveTextContent('Ctrl+G already does Routes. Use it for Story search instead?');
    await userEvent.click(within(ask).getByRole('button', { name: 'Use it for Story search' }));
    expect(within(help).getByText('Routes').nextElementSibling).toHaveTextContent('No key');
    expect(within(help).getByText('Story search').nextElementSibling).toHaveTextContent('Ctrl+G');

    await userEvent.click(
      within(help).getByRole('button', { name: 'Put back the usual keys for Quick save' }),
    );
    expect(within(help).getByText('Quick save').nextElementSibling).toHaveTextContent('Ctrl+S');
    await userEvent.click(
      within(help).getByRole('button', { name: 'Put back all the usual keys' }),
    );
    expect(within(help).getByText('Routes').nextElementSibling).toHaveTextContent('Ctrl+G');
    expect(useShortcutKeys.getState().custom).toEqual({});
  });
});

// The reader's screen layout: game-style presets, mixing your own, and the
// handle that resizes the picture or hides it for text only.
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventDto, RouteView } from '../types';
import { fakeRouteView } from './fakeBackend';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  Channel: class {
    onmessage: (m: unknown) => void = () => undefined;
  },
}));

import { ReaderScreen } from '../features/reader/ReaderScreen';
import { LayoutControls } from '../components/LayoutControls';
import { usePictureView } from '../features/reader/stage';
import { LAYOUT_PRESETS, matchingPreset, STAGE_MIN, useScreenLayout } from '../app/screenLayout';
import { useUiStore } from '../app/store';

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

function view(): RouteView {
  const v = fakeRouteView([reply('ev-2', 'Mara Quill waves from the lamp room door.')]);
  v.state.state = {
    ...v.state.state,
    characters: {
      pc: { id: 'pc', name: 'Sam Ashby' },
      mara: { id: 'mara', name: 'Mara Quill' },
    },
    scene: { location: 'The lamp room', summary: '', participantIds: ['pc', 'mara'] },
  } as unknown as RouteView['state']['state'];
  v.visuals = [
    { slot: 'background', assetId: 'img-bg' },
    { slot: 'portrait:mara', assetId: 'img-mara' },
  ];
  return v;
}

function reset() {
  localStorage.clear();
  usePictureView.getState().setShown(true);
  useScreenLayout.getState().update(LAYOUT_PRESETS[0]!.layout);
  useScreenLayout.getState().setSize({ top: null, side: null, box: null }, true);
}

describe('layout presets', () => {
  beforeEach(reset);

  it('each preset is its own mix, and anything else is the player’s own', () => {
    const ids = LAYOUT_PRESETS.map((p) => matchingPreset(p.layout, p.pictures));
    expect(ids).toEqual(LAYOUT_PRESETS.map((p) => p.id));
    expect(matchingPreset({ picture: 'side', frame: 'box', corners: 'round' }, true)).toBeNull();
  });

  it('picking a preset sets the layout; changing a part makes it your own', async () => {
    render(<LayoutControls />);
    expect(screen.getByRole('radio', { name: /^Classic/ })).toBeChecked();

    await userEvent.click(screen.getByRole('radio', { name: /^Visual novel/ }));
    expect(useScreenLayout.getState()).toMatchObject({ picture: 'behind', frame: 'panel' });

    await userEvent.click(screen.getByRole('radio', { name: /^Text adventure/ }));
    expect(usePictureView.getState().shown).toBe(false);
    expect(screen.getByRole('radio', { name: 'Text only' })).toBeChecked();

    await userEvent.click(screen.getByRole('radio', { name: 'Dialog box' }));
    expect(screen.getByTestId('layout-custom')).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /^Text adventure/, checked: true })).toBeNull();
    // Kept on this computer.
    expect(JSON.parse(localStorage.getItem('dtl.screenLayout')!)).toMatchObject({ frame: 'box' });
  });
});

describe('the picture handle in the reader', () => {
  beforeEach(() => {
    reset();
    invoke.mockReset();
    useUiStore.setState({ drafts: {} });
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_route_view') return view();
      if (cmd === 'list_bookmarks') return [];
      throw { code: 'NOT_FOUND', message: cmd };
    });
  });

  it('resizes the picture with the keys, hides it when shut, and a tab brings it back', async () => {
    const { container } = render(<ReaderScreen routeId="route-1" />);
    const handle = await screen.findByRole('separator', { name: 'Picture size' });
    expect(container.querySelector('.reader')).toHaveAttribute('data-frame', 'plain');

    // jsdom lays nothing out, so the picture measures 0: a step down sets a size.
    act(() => useScreenLayout.getState().setSize({ top: 200 }, true));
    fireEvent.keyDown(handle, { key: 'ArrowUp' });
    expect(usePictureView.getState().shown).toBe(true);
    expect(container.querySelector('.stage-area')).toHaveAttribute('data-top-sized');

    // Home goes back to the size that fits the window.
    fireEvent.keyDown(handle, { key: 'Home' });
    expect(useScreenLayout.getState().sizes.top).toBeNull();

    // Shut: text only, and the tab shows the pictures again.
    fireEvent.keyDown(handle, { key: 'Enter' });
    expect(usePictureView.getState().shown).toBe(false);
    expect(screen.queryByRole('group', { name: 'Scene pictures' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Show pictures' }));
    expect(await screen.findByRole('group', { name: 'Scene pictures' })).toBeVisible();
  });

  it('dragging the picture nearly shut hides it and keeps the size it had', async () => {
    useScreenLayout.getState().setSize({ top: 240 }, true);
    render(<ReaderScreen routeId="route-1" />);
    const handle = await screen.findByRole('separator', { name: 'Picture size' });
    // jsdom has no pointer capture.
    handle.setPointerCapture = () => undefined;
    fireEvent.pointerDown(handle, { button: 0, clientX: 0, clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 0, clientY: 250, pointerId: 1 });
    expect(useScreenLayout.getState().sizes.top).toBeGreaterThan(0);
    fireEvent.pointerUp(handle, { clientX: 0, clientY: 300 - STAGE_MIN.top - 400, pointerId: 1 });
    expect(usePictureView.getState().shown).toBe(false);
    expect(useScreenLayout.getState().sizes.top).toBe(240);
  });

  it('puts the layout on the reader for the stylesheet', async () => {
    useScreenLayout.getState().update({ picture: 'side', frame: 'box', corners: 'square' });
    const { container } = render(<ReaderScreen routeId="route-1" />);
    const handle = await screen.findByRole('separator', { name: 'Picture size' });
    expect(handle).toHaveAttribute('aria-orientation', 'vertical');
    expect(container.querySelector('.stage-area')).toHaveAttribute('data-picture', 'side');
    expect(container.querySelector('.reader')).toHaveAttribute('data-corners', 'square');
  });
});

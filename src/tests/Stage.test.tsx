// The picture view: the stage shows whoever the story is with, switches when
// someone new appears, and the side button turns it into text only.
import { render, screen, within } from '@testing-library/react';
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
import { stageFocus, usePictureView } from '../features/reader/stage';
import { useUiStore } from '../app/store';

const cast = [
  { id: 'mara', names: ['Mara Quill', 'Mara'] },
  { id: 'oren', names: ['Oren Vale', 'Oren'] },
  { id: 'misaki', names: ['美咲'] },
];

describe('who is on stage', () => {
  it('follows the replies: newcomers take the stage, the current one keeps it', () => {
    expect(stageFocus([], cast)).toBeNull();
    expect(stageFocus(['The rain does not stop.'], cast)).toBeNull();
    expect(stageFocus(['Mara waves from the pier.'], cast)).toBe('mara');
    expect(stageFocus(['Mara waves.', 'Mara laughs. "Oren is late," she says.'], cast)).toBe(
      'oren',
    );
    expect(stageFocus(['Mara waves.', 'Mara laughs at the gulls.'], cast)).toBe('mara');
    // Still with Oren while he is in the story, even when Mara is mentioned too.
    expect(
      stageFocus(['Mara waves.', 'Oren walks in.', 'Oren sits. Mara pours tea for Oren.'], cast),
    ).toBe('oren');
    // Someone back after a few replies away takes the stage again.
    const away = ['Oren talks.', 'Oren talks.', 'Oren talks.'];
    expect(stageFocus(['Mara waves.', ...away, 'Oren talks. Mara is back.'], cast)).toBe('mara');
    // A text message counts as the sender appearing.
    expect(stageFocus(['Mara waves.', '<text from="Oren Vale">Where are you?</text>'], cast)).toBe(
      'oren',
    );
    // Whole words only for Latin names; Japanese names match inside the text.
    expect(stageFocus(['Maraschino cherries on the table.'], cast)).toBeNull();
    expect(stageFocus(['美咲は笑った。'], cast)).toBe('misaki');
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

function view(): RouteView {
  const v = fakeRouteView([
    reply('ev-2', 'Mara Quill waves from the lamp room door.'),
    reply('ev-3', 'Footsteps on the stairs: Oren Vale, out of breath.'),
  ]);
  v.state.state = {
    ...v.state.state,
    characters: {
      pc: { id: 'pc', name: 'Sam Ashby' },
      mara: { id: 'mara', name: 'Mara Quill' },
      oren: { id: 'oren', name: 'Oren Vale' },
    },
    scene: { location: 'The lamp room', summary: '', participantIds: ['pc', 'mara', 'oren'] },
  } as unknown as RouteView['state']['state'];
  v.visuals = [
    { slot: 'background', assetId: 'img-bg' },
    { slot: 'portrait:mara', assetId: 'img-mara' },
    { slot: 'portrait:oren', assetId: 'img-oren' },
    { slot: 'portrait:pc', assetId: 'img-sam' },
  ];
  return v;
}

describe('the picture view in the reader', () => {
  beforeEach(() => {
    localStorage.clear();
    usePictureView.getState().setShown(true);
    invoke.mockReset();
    useUiStore.setState({ drafts: {} });
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_route_view') return view();
      if (cmd === 'list_bookmarks') return [];
      throw { code: 'NOT_FOUND', message: cmd };
    });
  });

  it('shows who arrived last, lets you pick another, and can be text only', async () => {
    render(<ReaderScreen routeId="route-1" />);
    const stage = await screen.findByRole('group', { name: 'Scene pictures' });
    expect(within(stage).getByRole('img', { name: 'Portrait of Oren Vale' })).toBeVisible();
    expect(within(stage).getByText('Oren Vale')).toBeVisible();
    // The player's own portrait is never on stage.
    expect(within(stage).queryByRole('button', { name: 'Show Sam Ashby' })).toBeNull();

    await userEvent.click(within(stage).getByRole('button', { name: 'Show Mara Quill' }));
    expect(within(stage).getByRole('img', { name: 'Portrait of Mara Quill' })).toBeVisible();
    expect(within(stage).getByRole('button', { name: 'Show Mara Quill' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const toggle = screen.getByRole('button', { name: 'Picture view' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(toggle);
    expect(screen.queryByRole('group', { name: 'Scene pictures' })).toBeNull();
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(localStorage.getItem('dtl.readerPictures')).toBe('off');
    await userEvent.click(toggle);
    expect(await screen.findByRole('group', { name: 'Scene pictures' })).toBeVisible();
  });
});

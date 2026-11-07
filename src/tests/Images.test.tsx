// Image library (M8): add, reuse, describe and safely delete images; choose
// pictures for a route from now on, or as a story default.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetDto, AssetUsage, EventDto, RouteView, StateEdit } from '../types';
import { fakeRouteView } from './fakeBackend';

const invoke = vi.fn();
const openDialog = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  Channel: class {
    onmessage: (m: unknown) => void = () => undefined;
  },
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...args: unknown[]) => openDialog(...args),
}));

import { ImagesScreen } from '../features/images/ImagesScreen';
import { ReaderScreen } from '../features/reader/ReaderScreen';
import { useUiStore } from '../app/store';

const harbor: AssetDto = {
  id: 'img-1',
  mime: 'image/png',
  width: 1200,
  height: 800,
  byteSize: 350_000,
  label: 'Harbor at dusk',
  tags: ['Background'],
  createdAt: '2026-11-06T00:00:00Z',
  shared: true,
  stories: [],
};
const mara: AssetDto = { ...harbor, id: 'img-2', label: 'Mara', tags: [] };

function readerView(refs: Record<string, string> = {}): RouteView {
  const v = fakeRouteView();
  v.state = {
    ...v.state,
    state: {
      ...v.state.state,
      characters: {
        pc: { id: 'pc', name: 'Sam Ashby' },
        mara: { id: 'mara', name: 'Mara Quill' },
      },
      scene: { location: 'The lamp room', summary: '', participantIds: ['pc', 'mara'] },
      visualRefs: refs,
    } as unknown as RouteView['state']['state'],
  };
  return v;
}

beforeEach(() => {
  invoke.mockReset();
  openDialog.mockReset();
  useUiStore.setState({ drafts: {}, screen: { name: 'images' }, history: [] });
});

describe('Images screen', () => {
  it('adds files, reports reused and refused ones, and shows details', async () => {
    let library: AssetDto[] = [mara];
    invoke.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
      if (cmd === 'list_images') return library;
      if (cmd === 'import_images') {
        library = [harbor, mara];
        return [
          { fileName: 'harbor.png', asset: harbor, alreadyInLibrary: false, error: null },
          { fileName: 'mara-copy.png', asset: mara, alreadyInLibrary: true, error: null },
          {
            fileName: 'notes.txt',
            asset: null,
            alreadyInLibrary: false,
            error: "this file isn't a PNG, JPEG or WebP image",
          },
        ];
      }
      if (cmd === 'image_usages') return [];
      throw { code: 'NOT_FOUND', message: `unknown ${cmd} ${JSON.stringify(args)}` };
    });
    openDialog.mockResolvedValue(['/p/harbor.png', '/p/mara-copy.png', '/p/notes.txt']);
    render(<ImagesScreen />);
    await screen.findByRole('list', { name: 'Your library (any story)' });
    await userEvent.click(screen.getByRole('button', { name: 'Add images' }));

    expect(invoke).toHaveBeenCalledWith('import_images', {
      paths: ['/p/harbor.png', '/p/mara-copy.png', '/p/notes.txt'],
      scope: null,
    });
    const status = await screen.findByText(/Added 1 image\./);
    expect(status).toHaveTextContent('1 was already in your library and is reused.');
    expect(screen.getByText("notes.txt: This file isn't a PNG, JPEG or WebP image.")).toBeVisible();

    // The first new image is selected and described.
    const details = await screen.findByRole('region', { name: 'Image: Harbor at dusk' });
    expect(details).toHaveTextContent('1200 × 800 · 342 KB · PNG');
    expect(within(details).getByRole('checkbox', { name: 'Background' })).toBeChecked();
    expect(await within(details).findByText('Not used in any story.')).toBeVisible();
  });

  it('keeps images that a story shows, and deletes unused ones after asking', async () => {
    const usages: Record<string, AssetUsage[]> = {
      'img-1': [
        {
          storyId: 's1',
          storyTitle: 'The Unsigned Letter',
          slot: 'background',
          place: 'Background on route Alt 1',
          inHistory: true,
        },
      ],
      'img-2': [],
    };
    let library = [harbor, mara];
    invoke.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
      if (cmd === 'list_images') return library;
      if (cmd === 'image_usages') return usages[args.assetId as string];
      if (cmd === 'delete_image') {
        library = library.filter((a) => a.id !== args.assetId);
        return null;
      }
      throw { code: 'NOT_FOUND', message: cmd };
    });
    render(<ImagesScreen />);
    await userEvent.click(await screen.findByRole('button', { name: 'Harbor at dusk' }));
    const used = await screen.findByRole('list', { name: 'Used in' });
    expect(used).toHaveTextContent('The Unsigned Letter: Background on route Alt 1');
    expect(screen.getByRole('button', { name: 'Delete image' })).toBeDisabled();
    expect(screen.getByText(/Earlier turns keep the pictures they showed/)).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: 'Mara' }));
    await screen.findByText('Not used in any story.');
    await userEvent.click(screen.getByRole('button', { name: 'Delete image' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete image?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete image' }));
    expect(invoke).toHaveBeenCalledWith('delete_image', { assetId: 'img-2' });
    expect(await screen.findByText('Choose an image to see where it is used.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Mara' })).toBeNull();
  });
});

describe('Pictures for one story or all', () => {
  it('groups pictures by who may use them, and shares or keeps them', async () => {
    const own: AssetDto = {
      ...harbor,
      id: 'img-3',
      label: 'Lamp room',
      shared: false,
      stories: [{ id: 's1', title: 'The Unsigned Letter' }],
    };
    const orphan: AssetDto = { ...harbor, id: 'img-4', label: 'Old sketch', shared: false };
    let library = [harbor, own, orphan];
    invoke.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
      if (cmd === 'list_images') return library;
      if (cmd === 'list_stories') return [{ id: 's1', title: 'The Unsigned Letter' }];
      if (cmd === 'image_usages') return [];
      if (cmd === 'set_image_scope') {
        const next: AssetDto = args.storyId
          ? { ...harbor, shared: false, stories: [{ id: 's1', title: 'The Unsigned Letter' }] }
          : { ...own, shared: true, stories: [] };
        library = library.map((a) => (a.id === next.id ? next : a));
        return next;
      }
      throw { code: 'NOT_FOUND', message: cmd };
    });
    render(<ImagesScreen />);
    const shared = await screen.findByRole('list', { name: 'Your library (any story)' });
    expect(within(shared).getByRole('button', { name: 'Harbor at dusk' })).toBeTruthy();
    const mine = screen.getByRole('list', { name: 'Only in “The Unsigned Letter”' });
    expect(within(mine).getByRole('button', { name: 'Lamp room' })).toBeTruthy();
    expect(
      within(screen.getByRole('list', { name: 'Not in any story' })).getByRole('button', {
        name: 'Old sketch',
      }),
    ).toBeTruthy();

    // A story's own picture can be shared with every story.
    await userEvent.click(within(mine).getByRole('button', { name: 'Lamp room' }));
    expect(await screen.findByTestId('image-scope')).toHaveTextContent(
      'Only “The Unsigned Letter”',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Share with all stories' }));
    expect(invoke).toHaveBeenCalledWith('set_image_scope', { assetId: 'img-3', storyId: null });
    expect(await screen.findByText('Shared with all stories.')).toBeVisible();

    // A shared one can be kept for one story.
    await userEvent.click(screen.getAllByRole('button', { name: 'Harbor at dusk' })[0]!);
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Keep for one story only' }),
      's1',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Keep for that story' }));
    expect(invoke).toHaveBeenCalledWith('set_image_scope', { assetId: 'img-1', storyId: 's1' });
    expect(await screen.findByText('Kept for “The Unsigned Letter” only.')).toBeVisible();
  });
});

describe('Pictures in the reader', () => {
  beforeEach(() => {
    useUiStore.setState({ screen: { name: 'reader', routeId: 'route-1' } });
  });

  it('a route picture applies from now on this route; a default is story-wide', async () => {
    let view = readerView();
    invoke.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
      if (cmd === 'get_route_view') return view;
      if (cmd === 'list_images') return [harbor, mara];
      if (cmd === 'edit_story_details') {
        const [c] = args.changes as StateEdit[];
        if (c?.op === 'setVisualRef' && c.assetId) view = readerView({ [c.slot]: c.assetId });
        return view;
      }
      if (cmd === 'set_story_picture') {
        return [{ slot: args.slot, assetId: args.assetId }];
      }
      throw { code: 'NOT_FOUND', message: cmd };
    });
    render(<ReaderScreen routeId="route-1" />);
    await screen.findByLabelText('What do you do?');
    expect(screen.queryByRole('group', { name: 'Scene pictures' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Pictures' }));
    const dialog = await screen.findByRole('dialog', { name: 'Pictures' });
    const rows = within(dialog).getByRole('list', { name: 'Pictures' });
    expect(rows).toHaveTextContent('Portrait of Mara Quill');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Choose Background' }));
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Harbor at dusk' }));
    expect(within(dialog).getByRole('radio', { name: /on Main only/ })).toBeChecked();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Use this picture' }));

    expect(invoke).toHaveBeenCalledWith('edit_story_details', {
      storyId: 'story-1',
      routeId: 'route-1',
      expectedHeadId: 'ev-1',
      changes: [{ op: 'setVisualRef', slot: 'background', assetId: 'img-1' }],
      note: 'Background',
    });
    const scene = await screen.findByRole('group', { name: 'Scene pictures' });
    expect(within(scene).getByRole('img', { name: 'Scene: The lamp room' })).toHaveAttribute(
      'src',
      'dtlimg://localhost/full/img-1',
    );
    expect(within(dialog).getByText('Chosen on Main.')).toBeVisible();

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Choose Portrait of Mara Quill' }),
    );
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Mara' }));
    await userEvent.click(within(dialog).getByRole('radio', { name: /story default/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Use this picture' }));
    expect(invoke).toHaveBeenCalledWith('set_story_picture', {
      storyId: 'story-1',
      slot: 'portrait:mara',
      assetId: 'img-2',
    });
    expect(await within(scene).findByRole('img', { name: 'Portrait of Mara Quill' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Portrait of Mara Quill set for the story',
    );
  });

  it('shows picture-only changes as picture notes in the story', async () => {
    const edit: EventDto = {
      id: 'ev-2',
      originRouteId: 'route-1',
      parentEventId: 'ev-1',
      generationRunId: null,
      createdAt: '2026-11-06T00:00:01Z',
      kind: 'edit',
      payload: {
        changes: [{ op: 'setVisualRef', slot: 'background', assetId: 'img-1' }],
        note: 'Background',
      },
    };
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_route_view') return fakeRouteView([edit]);
      throw { code: 'NOT_FOUND', message: cmd };
    });
    render(<ReaderScreen routeId="route-1" />);
    expect(await screen.findByText('Picture changed: Background.')).toBeVisible();
  });
});

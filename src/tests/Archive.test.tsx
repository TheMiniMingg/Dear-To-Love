// Storypacks and text export (M9): import from the library, export a route
// as text or the whole story as a storypack from the reader.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StorySummary } from '../types';
import { fakeRouteView } from './fakeBackend';

const invoke = vi.fn();
const openDialog = vi.fn();
const saveDialog = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  Channel: class {
    onmessage: (m: unknown) => void = () => undefined;
  },
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...args: unknown[]) => openDialog(...args),
  save: (...args: unknown[]) => saveDialog(...args),
}));

import { fileSafe } from '../api/archive';
import { useUiStore } from '../app/store';
import { LibraryScreen } from '../features/library/LibraryScreen';
import { ReaderScreen } from '../features/reader/ReaderScreen';

const story = (id: string, title: string): StorySummary => ({
  id,
  title,
  description: '',
  createdAt: '2026-11-06T00:00:00Z',
  updatedAt: '2026-11-06T00:00:00Z',
  routeCount: 2,
  mainRouteId: `${id}-main`,
  lastRouteId: `${id}-main`,
  coverAssetId: null,
  writing: false,
  genres: [],
  chapter: 1,
  turns: 0,
  lastReply: null,
  place: '',
  setting: '',
  cast: [],
});

beforeEach(() => {
  invoke.mockReset();
  openDialog.mockReset();
  saveDialog.mockReset();
  useUiStore.setState({ drafts: {}, screen: { name: 'library' }, history: [] });
});

describe('Import storypack', () => {
  it('adds the story to the library and says what came with it', async () => {
    let stories = [story('s1', 'The Unsigned Letter')];
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'list_stories') return stories;
      if (cmd === 'import_storypack') {
        stories = [story('s2', 'The Lamp Room'), ...stories];
        return {
          storyId: 's2',
          title: 'The Lamp Room',
          mainRouteId: 's2-main',
          routes: 2,
          imagesAdded: 1,
          imagesReused: 1,
        };
      }
      throw { code: 'NOT_FOUND', message: cmd };
    });
    openDialog.mockResolvedValue('/p/The Lamp Room.storypack');
    render(<LibraryScreen />);
    await screen.findByText('The Unsigned Letter');
    await userEvent.click(screen.getByRole('button', { name: 'Import storypack' }));

    expect(openDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [expect.objectContaining({ extensions: ['storypack'] })],
      }),
    );
    expect(invoke).toHaveBeenCalledWith('import_storypack', {
      path: '/p/The Lamp Room.storypack',
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Imported "The Lamp Room" with 2 routes. 1 new image added. 1 image was already in your library.',
    );
    expect(await screen.findByText('The Lamp Room')).toBeVisible();
  });

  it('explains a damaged pack and changes nothing; closing the picker does nothing', async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'list_stories') return [];
      if (cmd === 'import_storypack')
        throw {
          code: 'ARCHIVE_INVALID',
          message: "this storypack is damaged or incomplete: story.json doesn't match its checksum",
        };
      throw { code: 'NOT_FOUND', message: cmd };
    });
    render(<LibraryScreen />);
    await screen.findByText('No stories yet.');

    openDialog.mockResolvedValueOnce(null);
    await userEvent.click(screen.getByRole('button', { name: 'Import storypack' }));
    expect(invoke).not.toHaveBeenCalledWith('import_storypack', expect.anything());

    openDialog.mockResolvedValueOnce('/p/broken.storypack');
    await userEvent.click(screen.getByRole('button', { name: 'Import storypack' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "This storypack is damaged or incomplete: story.json doesn't match its checksum.",
    );
    expect(screen.getByText('No stories yet.')).toBeVisible();
  });
});

describe('Export from the reader', () => {
  beforeEach(() => {
    useUiStore.setState({ screen: { name: 'reader', routeId: 'route-1' } });
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_route_view') return fakeRouteView();
      if (cmd === 'export_route_text')
        return { fileName: 'The Unsigned Letter - Main.txt', chapters: 2, turns: 8 };
      if (cmd === 'export_route_book')
        return {
          fileName: 'The Unsigned Letter - Main.epub',
          chapters: 2,
          turns: 8,
          bytes: 420_000,
          coverPicture: false,
        };
      if (cmd === 'export_storypack')
        return {
          fileName: 'The Unsigned Letter.storypack',
          bytes: 2_500_000,
          routes: 3,
          images: 2,
          missingImages: 1,
        };
      throw { code: 'NOT_FOUND', message: cmd };
    });
  });

  async function openExport() {
    render(<ReaderScreen routeId="route-1" />);
    await screen.findByLabelText('What do you do?');
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Export…' }));
    return screen.findByRole('dialog', { name: 'Export' });
  }

  it('saves this route as plain text with times', async () => {
    const dialog = await openExport();
    expect(within(dialog).getByRole('radio', { name: 'Markdown (.md)' })).toBeChecked();
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Plain text (.txt)' }));
    await userEvent.click(
      within(dialog).getByRole('checkbox', { name: 'Include the time of each turn' }),
    );
    saveDialog.mockResolvedValue('/home/a/The Unsigned Letter - Main.txt');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save as text…' }));

    expect(saveDialog).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: 'The Unsigned Letter - Main.txt' }),
    );
    expect(invoke).toHaveBeenCalledWith('export_route_text', {
      routeId: 'route-1',
      path: '/home/a/The Unsigned Letter - Main.txt',
      format: 'text',
      timestamps: true,
    });
    expect(await within(dialog).findByRole('status')).toHaveTextContent(
      'Saved The Unsigned Letter - Main.txt: 2 chapters, 8 turns.',
    );
  });

  it('saves this route as a book with its own title page words', async () => {
    const dialog = await openExport();
    expect(dialog).toHaveTextContent('Only the story goes in, never notes or settings.');
    saveDialog.mockResolvedValue('/home/a/The Unsigned Letter - Main.epub');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save as a book…' }));

    expect(saveDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: 'The Unsigned Letter - Main.epub',
        filters: [{ name: 'E-book (.epub)', extensions: ['epub'] }],
      }),
    );
    expect(invoke).toHaveBeenCalledWith('export_route_book', {
      routeId: 'route-1',
      path: '/home/a/The Unsigned Letter - Main.epub',
      labels: {
        language: undefined,
        // The main route needs no subtitle.
        subtitle: undefined,
        byline: 'Played as Sam Ashby',
        colophon: expect.stringMatching(/^Made with Dear to Love on \w+ \d+, \d{4}$/),
        contents: 'Contents',
      },
    });
    expect(await within(dialog).findByRole('status')).toHaveTextContent(
      'Saved The Unsigned Letter - Main.epub (410 KB): 2 chapters, 8 turns. The story has no cover picture, so the front shows its title.',
    );
  });

  it('saves the whole story as a storypack and reports pictures left out', async () => {
    const dialog = await openExport();
    expect(dialog).toHaveTextContent('It never includes API keys');

    saveDialog.mockResolvedValueOnce(null);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save storypack…' }));
    expect(invoke).not.toHaveBeenCalledWith('export_storypack', expect.anything());

    saveDialog.mockResolvedValueOnce('/home/a/Letter.storypack');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save storypack…' }));
    expect(saveDialog).toHaveBeenLastCalledWith(
      expect.objectContaining({ defaultPath: 'The Unsigned Letter.storypack' }),
    );
    expect(invoke).toHaveBeenCalledWith('export_storypack', {
      storyId: 'story-1',
      path: '/home/a/Letter.storypack',
    });
    expect(await within(dialog).findByRole('status')).toHaveTextContent(
      'Saved The Unsigned Letter.storypack (2.4 MB): 3 routes, 2 pictures. 1 picture was missing from the image library and left out.',
    );
  });
});

describe('fileSafe', () => {
  it('keeps titles readable but valid as file names', () => {
    expect(fileSafe('The Lamp: Part 1/2?')).toBe('The Lamp Part 1 2');
    expect(fileSafe('  ...  ')).toBe('Story');
    expect(fileSafe('Tab\there')).toBe('Tab here');
    expect(fileSafe('a'.repeat(200))).toHaveLength(80);
  });
});

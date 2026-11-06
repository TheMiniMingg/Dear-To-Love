// Backups (M9): back up everything, restore a kept copy or a file after
// confirming, and hear about the result after the restart.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackupInfo, RestorePlan } from '../types';

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

import { useUiStore } from '../app/store';
import { BackupsScreen } from '../features/backups/BackupsScreen';
import { LibraryScreen } from '../features/library/LibraryScreen';

const kept: BackupInfo[] = [
  {
    id: 'auto/auto-20261106T090000.000Z.db',
    kind: 'automatic',
    createdAt: '2026-11-06T09:00:00.000Z',
    bytes: 2_000_000,
  },
  {
    id: 'pre-migration-v3-20261101T000000Z.db',
    kind: 'beforeUpgrade',
    createdAt: '2026-11-01T00:00:00.000Z',
    bytes: 1_500_000,
  },
];

const plan = (over: Partial<RestorePlan> = {}): RestorePlan => ({
  token: 'tok-1',
  source: 'Automatic backup',
  createdAt: '2026-11-06T09:00:00.000Z',
  appVersion: null,
  stories: 3,
  routes: 5,
  images: 2,
  missingImages: 0,
  upgraded: false,
  ...over,
});

beforeEach(() => {
  invoke.mockReset();
  openDialog.mockReset();
  saveDialog.mockReset();
  useUiStore.setState({ screen: { name: 'backups' }, history: [{ name: 'settings' }] });
});

function backend(overrides: Record<string, (args: Record<string, unknown>) => unknown> = {}) {
  invoke.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
    if (overrides[cmd]) return overrides[cmd](args);
    if (cmd === 'list_backups') return kept;
    if (cmd === 'cancel_restore' || cmd === 'restart_app') return null;
    throw { code: 'NOT_FOUND', message: cmd };
  });
}

describe('Backups screen', () => {
  it('lists kept copies and backs up everything to a chosen file', async () => {
    backend({
      export_backup: () => ({
        fileName: 'Dear to Love backup 2026-11-06.dtlbackup',
        bytes: 5_000_000,
        stories: 2,
        images: 3,
        missingImages: 0,
      }),
    });
    render(<BackupsScreen />);
    const list = await screen.findByRole('list', { name: 'Kept on this computer' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(list).toHaveTextContent('Automatic');
    expect(list).toHaveTextContent('Before an app upgrade');
    expect(list).toHaveTextContent('1.9 MB');

    saveDialog.mockResolvedValue('/home/a/Dear to Love backup 2026-11-06.dtlbackup');
    await userEvent.click(screen.getByRole('button', { name: 'Back up everything…' }));
    expect(saveDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: expect.stringMatching(/^Dear to Love backup \d{4}-\d\d-\d\d\.dtlbackup$/),
      }),
    );
    expect(invoke).toHaveBeenCalledWith('export_backup', {
      path: '/home/a/Dear to Love backup 2026-11-06.dtlbackup',
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Saved Dear to Love backup 2026-11-06.dtlbackup (4.8 MB): 2 stories, 3 images.',
    );
  });

  it('asks before restoring a kept copy, and can keep the current data', async () => {
    backend({ prepare_restore: () => plan({ missingImages: 1 }) });
    render(<BackupsScreen />);
    await userEvent.click(
      await screen.findByRole('button', { name: /^Restore Automatic backup from / }),
    );
    expect(invoke).toHaveBeenCalledWith('prepare_restore', {
      source: { from: 'kept', id: 'auto/auto-20261106T090000.000Z.db' },
    });
    const dialog = await screen.findByRole('dialog', { name: 'Restore this backup?' });
    expect(dialog).toHaveTextContent('3 stories with 5 routes, and 2 images.');
    expect(dialog).toHaveTextContent("1 picture isn't in the backup or your library");
    expect(dialog).toHaveTextContent('Your current data is saved first');
    expect(dialog).toHaveTextContent("API keys aren't in backups");

    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep my current data' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(invoke).toHaveBeenCalledWith('cancel_restore', undefined);
    expect(invoke).not.toHaveBeenCalledWith('confirm_restore', expect.anything());
  });

  it('restores a file after confirming, then restarts', async () => {
    backend({
      prepare_restore: () => plan({ source: 'old.dtlbackup', appVersion: '0.1.0', upgraded: true }),
      confirm_restore: () => kept[0],
    });
    openDialog.mockResolvedValue('/home/a/old.dtlbackup');
    render(<BackupsScreen />);
    await userEvent.click(await screen.findByRole('button', { name: 'Restore from file…' }));
    expect(invoke).toHaveBeenCalledWith('prepare_restore', {
      source: { from: 'file', path: '/home/a/old.dtlbackup' },
    });
    const dialog = await screen.findByRole('dialog', { name: 'Restore this backup?' });
    expect(dialog).toHaveTextContent('by Dear to Love 0.1.0');
    expect(dialog).toHaveTextContent('has been upgraded');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Restore and restart' }));
    expect(invoke).toHaveBeenCalledWith('confirm_restore', { token: 'tok-1' });
    await vi.waitFor(() => expect(invoke).toHaveBeenLastCalledWith('restart_app', undefined));
  });

  it('explains a damaged backup file', async () => {
    backend({
      prepare_restore: () => {
        throw {
          code: 'ARCHIVE_INVALID',
          message: "this backup is damaged or incomplete: story.db doesn't match its checksum",
        };
      },
    });
    openDialog.mockResolvedValue('/home/a/bad.dtlbackup');
    render(<BackupsScreen />);
    await userEvent.click(await screen.findByRole('button', { name: 'Restore from file…' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "This backup is damaged or incomplete: story.db doesn't match its checksum.",
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('After a restore', () => {
  it('the library says it worked, once', async () => {
    useUiStore.setState({ screen: { name: 'library' }, history: [] });
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'list_stories') return [];
      if (cmd === 'take_restore_result')
        return {
          ok: true,
          source: 'old.dtlbackup',
          backupCreatedAt: '2026-11-06T09:00:00.000Z',
          message: null,
        };
      throw { code: 'NOT_FOUND', message: cmd };
    });
    render(<LibraryScreen />);
    expect(await screen.findByRole('status')).toHaveTextContent(
      /^Restored the backup from .+\. Your earlier data is kept under Settings → Backups/,
    );
  });
});

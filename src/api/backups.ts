// Backups: file dialogs and readable text for backups and restores.
import { open, save } from '@tauri-apps/plugin-dialog';
import type { BackupExport, BackupKind, RestorePlan, RestoreResult } from '../types';
import { formatBytes } from './images';

export const BACKUP_FILTER = { name: 'Dear to Love backup', extensions: ['dtlbackup'] };

export const KIND_LABELS: Record<BackupKind, string> = {
  automatic: 'Automatic',
  beforeUpgrade: 'Before an app upgrade',
  beforeRestore: 'Before a restore',
};

export function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Where to save a full backup. `null` when the dialog is closed. */
export async function pickBackupTarget(today = new Date()): Promise<string | null> {
  const day = today.toISOString().slice(0, 10);
  return save({
    title: 'Back up everything',
    defaultPath: `Dear to Love backup ${day}.dtlbackup`,
    filters: [BACKUP_FILTER],
  });
}

/** A backup file to restore. `null` when the dialog is closed. */
export async function pickBackupFile(): Promise<string | null> {
  const picked = await open({
    title: 'Restore from a backup file',
    multiple: false,
    directory: false,
    filters: [BACKUP_FILTER],
  });
  return Array.isArray(picked) ? (picked[0] ?? null) : picked;
}

export function describeBackup(r: BackupExport): string {
  let text = `Saved ${r.fileName} (${formatBytes(r.bytes)}): ${plural(r.stories, 'story', 'stories')}, ${plural(r.images, 'image')}.`;
  if (r.missingImages)
    text += ` ${plural(r.missingImages, 'image file')} ${r.missingImages === 1 ? 'was' : 'were'} missing and left out.`;
  return text;
}

export function describePlan(p: RestorePlan): string {
  return `${plural(p.stories, 'story', 'stories')} with ${plural(p.routes, 'route')}, and ${plural(p.images, 'image')}.`;
}

export function describeRestoreResult(r: RestoreResult): string {
  const when = r.backupCreatedAt ? ` from ${formatWhen(r.backupCreatedAt)}` : '';
  return r.ok
    ? `Restored the backup${when}. Your earlier data is kept under Settings → Backups as "Before a restore".`
    : `The backup${when} could not be restored: ${r.message ?? 'unknown problem'}.`;
}

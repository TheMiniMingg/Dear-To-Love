// Backups: file dialogs and readable text for backups and restores.
import { open, save } from '@tauri-apps/plugin-dialog';
import type { BackupExport, BackupKind, RestorePlan, RestoreResult } from '../types';
import { formatBytes } from './images';
import { intlLocale, joinSentences, msg, t, tn } from '../i18n';

const backupFilter = () => ({ name: t('Dear to Love backup'), extensions: ['dtlbackup'] });

const KINDS: Record<BackupKind, string> = {
  automatic: msg('Automatic'),
  beforeUpgrade: msg('Before an app upgrade'),
  beforeRestore: msg('Before a restore'),
};

export const kindLabel = (kind: BackupKind) => t(KINDS[kind]);

export function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(intlLocale(), { dateStyle: 'medium', timeStyle: 'short' });
}

/** Where to save a full backup. `null` when the dialog is closed. */
export async function pickBackupTarget(today = new Date()): Promise<string | null> {
  const day = today.toISOString().slice(0, 10);
  return save({
    title: t('Back up everything'),
    defaultPath: `Dear to Love backup ${day}.dtlbackup`,
    filters: [backupFilter()],
  });
}

/** A backup file to restore. `null` when the dialog is closed. */
export async function pickBackupFile(): Promise<string | null> {
  const picked = await open({
    title: t('Restore from a backup file'),
    multiple: false,
    directory: false,
    filters: [backupFilter()],
  });
  return Array.isArray(picked) ? (picked[0] ?? null) : picked;
}

export function describeBackup(r: BackupExport): string {
  const parts = [
    t('Saved {file} ({size}): {stories}, {images}.', {
      file: r.fileName,
      size: formatBytes(r.bytes),
      stories: tn(r.stories, '{n} story', '{n} stories'),
      images: tn(r.images, '{n} image', '{n} images'),
    }),
  ];
  if (r.missingImages)
    parts.push(
      tn(
        r.missingImages,
        '{n} image file was missing and left out.',
        '{n} image files were missing and left out.',
      ),
    );
  return joinSentences(parts);
}

export function describePlan(p: RestorePlan): string {
  return t('{stories} with {routes}, and {images}.', {
    stories: tn(p.stories, '{n} story', '{n} stories'),
    routes: tn(p.routes, '{n} route', '{n} routes'),
    images: tn(p.images, '{n} image', '{n} images'),
  });
}

export function describeRestoreResult(r: RestoreResult): string {
  const when = r.backupCreatedAt ? formatWhen(r.backupCreatedAt) : null;
  const problem = r.message ?? t('unknown problem');
  if (r.ok) {
    return when
      ? t(
          'Restored the backup from {when}. Your earlier data is kept under Settings → Backups as "Before a restore".',
          { when },
        )
      : t(
          'Restored the backup. Your earlier data is kept under Settings → Backups as "Before a restore".',
        );
  }
  return when
    ? t('The backup from {when} could not be restored: {problem}.', { when, problem })
    : t('The backup could not be restored: {problem}.', { problem });
}

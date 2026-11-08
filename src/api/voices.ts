// Voice pack files: where to save one, and which one to open.
import { open, save } from '@tauri-apps/plugin-dialog';
import { fileSafe } from './archive';
import { t } from '../i18n';

const voicePackFilter = () => ({
  name: t('Dear to Love voice pack'),
  extensions: ['dtlvoices', 'json'],
});

/** Where to save a voice pack. `null` when the dialog is closed. */
export async function pickVoicePackTarget(name: string): Promise<string | null> {
  return save({
    title: t('Save voice pack'),
    defaultPath: `${fileSafe(name)}.dtlvoices`,
    filters: [voicePackFilter()],
  });
}

/** A voice pack to import. `null` when the dialog is closed. */
export async function pickVoicePackFile(): Promise<string | null> {
  const picked = await open({
    title: t('Import voice pack'),
    multiple: false,
    directory: false,
    filters: [voicePackFilter()],
  });
  return Array.isArray(picked) ? (picked[0] ?? null) : picked;
}

import { open, save } from '@tauri-apps/plugin-dialog';
import { fileSafe } from './archive';
import { t } from '../i18n';

const presetFilter = () => ({ name: t('Dear to Love preset'), extensions: ['dtlpreset'] });

/** Where to write a preset file. `null` when the dialog is closed. */
export async function pickPresetTarget(name: string): Promise<string | null> {
  return save({
    title: t('Save preset'),
    defaultPath: `${fileSafe(name)}.dtlpreset`,
    filters: [presetFilter()],
  });
}

/** A preset file to import. `null` when the dialog is closed. */
export async function pickPresetFile(): Promise<string | null> {
  const picked = await open({
    title: t('Import preset'),
    multiple: false,
    directory: false,
    filters: [presetFilter()],
  });
  return Array.isArray(picked) ? (picked[0] ?? null) : picked;
}

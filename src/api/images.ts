// Library images: the URL that shows one, the file picker, and a readable
// summary of what an import did.
import { open } from '@tauri-apps/plugin-dialog';
import type { ImageImport } from '../types';
import { sentence } from './commands';
import { joinSentences, t, tKnown, tn } from '../i18n';

const errorText = (e: string) => {
  const known = tKnown(e);
  return known === e ? sentence(e) : known;
};

type Internals = { convertFileSrc?: (path: string, protocol: string) => string };

/**
 * URL for a library image served by the app's `dtlimg:` protocol. The
 * scheme's shape differs by platform, so Tauri builds it when available.
 */
export function imageUrl(assetId: string, size: 'thumb' | 'full' = 'thumb'): string {
  const path = `${size}/${assetId}`;
  const internals = (window as unknown as { __TAURI_INTERNALS__?: Internals }).__TAURI_INTERNALS__;
  return internals?.convertFileSrc?.(path, 'dtlimg') ?? `dtlimg://localhost/${path}`;
}

/** Ask for image files. Returns `[]` when the picker is closed. */
export async function pickImageFiles(): Promise<string[]> {
  const picked = await open({
    title: t('Add images'),
    multiple: true,
    directory: false,
    filters: [
      {
        name: t('Images (PNG, JPEG, WebP, GIF)'),
        extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'],
      },
    ],
  });
  if (!picked) return [];
  return Array.isArray(picked) ? picked : [picked];
}

/** "Added 2 images. 1 was already in your library." plus one line per failure. */
export function describeImports(results: ImageImport[]): { text: string; problems: string[] } {
  const added = results.filter((r) => r.asset && !r.alreadyInLibrary).length;
  const reused = results.filter((r) => r.asset && r.alreadyInLibrary).length;
  const problems = results
    .filter((r) => r.error)
    .map((r) =>
      t('{file}: {problem}', {
        file: r.fileName || t('A file'),
        problem: errorText(r.error ?? ''),
      }),
    );
  const parts: string[] = [];
  if (added) parts.push(tn(added, 'Added {n} image.', 'Added {n} images.'));
  if (reused)
    parts.push(
      tn(
        reused,
        '{n} was already in your library and is reused.',
        '{n} were already in your library and are reused.',
      ),
    );
  if (!added && !reused) parts.push(t('No images were added.'));
  return { text: joinSentences(parts), problems };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

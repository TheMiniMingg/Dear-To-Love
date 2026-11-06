// Library images: the URL that shows one, the file picker, and a readable
// summary of what an import did.
import { open } from '@tauri-apps/plugin-dialog';
import type { ImageImport } from '../types';
import { sentence } from './commands';

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
    title: 'Add images',
    multiple: true,
    directory: false,
    filters: [{ name: 'Images (PNG, JPEG, WebP)', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
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
    .map((r) => `${r.fileName || 'A file'}: ${sentence(r.error ?? '')}`);
  const parts: string[] = [];
  if (added) parts.push(`Added ${added} ${added === 1 ? 'image' : 'images'}.`);
  if (reused)
    parts.push(
      reused === 1
        ? '1 was already in your library and is reused.'
        : `${reused} were already in your library and are reused.`,
    );
  if (!added && !reused) parts.push('No images were added.');
  return { text: parts.join(' '), problems };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

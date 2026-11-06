// Storypack and text export: file dialogs and readable summaries of results.
import { open, save } from '@tauri-apps/plugin-dialog';
import type { StorypackExport, StorypackImport, TextExport, TextFormat } from '../types';
import { formatBytes } from './images';

export const STORYPACK_FILTER = { name: 'Dear to Love storypack', extensions: ['storypack'] };

/** A title as a file name: no characters any desktop system refuses. */
export function fileSafe(name: string): string {
  const cleaned = Array.from(name, (c) => (c.charCodeAt(0) < 32 ? ' ' : c))
    .join('')
    .replace(/[<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, 80)
    .trim();
  return cleaned || 'Story';
}

/** Where to save a storypack. `null` when the dialog is closed. */
export async function pickStorypackTarget(title: string): Promise<string | null> {
  return save({
    title: 'Save storypack',
    defaultPath: `${fileSafe(title)}.storypack`,
    filters: [STORYPACK_FILTER],
  });
}

/** A storypack to import. `null` when the dialog is closed. */
export async function pickStorypackFile(): Promise<string | null> {
  const picked = await open({
    title: 'Import storypack',
    multiple: false,
    directory: false,
    filters: [STORYPACK_FILTER],
  });
  return Array.isArray(picked) ? (picked[0] ?? null) : picked;
}

export const TEXT_FORMATS: { format: TextFormat; label: string; extension: string }[] = [
  { format: 'markdown', label: 'Markdown (.md)', extension: 'md' },
  { format: 'text', label: 'Plain text (.txt)', extension: 'txt' },
];

export async function pickTextTarget(
  title: string,
  routeLabel: string,
  format: TextFormat,
): Promise<string | null> {
  const extension = format === 'text' ? 'txt' : 'md';
  const label = TEXT_FORMATS.find((t) => t.format === format)?.label ?? extension;
  return save({
    title: 'Save as text',
    defaultPath: `${fileSafe(`${title} - ${routeLabel}`)}.${extension}`,
    filters: [{ name: label, extensions: [extension] }],
  });
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function describeExport(r: StorypackExport): string {
  const parts = [`Saved ${r.fileName} (${formatBytes(r.bytes)}): ${plural(r.routes, 'route')}`];
  if (r.images) parts.push(plural(r.images, 'picture'));
  let text = `${parts.join(', ')}.`;
  if (r.missingImages)
    text += ` ${plural(r.missingImages, 'picture')} ${r.missingImages === 1 ? 'was' : 'were'} missing from the image library and left out.`;
  return text;
}

export function describeImport(r: StorypackImport): string {
  let text = `Imported "${r.title}" with ${plural(r.routes, 'route')}.`;
  const pics: string[] = [];
  if (r.imagesAdded) pics.push(`${plural(r.imagesAdded, 'new image')} added`);
  if (r.imagesReused)
    pics.push(
      `${plural(r.imagesReused, 'image')} ${r.imagesReused === 1 ? 'was' : 'were'} already in your library`,
    );
  if (pics.length) text += ` ${pics.join('; ')}.`;
  return text;
}

export function describeText(r: TextExport): string {
  return `Saved ${r.fileName}: ${plural(r.chapters, 'chapter')}, ${plural(r.turns, 'turn')}.`;
}

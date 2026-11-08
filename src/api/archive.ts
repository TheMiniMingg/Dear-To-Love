// Storypack and text export: file dialogs and readable summaries of results.
import { open, save } from '@tauri-apps/plugin-dialog';
import type {
  BookExport,
  StorypackExport,
  StorypackImport,
  TextExport,
  TextFormat,
} from '../types';
import { formatBytes } from './images';
import { joinList, joinSentences, msg, t, tn } from '../i18n';

const storypackFilter = () => ({ name: t('Dear to Love storypack'), extensions: ['storypack'] });

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
    title: t('Save storypack'),
    defaultPath: `${fileSafe(title)}.storypack`,
    filters: [storypackFilter()],
  });
}

/** A storypack to import. `null` when the dialog is closed. */
export async function pickStorypackFile(): Promise<string | null> {
  const picked = await open({
    title: t('Import storypack'),
    multiple: false,
    directory: false,
    filters: [storypackFilter()],
  });
  return Array.isArray(picked) ? (picked[0] ?? null) : picked;
}

export const TEXT_FORMATS: { format: TextFormat; label: string; extension: string }[] = [
  { format: 'markdown', label: msg('Markdown (.md)'), extension: 'md' },
  { format: 'text', label: msg('Plain text (.txt)'), extension: 'txt' },
];

export async function pickTextTarget(
  title: string,
  routeLabel: string,
  format: TextFormat,
): Promise<string | null> {
  const extension = format === 'text' ? 'txt' : 'md';
  const known = TEXT_FORMATS.find((f) => f.format === format)?.label;
  const label = known ? t(known) : extension;
  return save({
    title: t('Save as text'),
    defaultPath: `${fileSafe(`${title} - ${routeLabel}`)}.${extension}`,
    filters: [{ name: label, extensions: [extension] }],
  });
}

/** Where to save a route as a book. `null` when the dialog is closed. */
export async function pickBookTarget(title: string, routeLabel: string): Promise<string | null> {
  return save({
    title: t('Save as a book'),
    defaultPath: `${fileSafe(`${title} - ${routeLabel}`)}.epub`,
    filters: [{ name: t('E-book (.epub)'), extensions: ['epub'] }],
  });
}

export function describeBook(r: BookExport): string {
  return joinSentences([
    t('Saved {file} ({size}): {chapters}, {turns}.', {
      file: r.fileName,
      size: formatBytes(r.bytes),
      chapters: tn(r.chapters, '{n} chapter', '{n} chapters'),
      turns: tn(r.turns, '{n} turn', '{n} turns'),
    }),
    r.coverPicture
      ? t('The story’s cover is on the front.')
      : t('The story has no cover picture, so the front shows its title.'),
  ]);
}

export function describeExport(r: StorypackExport): string {
  const what = [tn(r.routes, '{n} route', '{n} routes')];
  if (r.images) what.push(tn(r.images, '{n} picture', '{n} pictures'));
  const parts = [
    t('Saved {file} ({size}): {what}.', {
      file: r.fileName,
      size: formatBytes(r.bytes),
      what: joinList(what),
    }),
  ];
  if (r.missingImages)
    parts.push(
      tn(
        r.missingImages,
        '{n} picture was missing from the image library and left out.',
        '{n} pictures were missing from the image library and left out.',
      ),
    );
  return joinSentences(parts);
}

export function describeImport(r: StorypackImport): string {
  const parts = [
    t('Imported "{title}" with {routes}.', {
      title: r.title,
      routes: tn(r.routes, '{n} route', '{n} routes'),
    }),
  ];
  if (r.imagesAdded) parts.push(tn(r.imagesAdded, '{n} new image added.', '{n} new images added.'));
  if (r.imagesReused)
    parts.push(
      tn(
        r.imagesReused,
        '{n} image was already in your library.',
        '{n} images were already in your library.',
      ),
    );
  return joinSentences(parts);
}

export function describeText(r: TextExport): string {
  return t('Saved {file}: {chapters}, {turns}.', {
    file: r.fileName,
    chapters: tn(r.chapters, '{n} chapter', '{n} chapters'),
    turns: tn(r.turns, '{n} turn', '{n} turns'),
  });
}

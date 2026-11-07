/**
 * The command palette (Ctrl/Cmd+K): one box that goes to any story,
 * chapter, window or setting by typing a few letters of its name.
 */
import type { LucideIcon } from 'lucide-react';
import { create } from 'zustand';
import type { ShortcutId } from './shortcuts';

export type PaletteEntry = {
  id: string;
  /** The group it is listed under, already in the app's language. */
  group: string;
  label: string;
  /** More words it is found by (a story's genres, a chapter's number). */
  keywords?: string;
  /** A short line under the label. */
  hint?: string;
  icon?: LucideIcon;
  keys?: ShortcutId;
  run: () => void;
};

/**
 * Entries the open screen adds (the reader's chapters and windows), read
 * when the palette opens so they are never out of date.
 */
export const paletteSources = new Map<string, () => PaletteEntry[]>();

export const usePalette = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

/** Lower case, without accents, single spaces: "Café" and "cafe" match. */
export function foldText(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * How well `entry` fits `query`, or 0 when it doesn't: every word of the
 * query must be in its label, group or keywords. A label that starts with
 * the query comes first, then labels with a word that starts with it.
 */
export function paletteScore(entry: PaletteEntry, query: string): number {
  const q = foldText(query);
  if (!q) return 1;
  const label = foldText(entry.label);
  const all = `${label} ${foldText(entry.group)} ${foldText(entry.keywords ?? '')}`;
  const words = q.split(' ');
  if (!words.every((w) => all.includes(w))) return 0;
  if (label.startsWith(q)) return 4;
  if (label.split(/[\s:·,.()-]+/).some((w) => w.startsWith(words[0] ?? ''))) return 3;
  if (label.includes(q)) return 2;
  return 1;
}

/** The entries that fit `query`, best first, in their own order among equals. */
export function searchPalette(entries: PaletteEntry[], query: string, limit = 60): PaletteEntry[] {
  return entries
    .map((entry, i) => ({ entry, i, score: paletteScore(entry, query) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.entry);
}

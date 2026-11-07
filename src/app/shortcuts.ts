/**
 * Keyboard shortcuts: one list that the key handlers, the button hints and
 * the Keyboard shortcuts window all read. "Mod" is Ctrl, or Cmd on a Mac.
 */
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { create } from 'zustand';
import { msg, t } from '../i18n';

type AnyKeyEvent = KeyboardEvent | ReactKeyboardEvent;

export type ShortcutId =
  | 'menu'
  | 'send'
  | 'newline'
  | 'quickSave'
  | 'saves'
  | 'search'
  | 'bookmark'
  | 'endChapter'
  | 'pictures'
  | 'details'
  | 'routes'
  | 'memory'
  | 'larger'
  | 'smaller'
  | 'latest'
  | 'scroll'
  | 'newStory'
  | 'moveStories'
  | 'settings'
  | 'help'
  | 'closeWindow';

type Shortcut = { id: ShortcutId; keys: string[]; label: string };

export const SHORTCUT_GROUPS: { title: string; items: Shortcut[] }[] = [
  {
    title: msg('In a story'),
    items: [
      { id: 'send', keys: ['Enter'], label: msg('Send what you wrote') },
      { id: 'newline', keys: ['Shift+Enter'], label: msg('New line in the action box') },
      { id: 'menu', keys: ['Escape'], label: msg('Pause menu') },
      { id: 'quickSave', keys: ['Mod+S'], label: msg('Quick save') },
      { id: 'saves', keys: ['Mod+L'], label: msg('Save / Load') },
      { id: 'search', keys: ['Mod+F'], label: msg('Story search') },
      { id: 'bookmark', keys: ['Mod+B'], label: msg('Bookmark the latest reply, or remove it') },
      { id: 'routes', keys: ['Mod+G'], label: msg('Routes') },
      { id: 'details', keys: ['Mod+I'], label: msg('Story details') },
      // Not Mod+M: on a Mac that minimizes the window.
      { id: 'memory', keys: ['Mod+Shift+M'], label: msg('Story memory') },
      { id: 'endChapter', keys: ['Mod+E'], label: msg('End chapter') },
      { id: 'pictures', keys: ['Mod+P'], label: msg('Picture view on or off') },
      { id: 'larger', keys: ['Mod+='], label: msg('Larger text') },
      { id: 'smaller', keys: ['Mod+-'], label: msg('Smaller text') },
      { id: 'latest', keys: ['Mod+J'], label: msg('Jump to the latest and write') },
      { id: 'scroll', keys: ['ArrowUp', 'ArrowDown'], label: msg('Scroll the story') },
    ],
  },
  {
    title: msg('In the library'),
    items: [
      { id: 'newStory', keys: ['Mod+N'], label: msg('Preset Story') },
      { id: 'moveStories', keys: ['ArrowUp', 'ArrowDown'], label: msg('Move between stories') },
    ],
  },
  {
    title: msg('Anywhere'),
    items: [
      { id: 'settings', keys: ['Mod+,'], label: msg('Settings') },
      { id: 'help', keys: ['F1', 'Mod+/'], label: msg('Show this list') },
      { id: 'closeWindow', keys: ['Escape'], label: msg('Close a window') },
    ],
  },
];

const BY_ID = new Map(SHORTCUT_GROUPS.flatMap((g) => g.items).map((s) => [s.id, s]));

export const isMac = (): boolean =>
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/**
 * True when `e` is the key combination `combo`, such as "Mod+S" or "F1".
 * Shift is ignored for punctuation, which needs it on some keyboards, and a
 * letter also matches by its key position when the layout types another
 * script (Korean, Russian, and so on).
 */
export function isCombo(e: AnyKeyEvent, combo: string): boolean {
  const plus = combo.lastIndexOf('+', combo.length - 2);
  const key = plus < 0 ? combo : combo.slice(plus + 1);
  const mods = plus < 0 ? [] : combo.slice(0, plus).split('+');
  if (mods.includes('Mod') !== (e.ctrlKey || e.metaKey) || e.altKey) return false;
  const punctuation = key.length === 1 && !/[a-z0-9]/i.test(key);
  if (!punctuation && mods.includes('Shift') !== e.shiftKey) return false;
  if (key === '=') return e.key === '=' || e.key === '+';
  if (/^[a-z]$/i.test(key)) {
    if (e.key.toLowerCase() === key.toLowerCase()) return true;
    return !/^[a-z]$/i.test(e.key) && e.code === `Key${key.toUpperCase()}`;
  }
  return e.key === key;
}

/** True when `e` is any of the keys of the shortcut `id`. */
export function isShortcut(e: AnyKeyEvent, id: ShortcutId): boolean {
  return BY_ID.get(id)?.keys.some((k) => isCombo(e, k)) ?? false;
}

const KEY_NAMES: Record<string, string> = {
  Escape: 'Esc',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Enter: 'Enter',
};

/** "Ctrl+S" on Windows and Linux, "⌘S" on a Mac ("⇧⌘M" with Shift). */
export function keyLabel(combo: string): string {
  const mac = isMac();
  const parts = combo.split(/\+(?!$)/);
  const key = parts.pop() ?? '';
  const name = KEY_NAMES[key] ?? (key.length === 1 ? key.toUpperCase() : key);
  const mods = parts.map((p) => {
    if (p === 'Mod') return mac ? '⌘' : 'Ctrl';
    if (p === 'Shift') return mac ? '⇧' : 'Shift';
    return p;
  });
  // A Mac lists Shift before Command.
  if (mac) return [...mods].sort((a, b) => (a === '⇧' ? -1 : b === '⇧' ? 1 : 0)).join('') + name;
  return [...mods, name].join('+');
}

/** The first key combination of a shortcut, for a hint: "Ctrl+S". */
export function shortcutKeys(id: ShortcutId): string {
  const s = BY_ID.get(id);
  return s ? keyLabel(s.keys[0]!) : '';
}

/** A button hint: "Quick save (Ctrl+S)". */
export function withKeys(label: string, id: ShortcutId): string {
  return t('{label} ({keys})', { label, keys: shortcutKeys(id) });
}

/** For `aria-keyshortcuts`: "Control+S" or "Meta+S". */
export function ariaKeys(id: ShortcutId): string {
  const s = BY_ID.get(id);
  if (!s) return '';
  return s.keys.map((k) => k.replace('Mod', isMac() ? 'Meta' : 'Control')).join(' ');
}

/** Whether the Keyboard shortcuts window is open. */
export const useShortcutHelp = create<{ open: boolean; setOpen: (open: boolean) => void }>(
  (set) => ({ open: false, setOpen: (open) => set({ open }) }),
);

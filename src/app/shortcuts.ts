/**
 * Keyboard shortcuts: one list that the key handlers, the button hints and
 * the Keyboard shortcuts window all read. "Mod" is Ctrl, or Cmd on a Mac.
 * The player can change any of them (saved on this computer); a few keys
 * that typing itself needs (Enter, the arrows, Escape for closing) stay.
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
  | 'takeBack'
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
  | 'palette'
  | 'closeWindow';

type Shortcut = {
  id: ShortcutId;
  keys: string[];
  label: string;
  /** Keys typing and windows need: shown, but not changed. */
  fixed?: boolean;
};

export const SHORTCUT_GROUPS: { title: string; items: Shortcut[] }[] = [
  {
    title: msg('In a story'),
    items: [
      { id: 'send', keys: ['Enter'], label: msg('Send what you wrote'), fixed: true },
      {
        id: 'newline',
        keys: ['Shift+Enter'],
        label: msg('New line in the action box'),
        fixed: true,
      },
      { id: 'menu', keys: ['Escape'], label: msg('Pause menu') },
      { id: 'quickSave', keys: ['Mod+S'], label: msg('Quick save') },
      { id: 'saves', keys: ['Mod+L'], label: msg('Save / Load') },
      { id: 'search', keys: ['Mod+F'], label: msg('Story search') },
      { id: 'bookmark', keys: ['Mod+B'], label: msg('Bookmark the latest reply, or remove it') },
      { id: 'routes', keys: ['Mod+G'], label: msg('Routes') },
      { id: 'details', keys: ['Mod+I'], label: msg('Story details') },
      // Not Mod+M: on a Mac that minimizes the window.
      { id: 'memory', keys: ['Mod+Shift+M'], label: msg('Story memory') },
      { id: 'takeBack', keys: ['Mod+U'], label: msg('Take back my last turn') },
      { id: 'endChapter', keys: ['Mod+E'], label: msg('End chapter') },
      { id: 'pictures', keys: ['Mod+P'], label: msg('Picture view on or off') },
      { id: 'larger', keys: ['Mod+='], label: msg('Larger text') },
      { id: 'smaller', keys: ['Mod+-'], label: msg('Smaller text') },
      { id: 'latest', keys: ['Mod+J'], label: msg('Jump to the latest and write') },
      {
        id: 'scroll',
        keys: ['ArrowUp', 'ArrowDown'],
        label: msg('Scroll the story'),
        fixed: true,
      },
    ],
  },
  {
    title: msg('In the library'),
    items: [
      { id: 'newStory', keys: ['Mod+N'], label: msg('Preset Story') },
      {
        id: 'moveStories',
        keys: ['ArrowUp', 'ArrowDown'],
        label: msg('Move between stories'),
        fixed: true,
      },
    ],
  },
  {
    title: msg('Anywhere'),
    items: [
      {
        id: 'palette',
        keys: ['Mod+K'],
        label: msg('Go to anything: a story, chapter, window or setting'),
      },
      { id: 'settings', keys: ['Mod+,'], label: msg('Settings') },
      { id: 'help', keys: ['F1', 'Mod+/'], label: msg('Show this list') },
      { id: 'closeWindow', keys: ['Escape'], label: msg('Close a window'), fixed: true },
    ],
  },
];

const BY_ID = new Map(SHORTCUT_GROUPS.flatMap((g) => g.items).map((s) => [s.id, s]));
/** Which group each shortcut is in: 0 in a story, 1 in the library, 2 anywhere. */
const GROUP_OF = new Map(SHORTCUT_GROUPS.flatMap((g, i) => g.items.map((s) => [s.id, i] as const)));
const ANYWHERE = 2;

const STORAGE_KEY = 'dtl.shortcuts';

type Custom = Partial<Record<ShortcutId, string[]>>;

function loadCustom(): Custom {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Record<
      string,
      unknown
    > | null;
    const out: Custom = {};
    for (const [id, keys] of Object.entries(raw ?? {})) {
      const s = BY_ID.get(id as ShortcutId);
      if (!s || s.fixed || !Array.isArray(keys)) continue;
      const list = keys.filter((k): k is string => typeof k === 'string' && k.length < 40);
      out[s.id] = list.slice(0, 2);
    }
    return out;
  } catch {
    return {};
  }
}

type ShortcutKeysState = {
  /** The player's own keys, by shortcut; an empty list means none. */
  custom: Custom;
  /** `null` puts the shortcut back to its usual keys. */
  setKeys: (id: ShortcutId, keys: string[] | null) => void;
  resetAll: () => void;
};

export const useShortcutKeys = create<ShortcutKeysState>((set, get) => {
  const keep = (custom: Custom) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
    } catch {
      // A preference only.
    }
    set({ custom });
  };
  return {
    custom: loadCustom(),
    setKeys: (id, keys) => {
      if (BY_ID.get(id)?.fixed) return;
      const custom = { ...get().custom };
      if (keys === null) delete custom[id];
      else custom[id] = keys;
      keep(custom);
    },
    resetAll: () => keep({}),
  };
});

/** The keys a shortcut has now: the player's own, or its usual ones. */
export function keysOf(id: ShortcutId): string[] {
  return useShortcutKeys.getState().custom[id] ?? BY_ID.get(id)?.keys ?? [];
}

/** The usual keys of a shortcut. */
export function defaultKeysOf(id: ShortcutId): string[] {
  return BY_ID.get(id)?.keys ?? [];
}

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
  const { key, mods } = splitCombo(combo);
  if (mods.includes('Mod') !== (e.ctrlKey || e.metaKey)) return false;
  if (mods.includes('Alt') !== e.altKey) return false;
  const punctuation = key.length === 1 && !/[a-z0-9]/i.test(key);
  if (!punctuation && mods.includes('Shift') !== e.shiftKey) return false;
  if (key === '=') return e.key === '=' || e.key === '+';
  if (key === 'Space') return e.key === ' ' || e.code === 'Space';
  if (/^[a-z]$/i.test(key)) {
    if (e.key.toLowerCase() === key.toLowerCase()) return true;
    return !/^[a-z]$/i.test(e.key) && e.code === `Key${key.toUpperCase()}`;
  }
  // A digit with Shift or Alt types another character on many keyboards.
  if (/^[0-9]$/.test(key)) return e.key === key || e.code === `Digit${key}`;
  return e.key === key;
}

function splitCombo(combo: string): { key: string; mods: string[] } {
  const plus = combo.lastIndexOf('+', combo.length - 2);
  return {
    key: plus < 0 ? combo : combo.slice(plus + 1),
    mods: plus < 0 ? [] : combo.slice(0, plus).split('+'),
  };
}

/** True when `e` is any of the keys of the shortcut `id`. */
export function isShortcut(e: AnyKeyEvent, id: ShortcutId): boolean {
  return keysOf(id).some((k) => isCombo(e, k));
}

const MODIFIER_KEYS = new Set([
  'Shift',
  'Control',
  'Alt',
  'AltGraph',
  'Meta',
  'OS',
  'Super',
  'Hyper',
  'Fn',
  'CapsLock',
]);

/**
 * The key combination a key press makes, as the list spells them
 * ("Mod+Shift+K", "Alt+1", "F5"), or null while only modifiers are down.
 */
export function comboFromEvent(e: AnyKeyEvent): string | null {
  if (MODIFIER_KEYS.has(e.key) || e.key === 'Dead' || e.key === 'Unidentified') return null;
  let key: string;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5);
  else if (e.key === ' ') key = 'Space';
  else if (e.key.length === 1) key = e.key.toUpperCase();
  else key = e.key;
  const punctuation = key.length === 1 && !/[a-z0-9]/i.test(key);
  const mods = [
    e.ctrlKey || e.metaKey ? 'Mod' : null,
    e.altKey ? 'Alt' : null,
    // The punctuation typed already says whether Shift was down.
    e.shiftKey && !punctuation ? 'Shift' : null,
  ].filter((m): m is string => m !== null);
  return [...mods, key].join('+');
}

/** Keys the system or text editing needs, which no shortcut may take. */
const RESERVED = new Set([
  'Mod+C',
  'Mod+V',
  'Mod+X',
  'Mod+A',
  'Mod+Z',
  'Mod+Shift+Z',
  'Mod+Y',
  'Mod+Q',
  'Mod+W',
  'Mod+H',
  'Mod+M',
  'Mod+R',
  'Alt+F4',
]);

export type ComboCheck =
  { ok: true; clash: ShortcutId | null } | { ok: false; reason: 'needsModifier' | 'reserved' };

/**
 * Whether `combo` can be given to shortcut `id`: it has to leave typing
 * alone (Ctrl, Cmd or Alt with it, unless it is a function key) and the
 * system's own keys free. `clash` is another shortcut it already does
 * where both work, which would lose it.
 */
export function checkCombo(id: ShortcutId, combo: string): ComboCheck {
  const { key, mods } = splitCombo(combo);
  const held = mods.includes('Mod') || mods.includes('Alt');
  if (!held && !/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) return { ok: false, reason: 'needsModifier' };
  if (key === 'Tab' || RESERVED.has(combo)) return { ok: false, reason: 'reserved' };
  const mine = GROUP_OF.get(id);
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  for (const other of BY_ID.values()) {
    if (other.id === id) continue;
    const theirs = GROUP_OF.get(other.id);
    const overlap = mine === theirs || mine === ANYWHERE || theirs === ANYWHERE;
    if (overlap && keysOf(other.id).some((k) => same(k, combo)))
      return { ok: true, clash: other.id };
  }
  return { ok: true, clash: null };
}

/** The label of a shortcut, for messages ("Quick save"). */
export function shortcutLabel(id: ShortcutId): string {
  return BY_ID.get(id)?.label ?? id;
}

const KEY_NAMES: Record<string, string> = {
  Escape: 'Esc',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Enter: 'Enter',
  Space: 'Space',
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
    if (p === 'Alt') return mac ? '⌥' : 'Alt';
    return p;
  });
  // A Mac lists Option, then Shift, then Command.
  const order = ['⌥', '⇧', '⌘'];
  if (mac) return [...mods].sort((a, b) => order.indexOf(a) - order.indexOf(b)).join('') + name;
  return [...mods, name].join('+');
}

/** The first key combination of a shortcut, for a hint: "Ctrl+S". */
export function shortcutKeys(id: ShortcutId): string {
  const first = keysOf(id)[0];
  return first ? keyLabel(first) : '';
}

/** A button hint: "Quick save (Ctrl+S)", or just the label with no key. */
export function withKeys(label: string, id: ShortcutId): string {
  const keys = shortcutKeys(id);
  return keys ? t('{label} ({keys})', { label, keys }) : label;
}

/** For `aria-keyshortcuts`: "Control+S" or "Meta+S". */
export function ariaKeys(id: ShortcutId): string {
  return keysOf(id)
    .map((k) => k.replace('Mod', isMac() ? 'Meta' : 'Control'))
    .join(' ');
}

/** Whether the Keyboard shortcuts window is open. */
export const useShortcutHelp = create<{ open: boolean; setOpen: (open: boolean) => void }>(
  (set) => ({ open: false, setOpen: (open) => set({ open }) }),
);

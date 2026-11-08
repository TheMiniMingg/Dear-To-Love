import { create } from 'zustand';
import type { UpdateStatus } from '../types';

// UI-only state. Story data never lives here: the Rust layer owns canonical
// state and screens fetch views from it.
export type Screen =
  | { name: 'library' }
  | { name: 'quickstart' }
  | { name: 'create' }
  | { name: 'reader'; routeId: string }
  | { name: 'diagnostics' }
  | { name: 'settings' }
  | { name: 'usage' }
  | { name: 'images' }
  | { name: 'backups' }
  | { name: 'guide' }
  | { name: 'help' };

const HISTORY_LIMIT = 10;
const TEXT_SIZE_KEY = 'dtl.textSize';
export const TEXT_SIZES = [0.9, 1, 1.15, 1.3, 1.5] as const;

function loadTextSize(): number {
  try {
    const v = Number(localStorage.getItem(TEXT_SIZE_KEY));
    return TEXT_SIZES.includes(v as (typeof TEXT_SIZES)[number]) ? v : 1;
  } catch {
    return 1;
  }
}

function keepTextSize(size: number): number {
  try {
    localStorage.setItem(TEXT_SIZE_KEY, String(size));
  } catch {
    // Preference only; ignore storage failures.
  }
  return size;
}

/** A connection the setup guide asked Settings to start: a preset id and maybe a model. */
export type NewConnection = { preset: string; model?: string };

type UiState = {
  screen: Screen;
  /** Where Back returns to, newest last (Settings, Usage, Diagnostics). */
  history: Screen[];
  /** Unsent composer text per route; survives pause menus and screen changes. */
  drafts: Record<string, string>;
  textSize: number;
  /** The update check's state, shared by the footer notice and Settings. */
  updates: UpdateStatus | null;
  setUpdates: (u: UpdateStatus | null) => void;
  navigate: (screen: Screen) => void;
  goBack: () => void;
  setDraft: (routeId: string, text: string) => void;
  clearDraft: (routeId: string) => void;
  stepTextSize: (delta: 1 | -1) => void;
  setTextSize: (size: number) => void;
  /** A service the setup guide asked Settings to add, and the model it picked. */
  newConnection: NewConnection | null;
  /** Opens Settings with a new connection for this preset (and model). */
  addConnection: (preset: string, model?: string) => void;
  clearNewConnection: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  screen: { name: 'library' },
  history: [],
  drafts: {},
  textSize: loadTextSize(),
  updates: null,
  newConnection: null,
  addConnection: (preset, model) =>
    set((s) => ({
      newConnection: model ? { preset, model } : { preset },
      screen: { name: 'settings' },
      history: [...s.history, s.screen].slice(-HISTORY_LIMIT),
    })),
  clearNewConnection: () => set({ newConnection: null }),
  setUpdates: (updates) => set({ updates }),
  navigate: (screen) =>
    set((s) => ({ screen, history: [...s.history, s.screen].slice(-HISTORY_LIMIT) })),
  goBack: () =>
    set((s) => ({
      screen: s.history[s.history.length - 1] ?? { name: 'library' },
      history: s.history.slice(0, -1),
    })),
  setDraft: (routeId, text) => set((s) => ({ drafts: { ...s.drafts, [routeId]: text } })),
  clearDraft: (routeId) =>
    set((s) => {
      const drafts = { ...s.drafts };
      delete drafts[routeId];
      return { drafts };
    }),
  stepTextSize: (delta) =>
    set((s) => {
      const i = Math.max(
        0,
        Math.min(TEXT_SIZES.length - 1, TEXT_SIZES.indexOf(s.textSize as never) + delta),
      );
      return { textSize: keepTextSize(TEXT_SIZES[i] ?? 1) };
    }),
  setTextSize: (size) =>
    set({ textSize: keepTextSize(TEXT_SIZES.includes(size as never) ? size : 1) }),
}));

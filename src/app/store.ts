import { create } from 'zustand';

// UI-only state. Story data never lives here: the Rust layer owns canonical
// state and screens fetch views from it.
export type Screen =
  | { name: 'library' }
  | { name: 'quickstart' }
  | { name: 'reader'; routeId: string }
  | { name: 'diagnostics' }
  | { name: 'settings' };

const TEXT_SIZE_KEY = 'dtl.textSize';
const TEXT_SIZES = [0.9, 1, 1.15, 1.3, 1.5] as const;

function loadTextSize(): number {
  try {
    const v = Number(localStorage.getItem(TEXT_SIZE_KEY));
    return TEXT_SIZES.includes(v as (typeof TEXT_SIZES)[number]) ? v : 1;
  } catch {
    return 1;
  }
}

type UiState = {
  screen: Screen;
  /** Where the Back button of Diagnostics and Settings returns to. */
  previous: Screen | null;
  /** Unsent composer text per route; survives pause menus and screen changes. */
  drafts: Record<string, string>;
  textSize: number;
  navigate: (screen: Screen) => void;
  goBack: () => void;
  setDraft: (routeId: string, text: string) => void;
  clearDraft: (routeId: string) => void;
  stepTextSize: (delta: 1 | -1) => void;
};

export const useUiStore = create<UiState>((set) => ({
  screen: { name: 'library' },
  previous: null,
  drafts: {},
  textSize: loadTextSize(),
  navigate: (screen) => set((s) => ({ screen, previous: s.screen })),
  goBack: () => set((s) => ({ screen: s.previous ?? { name: 'library' }, previous: null })),
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
      const textSize = TEXT_SIZES[i] ?? 1;
      try {
        localStorage.setItem(TEXT_SIZE_KEY, String(textSize));
      } catch {
        // Preference only; ignore storage failures.
      }
      return { textSize };
    }),
}));

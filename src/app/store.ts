import { create } from 'zustand';

// UI-only state: which screen is showing. Story data never lives here;
// the Rust layer owns canonical state.
export type Screen = 'library' | 'diagnostics';

type UiState = {
  screen: Screen;
  navigate: (screen: Screen) => void;
};

export const useUiStore = create<UiState>((set) => ({
  screen: 'library',
  navigate: (screen) => set({ screen }),
}));

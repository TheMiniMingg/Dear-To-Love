import { create } from 'zustand';
import { msg } from '../i18n';

/** How much of the background picture shows through behind the text. */
export type Veil = 'faint' | 'soft' | 'clear';

export const VEILS: { id: Veil; label: string }[] = [
  { id: 'faint', label: msg('A little') },
  { id: 'soft', label: msg('Some') },
  { id: 'clear', label: msg('A lot') },
];

type Backdrop = { assetId: string | null; veil: Veil };

type BackdropState = Backdrop & {
  /** Change the picture or how much it shows; kept on this computer. */
  update: (next: Partial<Backdrop>) => void;
};

const STORAGE_KEY = 'dtl.backdrop';
const NONE: Backdrop = { assetId: null, veil: 'soft' };

function load(): Backdrop {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Backdrop> | null;
    if (!raw) return NONE;
    return {
      assetId: typeof raw.assetId === 'string' && raw.assetId ? raw.assetId : null,
      veil: VEILS.some((v) => v.id === raw.veil) ? (raw.veil as Veil) : NONE.veil,
    };
  } catch {
    return NONE;
  }
}

/**
 * The app's background picture: an image from the library behind every
 * screen. A setting of this computer, like the app language, so it is not in
 * backups or storypacks.
 */
export const useBackdrop = create<BackdropState>((set, get) => ({
  ...load(),
  update: (next) => {
    const value = { assetId: get().assetId, veil: get().veil, ...next };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      // A preference only; it still applies until the app closes.
    }
    set(value);
  },
}));

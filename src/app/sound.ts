/**
 * One switch for every sound the app makes: the reply chime and reading
 * aloud. Off means silent: nothing plays and no voice is asked for. A
 * setting of this computer.
 */
import { create } from 'zustand';

const STORAGE_KEY = 'dtl.sound';

function load(): boolean {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as { on?: unknown } | null;
    return typeof raw?.on === 'boolean' ? raw.on : true;
  } catch {
    return true;
  }
}

type SoundState = {
  on: boolean;
  setOn: (on: boolean) => void;
};

/** Listeners told when sound goes off, so whatever is playing stops. */
const offListeners = new Set<() => void>();

/** Calls `stop` whenever sound is turned off. Returns the unsubscribe. */
export function onSoundOff(stop: () => void): () => void {
  offListeners.add(stop);
  return () => offListeners.delete(stop);
}

export const useSound = create<SoundState>((set) => ({
  on: load(),
  setOn: (on) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ on }));
    } catch {
      // A preference only.
    }
    set({ on });
    if (!on) for (const stop of offListeners) stop();
  },
}));

/** True when the app may play sound. */
export const soundOn = (): boolean => useSound.getState().on;

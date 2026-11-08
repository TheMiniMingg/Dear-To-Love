import { useEffect } from 'react';
import { create } from 'zustand';
import { commands } from '../api/commands';
import { useLibraryPrefs } from './library';
import { useLook } from './look';
import { soundOn } from './sound';

type Ready = { storyId: string; title: string; routeId: string };

type WatchState = {
  /** Stories writing a reply nobody is reading, by id, with their titles. */
  writing: Record<string, string>;
  /** A reply that finished while you were elsewhere, until you open or dismiss it. */
  ready: Ready | null;
  watch: (storyId: string, title: string) => void;
  dismiss: () => void;
};

/**
 * Replies keep writing while you read another story or browse the library.
 * The stories being watched, and the last one that finished.
 */
export const useReplyWatch = create<WatchState>((set, get) => ({
  writing: {},
  ready: null,
  watch: (storyId, title) => {
    if (get().writing[storyId] === title) return;
    set({ writing: { ...get().writing, [storyId]: title } });
  },
  dismiss: () => set({ ready: null }),
}));

const POLL_MS = 2000;

/**
 * Two soft notes, made on the spot (no sound file). Does nothing when sound
 * is off or where the computer can't play sound.
 */
export function playChime() {
  if (!soundOn()) return;
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const start = ctx.currentTime + 0.02;
    for (const [freq, at] of [
      [880, 0],
      [1318.5, 0.14],
    ] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start + at);
      gain.gain.exponentialRampToValueAtTime(0.12, start + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + at + 0.9);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start + at);
      osc.stop(start + at + 1);
    }
    window.setTimeout(() => void ctx.close().catch(() => undefined), 1600);
  } catch {
    // No sound; the notice still shows.
  }
}

/**
 * While any watched story is writing, look every two seconds. When one
 * finishes and you are not reading it, show a notice (and chime, unless
 * that is off in Settings).
 */
export function useReplyNotices() {
  const watching = useReplyWatch((s) => Object.keys(s.writing).length > 0);
  useEffect(() => {
    if (!watching) return;
    let live = true;
    const tick = async () => {
      try {
        const stories = await commands.listStories();
        if (!live) return;
        const writing = { ...useReplyWatch.getState().writing };
        let ready: Ready | null = null;
        for (const [id, title] of Object.entries(writing)) {
          const s = stories.find((x) => x.id === id);
          if (s?.writing) continue;
          delete writing[id];
          const reading = useLook.getState().open?.storyId === id;
          if (s && !reading)
            ready = { storyId: id, title: s.title || title, routeId: s.lastRouteId };
        }
        useReplyWatch.setState(ready ? { writing, ready } : { writing });
        if (ready && useLibraryPrefs.getState().chime) playChime();
      } catch {
        // Try again at the next look.
      }
    };
    const id = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [watching]);
}

/**
 * Read aloud with the computer's own voices (the Web Speech API), so it
 * works offline and costs nothing. The voice and speed are a setting of
 * this computer; nothing about it is sent anywhere.
 */
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { msg } from '../i18n';

const STORAGE_KEY = 'dtl.readAloud';

export type ReadingSpeed = 'slow' | 'normal' | 'fast';

export const READING_SPEEDS: { id: ReadingSpeed; label: string; rate: number }[] = [
  { id: 'slow', label: msg('Slower'), rate: 0.85 },
  { id: 'normal', label: msg('Normal'), rate: 1 },
  { id: 'fast', label: msg('Faster'), rate: 1.2 },
];

type Prefs = {
  /** A voice's `voiceURI`, or null for the computer's default. */
  voice: string | null;
  speed: ReadingSpeed;
};

const DEFAULTS: Prefs = { voice: null, speed: 'normal' };

function load(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Prefs> | null;
    return {
      voice: typeof raw?.voice === 'string' && raw.voice ? raw.voice : null,
      speed: READING_SPEEDS.some((s) => s.id === raw?.speed)
        ? (raw?.speed as ReadingSpeed)
        : DEFAULTS.speed,
    };
  } catch {
    return DEFAULTS;
  }
}

const SPEECH_LANGS: Record<string, string> = {
  english: 'en',
  'simplified chinese': 'zh-CN',
  chinese: 'zh-CN',
  'traditional chinese': 'zh-TW',
  japanese: 'ja-JP',
  korean: 'ko-KR',
  spanish: 'es',
  french: 'fr-FR',
  german: 'de-DE',
  portuguese: 'pt',
  italian: 'it-IT',
  russian: 'ru-RU',
  vietnamese: 'vi-VN',
  thai: 'th-TH',
  indonesian: 'id-ID',
};

/** The speech language for a story language ("Japanese" → "ja-JP"), when known. */
export function speechLang(storyLanguage: string | null | undefined): string | undefined {
  return SPEECH_LANGS[storyLanguage?.trim().toLowerCase() ?? ''];
}

/** The computer's speech, when this window has it. */
function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
    ? window.speechSynthesis
    : null;
}

/** True when this computer can read aloud at all. */
export function canReadAloud(): boolean {
  return synth() !== null && typeof SpeechSynthesisUtterance !== 'undefined';
}

/**
 * Splits text into pieces short enough to be spoken one after another
 * (some speech engines stop a long utterance part way through).
 */
export function speechParts(text: string, max = 220): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n+/)) {
    const words = para.replace(/\s+/g, ' ').trim();
    if (!words) continue;
    if (words.length <= max) {
      out.push(words);
      continue;
    }
    // Sentences, then whole words when a sentence is still too long.
    let piece = '';
    for (const sentence of words.match(/[^.!?。！？]+[.!?。！？]*["”’)]*\s*/g) ?? [words]) {
      if (piece && (piece + sentence).length > max) {
        out.push(piece.trim());
        piece = '';
      }
      if (sentence.length > max) {
        for (const w of sentence.split(' ')) {
          if (piece && (piece + w).length > max) {
            out.push(piece.trim());
            piece = '';
          }
          piece += `${w} `;
        }
      } else piece += sentence;
    }
    if (piece.trim()) out.push(piece.trim());
  }
  return out;
}

type ReadAloudState = Prefs & {
  /** What is being read now (an event id), or null. */
  reading: string | null;
  setVoice: (voice: string | null) => void;
  setSpeed: (speed: ReadingSpeed) => void;
  /** Read `text` aloud as `id`, stopping anything else first. */
  read: (id: string, text: string, lang?: string) => void;
  stop: () => void;
};

/** Counts reads, so a stopped one's last "end" does not clear a new one. */
let session = 0;

export const useReadAloud = create<ReadAloudState>((set, get) => {
  const keep = (next: Partial<Prefs>) => {
    const { voice, speed } = { ...get(), ...next };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ voice, speed }));
    } catch {
      // A preference only.
    }
    set({ voice, speed });
  };
  return {
    ...load(),
    reading: null,
    setVoice: (voice) => keep({ voice }),
    setSpeed: (speed) => keep({ speed }),
    stop: () => {
      session += 1;
      synth()?.cancel();
      set({ reading: null });
    },
    read: (id, text, lang) => {
      const speech = synth();
      if (!speech || !canReadAloud()) return;
      session += 1;
      const mine = session;
      speech.cancel();
      const parts = speechParts(text);
      if (parts.length === 0) return set({ reading: null });
      const { voice, speed } = get();
      const chosen = voice ? speech.getVoices().find((v) => v.voiceURI === voice) : undefined;
      const rate = READING_SPEEDS.find((s) => s.id === speed)?.rate ?? 1;
      parts.forEach((part, i) => {
        const u = new SpeechSynthesisUtterance(part);
        if (chosen) u.voice = chosen;
        else if (lang) u.lang = lang;
        u.rate = rate;
        if (i === parts.length - 1) {
          u.onend = () => {
            if (session === mine) set({ reading: null });
          };
        }
        u.onerror = () => {
          if (session === mine) set({ reading: null });
        };
        speech.speak(u);
      });
      set({ reading: id });
    },
  };
});

/** The computer's voices, which some systems only list after a moment. */
export function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => synth()?.getVoices() ?? []);
  useEffect(() => {
    const speech = synth();
    if (!speech) return;
    const update = () => setVoices(speech.getVoices());
    update();
    speech.addEventListener?.('voiceschanged', update);
    return () => speech.removeEventListener?.('voiceschanged', update);
  }, []);
  return voices;
}

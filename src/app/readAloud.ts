/**
 * Read aloud. Without a voice pack, with the computer's own voices (the
 * Web Speech API), so it works offline and costs nothing; the voice and
 * speed are a setting of this computer. A voice pack gives the narrator
 * and each character a voice of their own, from the computer or from a
 * voice connection (AI voices, which send the text being read to that
 * service, one paragraph or line at a time).
 */
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { CommandError, commands, errorMessage } from '../api/commands';
import { msg, t } from '../i18n';
import { onSoundOff, soundOn, useSound } from './sound';
import { speakerSegments } from './speakers';
import {
  activePack,
  useVoicePacks,
  usesAiVoices,
  voiceFor,
  voicedNames,
  type VoicePack,
} from './voicePacks';

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
  /** Read each new reply aloud as it lands, without a click. */
  autoRead: boolean;
};

const DEFAULTS: Prefs = { voice: null, speed: 'normal', autoRead: false };

function load(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Prefs> | null;
    return {
      voice: typeof raw?.voice === 'string' && raw.voice ? raw.voice : null,
      speed: READING_SPEEDS.some((s) => s.id === raw?.speed)
        ? (raw?.speed as ReadingSpeed)
        : DEFAULTS.speed,
      autoRead: raw?.autoRead === true,
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

/** Why the last reading stopped short, shown under that reply. */
export type ReadProblem = {
  id: string;
  text: string;
  /** The budget can't price voices: the player may read aloud anyway. */
  override: boolean;
};

type ReadAloudState = Prefs & {
  /** What is being read now (an event id), or null. */
  reading: string | null;
  /** Waiting for an AI voice to answer. */
  fetching: boolean;
  problem: ReadProblem | null;
  setVoice: (voice: string | null) => void;
  setSpeed: (speed: ReadingSpeed) => void;
  setAutoRead: (autoRead: boolean) => void;
  /**
   * Read `text` aloud as `id`, stopping anything else first. With a voice
   * pack chosen, each character's lines are read in their own voice.
   * `pack` reads with that pack instead (a sample in its editor);
   * `allowUnpriced` is the player's go-ahead for voices the budget can't price.
   */
  read: (
    id: string,
    text: string,
    lang?: string,
    opts?: { pack?: VoicePack | null; allowUnpriced?: boolean },
  ) => void;
  stop: () => void;
  /** Reads the reply that was stopped by the budget, this once. */
  readAnyway: () => void;
};

/** Counts reads, so a stopped one's last "end" does not clear a new one. */
let session = 0;
/** The AI voice playing now, and how to end its wait when stopped. */
let playing: { audio: HTMLAudioElement; done: () => void } | null = null;
/** The last reading, for "Read aloud anyway". */
let lastRead: { id: string; text: string; lang?: string; pack?: VoicePack | null } | null = null;

/** Recent AI readings, so reading a reply again costs nothing. */
const heard = new Map<string, string>();
const HEARD_MAX = 60;

function remember(key: string, url: string) {
  heard.set(key, url);
  while (heard.size > HEARD_MAX) {
    const [oldest, old] = heard.entries().next().value as [string, string];
    heard.delete(oldest);
    URL.revokeObjectURL(old);
  }
}

function stopPlaying() {
  if (!playing) return;
  playing.audio.pause();
  playing.done();
  playing = null;
}

/** The computer voice for a pack's choice: by id, else by name. */
function computerVoice(
  speech: SpeechSynthesis,
  voice: string | null,
  label?: string,
): SpeechSynthesisVoice | undefined {
  if (!voice && !label) return undefined;
  const all = speech.getVoices();
  return (
    all.find((v) => voice && v.voiceURI === voice) ?? all.find((v) => label && v.name === label)
  );
}

/** Pieces of at most `max` characters, whole paragraphs where they fit. */
function aiPieces(text: string, max = 900): string[] {
  const out: string[] = [];
  let piece = '';
  for (const part of speechParts(text, max)) {
    if (piece && piece.length + part.length + 1 > max) {
      out.push(piece);
      piece = '';
    }
    piece = piece ? `${piece}\n${part}` : part;
  }
  if (piece) out.push(piece);
  return out;
}

export const useReadAloud = create<ReadAloudState>((set, get) => {
  const keep = (next: Partial<Prefs>) => {
    const { voice, speed, autoRead } = { ...get(), ...next };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ voice, speed, autoRead }));
    } catch {
      // A preference only.
    }
    set({ voice, speed, autoRead });
  };

  const finish = (mine: number) => {
    if (session === mine) set({ reading: null, fetching: false });
  };

  const readComputer = (
    mine: number,
    id: string,
    text: string,
    lang?: string,
    pack?: VoicePack,
  ) => {
    const speech = synth();
    if (!speech || !canReadAloud()) return;
    const rate = READING_SPEEDS.find((s) => s.id === (pack ? pack.speed : get().speed))?.rate ?? 1;
    const lines = pack
      ? speakerSegments(text, voicedNames(pack)).flatMap((seg) => {
          const v = voiceFor(pack, seg.who);
          const chosen = computerVoice(speech, v.voice, v.label);
          return speechParts(seg.text).map((part) => ({ part, chosen }));
        })
      : speechParts(text).map((part) => ({
          part,
          chosen: computerVoice(speech, get().voice),
        }));
    if (lines.length === 0) return set({ reading: null });
    lines.forEach(({ part, chosen }, i) => {
      const u = new SpeechSynthesisUtterance(part);
      if (chosen) u.voice = chosen;
      else if (lang) u.lang = lang;
      u.rate = rate;
      if (i === lines.length - 1) u.onend = () => finish(mine);
      u.onerror = () => finish(mine);
      speech.speak(u);
    });
    set({ reading: id });
  };

  const readAi = async (
    mine: number,
    id: string,
    text: string,
    pack: VoicePack,
    allowUnpriced: boolean,
  ) => {
    const connectionId = pack.connectionId;
    if (!connectionId) {
      set({
        problem: {
          id,
          text: t('Choose a voice connection for the voice pack {name} in Settings, under Sound.', {
            name: pack.name,
          }),
          override: false,
        },
      });
      return;
    }
    const pieces = speakerSegments(text, voicedNames(pack)).flatMap((seg) => {
      const voice = voiceFor(pack, seg.who).voice;
      return aiPieces(seg.text).map((part) => ({ voice, text: part }));
    });
    if (pieces.length === 0) return;
    const rate = READING_SPEEDS.find((s) => s.id === pack.speed)?.rate ?? 1;
    type Got = { url: string } | { error: unknown };
    const fetchPiece = (p: { voice: string; text: string }): Promise<Got> => {
      const key = `${connectionId}\u0000${p.voice}\u0000${p.text}`;
      const known = heard.get(key);
      if (known) return Promise.resolve({ url: known });
      return commands
        .speakText({ connectionId, voice: p.voice, text: p.text, allowUnpriced })
        .then((bytes) => {
          const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
          remember(key, url);
          return { url };
        })
        .catch((error: unknown) => ({ error }));
    };
    set({ reading: id, fetching: true });
    let next: Promise<Got> | null = fetchPiece(pieces[0]!);
    for (let i = 0; next; i++) {
      const got: Got = await next;
      if (session !== mine) return;
      if ('error' in got) {
        const e = got.error;
        const override = e instanceof CommandError && e.code === 'BUDGET_OVERRIDE_REQUIRED';
        set({
          reading: null,
          fetching: false,
          problem: {
            id,
            text: override
              ? t(
                  'Your budget pauses requests it can’t price, and the app can’t price AI voices. Read this reply aloud anyway, or use the computer’s voices.',
                )
              : t('Could not read this aloud: {reason}', { reason: errorMessage(e) }),
            override,
          },
        });
        return;
      }
      // Ask for the next piece while this one plays.
      next = i + 1 < pieces.length ? fetchPiece(pieces[i + 1]!) : null;
      set({ fetching: false });
      await new Promise<void>((resolve) => {
        const audio = new Audio(got.url);
        audio.playbackRate = rate;
        const done = () => {
          if (playing?.audio === audio) playing = null;
          resolve();
        };
        playing = { audio, done };
        audio.onended = done;
        audio.onerror = done;
        audio.play().catch(done);
      });
      if (session !== mine) return;
      if (next) set({ fetching: true });
    }
    finish(mine);
  };

  return {
    ...load(),
    reading: null,
    fetching: false,
    problem: null,
    setVoice: (voice) => keep({ voice }),
    setSpeed: (speed) => keep({ speed }),
    setAutoRead: (autoRead) => keep({ autoRead }),
    stop: () => {
      session += 1;
      synth()?.cancel();
      stopPlaying();
      set({ reading: null, fetching: false });
    },
    read: (id, text, lang, opts) => {
      if (!soundOn()) return;
      session += 1;
      const mine = session;
      synth()?.cancel();
      stopPlaying();
      const pack = opts?.pack === undefined ? activePack() : opts.pack;
      lastRead = { id, text, lang, pack };
      set({ reading: null, fetching: false, problem: null });
      if (pack && usesAiVoices(pack)) {
        void readAi(mine, id, text, pack, opts?.allowUnpriced ?? false);
      } else {
        readComputer(mine, id, text, lang, pack ?? undefined);
      }
    },
    readAnyway: () => {
      const last = lastRead;
      if (!last) return;
      get().read(last.id, last.text, last.lang, { pack: last.pack, allowUnpriced: true });
    },
  };
});

// Turning sound off stops whatever is being read.
onSoundOff(() => useReadAloud.getState().stop());

/** As `useCanReadAloud`, for code that only needs to know once. */
export function readAloudAvailable(): boolean {
  const pack = activePack();
  return soundOn() && ((pack !== null && usesAiVoices(pack)) || canReadAloud());
}

/**
 * True when replies can be read aloud here: sound is on, and the chosen
 * voice pack's voices (or the computer's) are there.
 */
export function useCanReadAloud(): boolean {
  const on = useSound((s) => s.on);
  const ai = useVoicePacks((s) => {
    const pack = s.packs.find((p) => p.id === s.active);
    return pack ? usesAiVoices(pack) : false;
  });
  return on && (ai || canReadAloud());
}

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

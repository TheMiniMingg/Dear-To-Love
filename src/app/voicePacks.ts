/**
 * Voice packs: which voice reads the narration and which reads each
 * character, from the computer's own voices or a voice connection
 * (ElevenLabs, or a voice server such as Kokoro). Kept on this computer;
 * a pack can be saved to a `.dtlvoices` file to share, which names voices
 * only, never a key or a connection.
 */
import { create } from 'zustand';
import type {
  CharacterVoice,
  ProviderProfile,
  VoiceChoice,
  VoicePackFile,
  VoicePackSpeed,
  VoiceSource,
} from '../types';

const STORAGE_KEY = 'dtl.voicePacks';

export type VoicePack = VoicePackFile & {
  id: string;
  /** The voice connection on this computer, for a pack of AI voices. */
  connectionId: string | null;
};

const SOURCES: VoiceSource[] = ['computer', 'elevenlabs', 'openai_speech'];
const SPEEDS: VoicePackSpeed[] = ['slow', 'normal', 'fast'];

const str = (v: unknown, max = 200): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

function choice(v: unknown): VoiceChoice {
  const o = (v ?? {}) as Record<string, unknown>;
  return { voice: str(o.voice), label: str(o.label, 80) };
}

function parsePack(v: unknown): VoicePack | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const id = str(o.id);
  const name = str(o.name, 80);
  const source = SOURCES.find((s) => s === o.source);
  if (!id || !name || !source) return null;
  const characters: CharacterVoice[] = Array.isArray(o.characters)
    ? o.characters
        .map((c) => ({ name: str((c as { name?: unknown })?.name, 80), ...choice(c) }))
        .filter((c) => c.name)
    : [];
  return {
    id,
    name,
    source,
    connectionId: str(o.connectionId) || null,
    narrator: choice(o.narrator),
    speed: SPEEDS.find((s) => s === o.speed) ?? 'normal',
    characters,
  };
}

type Saved = { packs: VoicePack[]; active: string | null };

function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as {
      packs?: unknown;
      active?: unknown;
    } | null;
    const packs = Array.isArray(raw?.packs)
      ? raw.packs.map(parsePack).filter((p): p is VoicePack => p !== null)
      : [];
    const active = typeof raw?.active === 'string' ? raw.active : null;
    return { packs, active: packs.some((p) => p.id === active) ? active : null };
  } catch {
    return { packs: [], active: null };
  }
}

type VoicePacksState = Saved & {
  /** Adds the pack, or replaces the one with its id. */
  savePack: (pack: VoicePack) => void;
  deletePack: (id: string) => void;
  /** The pack replies are read with; null for one computer voice. */
  setActive: (id: string | null) => void;
};

export const useVoicePacks = create<VoicePacksState>((set, get) => {
  const keep = (next: Partial<Saved>) => {
    const { packs, active } = { ...get(), ...next };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ packs, active }));
    } catch {
      // A preference only.
    }
    set({ packs, active });
  };
  return {
    ...load(),
    savePack: (pack) => {
      const { packs } = get();
      const at = packs.findIndex((p) => p.id === pack.id);
      keep({ packs: at < 0 ? [...packs, pack] : packs.map((p, i) => (i === at ? pack : p)) });
    },
    deletePack: (id) => {
      const { packs, active } = get();
      keep({ packs: packs.filter((p) => p.id !== id), active: active === id ? null : active });
    },
    setActive: (active) => keep({ active }),
  };
});

/** The pack replies are read with now, or null. */
export function activePack(): VoicePack | null {
  const { packs, active } = useVoicePacks.getState();
  return packs.find((p) => p.id === active) ?? null;
}

/** True for a pack whose voices come from a voice connection. */
export const usesAiVoices = (pack: { source: VoiceSource }): boolean => pack.source !== 'computer';

const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `vp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function newPack(name: string, source: VoiceSource, connectionId: string | null): VoicePack {
  return {
    id: newId(),
    name,
    source,
    connectionId,
    narrator: { voice: '', label: '' },
    speed: 'normal',
    characters: [],
  };
}

export function copyPack(pack: VoicePack, name: string): VoicePack {
  return { ...pack, id: newId(), name, characters: pack.characters.map((c) => ({ ...c })) };
}

/** The voice that reads `who`'s lines: theirs, or the narrator's. */
export function voiceFor(pack: VoicePack, who: string | null): VoiceChoice {
  if (who) {
    const c = pack.characters.find((x) => x.name.toLowerCase() === who.toLowerCase());
    if (c?.voice) return c;
  }
  return pack.narrator;
}

/** Characters with a voice of their own. */
export const voicedNames = (pack: VoicePack): string[] =>
  pack.characters.filter((c) => c.voice).map((c) => c.name);

/** What a pack file holds: no id and no connection. */
export function toFile(pack: VoicePack): VoicePackFile {
  return {
    name: pack.name,
    source: pack.source,
    narrator: pack.narrator,
    speed: pack.speed,
    characters: pack.characters,
  };
}

/**
 * A pack from a file, set up for this computer: AI voices use this
 * computer's first connection of the same kind, when there is one.
 */
export function fromFile(file: VoicePackFile, connections: ProviderProfile[]): VoicePack {
  const match = usesAiVoices(file)
    ? (connections.find((c) => c.adapter === file.source)?.id ?? null)
    : null;
  return { ...file, id: newId(), connectionId: match };
}

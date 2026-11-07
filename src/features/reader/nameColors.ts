import { createContext, type CSSProperties } from 'react';
import type { Character, RouteView } from '../../types';
import { samePerson } from './messages';

/**
 * Colours names are picked from. Each theme blends them with its own text
 * colour, so they stay readable on light and dark pages.
 */
export const NAME_COLORS = [
  '#d81b60', // rose
  '#8e24aa', // violet
  '#3f51b5', // indigo
  '#0288d1', // sky
  '#00897b', // teal
  '#43a047', // green
  '#c0a000', // amber
  '#ef6c00', // orange
  '#8d6e63', // cocoa
  '#5e35b1', // plum
] as const;

/** A number from a name or id that stays the same from run to run. */
function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s.trim().toLowerCase()) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** The first word of a name, for speakers named only by first name. */
const firstWord = (name: string) => name.trim().split(/\s+/)[0] ?? '';

/**
 * Colours for a cast: each character's own, or one from the name list,
 * chosen from their id so it never changes, and moved along the list when
 * someone else already has it. The player character keeps the theme's
 * accent unless given a colour of their own.
 */
export function castColors(characters: Character[], playerId: string): Map<string, string | null> {
  const out = new Map<string, string | null>();
  const taken = new Set<number>();
  for (const c of characters) {
    if (c.color) {
      out.set(c.id, c.color);
      const own = NAME_COLORS.findIndex((x) => x === c.color?.toLowerCase());
      if (own >= 0) taken.add(own);
    }
  }
  const rest = characters
    .filter((c) => !c.color && c.id !== playerId)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const c of rest) {
    let i = hash(c.id) % NAME_COLORS.length;
    for (let tries = 0; taken.has(i) && tries < NAME_COLORS.length; tries++) {
      i = (i + 1) % NAME_COLORS.length;
    }
    taken.add(i);
    out.set(c.id, NAME_COLORS[i] ?? null);
  }
  for (const c of characters) if (!out.has(c.id)) out.set(c.id, null);
  return out;
}

/** The colour of a name nobody in the cast has. */
export function strangerColor(name: string): string {
  return NAME_COLORS[hash(firstWord(name)) % NAME_COLORS.length] ?? NAME_COLORS[0];
}

/**
 * Finds the colour of a speaker's name. null keeps the theme's accent (the
 * player, or anything outside a story).
 */
export const NameColorsContext = createContext<(name: string) => string | null>(() => null);

/** Name colours of the story's characters on this route, looked up by name. */
export function nameColorFinder(view: RouteView): (name: string) => string | null {
  const state = view.state.state;
  const characters = Object.values(state.characters ?? {});
  const colors = castColors(characters, state.playerCharacterId);
  return (name) => {
    if (!name.trim()) return null;
    const c =
      characters.find((x) => samePerson(name, x.name)) ??
      characters.find((x) => samePerson(firstWord(name), firstWord(x.name)));
    return c ? (colors.get(c.id) ?? null) : strangerColor(name);
  };
}

/** Style that hands a name colour to the stylesheet. */
export function nameStyle(color: string | null): CSSProperties | undefined {
  return color ? ({ '--name': color } as CSSProperties) : undefined;
}

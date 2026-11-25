/**
 * RPG items beyond a name and a count: rarity (Common to Mythical), items
 * that change the dice, the odds of each rarity turning up, and starter
 * kits. Mirrors `domain/loot.rs`.
 */
import type { Item, Rarity, Tracking } from '../../types';
import { msg, t } from '../../i18n';

export const RARITIES: { value: Rarity; label: string }[] = [
  { value: 'common', label: msg('Common') },
  { value: 'uncommon', label: msg('Uncommon') },
  { value: 'rare', label: msg('Rare') },
  { value: 'epic', label: msg('Epic') },
  { value: 'legendary', label: msg('Legendary') },
  { value: 'mythical', label: msg('Mythical') },
];

const ORDER: Rarity[] = RARITIES.map((r) => r.value);

export const rarityLabel = (r: Rarity) => t(RARITIES.find((x) => x.value === r)!.label);

/** The rarer of two. */
const rarer = (a: Rarity, b: Rarity) => (ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b);

export type DiceEffect =
  | { kind: 'bonus'; n: number }
  | { kind: 'odd' }
  | { kind: 'even' }
  | { kind: 'best' }
  | { kind: 'faces'; low: number; high: number };

export const MAX_ITEM_BONUS = 10;

/** `+2`, `odd`, `even`, `best` or `1-2`, as the app stores them. */
export function parseEffect(text: string | undefined): DiceEffect | null {
  const s = (text ?? '').trim().toLowerCase().replace(/[–—]/g, '-');
  if (s === 'odd' || s === 'even' || s === 'best') return { kind: s };
  const bonus = /^\+(\d+)$/.exec(s);
  if (bonus) {
    const n = Number(bonus[1]);
    return n >= 1 && n <= MAX_ITEM_BONUS ? { kind: 'bonus', n } : null;
  }
  const faces = /^(\d+)\s*(?:-|to)\s*(\d+)$/.exec(s);
  if (faces) {
    const low = Number(faces[1]);
    const high = Number(faces[2]);
    return low >= 1 && high >= low && high <= 1000 ? { kind: 'faces', low, high } : null;
  }
  return null;
}

export function effectText(e: DiceEffect): string {
  switch (e.kind) {
    case 'bonus':
      return `+${e.n}`;
    case 'faces':
      return `${e.low}-${e.high}`;
    default:
      return e.kind;
  }
}

/** What it does to a roll, in words: "Only 1 to 2 on the dice". */
export function describeEffect(e: DiceEffect): string {
  switch (e.kind) {
    case 'bonus':
      return t('+{n} to a roll', { n: e.n });
    case 'odd':
      return t('Odd numbers only on a roll');
    case 'even':
      return t('Even numbers only on a roll');
    case 'best':
      return t('Roll twice, keep the higher');
    case 'faces':
      return e.low === e.high
        ? t('Always rolls {n}', { n: e.low })
        : t('Only {low} to {high} on a roll', { low: e.low, high: e.high });
  }
}

/** The least rarity an effect needs (stronger effects are rarer). */
export function leastRarity(e: DiceEffect): Rarity {
  switch (e.kind) {
    case 'bonus':
      return e.n <= 1
        ? 'common'
        : e.n === 2
          ? 'uncommon'
          : e.n === 3
            ? 'rare'
            : e.n <= 5
              ? 'epic'
              : e.n <= 7
                ? 'legendary'
                : 'mythical';
    case 'best':
      return 'uncommon';
    case 'odd':
    case 'even':
      return 'rare';
    case 'faces': {
      const kept = Math.min(e.high, 20) - Math.max(e.low, 1) + 1;
      return kept >= 15
        ? 'uncommon'
        : kept >= 10
          ? 'rare'
          : kept >= 5
            ? 'epic'
            : kept >= 2
              ? 'legendary'
              : 'mythical';
    }
  }
}

/** The rarity an item shows: its own, raised to what its dice effect needs. */
export function shownRarity(item: Item): Rarity | undefined {
  const e = parseEffect(item.dice);
  const least = e ? leastRarity(e) : undefined;
  if (item.rarity && least) return rarer(item.rarity, least);
  return item.rarity ?? least;
}

export const diceEffect = (item: Item) => parseEffect(item.dice);

/** Whether an item's effect can change a roll of `spec` (`1d20`, `40-100`). */
export function effectFits(e: DiceEffect, spec: string): boolean {
  if (e.kind === 'bonus' || e.kind === 'best') return true;
  const s = spec.trim().toLowerCase().replace(/[–—]/g, '-');
  const die = /d\s*(\d+)/.exec(s);
  let lo: number;
  let hi: number;
  if (die) {
    lo = 1;
    hi = Number(die[1]);
  } else {
    const range = /^(-?\d+)\s*(?:-|to)\s*(-?\d+)$/.exec(s);
    if (!range) return true;
    lo = Number(range[1]);
    hi = Number(range[2]);
  }
  if (e.kind === 'faces') return Math.max(lo, e.low) <= Math.min(hi, e.high);
  return hi > lo || (e.kind === 'odd' ? Math.abs(lo % 2) === 1 : lo % 2 === 0);
}

/** Usual odds of each rarity, Common to Mythical. */
export const ODDS_PRESETS: { name: string; odds: number[] }[] = [
  { name: msg('Stingy'), odds: [65, 22, 9, 3, 1, 0] },
  { name: msg('Balanced'), odds: [50, 25, 13, 7, 4, 1] },
  { name: msg('Generous'), odds: [30, 28, 20, 12, 7, 3] },
];
export const DEFAULT_ODDS = ODDS_PRESETS[1]!.odds;

export const oddsOf = (tr: Tracking): number[] => tr.lootOdds ?? DEFAULT_ODDS;

/** Each rarity's chance in whole percent. */
export function percents(odds: number[]): number[] {
  const total = odds.reduce((a, b) => a + b, 0) || 1;
  return odds.map((w) => Math.round((w * 100) / total));
}

type KitItem = { name: string; qty?: number; rarity?: Rarity; dice?: string; keep?: boolean };

/** Typical RPG starting gear, a click each, for faster play. */
export const STARTER_KITS: { name: string; items: KitItem[] }[] = [
  {
    name: msg('Warrior'),
    items: [
      { name: msg('Iron sword') },
      { name: msg('Wooden shield') },
      { name: msg('Leather armor') },
      { name: msg('Healing potion'), qty: 2 },
      { name: msg('Rations'), qty: 3 },
    ],
  },
  {
    name: msg('Rogue'),
    items: [
      { name: msg('Twin daggers') },
      { name: msg('Lockpicks'), keep: true },
      { name: msg('Dark cloak') },
      { name: msg('Smoke bomb'), qty: 2 },
      { name: msg('Lucky coin'), rarity: 'common', dice: '+1', keep: true },
    ],
  },
  {
    name: msg('Mage'),
    items: [
      { name: msg('Oak staff') },
      { name: msg('Spellbook') },
      { name: msg('Mana potion'), qty: 2 },
      { name: msg('Healing potion') },
      { name: msg('Rune of fortune'), rarity: 'uncommon', dice: 'best' },
    ],
  },
  {
    name: msg('Ranger'),
    items: [
      { name: msg('Longbow') },
      { name: msg('Arrows'), qty: 20 },
      { name: msg('Hunting knife') },
      { name: msg('Rope') },
      { name: msg('Rations'), qty: 3 },
    ],
  },
  {
    name: msg('Healer'),
    items: [
      { name: msg('Mace') },
      { name: msg('Holy symbol'), keep: true },
      { name: msg('Bandages'), qty: 5 },
      { name: msg('Healing potion'), qty: 3 },
    ],
  },
  {
    name: msg("Adventurer's pack"),
    items: [
      { name: msg('Backpack') },
      { name: msg('Bedroll') },
      { name: msg('Torch'), qty: 3 },
      { name: msg('Waterskin') },
      { name: msg('Flint and steel'), keep: true },
      { name: msg('Rations'), qty: 5 },
    ],
  },
];

/** The kit's items added to `items`: one more of what is already there. */
export function addKit(items: Item[], kit: KitItem[]): Item[] {
  const out = items.filter((i) => i.name.trim()).map((i) => ({ ...i }));
  for (const k of kit) {
    const name = t(k.name);
    const have = out.find((i) => i.name.trim().toLowerCase() === name.toLowerCase());
    if (have) {
      have.qty = Math.min(9999, have.qty + (k.qty ?? 1));
      continue;
    }
    if (out.length >= 200) break;
    const item: Item = { name, qty: k.qty ?? 1 };
    if (k.rarity) item.rarity = k.rarity;
    if (k.dice) item.dice = k.dice;
    if (k.keep) item.keep = true;
    out.push(item);
  }
  return out;
}

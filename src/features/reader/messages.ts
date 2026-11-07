/**
 * Message tags the storyteller (and the composer) write into story text:
 * texts, calls, inner thoughts, letters, posts, dice rolls, scene
 * headings, and changes to tracked bars and items. The reader
 * shows them as cards; anything else is prose. Mirrors `plain_message_tags`
 * in Rust.
 */
import type { RollRequest } from '../../types';
import { t } from '../../i18n';
import { plainStoryText } from '../../i18n/names';

export type MessageTag =
  'text' | 'call' | 'thought' | 'letter' | 'post' | 'roll' | 'scene' | 'meter' | 'item';

export type Block =
  | { kind: 'prose'; text: string }
  | {
      kind: MessageTag;
      attrs: Record<string, string>;
      body: string;
      /** Still being written (no closing tag yet). */
      open: boolean;
    };

const TAGS: MessageTag[] = [
  'text',
  'call',
  'thought',
  'letter',
  'post',
  'roll',
  'scene',
  'meter',
  'item',
];

/** Tags only the app (a roll) or the storyteller (bars and items) may write. */
export const APP_TAGS: MessageTag[] = ['roll', 'meter', 'item'];

function parseAttrs(head: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of head.matchAll(/([A-Za-z_-]+)\s*=\s*"([^"]*)"/g)) {
    out[m[1]!.toLowerCase()] = m[2]!.trim();
  }
  return out;
}

function pushProse(out: Block[], text: string) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last?.kind === 'prose') last.text += text;
  else out.push({ kind: 'prose', text });
}

/**
 * Split story text into prose and message blocks. With `streaming`, a tag
 * that is still being typed at the end is hidden instead of shown raw.
 */
export function parseBlocks(text: string, streaming = false): Block[] {
  const out: Block[] = [];
  let rest = text;
  for (;;) {
    const i = rest.indexOf('<');
    if (i < 0) break;
    pushProse(out, rest.slice(0, i));
    const after = rest.slice(i + 1);
    const tag = TAGS.find((t) => after.startsWith(t) && /^[\s>/]/.test(after.slice(t.length)));
    const end = after.indexOf('>');
    if (!tag || end < 0) {
      // While streaming, "<", "<te" or '<text from="Eri' is a tag on its way.
      const word = /^[a-z]*/.exec(after)![0];
      const typing =
        word === after ||
        ((TAGS as string[]).includes(word) && /^\s/.test(after.slice(word.length)));
      if (streaming && end < 0 && typing && TAGS.some((t) => t.startsWith(word))) return out;
      pushProse(out, '<');
      rest = after;
      continue;
    }
    const head = after.slice(tag.length, end);
    const attrs = parseAttrs(head);
    const tail = after.slice(end + 1);
    if (head.trimEnd().endsWith('/')) {
      out.push({ kind: tag, attrs, body: '', open: false });
      rest = tail;
      continue;
    }
    const close = `</${tag}>`;
    const j = tail.indexOf(close);
    if (j < 0) {
      // Hide a closing tag that is still being typed.
      let body = tail;
      if (streaming) body = body.replace(/<\/?[a-z]*$/, '');
      out.push({ kind: tag, attrs, body: body.trim(), open: true });
      return out;
    }
    out.push({ kind: tag, attrs, body: tail.slice(0, j).trim(), open: false });
    rest = tail.slice(j + close.length);
  }
  pushProse(out, rest);
  return out;
}

/** The label `plain_message_tags` in Rust gives a tag, in English. */
function plainLabel(kind: MessageTag, a: Record<string, string>): string {
  let label: string;
  switch (kind) {
    case 'text':
      label = a.from ? `Text from ${a.from}` : a.to ? `Text to ${a.to}` : 'Text';
      break;
    case 'call':
      label = a.with
        ? a.status
          ? `Call with ${a.with}: ${a.status}`
          : `Call with ${a.with}`
        : a.status
          ? `Call: ${a.status}`
          : 'Call';
      break;
    case 'thought':
      label = `${a.who || 'Someone'} thinks`;
      break;
    case 'letter':
      label = a.from ? `Letter from ${a.from}` : 'Letter';
      break;
    case 'roll': {
      const dice = a.dice || 'dice';
      label = `${a.for ? `Roll for ${a.for}: ` : 'Roll: '}${a.result ? `${a.result} on ${dice}` : dice}`;
      break;
    }
    case 'post':
      label = a.from ? `Post by ${a.from}` : 'Post';
      break;
    case 'scene':
      label = a.place || 'Scene';
      break;
    case 'meter': {
      label = a.name || 'Meter';
      if (a.who) label = `${a.who}: ${label}`;
      if (a.change) label = `${label} ${a.change}`;
      else if (a.set) label = `${label} now ${a.set}`;
      break;
    }
    case 'item': {
      const named = (name: string) => (a.qty && a.qty !== '1' ? `${a.qty} × ${name}` : name);
      label = a.gain ? `Got ${named(a.gain)}` : a.lose ? `Lost ${named(a.lose)}` : 'Item';
      break;
    }
  }
  return a.time ? `${label}, ${a.time}` : label;
}

/**
 * Story text as plain words, each message tag a short label in the chosen
 * language ("[Text from Mara] Are you up?"), as the app's core writes it.
 */
export function plainText(text: string): string {
  const words = parseBlocks(text)
    .map((b) => {
      if (b.kind === 'prose') return b.text;
      const label = plainLabel(b.kind, b.attrs);
      if (b.kind === 'thought') return `(${label}: ${b.body})`;
      return b.body ? `[${label}] ${b.body}` : `[${label}]`;
    })
    .join('');
  return plainStoryText(words);
}

/** True when `text` contains at least one message tag. */
export function hasMessageTags(text: string): boolean {
  return parseBlocks(text).some((b) => b.kind !== 'prose');
}

/** Same name, ignoring case and spacing, or a first name of the other. */
export function samePerson(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (!x || !y) return false;
  return x === y || x.split(/\s+/)[0] === y || y.split(/\s+/)[0] === x;
}

/** Characters a quote mark or angle bracket could break an attribute with. */
function attr(value: string): string {
  return value.replace(/["<>]/g, "'").trim();
}

export type ComposeMode = 'act' | 'text' | 'call' | 'think';

/**
 * The action text for a composer mode: a text message, a call or a
 * thought becomes the tag the storyteller is told about.
 */
export function wrapAction(
  mode: ComposeMode,
  text: string,
  { to, player }: { to: string; player: string },
): string {
  const body = text.trim();
  switch (mode) {
    case 'act':
      return text;
    case 'text':
      return `<text to="${attr(to)}">${body}</text>`;
    case 'call':
      return `<call with="${attr(to)}" status="ringing"/>${body ? `\n\n${body}` : ''}`;
    case 'think':
      return `<thought who="${attr(player)}">${body}</thought>`;
  }
}

/**
 * The roll a storyteller asks for with `<roll for dice target stat/>`, or
 * null when the tag has no dice or already has a result.
 */
export function rollRequestOf(attrs: Record<string, string>): RollRequest | null {
  const dice = attrs.dice?.trim();
  if (!dice || attrs.result) return null;
  const req: RollRequest = { label: attrs.for?.trim() || t('A roll'), dice, asked: true };
  const target = Number.parseInt(attrs.target ?? '', 10);
  if (Number.isFinite(target)) req.target = target;
  if (attrs.stat?.trim()) req.stat = attrs.stat.trim();
  return req;
}

/** The last roll the storyteller asked for in `text` (the one to answer). */
export function lastRollRequest(text: string): RollRequest | null {
  let found: RollRequest | null = null;
  for (const b of parseBlocks(text)) {
    if (b.kind === 'roll') found = rollRequestOf(b.attrs) ?? found;
  }
  return found;
}

const MAX_DICE = 20;
const MAX_SIDES = 1000;
const MAX_NUMBER = 1_000_000;

function diceNumber(s: string): number | null {
  const t = s.trim();
  if (!/^[+-]?\d{1,7}$/.test(t)) return null;
  const n = Number(t);
  return Math.abs(n) <= MAX_NUMBER ? n : null;
}

/**
 * Dice the app can roll: `1d20`, `2d6+1`, `d100` or a range such as
 * `40-100` or `-5 to 5`. The same rules as `DiceSpec::parse` in Rust.
 */
export function isDice(spec: string): boolean {
  const s = spec.trim().toLowerCase().replace(/[–—]/g, '-');
  const d = s.indexOf('d');
  if (d >= 0) {
    const c = s.slice(0, d).trim();
    const count = c === '' ? 1 : /^\d{1,3}$/.test(c) ? Number(c) : NaN;
    const rest = s.slice(d + 1);
    const sign = rest.search(/[+-]/);
    if (sign >= 0 && diceNumber(rest.slice(sign + 1)) === null) return false;
    const sides = (sign >= 0 ? rest.slice(0, sign) : rest).trim();
    if (!/^\d{1,5}$/.test(sides)) return false;
    return count >= 1 && count <= MAX_DICE && Number(sides) >= 2 && Number(sides) <= MAX_SIDES;
  }
  let at = s.indexOf(' to ');
  let len = 4;
  if (at < 0) {
    // The dash between the two numbers, not a minus sign before the first.
    const first = s.search(/\d/);
    at = first < 0 ? -1 : s.indexOf('-', first);
    len = 1;
  }
  if (at < 0) return false;
  const low = diceNumber(s.slice(0, at));
  const high = diceNumber(s.slice(at + len));
  return low !== null && high !== null && low < high;
}

/**
 * A roll from the composer: one short line is what the roll is for; longer
 * text keeps its first line (shortened) as the label and is sent as words.
 */
export function rollFromComposer(
  value: string,
  { dice, stat, target }: { dice: string; stat: string; target: string },
): { text: string; roll: RollRequest } {
  const words = value.trim();
  const oneLine = !words.includes('\n') && [...words].length <= 120;
  const first = words.split('\n')[0]!.trim();
  const label = !words
    ? t('A roll')
    : oneLine
      ? words
      : [...first].length > 80
        ? `${[...first].slice(0, 79).join('')}…`
        : first;
  const roll: RollRequest = { label, dice: dice.trim() };
  if (stat.trim()) roll.stat = stat.trim();
  const need = Number.parseInt(target, 10);
  if (Number.isFinite(need)) roll.target = need;
  return { text: oneLine ? '' : words, roll };
}

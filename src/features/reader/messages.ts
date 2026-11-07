/**
 * Message tags the storyteller (and the composer) write into story text:
 * texts, calls, inner thoughts, letters, posts, dice rolls, scene
 * headings, changes to tracked bars and items, and memory notes. The
 * reader shows them as cards; anything else is prose. Mirrors
 * `plain_message_tags` in Rust.
 */
import type { NoteKind, RollRequest, StoryStateV1 } from '../../types';
import { t } from '../../i18n';
import { plainStoryText } from '../../i18n/names';

export type MessageTag =
  | 'text'
  | 'call'
  | 'thought'
  | 'letter'
  | 'post'
  | 'roll'
  | 'scene'
  | 'meter'
  | 'item'
  | 'remember'
  | 'forget'
  | 'thread'
  | 'character'
  | 'next';

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
  'remember',
  'forget',
  'thread',
  'character',
  'next',
];

/**
 * Tags written beside the story, not in it: memory notes, open threads, new
 * characters and ideas for the next move. The reader shows them under the
 * reply or by the composer.
 */
export const ASIDE_TAGS: MessageTag[] = ['remember', 'forget', 'thread', 'character', 'next'];
const isAside = (kind: Block['kind']) => (ASIDE_TAGS as string[]).includes(kind);

/**
 * Tags only the app (a roll) or the storyteller (bars, items, memory notes,
 * threads, new characters and next moves) may write.
 */
export const APP_TAGS: MessageTag[] = [
  'roll',
  'meter',
  'item',
  'remember',
  'forget',
  'thread',
  'character',
  'next',
];

/** `key="value"` pairs; a bare word (`<thread done>`) counts as `word="yes"`. */
function parseAttrs(head: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of head.matchAll(/([A-Za-z_-]+)\s*=\s*"([^"]*)"/g)) {
    out[m[1]!.toLowerCase()] = m[2]!.trim();
  }
  const bare = head.replace(/[A-Za-z_-]+\s*=\s*"[^"]*"/g, ' ');
  for (const m of bare.matchAll(/(?:^|[\s/])([A-Za-z_-]+)(?=[\s/]|$)/g)) {
    out[m[1]!.toLowerCase()] ??= 'yes';
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
    case 'remember':
    case 'forget':
    case 'thread':
    case 'character':
    case 'next':
      label = '';
      break;
  }
  return a.time ? `${label}, ${a.time}` : label;
}

/**
 * Story text as plain words, each message tag a short label in the chosen
 * language ("[Text from Mara] Are you up?"), as the app's core writes it.
 */
export function plainText(text: string): string {
  let words = '';
  let afterNote = false;
  for (const b of parseBlocks(text)) {
    if (isAside(b.kind)) {
      // Notes, threads, new characters and next moves are not part of the
      // story's text: drop each with the line break that set it apart.
      words = words.replace(/[ \t]+$/, '');
      afterNote = true;
      continue;
    }
    let part: string;
    if (b.kind === 'prose') {
      part = afterNote && b.text.startsWith('\n') ? b.text.slice(1) : b.text;
    } else {
      const label = plainLabel(b.kind, b.attrs);
      part =
        b.kind === 'thought'
          ? `(${label}: ${b.body})`
          : b.body
            ? `[${label}] ${b.body}`
            : `[${label}]`;
    }
    words += part;
    afterNote = false;
  }
  return plainStoryText(words);
}

/**
 * The words of a reply without its asides (memory notes, threads, new
 * characters, ideas), each dropped with the line break after it. Mirrors
 * `split_asides` in Rust, which keeps the old asides when a reply is edited.
 */
export function withoutAsides(text: string): string {
  let shown = '';
  let rest = text;
  for (;;) {
    const i = rest.indexOf('<');
    if (i < 0) break;
    const after = rest.slice(i + 1);
    const name = ASIDE_TAGS.find(
      (tag) => after.startsWith(tag) && /^[ /\n\t>]/.test(after.slice(tag.length)),
    );
    const end = after.indexOf('>');
    let len = -1;
    if (name && end >= 0) {
      if (after.slice(name.length, end).trimEnd().endsWith('/')) len = end + 1;
      else {
        const close = `</${name}>`;
        const j = after.indexOf(close, end + 1);
        if (j >= 0) len = j + close.length;
      }
    }
    if (len < 0) {
      shown += rest.slice(0, i + 1);
      rest = after;
      continue;
    }
    shown = (shown + rest.slice(0, i)).replace(/[ \t]+$/, '');
    const next = after.slice(len);
    rest = next.startsWith('\n') ? next.slice(1) : next;
  }
  return (shown + rest).trimEnd();
}

/** Message cards whose words can stand for a reply on their own. */
const SPOKEN: MessageTag[] = ['text', 'call', 'thought', 'letter', 'post'];

/**
 * The last line of a reply worth showing on its own, as plain words: its
 * last paragraph of prose, or its last text, call, thought, letter or post
 * as "Name: words". Empty when it has none.
 */
export function lastLine(text: string): string {
  const blocks = parseBlocks(text);
  const plain = (s: string) =>
    s
      .replace(/\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g, '$1$2')
      .replace(/\s+/g, ' ')
      .trim();
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i]!;
    if (b.kind === 'prose') {
      const last = b.text
        .split(/\n{2,}/)
        .map(plain)
        .filter(Boolean)
        .pop();
      if (last) return last;
    } else if (SPOKEN.includes(b.kind) && b.body.trim()) {
      const who = b.attrs.from || b.attrs.who || b.attrs.with || '';
      return who ? `${who}: ${plain(b.body)}` : plain(b.body);
    }
  }
  return '';
}

/** One memory note a reply writes (`<remember>`) or removes (`<forget>`). */
export type NoteChange = { forget: boolean; kind: NoteKind; name: string; text: string };

const NOTE_KINDS: Record<string, NoteKind> = {
  person: 'person',
  who: 'person',
  character: 'person',
  place: 'place',
  location: 'place',
  item: 'item',
  thing: 'item',
  object: 'item',
  event: 'event',
  fact: 'fact',
  about: 'fact',
};

/** One line, at most `max` characters, as `notes::clip` in Rust. */
const clip = (s: string, max: number) =>
  [...s.split(/\s+/).filter(Boolean).join(' ')].slice(0, max).join('');

/**
 * The memory notes a finished reply writes, as the app keeps them (the
 * same rules as `notes::scan` in Rust).
 */
export function noteChanges(text: string): NoteChange[] {
  const out: NoteChange[] = [];
  for (const b of parseBlocks(text)) {
    if ((b.kind !== 'remember' && b.kind !== 'forget') || b.open) continue;
    let kind: NoteKind | undefined;
    let name = '';
    if (b.attrs.kind) {
      kind = NOTE_KINDS[b.attrs.kind.toLowerCase()];
      name = b.attrs.name ?? '';
    } else {
      for (const [key, value] of Object.entries(b.attrs)) {
        if (NOTE_KINDS[key] && value.trim()) {
          kind = NOTE_KINDS[key];
          name = value;
          break;
        }
      }
    }
    name = clip(name, 80);
    const words = clip(b.body, 800);
    if (!kind || !name || (b.kind === 'remember' && !words)) continue;
    out.push({ forget: b.kind === 'forget', kind, name, text: words });
  }
  return out;
}

/** One open thread a reply opens or settles (`<thread>`, `<thread done>`). */
export type ThreadChange = { done: boolean; text: string };

const SETTLED = ['done', 'yes', 'true', 'resolved', 'settled', 'closed'];

/** The thread tags of a finished reply, as `threads::scan` in Rust reads them. */
export function threadChanges(text: string): ThreadChange[] {
  const out: ThreadChange[] = [];
  for (const b of parseBlocks(text)) {
    if (b.kind !== 'thread' || b.open) continue;
    const words = clip(b.body, 200);
    if (!words) continue;
    const settled = (v?: string) => !!v && SETTLED.includes(v.toLowerCase());
    out.push({ done: settled(b.attrs.done) || settled(b.attrs.status), text: words });
  }
  return out;
}

/** Someone new a reply brings in (`<character name role pronouns age>looks</character>`). */
export type NewCharacter = {
  name: string;
  role: string;
  pronouns: string;
  age: string;
  appearance: string;
};

/** The new characters a finished reply suggests, once each. */
export function newCharacters(text: string): NewCharacter[] {
  const out: NewCharacter[] = [];
  for (const b of parseBlocks(text)) {
    if (b.kind !== 'character' || b.open) continue;
    const name = clip(b.attrs.name ?? '', 80);
    if (!name || out.some((c) => samePerson(c.name, name))) continue;
    out.push({
      name,
      role: clip(b.attrs.role ?? '', 80),
      pronouns: clip(b.attrs.pronouns ?? '', 40),
      age: clip(b.attrs.age ?? '', 40),
      appearance: clip(b.body, 800),
    });
  }
  return out;
}

/** Ideas for the player's next move a finished reply ends with (`<next>`). */
export function nextMoves(text: string): string[] {
  const out: string[] = [];
  for (const b of parseBlocks(text)) {
    if (b.kind !== 'next' || b.open) continue;
    const idea = clip(b.body.replace(/^\*+|\*+$/g, ''), 120);
    if (idea && !out.some((o) => o.toLowerCase() === idea.toLowerCase())) out.push(idea);
  }
  return out.slice(0, 4);
}

/** Words that come before a name: "Lord Shen Yao" is not called "Lord". */
const TITLES = new Set(
  (
    'aunt auntie baron baroness brother capt captain count countess dame det detective doctor dr ' +
    'duchess duke emperor empress father general grandma grandpa king lady lieutenant lord lt ' +
    'madam madame master miss mistress mother mr mrs ms mx officer prince princess prof ' +
    'professor queen saint sergeant sgt sir sister st uncle'
  ).split(' '),
);

/**
 * What people call someone in passing: the first name ("Mara" for Mara
 * Quill), or the title and the next word ("Lord Shen" for Lord Shen Yao).
 */
export function shortName(name: string): string {
  const [first = '', next] = name.trim().split(/\s+/);
  return next && TITLES.has(first.replace(/\.$/, '').toLowerCase()) ? `${first} ${next}` : first;
}

/**
 * Ideas for the first move of a chapter, before the storyteller has
 * offered any: look around, talk to someone in the scene (or ask who is
 * there), or wait and listen.
 */
export function openingIdeas(state: StoryStateV1): string[] {
  const other = state.scene.participantIds
    .filter((id) => id !== state.playerCharacterId)
    .map((id) => shortName(state.characters[id]?.name ?? ''))
    .find(Boolean);
  return [
    t('Look around'),
    other ? t('Talk to {name}', { name: other }) : t('Ask who is there'),
    t('Wait and listen'),
  ];
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

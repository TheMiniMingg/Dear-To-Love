/**
 * The picture view (visual-novel style): which character's portrait the
 * stage above the story shows. It follows the replies: a character who
 * arrives (for the first time, or after a few replies away) takes the stage,
 * the current one keeps it while the story stays with them, and otherwise
 * the most mentioned one has it.
 */
import { create } from 'zustand';
import type { EventDto, RouteView } from '../../types';
import { parseBlocks } from './messages';
import { picture, portraitSlot } from './pictures';

/** Replies looked at, newest last; older ones no longer decide who is on stage. */
const LOOK_BACK = 30;

type Cast = { id: string; names: string[] };

/** Latin-like names match whole words; others (Chinese, Japanese…) anywhere. */
function findAll(text: string, name: string): number[] {
  const wordy = /^[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\s'.-]+$/u.test(name);
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = wordy
    ? new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'gu')
    : new RegExp(escaped, 'gu');
  return [...text.matchAll(re)].map((m) => m.index ?? 0);
}

/** The words of a reply, with the names in message tags (from, with, who). */
function replyWords(text: string): string {
  return parseBlocks(text)
    .map((b) =>
      b.kind === 'prose'
        ? b.text
        : `${[b.attrs.from, b.attrs.with, b.attrs.who, b.attrs.to].filter(Boolean).join(' ')} ${b.body}`,
    )
    .join(' ');
}

/** Who a reply mentions, in order of first mention, with how often. */
export function mentioned(
  text: string,
  cast: Cast[],
): { id: string; first: number; count: number }[] {
  const words = replyWords(text);
  const out: { id: string; first: number; count: number }[] = [];
  for (const c of cast) {
    const hits = c.names.flatMap((n) => findAll(words, n));
    if (hits.length) out.push({ id: c.id, first: Math.min(...hits), count: hits.length });
  }
  return out.sort((a, b) => a.first - b.first);
}

/** The characters who have a portrait, other than the player's, with the names they go by. */
export function stageCast(view: RouteView): Cast[] {
  const s = view.state.state;
  const all = Object.values(s.characters ?? {}).filter(
    (c) => c.id !== s.playerCharacterId && picture(view, portraitSlot(c.id)).assetId,
  );
  const firsts = all.map((c) => c.name.trim().split(/\s+/)[0] ?? '');
  return all.map((c, i) => {
    const full = c.name.trim();
    const first = firsts[i]!;
    // A first name only counts when it is long enough and no one else shares it.
    const own =
      first.length >= 3 && first !== full && firsts.filter((f) => f === first).length === 1;
    return { id: c.id, names: own ? [full, first] : [full] };
  });
}

/** Replies a character must be absent from to count as arriving again. */
const AWAY = 3;

/** Who the stage shows after these replies, or null when no one with a portrait is in them. */
export function stageFocus(replies: string[], cast: Cast[]): string | null {
  let focus: string | null = null;
  const recent: Set<string>[] = [];
  for (const text of replies.slice(-LOOK_BACK)) {
    const found = mentioned(text, cast);
    const seen = (id: string) => recent.some((r) => r.has(id));
    const fresh = found.find((f) => f.id !== focus && !seen(f.id));
    if (fresh) focus = fresh.id;
    else if (!found.some((f) => f.id === focus) && found.length) {
      focus = [...found].sort((a, b) => b.count - a.count || a.first - b.first)[0]!.id;
    }
    recent.push(new Set(found.map((f) => f.id)));
    if (recent.length > AWAY) recent.shift();
  }
  return focus;
}

/** The replies in a route's history (and the one being written), oldest first. */
export function replyTexts(events: EventDto[], draft?: string | null): string[] {
  const out: string[] = [];
  for (const e of events) if (e.kind === 'assistant') out.push(e.payload.text);
  if (draft) out.push(draft);
  return out;
}

const STORAGE_KEY = 'dtl.readerPictures';

function loadShown(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

/** Show the pictures above the story, or text only. Kept on this computer. */
export const usePictureView = create<{ shown: boolean; setShown: (shown: boolean) => void }>(
  (set) => ({
    shown: loadShown(),
    setShown: (shown) => {
      try {
        localStorage.setItem(STORAGE_KEY, shown ? 'on' : 'off');
      } catch {
        // A preference only.
      }
      set({ shown });
    },
  }),
);

/**
 * Who says what in a reply, so a voice pack can read each character's
 * lines in their own voice and everything else in the narrator's.
 *
 * Two kinds of line are recognised: a script line that opens with a name
 * and a colon ('Mina: "You came back."'), and speech in quotes inside the
 * narration ('"You came back," Mina says.'), which goes to the character
 * named next to it. Anything not clearly someone's is the narrator's.
 */

export type Segment = {
  /** A character's name as the voice pack spells it, or null for the narrator. */
  who: string | null;
  text: string;
};

/** A name and a colon at the start of a line (as RichText's SPEAKER). */
const SCRIPT =
  /^((?:\p{Lu}[\p{L}\p{M}'’.-]*)(?: \p{Lu}[\p{L}\p{M}'’.-]*){0,2}|[^\s\p{Ll}\p{Lu}:：]{1,12})[:：]\s*(?=["“「『*(（])/u;

/** Speech in double quotes or corner brackets. */
const QUOTE = /"[^"\n]+"|“[^”\n]+”|「[^」\n]+」|『[^』\n]+』/gu;

const HAS_WORDS = /[\p{L}\p{N}]/u;

/** Bold, italics and other marks the reader shows but a voice shouldn't say. */
function unmarked(text: string): string {
  return text
    .replace(/\*+/g, '')
    .replace(/(^|\s)_+(?=\S)|(?<=\S)_+(?=\s|$|[.,!?;:])/g, '$1')
    .replace(/[ \t]+/g, ' ');
}

/** True when a script uses letter case, so names can be found by word. */
const CASED = /\p{Lu}/u;

type Alias = { name: string; pattern: RegExp };

/** Each character's full name and first name, longest first. */
function aliases(names: string[]): Alias[] {
  const out: Alias[] = [];
  for (const name of names) {
    const forms = new Set([name.trim()]);
    const first = name.trim().split(/\s+/)[0] ?? '';
    if (first.length >= 2 && first !== name.trim()) forms.add(first);
    for (const form of forms) {
      if (!form) continue;
      const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Cased names are whole words; names in other scripts are found anywhere.
      const pattern = CASED.test(form)
        ? new RegExp(`(?<![\\p{L}\\p{M}])${escaped}(?![\\p{L}\\p{M}])`, 'gu')
        : new RegExp(escaped, 'gu');
      out.push({ name, pattern });
    }
  }
  return out.sort((a, b) => b.pattern.source.length - a.pattern.source.length);
}

/** Where each name appears in `text`: [index, name], in order. */
function mentions(text: string, list: Alias[]): [number, string][] {
  const found: [number, number, string][] = [];
  for (const a of list) {
    a.pattern.lastIndex = 0;
    for (const m of text.matchAll(a.pattern)) {
      const at = m.index;
      const end = at + m[0].length;
      // A longer name already found here wins ("Mina Park" over "Mina").
      if (found.some(([s, e]) => at < e && end > s)) continue;
      found.push([at, end, a.name]);
    }
  }
  return found.sort((x, y) => x[0] - y[0]).map(([at, , name]) => [at, name]);
}

/** The pack's spelling of a script line's speaker, when the pack has them. */
function castName(speaker: string, names: string[]): string | null {
  const s = speaker.trim().toLowerCase();
  return (
    names.find((n) => n.trim().toLowerCase() === s) ??
    names.find((n) => (n.trim().split(/\s+/)[0] ?? '').toLowerCase() === s) ??
    null
  );
}

function paragraphSegments(para: string, names: string[], list: Alias[]): Segment[] {
  const script = SCRIPT.exec(para);
  if (script) {
    const who = castName(script[1] ?? '', names);
    if (who) return [{ who, text: para.slice(script[0].length) }];
    return [{ who: null, text: para }];
  }
  const quotes = [...para.matchAll(QUOTE)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
  }));
  if (quotes.length === 0 || list.length === 0) return [{ who: null, text: para }];
  // Names in the narration only: a name said inside a quote is being spoken to.
  const found = mentions(para, list).filter(
    ([at]) => !quotes.some((q) => at >= q.start && at < q.end),
  );
  const out: Segment[] = [];
  let last = 0;
  quotes.forEach((q, i) => {
    if (q.start > last) out.push({ who: null, text: para.slice(last, q.start) });
    const nextQuote = quotes[i + 1]?.start ?? para.length;
    // The name just after the quote ('"…," Mina says'), else the last one
    // before it ('Mina looks up. "…"').
    const after = found.find(([at]) => at >= q.end && at < nextQuote);
    const before = [...found].reverse().find(([at]) => at < q.start);
    out.push({ who: (after ?? before)?.[1] ?? null, text: para.slice(q.start, q.end) });
    last = q.end;
  });
  if (last < para.length) out.push({ who: null, text: para.slice(last) });
  return out;
}

/**
 * The reply in pieces, each the narrator's or one character's. `names` are
 * the characters the voice pack has voices for. Neighbouring pieces with
 * the same reader are joined, and pieces with no words are left out.
 */
export function speakerSegments(text: string, names: string[]): Segment[] {
  const cast = names.map((n) => n.trim()).filter(Boolean);
  const list = aliases(cast);
  const out: Segment[] = [];
  for (const raw of unmarked(text).split(/\n+/)) {
    const para = raw.trim();
    if (!para) continue;
    let first = true;
    for (const seg of paragraphSegments(para, cast, list)) {
      const words = seg.text.trim();
      if (!HAS_WORDS.test(words)) continue;
      const prev = out[out.length - 1];
      // Within a paragraph a space; across paragraphs a line break (a pause).
      if (prev && prev.who === seg.who) prev.text += `${first ? '\n' : ' '}${words}`;
      else out.push({ who: seg.who, text: words });
      first = false;
    }
  }
  return out;
}

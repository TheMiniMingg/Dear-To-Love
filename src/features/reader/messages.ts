/**
 * Message tags the storyteller (and the composer) write into story text:
 * texts, calls, inner thoughts, letters and posts. The reader shows them as
 * cards; anything else is prose. Mirrors `plain_message_tags` in Rust.
 */

export type MessageTag = 'text' | 'call' | 'thought' | 'letter' | 'post';

export type Block =
  | { kind: 'prose'; text: string }
  | {
      kind: MessageTag;
      attrs: Record<string, string>;
      body: string;
      /** Still being written (no closing tag yet). */
      open: boolean;
    };

const TAGS: MessageTag[] = ['text', 'call', 'thought', 'letter', 'post'];

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

import type { ReactNode } from 'react';
import { parseBlocks, samePerson, type Block } from './messages';

type Tagged = Exclude<Block, { kind: 'prose' }>;

/** **bold** and *italic* inside one paragraph. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index;
    if (at > last) out.push(text.slice(last, at));
    out.push(m[1] ? <strong key={at}>{m[1]}</strong> : <em key={at}>{m[2]}</em>);
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * A capitalized name of up to three words ("Erika K."), or a short name in
 * a script without letter case (エリカ), then a colon and a quote.
 */
const SPEAKER =
  /^((?:\p{Lu}[\p{L}\p{M}'’.-]*)(?: \p{Lu}[\p{L}\p{M}'’.-]*){0,2}|[^\s\p{Ll}\p{Lu}:：]{1,12})([:：])\s*(?=["“「『*(（])/u;

/** A paragraph, with a leading speaker name ("Mara: \"…\"") in bold. */
function Paragraph({ text }: { text: string }) {
  const m = SPEAKER.exec(text);
  if (!m) return <p>{inline(text)}</p>;
  return (
    <p>
      <strong className="line-speaker">
        {m[1]}
        {m[2]}
      </strong>{' '}
      {inline(text.slice(m[0].length))}
    </p>
  );
}

/** Prose split into paragraphs at blank lines. */
export function Prose({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (
          <Paragraph key={i} text={p} />
        ))}
    </>
  );
}

function Avatar({ name }: { name: string }) {
  const initial = [...name.trim()][0]?.toUpperCase() ?? '?';
  return (
    <span className="msg-avatar" aria-hidden="true">
      {initial}
    </span>
  );
}

const CALL_STATUS: Record<string, string> = {
  ringing: 'Ringing…',
  calling: 'Calling…',
  connected: 'Connected',
  ended: 'Call ended',
  missed: 'Missed call',
};

type Group = { peer: string; texts: { sent: boolean; body: string; time: string }[] };

/**
 * Story text with texts, calls, thoughts, letters and posts shown as cards.
 * `playerName` decides which texts are the player's own (right side).
 */
export function RichText({
  text,
  playerName,
  streaming = false,
}: {
  text: string;
  playerName: string;
  streaming?: boolean;
}) {
  const blocks = parseBlocks(text, streaming);
  const out: ReactNode[] = [];
  let group: Group | null = null;
  let lastPeer = '';

  const flush = () => {
    if (!group) return;
    const g = group;
    const showName = !samePerson(g.peer, lastPeer);
    lastPeer = g.peer;
    out.push(
      <div
        key={`texts-${out.length}`}
        className="msg-phone"
        role="group"
        aria-label={`Text messages with ${g.peer || 'someone'}`}
      >
        {showName && g.peer && (
          <div className="msg-head">
            <Avatar name={g.peer} />
            <strong>{g.peer}</strong>
          </div>
        )}
        {g.texts.map((t, i) => (
          <div key={i} className={t.sent ? 'msg-bubble-row sent' : 'msg-bubble-row'}>
            <div className="msg-bubble">
              <span className="visually-hidden">{t.sent ? 'You sent: ' : `${g.peer}: `}</span>
              {t.body.split('\n').map((line, j) => (
                <span key={j} className="msg-line">
                  {inline(line)}
                </span>
              ))}
            </div>
            {t.time && <span className="msg-time">{t.time}</span>}
          </div>
        ))}
      </div>,
    );
    group = null;
  };

  const card = (b: Tagged, key: number): ReactNode => {
    const a = b.attrs;
    switch (b.kind) {
      case 'call': {
        const who = a.with || a.from || a.to || 'Unknown caller';
        const status = (a.status ?? '').toLowerCase();
        return (
          <div
            key={key}
            className={`msg-call ${status}`}
            role="group"
            aria-label={`Call with ${who}`}
          >
            <Avatar name={who} />
            <strong>{who}</strong>
            <span className="msg-call-status">{CALL_STATUS[status] ?? a.status ?? 'Call'}</span>
            <span className="msg-call-icons" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M6 11a6 6 0 0 0 12 0M12 17v4" />
              </svg>
              <svg viewBox="0 0 24 24">
                <path d="M4 9h4l5-4v14l-5-4H4z" />
                <path d="M16 9a4 4 0 0 1 0 6" />
              </svg>
              <svg viewBox="0 0 24 24" className="hang-up">
                <path d="M3 14c5-5 13-5 18 0l-2 3-4-2v-2a10 10 0 0 0-6 0v2l-4 2z" />
              </svg>
            </span>
            {b.body && (
              <div className="msg-call-body">
                <Prose text={b.body} />
              </div>
            )}
          </div>
        );
      }
      case 'thought': {
        const who = a.who || a.from || 'Someone';
        const own = samePerson(who, playerName);
        return (
          <aside
            key={key}
            className="msg-thought"
            aria-label={own ? 'Your thoughts' : `${who}'s thoughts`}
          >
            <span className="msg-label">{own ? 'You think' : `${who} thinks`}</span>
            <div className="msg-thought-body">
              <Prose text={b.body} />
            </div>
          </aside>
        );
      }
      case 'letter':
        return (
          <figure
            key={key}
            className="msg-letter"
            aria-label={a.from ? `Letter from ${a.from}` : 'Letter'}
          >
            <Prose text={b.body} />
            {a.from && <figcaption>{a.from}</figcaption>}
          </figure>
        );
      case 'post': {
        const who = a.from || 'Someone';
        return (
          <div key={key} className="msg-post" role="group" aria-label={`Post by ${who}`}>
            <div className="msg-head">
              <Avatar name={who} />
              <strong>{who}</strong>
              {a.time && <span className="msg-time">{a.time}</span>}
            </div>
            <Prose text={b.body} />
          </div>
        );
      }
      case 'text':
        return null;
    }
  };

  blocks.forEach((b, i) => {
    if (b.kind === 'prose') {
      if (!b.text.trim()) return;
      flush();
      lastPeer = '';
      out.push(<Prose key={i} text={b.text} />);
      return;
    }
    if (b.kind === 'text') {
      const sent = !!b.attrs.to || samePerson(b.attrs.from ?? '', playerName);
      const peer = (sent ? b.attrs.to : b.attrs.from) ?? '';
      if (group && !samePerson(group.peer, peer) && (peer || group.peer)) flush();
      group ??= { peer, texts: [] };
      group.texts.push({ sent, body: b.body, time: b.attrs.time ?? '' });
      return;
    }
    flush();
    lastPeer = '';
    out.push(card(b, i));
  });
  flush();
  return <>{out}</>;
}

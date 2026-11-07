import { useContext, type ReactNode } from 'react';
import type { RollRequest } from '../../types';
import { Thumb } from '../images/ImageGrid';
import { RollAsk, RollResult } from './DiceCards';
import {
  APP_TAGS,
  ASIDE_TAGS,
  parseBlocks,
  rollRequestOf,
  samePerson,
  type Block,
} from './messages';
import { NameColorsContext, nameStyle } from './nameColors';
import { PortraitsContext } from './portraits';
import { msg, t } from '../../i18n';

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

/** A paragraph that opens with a letter of the Latin alphabet, which a drop cap suits. */
const LATIN_START = /^[*_]*\p{Script=Latin}/u;

/**
 * A paragraph, with a leading speaker name ("Mara: \"…\"") in bold and in
 * that character's colour. `dropCap` enlarges the first letter (the opening
 * of a chapter) when the paragraph starts with one.
 */
function Paragraph({ text, dropCap = false }: { text: string; dropCap?: boolean }) {
  const colorOf = useContext(NameColorsContext);
  const m = SPEAKER.exec(text);
  if (!m) {
    return (
      <p className={dropCap && LATIN_START.test(text) ? 'drop-cap' : undefined}>{inline(text)}</p>
    );
  }
  return (
    <p className="script-line">
      <Avatar name={m[1] ?? ''} className="line-avatar" />
      <strong className="line-speaker" style={nameStyle(colorOf(m[1] ?? ''))}>
        {m[1]}
        {m[2]}
      </strong>{' '}
      {inline(text.slice(m[0].length))}
    </p>
  );
}

/** Prose split into paragraphs at blank lines; `dropCap` marks the first. */
export function Prose({ text, dropCap = false }: { text: string; dropCap?: boolean }) {
  return (
    <>
      {text
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (
          <Paragraph key={i} text={p} dropCap={dropCap && i === 0} />
        ))}
    </>
  );
}

/** Someone's portrait, or the first letter of their name in their colour. */
function Avatar({ name, className = 'msg-avatar' }: { name: string; className?: string }) {
  const portrait = useContext(PortraitsContext)(name);
  const color = useContext(NameColorsContext)(name);
  if (portrait) return <Thumb assetId={portrait} alt="" className={className} />;
  const initial = [...name.trim()][0]?.toUpperCase() ?? '?';
  return (
    <span className={className} aria-hidden="true" style={nameStyle(color)}>
      {initial}
    </span>
  );
}

const CALL_STATUS: Record<string, string> = {
  ringing: msg('Ringing…'),
  calling: msg('Calling…'),
  connected: msg('Connected'),
  ended: msg('Call ended'),
  missed: msg('Missed call'),
};

type Group = { peer: string; texts: { sent: boolean; body: string; time: string }[] };

/**
 * Story text with texts, calls, thoughts, letters, posts and dice rolls
 * shown as cards. `playerName` decides which texts are the player's own
 * (right side). `onRoll` offers a Roll button on the last roll asked for.
 */
export function RichText({
  text,
  playerName,
  streaming = false,
  onRoll,
  rolls = true,
  dropCap = false,
  sceneHeadings = true,
}: {
  text: string;
  playerName: string;
  streaming?: boolean;
  onRoll?: (request: RollRequest) => void;
  /**
   * False for the player's own words: only the app's roll and the
   * storyteller's changes to bars and items count, so such typed tags are
   * left out.
   */
  rolls?: boolean;
  /** The first reply of a chapter: a drop cap when it opens with prose. */
  dropCap?: boolean;
  /** Show scene headings; off, the marks still keep the place and time. */
  sceneHeadings?: boolean;
}) {
  const colorOf = useContext(NameColorsContext);
  // Only a scene heading may come before the paragraph that gets the drop cap.
  let capFree = dropCap;
  const blocks = parseBlocks(text, streaming).filter(
    (b) => rolls || !(APP_TAGS as string[]).includes(b.kind),
  );
  const lastAsk = blocks.findLastIndex((b) => b.kind === 'roll' && !!rollRequestOf(b.attrs));
  const out: ReactNode[] = [];
  let group: Group | null = null;
  let lastPeer = '';
  let changes: ReactNode[] = [];
  const flushChanges = () => {
    if (!changes.length) return;
    out.push(
      <p key={`changes-${out.length}`} className="tracker-changes">
        {changes}
      </p>,
    );
    changes = [];
  };

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
        aria-label={t('Text messages with {name}', { name: g.peer || t('someone') })}
      >
        {showName && g.peer && (
          <div className="msg-head">
            <Avatar name={g.peer} />
            <strong className="msg-name" style={nameStyle(colorOf(g.peer))}>
              {g.peer}
            </strong>
          </div>
        )}
        {g.texts.map((m, i) => (
          <div key={i} className={m.sent ? 'msg-bubble-row sent' : 'msg-bubble-row'}>
            <div className="msg-bubble">
              <span className="visually-hidden">
                {m.sent ? t('You sent: ') : t('{name}: ', { name: g.peer })}
              </span>
              {m.body.split('\n').map((line, j) => (
                <span key={j} className="msg-line">
                  {inline(line)}
                </span>
              ))}
            </div>
            {m.time && <span className="msg-time">{m.time}</span>}
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
        const who = a.with || a.from || a.to || t('Unknown caller');
        const status = (a.status ?? '').toLowerCase();
        return (
          <div
            key={key}
            className={`msg-call ${status}`}
            role="group"
            aria-label={t('Call with {name}', { name: who })}
          >
            <Avatar name={who} />
            <strong className="msg-name" style={nameStyle(colorOf(who))}>
              {who}
            </strong>
            <span className="msg-call-status">
              {CALL_STATUS[status] ? t(CALL_STATUS[status]) : (a.status ?? t('Call'))}
            </span>
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
        const who = a.who || a.from || t('Someone');
        const own = samePerson(who, playerName);
        return (
          <aside
            key={key}
            className="msg-thought"
            aria-label={own ? t('Your thoughts') : t("{name}'s thoughts", { name: who })}
          >
            <span className="msg-label">
              {own ? t('You think') : t('{name} thinks', { name: who })}
            </span>
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
            aria-label={a.from ? t('Letter from {name}', { name: a.from }) : t('Letter')}
          >
            <Prose text={b.body} />
            {a.from && <figcaption>{a.from}</figcaption>}
          </figure>
        );
      case 'post': {
        const who = a.from || t('Someone');
        return (
          <div
            key={key}
            className="msg-post"
            role="group"
            aria-label={t('Post by {name}', { name: who })}
          >
            <div className="msg-head">
              <Avatar name={who} />
              <strong className="msg-name" style={nameStyle(colorOf(who))}>
                {who}
              </strong>
              {a.time && <span className="msg-time">{a.time}</span>}
            </div>
            <Prose text={b.body} />
          </div>
        );
      }
      case 'roll': {
        const request = rollRequestOf(a);
        if (request) {
          return (
            <RollAsk
              key={key}
              request={request}
              onRoll={key === lastAsk && !streaming ? onRoll : undefined}
            />
          );
        }
        const total = Number.parseInt(a.result ?? '', 10);
        if (!Number.isFinite(total)) return null;
        const target = Number.parseInt(a.target ?? '', 10);
        return (
          <RollResult
            key={key}
            roll={{
              label: a.for || t('A roll'),
              dice: a.dice ?? '',
              total,
              target: Number.isFinite(target) ? target : undefined,
              stat: a.stat,
              bonus: Number.parseInt(a.bonus ?? '0', 10) || 0,
              critical:
                a.critical === 'success' || a.critical === 'failure' ? a.critical : undefined,
            }}
          />
        );
      }
      case 'scene': {
        const heading = [a.place, a.time].filter(Boolean).join(' — ');
        return heading ? (
          <p key={key} className="msg-scene" role="heading" aria-level={3}>
            {heading}
          </p>
        ) : null;
      }
      case 'meter':
      case 'item':
      case 'text':
      case 'remember':
      case 'forget':
      case 'thread':
      case 'character':
      case 'next':
        return null;
    }
  };

  blocks.forEach((b, i) => {
    // Notes, threads and new characters show under the reply, next moves
    // by the composer: none of them in it.
    if ((ASIDE_TAGS as string[]).includes(b.kind)) return;
    // Scene marks the player turned headings off for are kept, not shown.
    if (b.kind === 'scene' && !sceneHeadings) return;
    if (b.kind === 'meter' || b.kind === 'item') {
      const chip = <TrackerChip key={i} kind={b.kind} attrs={b.attrs} body={b.body} />;
      if (b.attrs.name || b.attrs.gain || b.attrs.lose) changes.push(chip);
      return;
    }
    if (b.kind !== 'prose' || b.text.trim()) flushChanges();
    if (b.kind === 'prose') {
      if (!b.text.trim()) return;
      flush();
      lastPeer = '';
      out.push(<Prose key={i} text={b.text} dropCap={capFree} />);
      capFree = false;
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
    if (b.kind !== 'scene') capFree = false;
    out.push(card(b, i));
  });
  flush();
  flushChanges();
  return <>{out}</>;
}

/** "Health −12", "Gold +35" or "Kira · Health → 40". */
function meterChange(a: Record<string, string>): { text: string; mood: string } {
  const who = a.who ? `${a.who} · ` : '';
  const change = Number.parseInt((a.change ?? '').replace('−', '-'), 10);
  if (Number.isFinite(change) && change !== 0) {
    const sign = change > 0 ? '+' : '−';
    return {
      text: `${who}${a.name} ${sign}${Math.abs(change)}`,
      mood: change > 0 ? 'up' : 'down',
    };
  }
  if (a.set) return { text: `${who}${a.name} → ${a.set}`, mood: 'set' };
  if (a.max) return { text: `${who}${a.name} / ${a.max}`, mood: 'set' };
  return { text: `${who}${a.name}`, mood: 'set' };
}

/** One change to a tracked bar or item, where the story says it happened. */
function TrackerChip({
  kind,
  attrs: a,
  body,
}: {
  kind: 'meter' | 'item';
  attrs: Record<string, string>;
  body: string;
}) {
  if (kind === 'meter') {
    const { text, mood } = meterChange(a);
    return <span className={`tracker-chip ${mood}`}>{text}</span>;
  }
  const qty = Math.max(1, Number.parseInt(a.qty ?? '1', 10) || 1);
  const gained = !!a.gain;
  const name = a.gain || a.lose || '';
  const label = gained ? t('Got {item}', { item: name }) : t('Lost {item}', { item: name });
  return (
    <span
      className={`tracker-chip item ${gained ? 'up' : 'down'}`}
      title={body || undefined}
      aria-label={body ? `${label}: ${body}` : label}
    >
      <span aria-hidden="true">
        {gained ? '+' : '−'}
        {a.qty === 'all' ? '' : qty} {name}
      </span>
    </span>
  );
}

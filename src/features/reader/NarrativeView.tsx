import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { EventDto } from '../../types';

type Props = {
  events: EventDto[];
  /** Reply being written right now (display only until it is committed). */
  draft?: { text: string } | null;
  /** Offer "Branch from here" on replies and chapter starts. */
  onBranch?: (eventId: string) => void;
  playerName: string;
};

function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </>
  );
}

function EventBlock({ e, onBranch, playerName }: { e: EventDto } & Omit<Props, 'events'>) {
  const branch = onBranch && (
    <button
      type="button"
      className="branch-button"
      onClick={() => onBranch(e.id)}
      aria-label="Branch from here"
      title="Start a new branch from this point"
    >
      Branch from here
    </button>
  );
  switch (e.kind) {
    case 'chapter_start':
      return (
        <header className="chapter-heading" data-event-id={e.id}>
          <h2>
            Chapter {e.payload.ordinal}: {e.payload.title}
          </h2>
          {branch}
        </header>
      );
    case 'player':
      return (
        <div className="turn-player" data-event-id={e.id}>
          <span className="speaker">{playerName}</span>
          <Paragraphs text={e.payload.text} />
        </div>
      );
    case 'assistant':
      return (
        <div className="turn-assistant" data-event-id={e.id}>
          <Paragraphs text={e.payload.text} />
          {branch}
        </div>
      );
    case 'edit':
      return (
        <p className="turn-note" data-event-id={e.id}>
          Story details changed{e.payload.note ? `: ${e.payload.note}` : ''}.
        </p>
      );
    case 'checkpoint':
      return (
        <p className="turn-note" data-event-id={e.id}>
          Checkpoint: {e.payload.label}
        </p>
      );
    case 'fact_confirm':
      return (
        <p className="turn-note" data-event-id={e.id}>
          Fact confirmed: {e.payload.fact.text}
        </p>
      );
  }
}

/**
 * Reading column. New content keeps the reader's position unless they are
 * already at the bottom; otherwise a "Jump to latest" button appears.
 */
export function NarrativeView({ events, draft, onBranch, playerName }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  // Changes whenever content grows: a new event or more streamed text.
  const lastId = `${events[events.length - 1]?.id ?? ''}:${draft ? draft.text.length : -1}`;

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    atBottomRef.current = atBottom;
    if (atBottom) setShowJump(false);
  };

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (atBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [lastId]);

  useEffect(() => {
    if (!atBottomRef.current) setShowJump(true);
  }, [lastId]);

  const jump = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    atBottomRef.current = true;
    setShowJump(false);
  };

  return (
    <div className="narrative-wrap">
      <div
        ref={scrollRef}
        className="narrative"
        onScroll={onScroll}
        tabIndex={0}
        aria-label="Story so far"
        data-testid="narrative"
      >
        <div className="narrative-column">
          {events.map((e) => (
            <EventBlock key={e.id} e={e} onBranch={onBranch} playerName={playerName} />
          ))}
          {draft && (
            <div className="turn-assistant turn-draft" aria-busy="true" data-testid="reply-draft">
              {draft.text ? <Paragraphs text={draft.text} /> : <p className="muted">Writing…</p>}
            </div>
          )}
        </div>
      </div>
      {showJump && (
        <button type="button" className="jump-latest" onClick={jump}>
          Jump to latest
        </button>
      )}
    </div>
  );
}

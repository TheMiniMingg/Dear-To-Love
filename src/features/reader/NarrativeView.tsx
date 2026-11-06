import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { EventDto } from '../../types';
import { picturesOnly } from './pictures';

type Props = {
  events: EventDto[];
  /** Reply being written right now (display only until it is committed). */
  draft?: { text: string } | null;
  /** Offer "Branch from here" on replies and chapter starts. */
  onBranch?: (eventId: string) => void;
  /** Offer "Another reply" on replies (a new route). */
  onRegenerate?: (eventId: string) => void;
  /** Offer "Change this action" on the player's actions (a new route). */
  onEditAction?: (eventId: string) => void;
  /** Offer "Bookmark" on chapters, actions and replies; pressed when marked. */
  onBookmark?: (eventId: string) => void;
  bookmarked?: ReadonlySet<string>;
  /** Scroll to this event and highlight it; a new `n` repeats it. */
  focus?: { eventId: string; n: number } | null;
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

function EventBlock({
  e,
  onBranch,
  onRegenerate,
  onEditAction,
  onBookmark,
  bookmarked,
  focused,
  playerName,
}: { e: EventDto; focused: boolean } & Omit<Props, 'events' | 'focus'>) {
  const marked = !!bookmarked?.has(e.id);
  const bookmark = onBookmark && (
    <button
      type="button"
      className="branch-button bookmark-button"
      aria-pressed={marked}
      onClick={() => onBookmark(e.id)}
      title={marked ? 'Remove this bookmark' : 'Bookmark this place to find it again'}
    >
      {marked ? 'Bookmarked' : 'Bookmark'}
    </button>
  );
  const cls = (base: string) =>
    [base, marked && 'is-bookmarked', focused && 'event-focus'].filter(Boolean).join(' ');
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
  const regenerate = onRegenerate && (
    <button
      type="button"
      className="branch-button"
      onClick={() => onRegenerate(e.id)}
      title="Write a different reply on a new route; this one stays"
    >
      Another reply
    </button>
  );
  const change = onEditAction && (
    <button
      type="button"
      className="branch-button"
      onClick={() => onEditAction(e.id)}
      title="Change what you did, on a new route; this one stays"
    >
      Change this action
    </button>
  );
  switch (e.kind) {
    case 'chapter_start':
      return (
        <header className={cls('chapter-heading')} data-event-id={e.id} tabIndex={-1}>
          <h2>
            Chapter {e.payload.ordinal}: {e.payload.title}
          </h2>
          {branch}
          {bookmark}
        </header>
      );
    case 'player':
      return (
        <div className={cls('turn-player')} data-event-id={e.id} tabIndex={-1}>
          <span className="speaker">{playerName}</span>
          <Paragraphs text={e.payload.text} />
          {(change || bookmark) && (
            <div className="turn-actions">
              {change}
              {bookmark}
            </div>
          )}
        </div>
      );
    case 'assistant':
      return (
        <div className={cls('turn-assistant')} data-event-id={e.id} tabIndex={-1}>
          <Paragraphs text={e.payload.text} />
          {(branch || regenerate || bookmark) && (
            <div className="turn-actions">
              {regenerate}
              {branch}
              {bookmark}
            </div>
          )}
        </div>
      );
    case 'edit':
      return (
        <p className={cls('turn-note')} data-event-id={e.id} tabIndex={-1}>
          {picturesOnly(e.payload.changes) ? 'Picture changed' : 'Story details changed'}
          {e.payload.note ? `: ${e.payload.note}` : ''}.
        </p>
      );
    case 'checkpoint':
      return (
        <p className={cls('turn-note')} data-event-id={e.id} tabIndex={-1}>
          Checkpoint: {e.payload.label}
        </p>
      );
    case 'fact_confirm':
      return (
        <p className={cls('turn-note')} data-event-id={e.id} tabIndex={-1}>
          Fact confirmed: {e.payload.fact.text}
        </p>
      );
  }
}

/**
 * Reading column. New content keeps the reader's position unless they are
 * already at the bottom; otherwise a "Jump to latest" button appears.
 */
export function NarrativeView({
  events,
  draft,
  onBranch,
  onRegenerate,
  onEditAction,
  onBookmark,
  bookmarked,
  focus,
  playerName,
}: Props) {
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

  // After dialogs close (they hand focus back first), show the event.
  useEffect(() => {
    if (!focus) return;
    const el = Array.from(
      scrollRef.current?.querySelectorAll<HTMLElement>('[data-event-id]') ?? [],
    ).find((x) => x.dataset.eventId === focus.eventId);
    if (!el) return;
    atBottomRef.current = false;
    el.scrollIntoView?.({ block: 'center' });
    el.focus({ preventScroll: true });
  }, [focus]);

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
          {events.map((e) => {
            const focused = focus?.eventId === e.id;
            return (
              <EventBlock
                // A new key replays the highlight when the same place is shown again.
                key={focused ? `${e.id}:${focus.n}` : e.id}
                e={e}
                onBranch={onBranch}
                onRegenerate={onRegenerate}
                onEditAction={onEditAction}
                onBookmark={onBookmark}
                bookmarked={bookmarked}
                focused={focused}
                playerName={playerName}
              />
            );
          })}
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

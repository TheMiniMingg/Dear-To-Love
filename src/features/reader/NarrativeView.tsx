import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { EventDto, RollRequest } from '../../types';
import { RollResult } from './DiceCards';
import { picturesOnly } from './pictures';
import { RichText } from './RichText';

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
  /** The premise under Chapter 1, and where things stand before the first action. */
  intro?: StoryIntro;
  /** Offer a Roll button when the latest reply asks for a roll. */
  onRoll?: (request: RollRequest) => void;
};

export type StoryIntro = { premise: string; location: string; scene: string };

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
  onRoll,
  latest,
}: { e: EventDto; focused: boolean; latest: boolean } & Omit<Props, 'events' | 'focus'>) {
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
    case 'chapter_start': {
      const recap = e.payload.previousChapterRecap?.trim();
      return (
        <>
          {recap && (
            <aside
              className="chapter-recap"
              aria-label={`Recap of Chapter ${e.payload.ordinal - 1}`}
            >
              <p className="recap-label">Recap of Chapter {e.payload.ordinal - 1}</p>
              <Paragraphs text={recap} />
            </aside>
          )}
          <header className={cls('chapter-heading')} data-event-id={e.id} tabIndex={-1}>
            <h2>
              Chapter {e.payload.ordinal}: {e.payload.title}
            </h2>
            {branch}
            {bookmark}
          </header>
        </>
      );
    }
    case 'player':
      return (
        <div className={cls('turn-player')} data-event-id={e.id} tabIndex={-1}>
          <span className="speaker">{playerName}</span>
          {e.payload.roll && <RollResult roll={e.payload.roll} fresh={latest} />}
          {e.payload.text.trim() && <RichText text={e.payload.text} playerName={playerName} />}
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
          <RichText
            text={e.payload.text}
            playerName={playerName}
            onRoll={latest ? onRoll : undefined}
          />
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

function lastOfKind(events: EventDto[], kind: EventDto['kind']): number {
  return events.findLastIndex((e) => e.kind === kind);
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
  intro,
  onRoll,
}: Props) {
  const opening = events[0]?.kind === 'chapter_start' && events[0].payload.ordinal === 1;
  const notStarted = !draft && !events.some((e) => e.kind === 'player');
  const introBlock = intro && (intro.premise.trim() || notStarted) && (
    <div className="story-intro" data-testid="story-intro">
      {intro.premise.trim() && <p className="intro-premise">{intro.premise.trim()}</p>}
      {notStarted && (
        <>
          {(intro.location.trim() || intro.scene.trim()) && (
            <div className="intro-scene">
              {intro.location.trim() && (
                <p>
                  <strong>{intro.location.trim()}</strong>
                </p>
              )}
              {intro.scene.trim() && <Paragraphs text={intro.scene.trim()} />}
            </div>
          )}
          <p className="intro-hint">
            Write what you do in the box below to begin, for example &ldquo;Look around&rdquo; or
            &ldquo;Ask who is there&rdquo;.
          </p>
        </>
      )}
    </div>
  );
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
          {!opening && notStarted && introBlock}
          {events.map((e, i) => {
            const focused = focus?.eventId === e.id;
            const block = (
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
                onRoll={onRoll}
                latest={i >= events.length - 2 && i === lastOfKind(events, e.kind)}
              />
            );
            return i === 0 && opening ? (
              <Fragment key={e.id}>
                {block}
                {introBlock}
              </Fragment>
            ) : (
              block
            );
          })}
          {draft && (
            <div className="turn-assistant turn-draft" aria-busy="true" data-testid="reply-draft">
              {draft.text ? (
                <RichText text={draft.text} playerName={playerName} streaming />
              ) : (
                <p className="muted">Writing…</p>
              )}
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

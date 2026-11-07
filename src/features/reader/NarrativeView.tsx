import { Fragment, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { EventDto, MemoryNote, RollRequest } from '../../types';
import { RollResult } from './DiceCards';
import { NameColorsContext, nameStyle } from './nameColors';
import { MemoryLine, notesOnly } from './notes';
import { picturesOnly } from './pictures';
import { RichText } from './RichText';
import { t } from '../../i18n';
import { chapterHasTitle, chapterHeading } from '../../i18n/names';

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
  /** Replies write memory notes: show a "Memory updated" line under them. */
  keepsNotes?: boolean;
  /** The story's notes as they are now, to tell whether a reply's notes can be undone. */
  currentNotes?: MemoryNote[];
  /** Offer "See notes" on that line. */
  onOpenNotes?: () => void;
  /** Offer "Undo" on that line. */
  onUndoNotes?: (eventId: string) => void;
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
  keepsNotes,
  currentNotes,
  onOpenNotes,
  onUndoNotes,
  opensChapter,
}: {
  e: EventDto;
  focused: boolean;
  latest: boolean;
  /** The chapter's first reply, which opens with a drop cap. */
  opensChapter: boolean;
} & Omit<Props, 'events' | 'focus'>) {
  const colorOf = useContext(NameColorsContext);
  const marked = !!bookmarked?.has(e.id);
  const bookmark = onBookmark && (
    <button
      type="button"
      className="branch-button bookmark-button"
      aria-pressed={marked}
      onClick={() => onBookmark(e.id)}
      title={marked ? t('Remove this bookmark') : t('Bookmark this place to find it again')}
    >
      {marked ? t('Bookmarked') : t('Bookmark')}
    </button>
  );
  const cls = (base: string) =>
    [base, marked && 'is-bookmarked', focused && 'event-focus'].filter(Boolean).join(' ');
  const branch = onBranch && (
    <button
      type="button"
      className="branch-button"
      onClick={() => onBranch(e.id)}
      aria-label={t('Branch from here')}
      title={t('Start a new branch from this point')}
    >
      {t('Branch from here')}
    </button>
  );
  const regenerate = onRegenerate && (
    <button
      type="button"
      className="branch-button"
      onClick={() => onRegenerate(e.id)}
      title={t('Write a different reply on a new route; this one stays')}
    >
      {t('Another reply')}
    </button>
  );
  const change = onEditAction && (
    <button
      type="button"
      className="branch-button"
      onClick={() => onEditAction(e.id)}
      title={t('Change what you did, on a new route; this one stays')}
    >
      {t('Change this action')}
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
              aria-label={t('Recap of Chapter {n}', { n: e.payload.ordinal - 1 })}
            >
              <p className="recap-label">
                {t('Recap of Chapter {n}', { n: e.payload.ordinal - 1 })}
              </p>
              <Paragraphs text={recap} />
            </aside>
          )}
          <header className={cls('chapter-heading')} data-event-id={e.id} tabIndex={-1}>
            <h2 aria-label={chapterHeading(e.payload.ordinal, e.payload.title)}>
              {chapterHasTitle(e.payload.ordinal, e.payload.title) ? (
                <>
                  <span className="chapter-number">
                    {t('Chapter {n}', { n: e.payload.ordinal })}
                  </span>
                  <span className="chapter-title">{e.payload.title?.trim()}</span>
                </>
              ) : (
                <span className="chapter-title">{chapterHeading(e.payload.ordinal, null)}</span>
              )}
            </h2>
            <span className="chapter-ornament" aria-hidden="true">
              <i />
            </span>
            {(branch || bookmark) && (
              <div className="turn-actions">
                {branch}
                {bookmark}
              </div>
            )}
          </header>
        </>
      );
    }
    case 'player':
      return (
        <div className={cls('turn-player')} data-event-id={e.id} tabIndex={-1}>
          <span className="speaker" style={nameStyle(colorOf(playerName))}>
            {playerName}
          </span>
          {e.payload.roll && <RollResult roll={e.payload.roll} fresh={latest} />}
          {e.payload.text.trim() && (
            <RichText text={e.payload.text} playerName={playerName} rolls={false} />
          )}
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
            dropCap={opensChapter}
          />
          {keepsNotes && (
            <MemoryLine
              text={e.payload.text}
              current={currentNotes}
              onOpen={onOpenNotes}
              onUndo={onUndoNotes && (() => onUndoNotes(e.id))}
            />
          )}
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
      if (notesOnly(e.payload.changes)) {
        return (
          <p className={cls('turn-note')} data-event-id={e.id} tabIndex={-1}>
            {e.payload.note
              ? t('Memory changed: {note}.', { note: e.payload.note })
              : t('Memory changed.')}
          </p>
        );
      }
      return (
        <p className={cls('turn-note')} data-event-id={e.id} tabIndex={-1}>
          {e.payload.note
            ? picturesOnly(e.payload.changes)
              ? t('Picture changed: {note}.', { note: e.payload.note })
              : t('Story details changed: {note}.', { note: e.payload.note })
            : picturesOnly(e.payload.changes)
              ? t('Picture changed.')
              : t('Story details changed.')}
        </p>
      );
    case 'checkpoint':
      return (
        <p className={cls('turn-note')} data-event-id={e.id} tabIndex={-1}>
          {t('Checkpoint: {label}', { label: e.payload.label })}
        </p>
      );
    case 'fact_confirm':
      return (
        <p className={cls('turn-note')} data-event-id={e.id} tabIndex={-1}>
          {t('Fact confirmed: {fact}', { fact: e.payload.fact.text })}
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
  keepsNotes,
  currentNotes,
  onOpenNotes,
  onUndoNotes,
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
            {t(
              'Write what you do in the box below to begin, for example “Look around” or “Ask who is there”.',
            )}
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

  // Which chapter start each event comes after, to find each chapter's first reply.
  const chapterOf: number[] = [];
  let lastChapter = -1;
  events.forEach((e, i) => {
    if (e.kind === 'chapter_start') lastChapter = i;
    chapterOf.push(lastChapter);
  });
  const replied = new Set<number>();
  // Only a chapter shown from its start opens with a drop cap.
  replied.add(-1);

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
        aria-label={t('Story so far')}
        data-testid="narrative"
      >
        <div className="narrative-column">
          {!opening && notStarted && introBlock}
          {events.map((e, i) => {
            const focused = focus?.eventId === e.id;
            const opensChapter = e.kind === 'assistant' && !replied.has(chapterOf[i] ?? -1);
            if (opensChapter) replied.add(chapterOf[i] ?? -1);
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
                keepsNotes={keepsNotes}
                currentNotes={currentNotes}
                onOpenNotes={onOpenNotes}
                onUndoNotes={onUndoNotes}
                latest={i >= events.length - 2 && i === lastOfKind(events, e.kind)}
                opensChapter={opensChapter}
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
                <p className="muted">{t('Writing…')}</p>
              )}
            </div>
          )}
        </div>
      </div>
      {showJump && (
        <button type="button" className="jump-latest" onClick={jump}>
          {t('Jump to latest')}
        </button>
      )}
    </div>
  );
}

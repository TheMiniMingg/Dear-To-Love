import {
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Bookmark,
  BookmarkCheck,
  GitBranch,
  NotebookPen,
  PenLine,
  Pencil,
  RefreshCw,
  Undo2,
} from 'lucide-react';
import { errorMessage } from '../../api/commands';
import { isComposing } from '../../app/keyboard';
import type { EventDto, MemoryNote, RollRequest } from '../../types';
import { RollResult } from './DiceCards';
import { NameColorsContext, nameStyle } from './nameColors';
import { MemoryLine, notesOnly, type ThreadLists } from './notes';
import { NewCharacterCards } from './NewCharacterCard';
import { withoutAsides, type NewCharacter } from './messages';
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
  /** The reply that can be edited in place (the latest), and how to save it. */
  editableReplyId?: string;
  onEditReply?: (eventId: string, text: string) => Promise<void>;
  /** The action that can be taken back (the player's last), and how. */
  takeBackId?: string;
  onTakeBack?: () => void;
  /** Offer "Remember this" for words picked in the story. */
  onRemember?: (words: string) => void;
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
  /** The threads as they are now, for the same. */
  currentThreads?: ThreadLists;
  /** Offer "See notes" on that line. */
  onOpenNotes?: () => void;
  /** Offer "Undo" on that line. */
  onUndoNotes?: (eventId: string) => void;
  /** Show the place and time headings; off, the storyteller's marks are kept but hidden. */
  sceneHeadings?: boolean;
  /** Offer to add the people a reply brings in to the cast. */
  newcomers?: Newcomers;
  /** Ideas for the first move show above the box. */
  ideasShown?: boolean;
};

export type Newcomers = {
  storyId: string;
  /** Everyone in the story now, the player too. */
  cast: string[];
  adultsOnly: boolean;
  onAdd: (c: NewCharacter) => Promise<void>;
};

export type StoryIntro = { premise: string; location: string; scene: string };

const ACTION_ICON = { 'aria-hidden': true, size: 16, strokeWidth: 1.9 } as const;

/** As `MAX_NOTE_TEXT` in Rust: the most words one memory note keeps. */
const MAX_REMEMBER = 800;

/**
 * The latest reply, open for new words. Its memory notes, threads and
 * ideas are not shown here: they stay as they were.
 */
function ReplyEditor({
  text,
  onSave,
  onCancel,
}: {
  text: string;
  onSave: (text: string) => Promise<void>;
  onCancel: () => void;
}) {
  const id = useId();
  const start = withoutAsides(text);
  const [value, setValue] = useState(start);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = value.trim() !== '' && value.trim() !== start.trim();
  const save = async () => {
    if (!changed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(value.trim());
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  return (
    <form
      className="reply-editor"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label htmlFor={`${id}-text`} className="visually-hidden">
        {t('The reply')}
      </label>
      <textarea
        id={`${id}-text`}
        value={value}
        rows={Math.min(18, Math.max(5, start.split('\n').length + 1))}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (isComposing(e)) return;
          if (e.key === 'Escape') {
            // Close the editor only, not into the pause menu.
            e.preventDefault();
            onCancel();
          } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void save();
          }
        }}
      />
      <p className="muted small">
        {t(
          'Only the words change. Its memory notes and ideas stay as they were, and the reply as it was is kept as a hidden route.',
        )}
      </p>
      {error && (
        <p role="alert" className="error small">
          {error}
        </p>
      )}
      <div className="button-row">
        <button type="submit" className="primary" disabled={!changed || busy}>
          {t('Save reply')}
        </button>
        <button type="button" onClick={onCancel} disabled={busy}>
          {t('Cancel')}
        </button>
      </div>
    </form>
  );
}

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
  editableReplyId,
  onEditReply,
  takeBackId,
  onTakeBack,
  onBookmark,
  bookmarked,
  focused,
  playerName,
  onRoll,
  latest,
  keepsNotes,
  currentNotes,
  currentThreads,
  onOpenNotes,
  onUndoNotes,
  opensChapter,
  sceneHeadings,
  newcomers,
}: {
  e: EventDto;
  focused: boolean;
  latest: boolean;
  /** The chapter's first reply, which opens with a drop cap. */
  opensChapter: boolean;
} & Omit<Props, 'events' | 'focus' | 'onRemember'>) {
  const colorOf = useContext(NameColorsContext);
  const [editingNow, setEditing] = useState(false);
  const canEdit = !!onEditReply && e.id === editableReplyId;
  // The editor closes once the reply can no longer change (a new turn).
  const editing = editingNow && canEdit;
  const marked = !!bookmarked?.has(e.id);
  // Small icon buttons that show when the pointer is over the turn (or a
  // key reaches them); a bookmark stays in view. The label is for screen
  // readers and the tooltip.
  const action = (label: string, title: string, icon: ReactNode, onClick: () => void) => (
    <button type="button" className="turn-action" onClick={onClick} title={title}>
      {icon}
      <span className="visually-hidden">{label}</span>
    </button>
  );
  const bookmark = onBookmark && (
    <button
      type="button"
      className="turn-action bookmark-button"
      aria-pressed={marked}
      onClick={() => onBookmark(e.id)}
      title={marked ? t('Remove this bookmark') : t('Bookmark this place to find it again')}
    >
      {marked ? <BookmarkCheck {...ACTION_ICON} /> : <Bookmark {...ACTION_ICON} />}
      <span className="visually-hidden">{marked ? t('Bookmarked') : t('Bookmark')}</span>
    </button>
  );
  const cls = (base: string) =>
    [base, marked && 'is-bookmarked', focused && 'event-focus'].filter(Boolean).join(' ');
  const branch =
    onBranch &&
    action(
      t('Branch from here'),
      t('Start a new branch from this point'),
      <GitBranch {...ACTION_ICON} />,
      () => onBranch(e.id),
    );
  const regenerate =
    onRegenerate &&
    action(
      t('Another reply'),
      t('Write a different reply on a new route; this one stays'),
      <RefreshCw {...ACTION_ICON} />,
      () => onRegenerate(e.id),
    );
  const change =
    onEditAction &&
    action(
      t('Change this action'),
      t('Change what you did, on a new route; this one stays'),
      <PenLine {...ACTION_ICON} />,
      () => onEditAction(e.id),
    );
  const takeBack =
    onTakeBack &&
    e.id === takeBackId &&
    action(
      t('Take back this turn'),
      t('Go back to before this action; the turn is kept in Routes'),
      <Undo2 {...ACTION_ICON} />,
      onTakeBack,
    );
  const edit =
    canEdit &&
    !editing &&
    action(
      t('Edit this reply'),
      t('Change the words of this reply, here'),
      <Pencil {...ACTION_ICON} />,
      () => setEditing(true),
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
          {e.payload.text.trim() ? (
            <RichText text={e.payload.text} playerName={playerName} rolls={false} />
          ) : (
            !e.payload.roll && <p className="kept-going">{t('You let the story go on.')}</p>
          )}
          {(change || takeBack || bookmark) && (
            <div className="turn-actions">
              {takeBack}
              {change}
              {bookmark}
            </div>
          )}
        </div>
      );
    case 'assistant':
      return (
        <div className={cls('turn-assistant')} data-event-id={e.id} tabIndex={-1}>
          {editing ? (
            <ReplyEditor
              text={e.payload.text}
              onCancel={() => setEditing(false)}
              onSave={async (text) => {
                await onEditReply(e.id, text);
                setEditing(false);
              }}
            />
          ) : (
            <RichText
              text={e.payload.text}
              playerName={playerName}
              onRoll={latest ? onRoll : undefined}
              dropCap={opensChapter}
              sceneHeadings={sceneHeadings}
            />
          )}
          {keepsNotes && (
            <MemoryLine
              text={e.payload.text}
              current={currentNotes}
              threads={currentThreads}
              onOpen={onOpenNotes}
              onUndo={onUndoNotes && (() => onUndoNotes(e.id))}
            />
          )}
          {newcomers && (
            <NewCharacterCards
              text={e.payload.text}
              storyId={newcomers.storyId}
              cast={newcomers.cast}
              adultsOnly={newcomers.adultsOnly}
              onAdd={newcomers.onAdd}
            />
          )}
          {!editing && (branch || regenerate || edit || bookmark) && (
            <div className="turn-actions">
              {edit}
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
  editableReplyId,
  onEditReply,
  takeBackId,
  onTakeBack,
  onRemember,
  onBookmark,
  bookmarked,
  focus,
  playerName,
  intro,
  onRoll,
  keepsNotes,
  currentNotes,
  currentThreads,
  onOpenNotes,
  onUndoNotes,
  sceneHeadings,
  newcomers,
  ideasShown = false,
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
            {ideasShown
              ? t('Write what you do in the box below to begin, or pick an idea just above it.')
              : t(
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

  // Words picked in the story, and where to offer "Remember this" for them.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<{ words: string; top: number; left: number } | null>(null);
  const placePick = useCallback(() => {
    const sel = document.getSelection();
    const host = scrollRef.current;
    const wrap = wrapRef.current;
    if (!onRemember || !sel || sel.isCollapsed || sel.rangeCount === 0 || !host || !wrap) {
      setPicked(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const words = sel.toString().replace(/\s+/g, ' ').trim();
    const turn =
      range.commonAncestorContainer instanceof Element
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;
    if (!words || !host.contains(turn) || turn?.closest('textarea, input, .reply-editor')) {
      setPicked(null);
      return;
    }
    const r =
      typeof range.getBoundingClientRect === 'function' ? range.getBoundingClientRect() : null;
    const box = wrap.getBoundingClientRect();
    const half = Math.min(90, box.width / 2);
    setPicked({
      words: words.slice(0, MAX_REMEMBER),
      top: r ? Math.max(4, r.top - box.top - 40) : 4,
      left: r ? Math.min(box.width - half, Math.max(half, r.left - box.left + r.width / 2)) : half,
    });
  }, [onRemember]);
  useEffect(() => {
    if (!onRemember) return;
    document.addEventListener('selectionchange', placePick);
    return () => document.removeEventListener('selectionchange', placePick);
  }, [onRemember, placePick]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    atBottomRef.current = atBottom;
    if (atBottom) setShowJump(false);
    if (picked) placePick();
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
    <div className="narrative-wrap" ref={wrapRef}>
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
                editableReplyId={editableReplyId}
                onEditReply={onEditReply}
                takeBackId={takeBackId}
                onTakeBack={onTakeBack}
                onBookmark={onBookmark}
                bookmarked={bookmarked}
                focused={focused}
                playerName={playerName}
                onRoll={onRoll}
                keepsNotes={keepsNotes}
                currentNotes={currentNotes}
                currentThreads={currentThreads}
                onOpenNotes={onOpenNotes}
                onUndoNotes={onUndoNotes}
                sceneHeadings={sceneHeadings}
                newcomers={newcomers}
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
                <RichText
                  text={draft.text}
                  playerName={playerName}
                  streaming
                  sceneHeadings={sceneHeadings}
                />
              ) : (
                <p className="muted">{t('Writing…')}</p>
              )}
            </div>
          )}
        </div>
      </div>
      {picked && onRemember && (
        <button
          type="button"
          className="remember-this"
          style={{ top: picked.top, left: picked.left }}
          // Keep the words picked while the button is pressed.
          onMouseDown={(ev) => ev.preventDefault()}
          onClick={() => {
            onRemember(picked.words);
            document.getSelection()?.removeAllRanges();
            setPicked(null);
          }}
        >
          <NotebookPen aria-hidden={true} size={15} />
          {t('Remember this')}
        </button>
      )}
      {showJump && (
        <button type="button" className="jump-latest" onClick={jump}>
          {t('Jump to latest')}
        </button>
      )}
    </div>
  );
}

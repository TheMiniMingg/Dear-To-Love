import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArchiveRestore,
  Backpack,
  BookMarked,
  BookOpenText,
  Brain,
  Check,
  ChevronDown,
  Download,
  Feather,
  GitBranch,
  Images,
  Keyboard,
  LibraryBig,
  Lightbulb,
  ListOrdered,
  MapPin,
  Menu,
  Play,
  Save,
  ScanText,
  Search,
  Settings,
  Stethoscope,
  StickyNote,
  Type,
  Undo2,
  UserRoundPen,
  Volume2,
  type LucideIcon,
} from 'lucide-react';
import {
  CommandError,
  commands,
  errorMessage,
  formatUsd,
  runErrorMessage,
} from '../../api/commands';
import { useUiStore } from '../../app/store';
import { readingStyle, useLook, useStoryLook } from '../../app/look';
import { useReplyWatch } from '../../app/replyWatch';
import { canReadAloud, speechLang, useReadAloud } from '../../app/readAloud';
import { paletteSources, usePalette } from '../../app/palette';
import { isComposing, isEditableTarget } from '../../app/keyboard';
import { ariaKeys, isShortcut, useShortcutHelp, withKeys } from '../../app/shortcuts';
import { Dialog } from '../../components/Dialog';
import { KeyHint } from '../../components/KeyHint';
import { MenuButton } from '../../components/MenuButton';
import { ChaptersPanel } from '../routes/ChaptersPanel';
import { RoutesPanel } from '../routes/RoutesPanel';
import { SavesPanel } from '../saves/SavesPanel';
import { SearchPanel } from '../search/SearchPanel';
import type {
  BookmarkDto,
  BudgetStatus,
  DiceRules,
  ErrorCode,
  EventDto,
  ReplyLength,
  ReplyOptions,
  RollRequest,
  RouteView,
  SaveView,
  SearchResults,
} from '../../types';
import { Composer, LENGTHS, lengthOptions } from './Composer';
import { ContextPreviewPanel } from './ContextPreviewPanel';
import { EndChapterPanel } from './EndChapterPanel';
import { ExportPanel } from './ExportPanel';
import { InventoryPanel, TrackerHud } from './InventoryPanel';
import { NarrativeView } from './NarrativeView';
import { joinCast, newcomerId } from './NewCharacterCard';
import { portraitSlot } from './pictures';
import { usePictureMaker } from '../images/MakePortrait';
import { PicturesPanel } from './PicturesPanel';
import { ReaderRail } from './ReaderRail';
import { ScenePictures } from './ScenePictures';
import { usePictureView } from './stage';
import { StoryDetailsPanel, type DetailsTab } from './StoryDetailsPanel';
import { StoryMemoryPanel } from './StoryMemoryPanel';
import { REMEMBER_NAME_ID } from './Notebook';
import { StorytellerPanel } from './StorytellerPanel';
import { Tour, useTour } from './Tour';
import { standingNotes, standingThreads } from './notes';
import { standingBonds } from './feelings';
import { nextMoves, openingIdeas, parseBlocks, plainText, type NewCharacter } from './messages';
import { NameColorsContext, nameColorFinder } from './nameColors';
import { PortraitsContext, portraitFinder } from './portraits';
import { DiceRulesContext } from './DiceCards';
import { intlLocale, joinList, joinSentences, msg, t, tKnown, tr } from '../../i18n';
import { chapterHasTitle, chapterHeading, routeName, saveName } from '../../i18n/names';

/** A portrait made for someone who joined the cast, waiting to be shown. */
type MadePortrait = { routeId: string; characterId: string; name: string; assetId: string };

type Panel =
  | null
  | 'menu'
  | 'saves'
  | 'routes'
  | 'chapters'
  | 'edit'
  | 'regenerate'
  | 'details'
  | 'pictures'
  | 'context'
  | 'export'
  | 'search'
  | 'storyteller'
  | 'memory'
  | 'inventory'
  | 'note'
  | 'end';

const PANEL_TITLES: Record<Exclude<Panel, null>, string> = {
  menu: msg('Paused'),
  saves: msg('Save / Load'),
  routes: msg('Routes'),
  chapters: msg('Chapters'),
  edit: msg('Change your action'),
  regenerate: msg('Another reply'),
  details: msg('Story details'),
  pictures: msg('Pictures'),
  context: msg('Preview context'),
  export: msg('Export'),
  search: msg('Story search'),
  storyteller: msg('Storyteller'),
  memory: msg('Story memory'),
  inventory: msg('Status and inventory'),
  note: msg('Note to the storyteller'),
  end: msg('End chapter'),
};

/** As `MAX_STORYTELLER_NOTE` and `MAX_HINT` in Rust. */
const MAX_NOTE = 500;
const MAX_HINT = 300;

/** Ready-made hints for Another reply; the player can write their own. */
const HINTS = [
  msg('More dialogue'),
  msg('More romantic'),
  msg('More tension'),
  msg('Funnier'),
  msg('Calmer'),
  msg('More about the place'),
  msg('Slower, more detail'),
];

/** Events after a reply that still leave it the latest one. */
const AFTER_REPLY: ReadonlySet<EventDto['kind']> = new Set(['edit', 'fact_confirm', 'checkpoint']);

const MENU_ICON = { className: 'btn-icon', 'aria-hidden': true } as const;

/** Panels that slide in beside the story instead of covering it. */
const SHEETS: ReadonlySet<Panel> = new Set<Panel>([
  'saves',
  'routes',
  'chapters',
  'details',
  'pictures',
  'context',
  'export',
  'search',
  'storyteller',
  'memory',
  'inventory',
]);

type Stream = { runId: string; text: string };

/**
 * Who is texting, while a reply that opens with a text message is being
 * written: the character's name, or null for anything else.
 */
function texting(draft: string, playerName: string): string | null {
  const first = parseBlocks(draft, true).find((b) => b.kind !== 'prose' || b.text.trim());
  if (first?.kind !== 'text') return null;
  const from = first.attrs.from?.trim();
  return from && from !== playerName ? from : null;
}

/** A small button with an icon in the reader's toolbar; its name shows as a tooltip. */
function ToolButton({
  icon: Icon,
  label,
  title,
  keys,
  onClick,
  disabled,
  badge,
}: {
  icon: LucideIcon;
  label: string;
  title: string;
  keys: string | undefined;
  onClick: () => void;
  disabled?: boolean;
  badge?: number;
}) {
  return (
    <button
      type="button"
      className="tool-button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-keyshortcuts={keys}
    >
      <Icon aria-hidden={true} size={18} strokeWidth={1.8} />
      <span className="visually-hidden">{label}</span>
      {badge !== undefined && badge > 1 && (
        <span className="tool-badge" aria-hidden="true">
          {badge}
        </span>
      )}
    </button>
  );
}

const POLL_MS = 1500;
/**
 * Where and when the story is ("The pier, Dawn"), or the chapter when the
 * story has not said: a name to start a save from.
 */
function placeName(view: RouteView): string {
  const scene = view.state.state.scene;
  const where = [scene.location.trim(), scene.time?.trim() ?? ''].filter(Boolean);
  if (where.length) return joinList(where).slice(0, 120);
  const chapter = view.state.activeChapter;
  return chapter ? chapterHeading(chapter.ordinal, chapter.title).slice(0, 120) : '';
}

/** Usual dice, kept as one object so the cards don't redraw for nothing. */
const NO_RULES: DiceRules = {};

function timeNow(): string {
  return new Date().toLocaleTimeString(intlLocale(), { hour: '2-digit', minute: '2-digit' });
}

export function ReaderScreen({ routeId }: { routeId: string }) {
  const navigate = useUiStore((s) => s.navigate);
  const draft = useUiStore((s) => s.drafts[routeId] ?? '');
  const setDraft = useUiStore((s) => s.setDraft);
  const clearDraft = useUiStore((s) => s.clearDraft);
  const stepTextSize = useUiStore((s) => s.stepTextSize);
  const textSize = useUiStore((s) => s.textSize);
  const readingWidth = useLook((s) => s.width);
  const lineSpacing = useLook((s) => s.spacing);

  const [view, setView] = useState<RouteView | null>(null);
  const [viewing, setViewing] = useState<SaveView | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  // A window opened from the pause menu goes back to it when closed; one
  // opened with a key or a button beside the story goes back to the story.
  const lastPanel = useRef<Panel>(null);
  const fromMenu = useRef(false);
  useEffect(() => {
    if (panel && panel !== 'menu') fromMenu.current = lastPanel.current === 'menu';
    lastPanel.current = panel;
  }, [panel]);
  /** The Story details tab to open on (the scene chip opens Scene). */
  const [detailsTab, setDetailsTab] = useState<DetailsTab>('characters');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string>(() => t('All changes saved'));
  const [reload, setReload] = useState(0);
  const [stream, setStream] = useState<Stream | null>(null);
  const [replyError, setReplyError] = useState<{ text: string; code: ErrorCode | null } | null>(
    null,
  );
  const [budget, setBudget] = useState<BudgetStatus | null>(null);
  const [editText, setEditText] = useState('');
  /** The note to the storyteller being written in its window. */
  const [noteText, setNoteText] = useState('');
  /** What Another reply asks for: its length and a hint. */
  const [regen, setRegen] = useState<{ length: ReplyLength | 'normal'; hint: string }>({
    length: 'normal',
    hint: '',
  });
  /** Words picked in the story for a new memory note. */
  const [remember, setRemember] = useState<string | null>(null);
  /** The action being changed, or the reply being replaced. */
  const [target, setTarget] = useState<EventDto | null>(null);
  const [bookmarks, setBookmarks] = useState<BookmarkDto[]>([]);
  const [bookmarksReload, setBookmarksReload] = useState(0);
  const [lastSearch, setLastSearch] = useState<SearchResults | null>(null);
  /** The place to show after a search or bookmark; `n` repeats it. */
  const [focus, setFocus] = useState<{ eventId: string; n: number } | null>(null);
  const narrativeHost = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Reading aloud stops when you leave the story.
  useEffect(() => () => useReadAloud.getState().stop(), []);

  // Leaving while a reply is being written: it keeps going, and the app
  // says so (with a chime) when it is ready.
  const leaving = useRef<{ storyId: string; title: string } | null>(null);
  useEffect(() => {
    leaving.current = stream && view ? { storyId: view.story.id, title: view.story.title } : null;
  }, [stream, view]);
  useEffect(
    () => () => {
      const l = leaving.current;
      if (l) useReplyWatch.getState().watch(l.storyId, l.title);
    },
    [],
  );

  /** Month-to-date budget standing; shown as a banner past the warning level. */
  const refreshBudget = useCallback(() => {
    commands
      .getBudgetStatus()
      .then((b) => {
        if (mounted.current) setBudget(b);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshBudget();
  }, [refreshBudget]);

  /** A reply is being written by someone else (e.g. before this screen
   * remounted): show it as in progress and poll until it lands. */
  const follow = useCallback(
    async (runId: string) => {
      setStream({ runId, text: '' });
      for (;;) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        if (!mounted.current) return;
        try {
          const v = await commands.getRouteView(routeId);
          if (!mounted.current) return;
          if (v.awaitingReply?.activeRun?.id !== runId) {
            setView(v);
            setStream(null);
            return;
          }
        } catch {
          // keep waiting; the next poll may succeed
        }
      }
    },
    [routeId],
  );

  /**
   * Write the reply for a pending run, showing drafts as they stream.
   * `budgetOverride` sends one reply the budget cannot price.
   */
  const generate = useCallback(
    async (runId: string, budgetOverride = false) => {
      setStream({ runId, text: '' });
      setReplyError(null);
      try {
        const v = await commands.generateReply(
          runId,
          (m) => {
            if (m.type !== 'delta') return;
            setStream((s) => (s && s.runId === m.runId ? { ...s, text: s.text + m.text } : s));
          },
          budgetOverride,
        );
        if (!mounted.current) return;
        setView(v);
        setStream(null);
        setSaveStatus(t('Autosaved {time}', { time: timeNow() }));
        refreshBudget();
      } catch (e) {
        if (!mounted.current) return;
        if (e instanceof CommandError && e.code === 'RUN_NOT_ACTIVE') {
          void follow(runId);
          return;
        }
        setStream(null);
        setReplyError({
          text: errorMessage(e),
          code: e instanceof CommandError ? e.code : null,
        });
        setReload((n) => n + 1);
        refreshBudget();
      }
    },
    [follow, refreshBudget],
  );

  useEffect(() => {
    let cancelled = false;
    commands
      .getRouteView(routeId)
      .then((v) => {
        if (cancelled) return;
        setView(v);
        // Pick up a reply that is waiting to start or still being written.
        const active = v.awaitingReply?.activeRun;
        if (active && reload === 0) {
          if (active.status === 'pending') void generate(active.id);
          else void follow(active.id);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [routeId, reload, generate, follow]);

  useEffect(() => {
    let cancelled = false;
    commands
      .listBookmarks(routeId)
      .then((list) => {
        if (!cancelled) setBookmarks(list);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [routeId, bookmarksReload]);

  const bookmarked = useMemo(() => new Set(bookmarks.map((b) => b.eventId)), [bookmarks]);

  const goToRoute = useCallback(
    (v: RouteView) => {
      setViewing(null);
      setPanel(null);
      setView(v);
      if (v.route.id !== routeId) navigate({ name: 'reader', routeId: v.route.id });
    },
    [navigate, routeId],
  );

  const run = useCallback(async (f: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await f();
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof CommandError && e.code === 'HEAD_CHANGED') setReload((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }, []);

  // Opening a story or a route (from the library, a save or a branch)
  // leaves the focus on the page: put it in the action box, ready to play.
  const placedFocus = useRef(false);
  useEffect(() => {
    if (placedFocus.current || !view || busy || panel || viewing) return;
    const box = document.getElementById('composer-input') as HTMLTextAreaElement | null;
    if (!box || box.disabled) return;
    placedFocus.current = true;
    const active = document.activeElement;
    if (!active || active === document.body) box.focus({ preventScroll: true });
  });

  const awaitingReply = !!view?.awaitingReply;
  const writing = stream !== null;

  // Portraits made for people who just joined the cast. Each one becomes
  // the route's picture for them, from then on, once the route is free to
  // change (no reply being written or waited for).
  const painter = usePictureMaker();
  const [madePortraits, setMadePortraits] = useState<MadePortrait[]>([]);
  const placing = useRef(false);
  useEffect(() => {
    const next = madePortraits.find((p) => p.routeId === view?.route.id);
    if (!view || !next || placing.current || busy || writing || awaitingReply || viewing) return;
    placing.current = true;
    const done = () => setMadePortraits((all) => all.filter((p) => p !== next));
    commands
      .editStoryDetails({
        storyId: view.story.id,
        routeId: view.route.id,
        expectedHeadId: view.state.headEventId,
        changes: [
          { op: 'setVisualRef', slot: portraitSlot(next.characterId), assetId: next.assetId },
        ],
        note: t('Portrait of {name}', { name: next.name }),
      })
      .then((v) => {
        done();
        setView(v);
        setSaveStatus(t('{name}’s portrait is ready {time}', { name: next.name, time: timeNow() }));
      })
      .catch((e: unknown) => {
        if (e instanceof CommandError && e.code === 'HEAD_CHANGED') {
          setReload((n) => n + 1);
        } else {
          done();
          setSaveStatus(
            t('{name}’s portrait is in your images; choose it under Pictures.', {
              name: next.name,
            }),
          );
        }
      })
      .finally(() => {
        placing.current = false;
      });
  }, [madePortraits, view, busy, writing, awaitingReply, viewing]);

  /** Makes the portrait of someone who just joined the cast, in the background. */
  const makeNewcomerPortrait = async (v: RouteView, characterId: string) => {
    const character = v.state.state.characters[characterId];
    if (!character) return;
    const name = character.name;
    setSaveStatus(t('Making {name}’s portrait…', { name }));
    try {
      const asset = await commands.makePortrait({
        character,
        world: v.state.state.world,
        style: 'painted',
        storyId: v.story.id,
      });
      setMadePortraits((all) => [
        ...all,
        { routeId: v.route.id, characterId, name, assetId: asset.id },
      ]);
    } catch (e) {
      setSaveStatus(
        t('{name}’s portrait wasn’t made: {reason}', { name, reason: errorMessage(e) }),
      );
    }
  };
  const lastAction = view?.history[view.history.length - 1];
  // The storyteller's ideas for the next move, from the reply the story
  // stands at, or a few ways in when a chapter begins: none once the
  // player acts.
  const lastTurn = view?.history.findLast((e) =>
    ['player', 'assistant', 'chapter_start'].includes(e.kind),
  );
  const ideas =
    !view || view.state.state.narration?.noSuggestions
      ? []
      : lastTurn?.kind === 'assistant'
        ? nextMoves(lastTurn.payload.text)
        : lastTurn?.kind === 'chapter_start'
          ? openingIdeas(view.state.state)
          : [];

  // Where this route began: what comes before it belongs to the route it
  // branched from, and only there can it be changed or taken back.
  const forkAt = view ? view.history.findIndex((e) => e.id === view.route.forkEventId) : -1;
  const lastReplyAt = view ? view.history.findLastIndex((e) => e.kind === 'assistant') : -1;
  /** The latest reply, which can change in place while only story details follow it. */
  const editableReplyId =
    view &&
    lastReplyAt > 0 &&
    lastReplyAt - 1 >= forkAt &&
    view.history.slice(lastReplyAt + 1).every((e) => AFTER_REPLY.has(e.kind))
      ? view.history[lastReplyAt]!.id
      : undefined;
  const lastActionAt = view ? view.history.findLastIndex((e) => e.kind === 'player') : -1;
  /** The player's last action, which can be taken back while it is in this chapter. */
  const takeBackId =
    view &&
    lastActionAt > 0 &&
    lastActionAt > forkAt &&
    !view.history.slice(lastActionAt).some((e) => e.kind === 'chapter_start')
      ? view.history[lastActionAt]!.id
      : undefined;
  const canTakeBack =
    !!takeBackId && !busy && !writing && !viewing && !view?.awaitingReply?.activeRun;

  /**
   * Send an action. A roll from a dice card leaves the typed draft alone.
   * Empty text is Keep going; `options` are for the next reply only.
   */
  const send = (
    text: string = draft,
    roll?: RollRequest,
    fromComposer = true,
    options?: ReplyOptions,
  ) =>
    view &&
    run(async () => {
      const sub = await commands.submitAction({
        storyId: view.story.id,
        routeId: view.route.id,
        expectedHeadId: view.route.headEventId ?? '',
        text,
        roll,
        options,
      });
      if (fromComposer) clearDraft(routeId);
      useTour.getState().acted();
      setView(sub.view);
      void generate(sub.runId);
    });

  const retry = (budgetOverride = false) =>
    view &&
    run(async () => {
      const sub = await commands.retryReply({
        storyId: view.story.id,
        routeId: view.route.id,
        expectedHeadId: view.route.headEventId ?? '',
      });
      setView(sub.view);
      void generate(sub.runId, budgetOverride);
    });

  const dismissBudget = () =>
    void commands
      .dismissBudgetWarning()
      .then((b) => {
        if (mounted.current) setBudget(b);
      })
      .catch((e: unknown) => setError(errorMessage(e)));

  const cancelReply = () => {
    if (stream) void commands.cancelReply(stream.runId).catch(() => undefined);
  };

  const openEdit = (e: EventDto | undefined = lastAction) => {
    if (e?.kind !== 'player') return;
    setTarget(e);
    setEditText(e.payload.text);
    setPanel('edit');
  };

  const openRegenerate = (eventId: string) => {
    const e = view?.history.find((x) => x.id === eventId);
    if (e?.kind !== 'assistant') return;
    setTarget(e);
    setRegen({ length: 'normal', hint: '' });
    setPanel('regenerate');
  };

  /** The player action a reply answered. */
  const answered = (reply: EventDto | null) =>
    reply && view?.history.find((x) => x.id === reply.parentEventId);

  const submitEdit = () =>
    view &&
    target?.kind === 'player' &&
    run(async () => {
      const sub = await commands.editAction({
        storyId: view.story.id,
        routeId: view.route.id,
        playerEventId: target.id,
        text: editText,
      });
      // The new branch's reader picks up its pending reply when it opens.
      goToRoute(sub.view);
    });

  const submitRegenerate = () =>
    view &&
    target?.kind === 'assistant' &&
    run(async () => {
      const hint = regen.hint.trim();
      const options = { ...lengthOptions(regen.length), ...(hint ? { hint } : {}) };
      const sub = await commands.regenerateReply({
        storyId: view.story.id,
        routeId: view.route.id,
        assistantEventId: target.id,
        options: Object.keys(options).length ? options : undefined,
      });
      goToRoute(sub.view);
    });

  /**
   * Take back the player's last turn: the story goes back to just before
   * it, and the turn stays on a branch. Words typed for it come back to the
   * box when it is empty, to change and send again.
   */
  const takeBack = () =>
    view &&
    run(async () => {
      const action = view.history.findLast((e) => e.kind === 'player');
      const back = await commands.takeBackTurn({
        storyId: view.story.id,
        routeId: view.route.id,
        expectedHeadId: view.route.headEventId ?? '',
      });
      setPanel(null);
      setView(back.view);
      const words = action?.kind === 'player' && !action.payload.roll ? action.payload.text : '';
      if (words.trim() && !draft.trim() && parseBlocks(words).every((b) => b.kind === 'prose')) {
        setDraft(routeId, words);
      }
      const kept = back.view.routes.find((r) => r.id === back.keptRouteId);
      setSaveStatus(
        t('Turn taken back {time}. It is kept in Routes as “{route}”.', {
          time: timeNow(),
          route: routeName(kept?.label ?? ''),
        }),
      );
    });

  /** New words for the latest reply, in place. Throws so the editor can show it. */
  const editReply = async (eventId: string, text: string) => {
    if (!view) return;
    setError(null);
    try {
      const v = await commands.editReply({
        storyId: view.story.id,
        routeId: view.route.id,
        expectedHeadId: view.route.headEventId ?? '',
        assistantEventId: eventId,
        text,
      });
      setView(v);
      setSaveStatus(t('Reply changed {time}', { time: timeNow() }));
      setBookmarksReload((n) => n + 1);
    } catch (e) {
      if (e instanceof CommandError && e.code === 'HEAD_CHANGED') setReload((n) => n + 1);
      throw e;
    }
  };

  const openNote = () => {
    setNoteText(view?.state.state.narration?.storytellerNote ?? '');
    setPanel('note');
  };

  /** Keep a note to the storyteller from now on, or remove it (null). */
  const saveNote = (text: string | null) =>
    view &&
    run(async () => {
      const narration = view.state.state.narration;
      const words = text?.trim() ?? '';
      const v = await commands.editStoryDetails({
        storyId: view.story.id,
        routeId: view.route.id,
        expectedHeadId: view.state.headEventId,
        changes: [
          {
            op: 'setNarration',
            narration: { ...narration, storytellerNote: words || undefined },
          },
        ],
        note: words ? t('note to the storyteller') : t('note to the storyteller removed'),
      });
      setView(v);
      setPanel(null);
      setSaveStatus(
        words
          ? t('Note to the storyteller kept {time}', { time: timeNow() })
          : t('Note to the storyteller removed {time}', { time: timeNow() }),
      );
    });

  /** Open Story memory with a new note holding the words picked in the story. */
  const rememberThis = (words: string) => {
    setRemember(words);
    setPanel('memory');
  };

  const quickSave = useCallback(() => {
    if (!view) return;
    void run(async () => {
      await commands.quickSave({ storyId: view.story.id, routeId: view.route.id });
      setSaveStatus(t('Quick-saved {time}', { time: timeNow() }));
    });
  }, [run, view]);

  /** Take back the memory notes one reply wrote. */
  const undoNotes = (eventId: string) =>
    run(async () => {
      if (!view) return;
      const reply = view.history.find((e) => e.id === eventId);
      const s = view.state.state;
      const names =
        reply?.kind === 'assistant'
          ? [
              ...standingNotes(reply.payload.text, s.notes ?? []).map((c) => c.name),
              ...standingThreads(reply.payload.text, {
                open: s.openThreads,
                done: s.doneThreads ?? [],
              }).map((c) => c.text),
              ...standingBonds(reply.payload.text, s).map((c) => c.name),
            ]
          : [];
      const v = await commands.undoReplyNotes({
        storyId: view.story.id,
        routeId: view.route.id,
        expectedHeadId: view.state.headEventId,
        assistantEventId: eventId,
        note: names.length ? t('took back {names}', { names: joinList(names) }) : null,
      });
      setView(v);
      setSaveStatus(t('Memory changed {time}', { time: timeNow() }));
    });

  /** Adds someone a reply brought in to the cast; throws when that fails. */
  const addToCast = async (c: NewCharacter, portrait: boolean) => {
    if (!view) return;
    const characterId = newcomerId(view.state.state);
    try {
      const v = await commands.editStoryDetails({
        storyId: view.story.id,
        routeId: view.route.id,
        expectedHeadId: view.state.headEventId,
        changes: joinCast(view.state.state, c, characterId),
        note: t('added {name} to the cast', { name: c.name.trim() }),
      });
      setView(v);
      setSaveStatus(t('{name} joined the cast {time}', { name: c.name.trim(), time: timeNow() }));
      if (portrait) void makeNewcomerPortrait(v, characterId);
    } catch (e) {
      if (e instanceof CommandError && e.code === 'HEAD_CHANGED') setReload((n) => n + 1);
      throw e;
    }
  };

  const toggleBookmark = async (eventId: string) => {
    if (!view) return;
    setError(null);
    try {
      const existing = bookmarks.find((b) => b.eventId === eventId);
      if (existing) {
        await commands.deleteBookmark(view.story.id, existing.id);
        setSaveStatus(t('Bookmark removed {time}', { time: timeNow() }));
      } else {
        await commands.addBookmark({ storyId: view.story.id, routeId: view.route.id, eventId });
        setSaveStatus(t('Bookmarked {time}', { time: timeNow() }));
      }
      setBookmarksReload((n) => n + 1);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const openDetails = (tab: DetailsTab = 'characters') => {
    setDetailsTab(tab);
    setPanel('details');
  };

  /** Close any panel or save view and show this place in the story. */
  const goTo = (eventId: string) => {
    setViewing(null);
    setPanel(null);
    setFocus((f) => ({ eventId, n: (f?.n ?? 0) + 1 }));
  };

  const branchFrom = (eventId: string) =>
    view &&
    run(async () => {
      goToRoute(
        await commands.forkRoute({ storyId: view.story.id, routeId: view.route.id, eventId }),
      );
    });

  // Story shortcuts (the list is in app/shortcuts.ts). Ctrl/Cmd ones work
  // while typing too; with the pause menu open they switch to their window,
  // and with any other window open only Quick save works. Escape opens the
  // pause menu (windows handle their own Escape first) and Up/Down scroll.
  const onKey = useRef<(e: KeyboardEvent) => void>(() => undefined);
  // Updated as each render commits, so a key pressed right after the story
  // loads already sees it.
  useLayoutEffect(() => {
    onKey.current = (e: KeyboardEvent) => {
      if (isComposing(e) || e.defaultPrevented || !view) return;
      // The Keyboard shortcuts window or the palette is on top: leave the story alone.
      if (useShortcutHelp.getState().open || usePalette.getState().open) return;
      const did = (fn?: () => void) => {
        e.preventDefault();
        fn?.();
      };
      if (isShortcut(e, 'quickSave')) return did(quickSave);
      if (panel && panel !== 'menu') return;
      const waiting = busy || awaitingReply || writing;
      if (isShortcut(e, 'search')) return did(() => setPanel('search'));
      if (isShortcut(e, 'saves')) return did(() => setPanel('saves'));
      if (isShortcut(e, 'routes')) return did(() => setPanel('routes'));
      if (isShortcut(e, 'memory')) return did(() => setPanel('memory'));
      if (isShortcut(e, 'details')) return did(() => !awaitingReply && !writing && openDetails());
      if (isShortcut(e, 'takeBack')) return did(() => canTakeBack && void takeBack());
      if (isShortcut(e, 'endChapter')) return did(() => !waiting && !viewing && setPanel('end'));
      if (isShortcut(e, 'pictures')) {
        const pictures = usePictureView.getState();
        return did(() => pictures.setShown(!pictures.shown));
      }
      if (isShortcut(e, 'larger')) return did(() => stepTextSize(1));
      if (isShortcut(e, 'smaller')) return did(() => stepTextSize(-1));
      if (isShortcut(e, 'bookmark')) {
        const latest = viewing
          ? undefined
          : [...view.history].reverse().find((x) => x.kind === 'assistant');
        return did(() => latest && void toggleBookmark(latest.id));
      }
      if (isShortcut(e, 'latest')) {
        return did(() => {
          setPanel(null);
          setViewing(null);
          // After the windows close and the action box is back.
          requestAnimationFrame(() => {
            const el = narrativeHost.current?.querySelector<HTMLElement>('.narrative');
            if (el) el.scrollTop = el.scrollHeight;
            document.getElementById('composer-input')?.focus();
          });
        });
      }
      if (panel) return;
      if (isShortcut(e, 'menu')) return did(() => (viewing ? setViewing(null) : setPanel('menu')));
      if (isShortcut(e, 'scroll') && !isEditableTarget(e.target)) {
        const el = narrativeHost.current?.querySelector<HTMLElement>('.narrative');
        if (el) did(() => el.scrollBy({ top: e.key === 'ArrowDown' ? 80 : -80 }));
      }
    };
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey.current(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  // The command palette offers this story's chapters and windows; it reads
  // them when it opens, so they follow the story as it changes.
  useLayoutEffect(() => {
    paletteSources.set('reader', () => {
      if (!view) return [];
      const group = t('In this story');
      const waiting = busy || awaitingReply || writing;
      const open = (p: Exclude<Panel, null>) => () => {
        setViewing(null);
        setPanel(p);
      };
      const latestReply = view.history.findLast((e) => e.kind === 'assistant');
      return [
        ...view.chapters.map((c) => ({
          id: `chapter:${c.eventId}`,
          group,
          label: chapterHeading(c.ordinal, c.title),
          keywords: t('Chapter {n}', { n: c.ordinal }),
          icon: BookOpenText,
          run: () => goTo(c.eventId),
        })),
        { id: 'p:menu', group, label: t('Pause menu'), icon: Menu, run: open('menu') },
        {
          id: 'p:saves',
          group,
          label: t('Save / Load'),
          icon: ArchiveRestore,
          keys: 'saves' as const,
          run: open('saves'),
        },
        {
          id: 'p:quick',
          group,
          label: t('Quick save'),
          icon: Save,
          keys: 'quickSave' as const,
          run: quickSave,
        },
        {
          id: 'p:routes',
          group,
          label: t('Routes'),
          icon: GitBranch,
          keys: 'routes' as const,
          run: open('routes'),
        },
        {
          id: 'p:chapters',
          group,
          label: t('Replay a chapter…'),
          icon: ListOrdered,
          run: open('chapters'),
        },
        {
          id: 'p:search',
          group,
          label: t('Story search'),
          icon: Search,
          keys: 'search' as const,
          run: open('search'),
        },
        ...(waiting
          ? []
          : [
              {
                id: 'p:details',
                group,
                label: t('Story details'),
                icon: UserRoundPen,
                keys: 'details' as const,
                run: () => openDetails(),
              },
              {
                id: 'p:end',
                group,
                label: t('End chapter'),
                icon: BookMarked,
                keys: 'endChapter' as const,
                run: open('end'),
              },
            ]),
        {
          id: 'p:memory',
          group,
          label: t('Story memory'),
          icon: Brain,
          keys: 'memory' as const,
          run: open('memory'),
        },
        ...(view.state.state.tracking
          ? [
              {
                id: 'p:inventory',
                group,
                label: t('Status and inventory'),
                icon: Backpack,
                run: open('inventory'),
              },
            ]
          : []),
        { id: 'p:pictures', group, label: t('Pictures'), icon: Images, run: open('pictures') },
        {
          id: 'p:storyteller',
          group,
          label: t('Storyteller'),
          icon: Feather,
          run: open('storyteller'),
        },
        {
          id: 'p:context',
          group,
          label: t('Preview context'),
          icon: ScanText,
          run: open('context'),
        },
        { id: 'p:export', group, label: t('Export…'), icon: Download, run: open('export') },
        {
          id: 'p:tips',
          group,
          label: t('Show the first-time tips again'),
          icon: Lightbulb,
          run: () => useTour.getState().start(),
        },
        ...(latestReply && canReadAloud()
          ? [
              {
                id: 'p:read',
                group,
                label: t('Read the latest reply aloud'),
                icon: Volume2,
                run: () =>
                  useReadAloud
                    .getState()
                    .read(
                      latestReply.id,
                      latestReply.kind === 'assistant' ? plainText(latestReply.payload.text) : '',
                      speechLang(view.state.state.narration?.language),
                    ),
              },
            ]
          : []),
      ];
    });
  });
  useEffect(() => () => void paletteSources.delete('reader'), []);

  useStoryLook(view?.story.id ?? null, view?.state.state.narration?.genres);

  if (!view) {
    return (
      <section className="screen">
        {error ? (
          <>
            <p role="alert" className="error">
              {error}
            </p>
            <button type="button" onClick={() => navigate({ name: 'library' })}>
              {t('Back to library')}
            </button>
          </>
        ) : (
          <p className="muted">{t('Loading story…')}</p>
        )}
      </section>
    );
  }

  const lastRun = view.awaitingReply?.lastRun ?? null;
  const failCode = replyError ? replyError.code : (lastRun?.errorCode ?? null);
  const showBudget =
    budget !== null && budget.policy.enabled && budget.level !== 'none' && !budget.dismissed;
  const chapter = view.state.activeChapter;
  const player = view.state.state.characters[view.state.state.playerCharacterId];
  const events = viewing ? viewing.history : view.history;
  const portraitOf = portraitFinder(view);
  const colorOf = nameColorFinder(view);
  const diceRules = view.state.state.narration?.diceRules ?? NO_RULES;
  // Where and when: the scene as the story keeps it, which follows the
  // storyteller's scene marks (and what the player set in Story details).
  const sceneNow = (viewing ?? view).state.state.scene;
  const scene = { place: sceneNow.location.trim(), time: sceneNow.time?.trim() ?? '' };
  const typist = stream ? texting(stream.text, player?.name ?? '') : null;
  const visibleRoutes = view.routes.filter((r) => !r.hidden).length;

  // Portraits and name colours reach the story and the panels over it.
  return (
    <PortraitsContext.Provider value={portraitOf}>
      <NameColorsContext.Provider value={colorOf}>
        <section
          className="reader"
          aria-label={t('Reading {title}', { title: view.story.title })}
          style={{
            fontSize: `${textSize}rem`,
            ...readingStyle({ width: readingWidth, spacing: lineSpacing }),
          }}
        >
          <header className="reader-status">
            <div className="reader-heading">
              <h1 className="reader-title">{view.story.title}</h1>
              <div className="reader-meta">
                {chapter && (
                  <MenuButton
                    label={t('Go to a chapter')}
                    className="reader-chapter chapter-jump"
                    items={[
                      ...view.chapters.map((c) => ({
                        label: chapterHeading(c.ordinal, c.title),
                        icon:
                          c.eventId === chapter.eventId ? (
                            <Check className="menu-icon" aria-hidden={true} size={16} />
                          ) : (
                            <span className="menu-icon menu-icon-space" aria-hidden="true" />
                          ),
                        onSelect: () => goTo(c.eventId),
                      })),
                      {
                        label: t('Replay a chapter…'),
                        icon: <ListOrdered className="menu-icon" aria-hidden={true} size={16} />,
                        onSelect: () => setPanel('chapters'),
                      },
                    ]}
                  >
                    <span>
                      {chapterHasTitle(chapter.ordinal, chapter.title) ? (
                        tr('Chapter {n}: {title}', {
                          n: chapter.ordinal,
                          title: <strong>{chapter.title}</strong>,
                        })
                      ) : (
                        <strong>{t('Chapter {n}', { n: chapter.ordinal })}</strong>
                      )}
                    </span>
                    <ChevronDown className="chapter-jump-icon" aria-hidden={true} size={14} />
                  </MenuButton>
                )}
                <span>
                  {tr('Route: {label}', {
                    label: <strong data-testid="route-label">{routeName(view.route.label)}</strong>,
                  })}
                </span>
              </div>
            </div>
            {(scene.place || scene.time) && (
              <button
                type="button"
                className="scene-chip"
                disabled={awaitingReply || writing || !!viewing}
                onClick={() => openDetails('scene')}
                // The whole place and time, which the chip may cut short.
                title={`${joinList([scene.place, scene.time].filter(Boolean))}\n${
                  awaitingReply || writing
                    ? t('Story details can change once the waiting action has its reply.')
                    : t('Where and when the story is. Click to correct it.')
                }`}
              >
                <MapPin className="scene-chip-icon" aria-hidden={true} size={15} />
                <span className="scene-place">{scene.place}</span>
                {scene.place && scene.time && <span aria-hidden="true">·</span>}
                {scene.time && <span className="scene-time">{scene.time}</span>}
              </button>
            )}
            <div className="reader-meta reader-controls">
              <button
                type="button"
                className="chip chip-button"
                onClick={() => setPanel('storyteller')}
                title={
                  view.storyteller.profileId
                    ? t('Replies come from {name} ({model}). Click to change it for this story.', {
                        name: view.storyteller.label,
                        model: view.storyteller.modelId ?? '',
                      })
                    : t(
                        'Replies come from the built-in offline storyteller. Click to choose another for this story.',
                      )
                }
              >
                {tKnown(view.storyteller.label)}
              </button>
              <span
                className="chip save-chip"
                role="status"
                aria-live="polite"
                title={writing || busy ? undefined : saveStatus}
              >
                {writing ? t('Writing…') : busy ? t('Working…') : saveStatus}
              </span>
              <button
                type="button"
                onClick={() => setPanel('menu')}
                title={withKeys(t('Pause menu'), 'menu')}
                aria-keyshortcuts={ariaKeys('menu')}
              >
                <Menu className="btn-icon" aria-hidden={true} />
                {t('Menu')}
              </button>
            </div>
          </header>

          {showBudget && (
            <div
              className={`budget-banner ${budget.level}`}
              role="region"
              aria-label={t('Monthly budget')}
            >
              <p>
                {joinSentences([
                  budget.level === 'reached'
                    ? t("You've reached your monthly budget: about {spent} of {limit}.", {
                        spent: formatUsd(budget.spentMicroUsd),
                        limit: formatUsd(budget.limitMicroUsd ?? 0),
                      })
                    : t(
                        "You've used {percent}% of your monthly budget: about {spent} of {limit}.",
                        {
                          percent: budget.percent ?? 0,
                          spent: formatUsd(budget.spentMicroUsd),
                          limit: formatUsd(budget.limitMicroUsd ?? 0),
                        },
                      ),
                  budget.paused
                    ? t('New paid replies are paused; local and offline storytellers still work.')
                    : '',
                ])}
              </p>
              <div className="button-row">
                <button type="button" onClick={() => navigate({ name: 'usage' })}>
                  {t('Usage & budget')}
                </button>
                <button type="button" onClick={dismissBudget}>
                  {t('Dismiss for this month')}
                </button>
              </div>
            </div>
          )}

          {viewing && (
            <div className="view-banner" role="region" aria-label={t('Viewing a save')}>
              <span>
                {tr('Viewing save {label} (read-only).', {
                  label: <strong>{saveName(viewing.save.label)}</strong>,
                })}
              </span>
              <div className="button-row">
                <button
                  type="button"
                  className="primary"
                  onClick={() =>
                    void run(async () => goToRoute(await commands.resumeSave(viewing.save.id)))
                  }
                >
                  {viewing.save.isRouteHead ? t('Continue') : t('Continue as new branch')}
                </button>
                <button type="button" onClick={() => setViewing(null)}>
                  {t('Back to current')}
                </button>
              </div>
            </div>
          )}

          {!viewing && <ScenePictures view={view} events={events} draft={stream?.text} />}

          <div ref={narrativeHost} className="reader-body">
            <DiceRulesContext.Provider value={diceRules}>
              <NarrativeView
                events={events}
                draft={viewing ? null : stream}
                playerName={player?.name ?? t('You')}
                onBranch={viewing ? undefined : (id) => void branchFrom(id)}
                onRegenerate={viewing || writing || busy ? undefined : openRegenerate}
                editableReplyId={viewing || writing || busy ? undefined : editableReplyId}
                onEditReply={editReply}
                takeBackId={canTakeBack ? takeBackId : undefined}
                onTakeBack={() => void takeBack()}
                onRemember={viewing || writing || awaitingReply ? undefined : rememberThis}
                onEditAction={
                  viewing || writing || busy
                    ? undefined
                    : (id) => openEdit(view.history.find((x) => x.id === id))
                }
                onBookmark={viewing ? undefined : (id) => void toggleBookmark(id)}
                bookmarked={viewing ? undefined : bookmarked}
                focus={viewing ? null : focus}
                onRoll={
                  viewing || busy || writing || awaitingReply
                    ? undefined
                    : (req) => void send('', req, false)
                }
                keepsNotes={!view.state.state.narration?.manualMemory}
                currentNotes={view.state.state.notes ?? []}
                currentThreads={{
                  open: view.state.state.openThreads,
                  done: view.state.state.doneThreads ?? [],
                }}
                currentState={view.state.state}
                sceneHeadings={!!view.state.state.narration?.sceneHeadings}
                speechLang={speechLang(view.state.state.narration?.language)}
                ideasShown={ideas.length > 0}
                newcomers={
                  viewing || writing || busy || awaitingReply
                    ? undefined
                    : {
                        storyId: view.story.id,
                        cast: Object.values(view.state.state.characters).map((c) => c.name),
                        adultsOnly: view.state.state.narration?.rating === 'explicit',
                        painter,
                        onAdd: addToCast,
                      }
                }
                onOpenNotes={viewing ? undefined : () => setPanel('memory')}
                onUndoNotes={
                  viewing || writing || busy || awaitingReply
                    ? undefined
                    : (id) => void undoNotes(id)
                }
                intro={
                  viewing
                    ? undefined
                    : {
                        premise: view.story.description,
                        location: view.state.state.scene.location,
                        scene: view.state.state.scene.summary,
                      }
                }
              />
            </DiceRulesContext.Provider>
            <ReaderRail storyId={view.story.id} genres={view.state.state.narration?.genres} />
          </div>

          {error && (
            <p role="alert" className="error reader-error">
              {error}
            </p>
          )}

          {!viewing && (
            <div className="reader-bottom">
              {writing && (
                <div className="reply-bar" role="region" aria-label={t('Reply in progress')}>
                  <span className="muted small typing-line">
                    <span className="typing-dots" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                    {typist
                      ? t('{name} is typing…', { name: typist })
                      : t('{name} is writing…', { name: tKnown(view.storyteller.label) })}
                  </span>
                  <button type="button" onClick={cancelReply}>
                    {t('Stop')}
                  </button>
                </div>
              )}
              {awaitingReply && !writing && (
                <div className="reply-bar" role="region" aria-label={t('Reply needed')}>
                  <p className={replyError || lastRun ? 'error small' : 'small'}>
                    {joinSentences([
                      replyError?.text ??
                        (lastRun
                          ? runErrorMessage(lastRun.errorCode)
                          : t('This action has no reply yet.')),
                      lastRun?.status === 'interrupted' && !replyError
                        ? t('If it had reached the AI service, it may still have cost a little.')
                        : '',
                    ])}
                  </p>
                  <div className="button-row">
                    <button type="button" className="primary" onClick={() => void retry()}>
                      {lastRun ? t('Retry') : t('Write a reply')}
                    </button>
                    {failCode === 'BUDGET_OVERRIDE_REQUIRED' && (
                      <button type="button" onClick={() => void retry(true)}>
                        {t('Send once without a price')}
                      </button>
                    )}
                    {(failCode === 'BUDGET_PAUSED' || failCode === 'BUDGET_OVERRIDE_REQUIRED') && (
                      <button type="button" onClick={() => navigate({ name: 'usage' })}>
                        {t('Usage & budget')}
                      </button>
                    )}
                    <button type="button" onClick={() => openEdit()}>
                      {t('Change action')}
                    </button>
                  </div>
                </div>
              )}
              <Tour hidden={!!panel || writing || awaitingReply} />
              {view.state.state.tracking && (
                <TrackerHud
                  tracking={view.state.state.tracking}
                  onOpen={() => setPanel('inventory')}
                />
              )}
              <Composer
                value={draft}
                onChange={(text) => setDraft(routeId, text)}
                onSubmit={(text, roll, options) => void send(text, roll, true, options)}
                note={view.state.state.narration?.storytellerNote}
                onNote={awaitingReply || writing ? undefined : openNote}
                disabled={busy || awaitingReply || writing}
                ideas={ideas}
                placeholder={t('What do you do? (Enter to send, Shift+Enter for a new line)')}
                playerName={player?.name ?? t('You')}
                dice={!!view.state.state.narration?.dice}
                diceRules={diceRules}
                stats={player?.stats}
                contacts={Object.values(view.state.state.characters)
                  .filter((c) => c.control !== 'player')
                  .map((c) => c.name)}
                tools={
                  <div className="tool-bar" role="toolbar" aria-label={t('Story tools')}>
                    <ToolButton
                      icon={Save}
                      label={t('Quick save')}
                      title={withKeys(t('Quick save'), 'quickSave')}
                      keys={ariaKeys('quickSave')}
                      onClick={quickSave}
                      disabled={busy}
                    />
                    <ToolButton
                      icon={ArchiveRestore}
                      label={t('Save / Load')}
                      title={withKeys(t('Save / Load'), 'saves')}
                      keys={ariaKeys('saves')}
                      onClick={() => setPanel('saves')}
                    />
                    <ToolButton
                      icon={BookMarked}
                      label={t('End chapter')}
                      title={withKeys(
                        t('Recap this chapter, save, and start the next one'),
                        'endChapter',
                      )}
                      keys={ariaKeys('endChapter')}
                      onClick={() => setPanel('end')}
                      disabled={busy || awaitingReply || writing}
                    />
                    <ToolButton
                      icon={GitBranch}
                      label={t('Routes ({n})', { n: visibleRoutes })}
                      title={withKeys(t('Routes ({n})', { n: visibleRoutes }), 'routes')}
                      keys={ariaKeys('routes')}
                      onClick={() => setPanel('routes')}
                      badge={visibleRoutes}
                    />
                    <ToolButton
                      icon={StickyNote}
                      label={t('Note to the storyteller')}
                      title={t('A note to the storyteller about the story, kept out of it')}
                      keys={undefined}
                      onClick={openNote}
                      disabled={busy || awaitingReply || writing}
                    />
                    <ToolButton
                      icon={Search}
                      label={t('Search')}
                      title={withKeys(t('Search this route and its bookmarks'), 'search')}
                      keys={ariaKeys('search')}
                      onClick={() => setPanel('search')}
                    />
                  </div>
                }
              />
            </div>
          )}

          {panel && (
            <Dialog
              key={panel}
              title={t(PANEL_TITLES[panel])}
              sheet={SHEETS.has(panel)}
              wide={
                panel === 'context' ||
                panel === 'details' ||
                panel === 'pictures' ||
                panel === 'memory' ||
                panel === 'end'
              }
              onClose={() => {
                setRemember(null);
                setPanel(
                  panel === 'menu' ||
                    panel === 'edit' ||
                    panel === 'note' ||
                    panel === 'end' ||
                    panel === 'storyteller' ||
                    panel === 'inventory' ||
                    !fromMenu.current
                    ? null
                    : 'menu',
                );
              }}
              initialFocusId={
                panel === 'menu'
                  ? 'pause-resume'
                  : panel === 'edit'
                    ? 'edit-action-input'
                    : panel === 'regenerate'
                      ? 'regenerate-confirm'
                      : panel === 'search'
                        ? 'search-input'
                        : panel === 'note'
                          ? 'storyteller-note-input'
                          : panel === 'memory' && remember
                            ? REMEMBER_NAME_ID
                            : undefined
              }
            >
              {panel === 'menu' && (
                <nav className="menu-list pause-grid" aria-label={t('Pause menu')}>
                  <button
                    id="pause-resume"
                    type="button"
                    data-wide=""
                    onClick={() => setPanel(null)}
                  >
                    <Play {...MENU_ICON} />
                    {t('Resume')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void takeBack()}
                    disabled={!canTakeBack}
                    aria-describedby={canTakeBack ? undefined : 'take-back-hint'}
                    aria-keyshortcuts={ariaKeys('takeBack')}
                  >
                    <Undo2 {...MENU_ICON} />
                    {t('Take back my last turn')}
                    <KeyHint id="takeBack" />
                  </button>
                  <button
                    type="button"
                    onClick={openNote}
                    disabled={awaitingReply || writing}
                    aria-describedby={awaitingReply || writing ? 'details-hint' : undefined}
                  >
                    <StickyNote {...MENU_ICON} />
                    {t('Note to the storyteller')}
                  </button>
                  {!canTakeBack && (
                    <p id="take-back-hint" className="muted small" data-wide="">
                      {writing || view.awaitingReply?.activeRun
                        ? t('A turn can be taken back once its reply is written or stopped.')
                        : t(
                            'Nothing to take back in this chapter. Use Chapters or Routes to go further back.',
                          )}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => setPanel('saves')}
                    aria-keyshortcuts={ariaKeys('saves')}
                  >
                    <ArchiveRestore {...MENU_ICON} />
                    {t('Save / Load')}
                    <KeyHint id="saves" />
                  </button>
                  <button type="button" onClick={() => setPanel('chapters')}>
                    <ListOrdered {...MENU_ICON} />
                    {t('Chapters')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPanel('routes')}
                    aria-keyshortcuts={ariaKeys('routes')}
                  >
                    <GitBranch {...MENU_ICON} />
                    {t('Routes')}
                    <KeyHint id="routes" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPanel('search')}
                    aria-keyshortcuts={ariaKeys('search')}
                  >
                    <Search {...MENU_ICON} />
                    {t('Story search')}
                    <KeyHint id="search" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openDetails()}
                    disabled={awaitingReply || writing}
                    aria-describedby={awaitingReply || writing ? 'details-hint' : undefined}
                    aria-keyshortcuts={ariaKeys('details')}
                  >
                    <UserRoundPen {...MENU_ICON} />
                    {t('Story details')}
                    <KeyHint id="details" />
                  </button>
                  {(awaitingReply || writing) && (
                    <p id="details-hint" className="muted small" data-wide="">
                      {t('Story details can change once the waiting action has its reply.')}
                    </p>
                  )}
                  {view.state.state.tracking && (
                    <button type="button" onClick={() => setPanel('inventory')}>
                      <Backpack {...MENU_ICON} />
                      {t('Status and inventory')}
                    </button>
                  )}
                  <button type="button" onClick={() => setPanel('pictures')}>
                    <Images {...MENU_ICON} />
                    {t('Pictures')}
                  </button>
                  <button type="button" onClick={() => setPanel('storyteller')}>
                    <Feather {...MENU_ICON} />
                    {t('Storyteller')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPanel('memory')}
                    aria-keyshortcuts={ariaKeys('memory')}
                  >
                    <Brain {...MENU_ICON} />
                    {t('Story memory')}
                    <KeyHint id="memory" />
                  </button>
                  <button type="button" onClick={() => setPanel('context')}>
                    <ScanText {...MENU_ICON} />
                    {t('Preview context')}
                  </button>
                  <button type="button" onClick={() => setPanel('export')}>
                    <Download {...MENU_ICON} />
                    {t('Export…')}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate({ name: 'settings' })}
                    aria-keyshortcuts={ariaKeys('settings')}
                  >
                    <Settings {...MENU_ICON} />
                    {t('Settings')}
                    <KeyHint id="settings" />
                  </button>
                  <button
                    type="button"
                    onClick={() => useShortcutHelp.getState().setOpen(true)}
                    aria-keyshortcuts={ariaKeys('help')}
                  >
                    <Keyboard {...MENU_ICON} />
                    {t('Keyboard shortcuts')}
                    <KeyHint id="help" />
                  </button>
                  <button type="button" onClick={() => navigate({ name: 'diagnostics' })}>
                    <Stethoscope {...MENU_ICON} />
                    {t('Diagnostics')}
                  </button>
                  <div className="button-row" data-wide="">
                    <span>
                      <Type {...MENU_ICON} />
                      {t('Text size')}
                    </span>
                    <button
                      type="button"
                      aria-label={t('Smaller text')}
                      title={withKeys(t('Smaller text'), 'smaller')}
                      aria-keyshortcuts={ariaKeys('smaller')}
                      onClick={() => stepTextSize(-1)}
                    >
                      A−
                    </button>
                    <button
                      type="button"
                      aria-label={t('Larger text')}
                      title={withKeys(t('Larger text'), 'larger')}
                      aria-keyshortcuts={ariaKeys('larger')}
                      onClick={() => stepTextSize(1)}
                    >
                      A+
                    </button>
                  </div>
                  <button type="button" data-wide="" onClick={() => navigate({ name: 'library' })}>
                    <LibraryBig {...MENU_ICON} />
                    {t('Back to library')}
                  </button>
                </nav>
              )}
              {panel === 'saves' && (
                <SavesPanel
                  storyId={view.story.id}
                  routeId={view.route.id}
                  suggestedName={placeName(view)}
                  onSaved={(s) =>
                    setSaveStatus(
                      t('Saved "{label}" {time}', { label: saveName(s.label), time: timeNow() }),
                    )
                  }
                  onView={(saveId) =>
                    void run(async () => {
                      setViewing(await commands.viewSave(saveId));
                      setPanel(null);
                    })
                  }
                  onResume={(saveId) =>
                    void run(async () => goToRoute(await commands.resumeSave(saveId)))
                  }
                />
              )}
              {panel === 'routes' && (
                <RoutesPanel
                  storyId={view.story.id}
                  currentRouteId={view.route.id}
                  routes={view.routes}
                  onSwitch={(id) => {
                    setPanel(null);
                    navigate({ name: 'reader', routeId: id });
                  }}
                  onChanged={() => setReload((n) => n + 1)}
                />
              )}
              {panel === 'chapters' && (
                <ChaptersPanel
                  chapters={view.chapters}
                  activeEventId={chapter?.eventId ?? null}
                  onRestart={(chapterEventId) =>
                    void run(async () =>
                      goToRoute(
                        await commands.restartChapter({
                          storyId: view.story.id,
                          routeId: view.route.id,
                          chapterEventId,
                        }),
                      ),
                    )
                  }
                />
              )}
              {panel === 'context' && <ContextPreviewPanel routeId={view.route.id} />}
              {panel === 'end' && (
                <EndChapterPanel
                  view={view}
                  onCancel={() => setPanel(null)}
                  onEnded={(v, saveLabel) => {
                    setView(v);
                    setPanel(null);
                    setSaveStatus(
                      t('Saved "{label}" {time}', { label: saveLabel, time: timeNow() }),
                    );
                  }}
                />
              )}
              {panel === 'export' && <ExportPanel view={view} />}
              {panel === 'search' && (
                <SearchPanel
                  storyId={view.story.id}
                  routeId={view.route.id}
                  routeLabel={routeName(view.route.label)}
                  playerName={player?.name ?? t('You')}
                  last={lastSearch}
                  onSearched={setLastSearch}
                  bookmarks={bookmarks}
                  onBookmarksChanged={() => setBookmarksReload((n) => n + 1)}
                  onGo={goTo}
                />
              )}
              {panel === 'pictures' && (
                <PicturesPanel
                  view={view}
                  awaitingReply={awaitingReply || writing}
                  onChanged={(v, status) => {
                    setView(v);
                    setSaveStatus(t('{status} {time}', { status, time: timeNow() }));
                  }}
                />
              )}
              {panel === 'inventory' && (
                <InventoryPanel
                  view={view}
                  detailsDisabled={awaitingReply || writing}
                  onOpenDetails={() => openDetails()}
                  onChanged={(v, status) => {
                    setView(v);
                    setSaveStatus(t('{status} {time}', { status, time: timeNow() }));
                  }}
                />
              )}
              {panel === 'storyteller' && (
                <StorytellerPanel
                  storyId={view.story.id}
                  current={view.storyteller}
                  onChanged={(info) => {
                    setView((v) => (v ? { ...v, storyteller: info } : v));
                    setSaveStatus(
                      t('Storyteller: {name} {time}', {
                        name: tKnown(info.label),
                        time: timeNow(),
                      }),
                    );
                  }}
                  onOpenSettings={() => navigate({ name: 'settings' })}
                  onOpenMemory={() => setPanel('memory')}
                />
              )}
              {panel === 'memory' && (
                <StoryMemoryPanel
                  view={view}
                  startNote={remember}
                  playerName={player?.name ?? t('You')}
                  detailsDisabled={awaitingReply || writing}
                  onChanged={(v) => {
                    setView(v);
                    setSaveStatus(t('Memory changed {time}', { time: timeNow() }));
                  }}
                  onOpenDetails={() => openDetails()}
                  onOpenStoryteller={() => setPanel('storyteller')}
                />
              )}
              {panel === 'details' && (
                <StoryDetailsPanel
                  view={view}
                  initialTab={detailsTab}
                  playerName={player?.name ?? t('You')}
                  onCancel={() => setPanel(null)}
                  onApplied={(v) => {
                    setView(v);
                    setPanel(null);
                    setSaveStatus(t('Story details changed {time}', { time: timeNow() }));
                  }}
                />
              )}
              {panel === 'regenerate' && target?.kind === 'assistant' && (
                <div className="panel form">
                  <p>
                    {tr(
                      'The storyteller writes a different reply to {action} on a {newRoute}. {route} keeps this reply and everything after it.',
                      {
                        action: (() => {
                          const a = answered(target);
                          return a?.kind === 'player' && plainText(a.payload.text).trim() ? (
                            <q>{plainText(a.payload.text)}</q>
                          ) : a?.kind === 'player' && !a.payload.roll ? (
                            <q>{t('Keep going')}</q>
                          ) : (
                            t('your action')
                          );
                        })(),
                        newRoute: <strong>{t('new route')}</strong>,
                        route: <strong>{routeName(view.route.label)}</strong>,
                      },
                    )}
                  </p>
                  <fieldset className="field">
                    <legend>{t('Length')}</legend>
                    <div className="segmented">
                      {LENGTHS.map((l) => (
                        <label key={l.value}>
                          <input
                            type="radio"
                            name="regenerate-length"
                            checked={regen.length === l.value}
                            onChange={() => setRegen({ ...regen, length: l.value })}
                          />
                          <span>{t(l.label)}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="field">
                    <label htmlFor="regenerate-hint">
                      {t('What should be different? (optional)')}
                    </label>
                    <input
                      id="regenerate-hint"
                      value={regen.hint}
                      maxLength={MAX_HINT}
                      placeholder={t('For example: she says no, or more about the storm')}
                      onChange={(e) => setRegen({ ...regen, hint: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !isComposing(e)) {
                          e.preventDefault();
                          if (!busy) void submitRegenerate();
                        }
                      }}
                    />
                    <div className="hint-chips" role="group" aria-label={t('Ready-made hints')}>
                      {HINTS.map((h) => (
                        <button
                          key={h}
                          type="button"
                          className="next-move"
                          aria-pressed={regen.hint === t(h)}
                          onClick={() =>
                            setRegen({ ...regen, hint: regen.hint === t(h) ? '' : t(h) })
                          }
                        >
                          {t(h)}
                        </button>
                      ))}
                    </div>
                    <p className="muted small">
                      {t('The hint is for this reply only; it never becomes part of the story.')}
                    </p>
                  </div>
                  <div className="button-row">
                    <button type="button" onClick={() => setPanel(null)}>
                      {t('Cancel')}
                    </button>
                    <button
                      id="regenerate-confirm"
                      type="button"
                      className="primary"
                      disabled={busy}
                      onClick={() => void submitRegenerate()}
                    >
                      {t('Write another reply')}
                    </button>
                  </div>
                </div>
              )}
              {panel === 'note' && (
                <form
                  className="form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveNote(noteText);
                  }}
                >
                  <label htmlFor="storyteller-note-input">
                    {t(
                      'Tell the storyteller what you want from the story, out of character. It steers every reply from now on until you change it, and is never part of the story.',
                    )}
                  </label>
                  <textarea
                    id="storyteller-note-input"
                    value={noteText}
                    rows={4}
                    maxLength={MAX_NOTE}
                    placeholder={t(
                      'For example: let the romance build slowly, and give Mara more to say.',
                    )}
                    onChange={(e) => setNoteText(e.target.value)}
                  />
                  <p className="muted small">
                    {t('{n} of {max} characters', { n: noteText.length, max: MAX_NOTE })}
                  </p>
                  <div className="button-row">
                    <button type="button" onClick={() => setPanel(null)}>
                      {t('Cancel')}
                    </button>
                    {view.state.state.narration?.storytellerNote && (
                      <button type="button" disabled={busy} onClick={() => void saveNote(null)}>
                        {t('Remove note')}
                      </button>
                    )}
                    <button
                      type="submit"
                      className="primary"
                      disabled={
                        busy ||
                        noteText.trim() === (view.state.state.narration?.storytellerNote ?? '') ||
                        (!noteText.trim() && !view.state.state.narration?.storytellerNote)
                      }
                    >
                      {t('Keep this note')}
                    </button>
                  </div>
                </form>
              )}
              {panel === 'edit' && (
                <form
                  className="form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (editText.trim()) void submitEdit();
                  }}
                >
                  <label htmlFor="edit-action-input">
                    {target && target.id !== lastAction?.id
                      ? t(
                          'Your action. The story continues from here on a new route; {route} keeps the original and everything after it.',
                          { route: routeName(view.route.label) },
                        )
                      : t(
                          'Your action. The story continues from here on a new route; {route} keeps the original.',
                          { route: routeName(view.route.label) },
                        )}
                  </label>
                  <textarea
                    id="edit-action-input"
                    value={editText}
                    rows={4}
                    onChange={(e) => setEditText(e.target.value)}
                  />
                  <div className="button-row">
                    <button type="button" onClick={() => setPanel(null)}>
                      {t('Cancel')}
                    </button>
                    <button type="submit" className="primary" disabled={!editText.trim() || busy}>
                      {t('Send changed action')}
                    </button>
                  </div>
                </form>
              )}
            </Dialog>
          )}
        </section>
      </NameColorsContext.Provider>
    </PortraitsContext.Provider>
  );
}

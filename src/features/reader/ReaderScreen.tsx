import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  CommandError,
  commands,
  errorMessage,
  formatUsd,
  runErrorMessage,
} from '../../api/commands';
import { useUiStore } from '../../app/store';
import { isComposing, isEditableTarget } from '../../app/keyboard';
import { ariaKeys, isShortcut, useShortcutHelp, withKeys } from '../../app/shortcuts';
import { Dialog } from '../../components/Dialog';
import { KeyHint } from '../../components/KeyHint';
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
  RollRequest,
  RouteView,
  SaveView,
  SearchResults,
} from '../../types';
import { Composer } from './Composer';
import { ContextPreviewPanel } from './ContextPreviewPanel';
import { EndChapterPanel } from './EndChapterPanel';
import { ExportPanel } from './ExportPanel';
import { InventoryPanel, TrackerHud } from './InventoryPanel';
import { NarrativeView } from './NarrativeView';
import { PicturesPanel } from './PicturesPanel';
import { ReaderRail } from './ReaderRail';
import { ScenePictures } from './ScenePictures';
import { usePictureView } from './stage';
import { StoryDetailsPanel } from './StoryDetailsPanel';
import { StoryMemoryPanel } from './StoryMemoryPanel';
import { StorytellerPanel } from './StorytellerPanel';
import { plainText } from './messages';
import { PortraitsContext, portraitFinder } from './portraits';
import { DiceRulesContext } from './DiceCards';
import { intlLocale, joinSentences, msg, t, tKnown, tr } from '../../i18n';
import { chapterHasTitle, routeName, saveName } from '../../i18n/names';

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
  end: msg('End chapter'),
};

type Stream = { runId: string; text: string };

const POLL_MS = 1500;
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

  const [view, setView] = useState<RouteView | null>(null);
  const [viewing, setViewing] = useState<SaveView | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
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

  const awaitingReply = !!view?.awaitingReply;
  const writing = stream !== null;
  const lastAction = view?.history[view.history.length - 1];

  /** Send an action. A roll from a dice card leaves the typed draft alone. */
  const send = (text: string = draft, roll?: RollRequest, fromComposer = true) =>
    view &&
    run(async () => {
      const sub = await commands.submitAction({
        storyId: view.story.id,
        routeId: view.route.id,
        expectedHeadId: view.route.headEventId ?? '',
        text,
        roll,
      });
      if (fromComposer) clearDraft(routeId);
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
      const sub = await commands.regenerateReply({
        storyId: view.story.id,
        routeId: view.route.id,
        assistantEventId: target.id,
      });
      goToRoute(sub.view);
    });

  const quickSave = useCallback(() => {
    if (!view) return;
    void run(async () => {
      await commands.quickSave({ storyId: view.story.id, routeId: view.route.id });
      setSaveStatus(t('Quick-saved {time}', { time: timeNow() }));
    });
  }, [run, view]);

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
      // The Keyboard shortcuts window is on top: leave the story alone.
      if (useShortcutHelp.getState().open) return;
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
      if (isShortcut(e, 'details'))
        return did(() => !awaitingReply && !writing && setPanel('details'));
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
  const diceRules = view.state.state.narration?.diceRules ?? NO_RULES;

  return (
    <section
      className="reader"
      aria-label={t('Reading {title}', { title: view.story.title })}
      style={{ fontSize: `${textSize}rem` }}
    >
      <header className="reader-status">
        <div>
          <h1 className="reader-title">{view.story.title}</h1>
          <div className="reader-meta">
            <span>
              {tr('Route: {label}', {
                label: <strong data-testid="route-label">{routeName(view.route.label)}</strong>,
              })}
            </span>
            {chapter && (
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
            )}
          </div>
        </div>
        <div className="reader-meta">
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
          <span className="chip" role="status" aria-live="polite">
            {writing ? t('Writing…') : busy ? t('Working…') : saveStatus}
          </span>
          <button
            type="button"
            onClick={() => setPanel('menu')}
            title={withKeys(t('Pause menu'), 'menu')}
            aria-keyshortcuts={ariaKeys('menu')}
          >
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
                : t("You've used {percent}% of your monthly budget: about {spent} of {limit}.", {
                    percent: budget.percent ?? 0,
                    spent: formatUsd(budget.spentMicroUsd),
                    limit: formatUsd(budget.limitMicroUsd ?? 0),
                  }),
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
        <PortraitsContext.Provider value={portraitOf}>
          <DiceRulesContext.Provider value={diceRules}>
            <NarrativeView
              events={events}
              draft={viewing ? null : stream}
              playerName={player?.name ?? t('You')}
              onBranch={viewing ? undefined : (id) => void branchFrom(id)}
              onRegenerate={viewing || writing || busy ? undefined : openRegenerate}
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
        </PortraitsContext.Provider>
        <ReaderRail />
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
              <span className="muted small">
                {t('{name} is writing…', { name: tKnown(view.storyteller.label) })}
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
          {view.state.state.tracking && (
            <TrackerHud tracking={view.state.state.tracking} onOpen={() => setPanel('inventory')} />
          )}
          <Composer
            value={draft}
            onChange={(text) => setDraft(routeId, text)}
            onSubmit={(text, roll) => void send(text, roll)}
            disabled={busy || awaitingReply || writing}
            placeholder={t('What do you do? (Enter to send, Shift+Enter for a new line)')}
            playerName={player?.name ?? t('You')}
            dice={!!view.state.state.narration?.dice}
            diceRules={diceRules}
            stats={player?.stats}
            contacts={Object.values(view.state.state.characters)
              .filter((c) => c.control !== 'player')
              .map((c) => c.name)}
          />
          <div className="action-bar">
            <button
              type="button"
              onClick={quickSave}
              disabled={busy}
              title={withKeys(t('Quick save'), 'quickSave')}
              aria-keyshortcuts={ariaKeys('quickSave')}
            >
              {t('Quick save')}
            </button>
            <button
              type="button"
              onClick={() => setPanel('saves')}
              title={withKeys(t('Save / Load'), 'saves')}
              aria-keyshortcuts={ariaKeys('saves')}
            >
              {t('Save / Load')}
            </button>
            <button
              type="button"
              onClick={() => setPanel('end')}
              disabled={busy || awaitingReply || writing}
              title={withKeys(t('Recap this chapter, save, and start the next one'), 'endChapter')}
              aria-keyshortcuts={ariaKeys('endChapter')}
            >
              {t('End chapter')}
            </button>
            <button
              type="button"
              onClick={() => setPanel('routes')}
              title={withKeys(t('Routes'), 'routes')}
              aria-keyshortcuts={ariaKeys('routes')}
            >
              {t('Routes ({n})', { n: view.routes.filter((r) => !r.hidden).length })}
            </button>
            <button
              type="button"
              onClick={() => setPanel('search')}
              title={withKeys(t('Search this route and its bookmarks'), 'search')}
              aria-keyshortcuts={ariaKeys('search')}
            >
              {t('Search')}
            </button>
          </div>
        </div>
      )}

      {panel && (
        <Dialog
          key={panel}
          title={t(PANEL_TITLES[panel])}
          wide={
            panel === 'context' ||
            panel === 'details' ||
            panel === 'pictures' ||
            panel === 'memory' ||
            panel === 'end'
          }
          onClose={() =>
            setPanel(
              panel === 'menu' ||
                panel === 'edit' ||
                panel === 'end' ||
                panel === 'storyteller' ||
                panel === 'inventory'
                ? null
                : 'menu',
            )
          }
          initialFocusId={
            panel === 'menu'
              ? 'pause-resume'
              : panel === 'edit'
                ? 'edit-action-input'
                : panel === 'regenerate'
                  ? 'regenerate-confirm'
                  : panel === 'search'
                    ? 'search-input'
                    : undefined
          }
        >
          {panel === 'menu' && (
            <nav className="menu-list" aria-label={t('Pause menu')}>
              <button id="pause-resume" type="button" onClick={() => setPanel(null)}>
                {t('Resume')}
              </button>
              <button
                type="button"
                onClick={() => setPanel('saves')}
                aria-keyshortcuts={ariaKeys('saves')}
              >
                {t('Save / Load')}
                <KeyHint id="saves" />
              </button>
              <button type="button" onClick={() => setPanel('chapters')}>
                {t('Chapters')}
              </button>
              <button
                type="button"
                onClick={() => setPanel('routes')}
                aria-keyshortcuts={ariaKeys('routes')}
              >
                {t('Routes')}
                <KeyHint id="routes" />
              </button>
              <div className="button-row">
                <span>{t('Text size')}</span>
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
              <button
                type="button"
                onClick={() => setPanel('details')}
                disabled={awaitingReply || writing}
                aria-describedby={awaitingReply || writing ? 'details-hint' : undefined}
                aria-keyshortcuts={ariaKeys('details')}
              >
                {t('Story details')}
                <KeyHint id="details" />
              </button>
              {(awaitingReply || writing) && (
                <p id="details-hint" className="muted small">
                  {t('Story details can change once the waiting action has its reply.')}
                </p>
              )}
              {view.state.state.tracking && (
                <button type="button" onClick={() => setPanel('inventory')}>
                  {t('Status and inventory')}
                </button>
              )}
              <button type="button" onClick={() => setPanel('pictures')}>
                {t('Pictures')}
              </button>
              <button type="button" onClick={() => setPanel('storyteller')}>
                {t('Storyteller')}
              </button>
              <button
                type="button"
                onClick={() => setPanel('memory')}
                aria-keyshortcuts={ariaKeys('memory')}
              >
                {t('Story memory')}
                <KeyHint id="memory" />
              </button>
              <button
                type="button"
                onClick={() => setPanel('search')}
                aria-keyshortcuts={ariaKeys('search')}
              >
                {t('Story search')}
                <KeyHint id="search" />
              </button>
              <button type="button" onClick={() => setPanel('context')}>
                {t('Preview context')}
              </button>
              <button type="button" onClick={() => setPanel('export')}>
                {t('Export…')}
              </button>
              <button
                type="button"
                onClick={() => navigate({ name: 'settings' })}
                aria-keyshortcuts={ariaKeys('settings')}
              >
                {t('Settings')}
                <KeyHint id="settings" />
              </button>
              <button
                type="button"
                onClick={() => useShortcutHelp.getState().setOpen(true)}
                aria-keyshortcuts={ariaKeys('help')}
              >
                {t('Keyboard shortcuts')}
                <KeyHint id="help" />
              </button>
              <button type="button" onClick={() => navigate({ name: 'diagnostics' })}>
                {t('Diagnostics')}
              </button>
              <button type="button" onClick={() => navigate({ name: 'library' })}>
                {t('Back to library')}
              </button>
            </nav>
          )}
          {panel === 'saves' && (
            <SavesPanel
              storyId={view.story.id}
              routeId={view.route.id}
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
                setSaveStatus(t('Saved "{label}" {time}', { label: saveLabel, time: timeNow() }));
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
              onOpenDetails={() => setPanel('details')}
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
                  t('Storyteller: {name} {time}', { name: tKnown(info.label), time: timeNow() }),
                );
              }}
              onOpenSettings={() => navigate({ name: 'settings' })}
              onOpenMemory={() => setPanel('memory')}
            />
          )}
          {panel === 'memory' && (
            <StoryMemoryPanel
              view={view}
              playerName={player?.name ?? t('You')}
              detailsDisabled={awaitingReply || writing}
              onOpenDetails={() => setPanel('details')}
              onOpenStoryteller={() => setPanel('storyteller')}
            />
          )}
          {panel === 'details' && (
            <StoryDetailsPanel
              view={view}
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
            <div className="panel">
              <p>
                {tr(
                  'The storyteller writes a different reply to {action} on a {newRoute}. {route} keeps this reply and everything after it.',
                  {
                    action: (() => {
                      const a = answered(target);
                      return a?.kind === 'player' ? (
                        <q>{plainText(a.payload.text)}</q>
                      ) : (
                        t('your action')
                      );
                    })(),
                    newRoute: <strong>{t('new route')}</strong>,
                    route: <strong>{routeName(view.route.label)}</strong>,
                  },
                )}
              </p>
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
  );
}

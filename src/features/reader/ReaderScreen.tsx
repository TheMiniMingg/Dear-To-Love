import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CommandError,
  commands,
  errorMessage,
  formatUsd,
  runErrorMessage,
} from '../../api/commands';
import { useUiStore } from '../../app/store';
import { isComposing, isEditableTarget, isModS } from '../../app/keyboard';
import { Dialog } from '../../components/Dialog';
import { ChaptersPanel } from '../routes/ChaptersPanel';
import { RoutesPanel } from '../routes/RoutesPanel';
import { SavesPanel } from '../saves/SavesPanel';
import type { BudgetStatus, ErrorCode, RouteView, SaveView } from '../../types';
import { Composer } from './Composer';
import { ContextPreviewPanel } from './ContextPreviewPanel';
import { NarrativeView } from './NarrativeView';

type Panel = null | 'menu' | 'saves' | 'routes' | 'chapters' | 'edit' | 'context';

const PANEL_TITLES: Record<Exclude<Panel, null>, string> = {
  menu: 'Paused',
  saves: 'Save / Load',
  routes: 'Routes',
  chapters: 'Chapters',
  edit: 'Change your action',
  context: 'Preview context',
};

type Stream = { runId: string; text: string };

const POLL_MS = 1500;

function timeNow(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
  const [saveStatus, setSaveStatus] = useState<string>('All changes saved');
  const [reload, setReload] = useState(0);
  const [stream, setStream] = useState<Stream | null>(null);
  const [replyError, setReplyError] = useState<{ text: string; code: ErrorCode | null } | null>(
    null,
  );
  const [budget, setBudget] = useState<BudgetStatus | null>(null);
  const [editText, setEditText] = useState('');
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
        setSaveStatus(`Autosaved ${timeNow()}`);
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

  const send = () =>
    view &&
    run(async () => {
      const sub = await commands.submitAction({
        storyId: view.story.id,
        routeId: view.route.id,
        expectedHeadId: view.route.headEventId ?? '',
        text: draft,
      });
      clearDraft(routeId);
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

  const openEdit = () => {
    if (lastAction?.kind === 'player') setEditText(lastAction.payload.text);
    setPanel('edit');
  };

  const submitEdit = () =>
    view &&
    lastAction?.kind === 'player' &&
    run(async () => {
      const sub = await commands.editAction({
        storyId: view.story.id,
        routeId: view.route.id,
        playerEventId: lastAction.id,
        text: editText,
      });
      // The new branch's reader picks up its pending reply when it opens.
      goToRoute(sub.view);
    });

  const quickSave = useCallback(() => {
    if (!view) return;
    void run(async () => {
      await commands.quickSave({ storyId: view.story.id, routeId: view.route.id });
      setSaveStatus(`Quick-saved ${timeNow()}`);
    });
  }, [run, view]);

  const nextChapter = () =>
    view &&
    run(async () => {
      const v = await commands.nextChapter({
        storyId: view.story.id,
        routeId: view.route.id,
        expectedHeadId: view.route.headEventId ?? '',
      });
      setView(v);
      setPanel(null);
      setSaveStatus(`Autosaved ${timeNow()}`);
    });

  const branchFrom = (eventId: string) =>
    view &&
    run(async () => {
      goToRoute(
        await commands.forkRoute({ storyId: view.story.id, routeId: view.route.id, eventId }),
      );
    });

  // Global shortcuts: Escape opens the pause menu (dialogs handle their own
  // Escape first), Ctrl/Cmd+S quick-saves, Up/Down scroll the story.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isComposing(e)) return;
      if (isModS(e)) {
        e.preventDefault();
        quickSave();
        return;
      }
      if (panel) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (viewing) setViewing(null);
        else setPanel('menu');
        return;
      }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !isEditableTarget(e.target)) {
        const el = narrativeHost.current?.querySelector<HTMLElement>('.narrative');
        if (el) {
          e.preventDefault();
          el.scrollBy({ top: e.key === 'ArrowDown' ? 80 : -80 });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel, quickSave, viewing]);

  if (!view) {
    return (
      <section className="screen">
        {error ? (
          <>
            <p role="alert" className="error">
              {error}
            </p>
            <button type="button" onClick={() => navigate({ name: 'library' })}>
              Back to library
            </button>
          </>
        ) : (
          <p className="muted">Loading story…</p>
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

  return (
    <section
      className="reader"
      aria-label={`Reading ${view.story.title}`}
      style={{ fontSize: `${textSize}rem` }}
    >
      <header className="reader-status">
        <div>
          <h1 className="reader-title">{view.story.title}</h1>
          <div className="reader-meta">
            <span>
              Route: <strong data-testid="route-label">{view.route.label}</strong>
            </span>
            {chapter && (
              <span>
                Chapter {chapter.ordinal}: <strong>{chapter.title}</strong>
              </span>
            )}
          </div>
        </div>
        <div className="reader-meta">
          <button
            type="button"
            className="chip chip-button"
            onClick={() => navigate({ name: 'settings' })}
            title={
              view.storyteller.profileId
                ? `Replies come from ${view.storyteller.label} (${view.storyteller.modelId ?? ''}). Click to change.`
                : 'Replies come from the built-in offline storyteller. Click to connect an AI model.'
            }
          >
            {view.storyteller.label}
          </button>
          <span className="chip" role="status" aria-live="polite">
            {writing ? 'Writing…' : busy ? 'Working…' : saveStatus}
          </span>
          <button type="button" onClick={() => setPanel('menu')} aria-label="Open menu (Escape)">
            Menu
          </button>
        </div>
      </header>

      {showBudget && (
        <div className={`budget-banner ${budget.level}`} role="region" aria-label="Monthly budget">
          <p>
            {budget.level === 'reached'
              ? `You've reached your monthly budget: about ${formatUsd(budget.spentMicroUsd)} of ${formatUsd(budget.limitMicroUsd ?? 0)}.`
              : `You've used ${budget.percent ?? 0}% of your monthly budget: about ${formatUsd(budget.spentMicroUsd)} of ${formatUsd(budget.limitMicroUsd ?? 0)}.`}
            {budget.paused
              ? ' New paid replies are paused; local and offline storytellers still work.'
              : ''}
          </p>
          <div className="button-row">
            <button type="button" onClick={() => navigate({ name: 'usage' })}>
              Usage &amp; budget
            </button>
            <button type="button" onClick={dismissBudget}>
              Dismiss for this month
            </button>
          </div>
        </div>
      )}

      {viewing && (
        <div className="view-banner" role="region" aria-label="Viewing a save">
          <span>
            Viewing save <strong>{viewing.save.label}</strong> (read-only).
          </span>
          <div className="button-row">
            <button
              type="button"
              className="primary"
              onClick={() =>
                void run(async () => goToRoute(await commands.resumeSave(viewing.save.id)))
              }
            >
              {viewing.save.isRouteHead ? 'Continue' : 'Continue as new branch'}
            </button>
            <button type="button" onClick={() => setViewing(null)}>
              Back to current
            </button>
          </div>
        </div>
      )}

      <div ref={narrativeHost} className="reader-body">
        <NarrativeView
          events={events}
          draft={viewing ? null : stream}
          playerName={player?.name ?? 'You'}
          onBranch={viewing ? undefined : (id) => void branchFrom(id)}
        />
      </div>

      {error && (
        <p role="alert" className="error reader-error">
          {error}
        </p>
      )}

      {!viewing && (
        <div className="reader-bottom">
          {writing && (
            <div className="reply-bar" role="region" aria-label="Reply in progress">
              <span className="muted small">{view.storyteller.label} is writing…</span>
              <button type="button" onClick={cancelReply}>
                Stop
              </button>
            </div>
          )}
          {awaitingReply && !writing && (
            <div className="reply-bar" role="region" aria-label="Reply needed">
              <p className={replyError || lastRun ? 'error small' : 'small'}>
                {replyError?.text ??
                  (lastRun ? runErrorMessage(lastRun.errorCode) : 'This action has no reply yet.')}
                {lastRun?.status === 'interrupted' &&
                  !replyError &&
                  ' If it had reached the AI service, it may still have cost a little.'}
              </p>
              <div className="button-row">
                <button type="button" className="primary" onClick={() => void retry()}>
                  {lastRun ? 'Retry' : 'Write a reply'}
                </button>
                {failCode === 'BUDGET_OVERRIDE_REQUIRED' && (
                  <button type="button" onClick={() => void retry(true)}>
                    Send once without a price
                  </button>
                )}
                {(failCode === 'BUDGET_PAUSED' || failCode === 'BUDGET_OVERRIDE_REQUIRED') && (
                  <button type="button" onClick={() => navigate({ name: 'usage' })}>
                    Usage &amp; budget
                  </button>
                )}
                <button type="button" onClick={openEdit}>
                  Change action
                </button>
              </div>
            </div>
          )}
          <Composer
            value={draft}
            onChange={(t) => setDraft(routeId, t)}
            onSubmit={() => void send()}
            disabled={busy || awaitingReply || writing}
            placeholder="What do you do? (Enter to send, Shift+Enter for a new line)"
          />
          <div className="action-bar">
            <button type="button" onClick={quickSave} disabled={busy}>
              Quick save
            </button>
            <button type="button" onClick={() => setPanel('saves')}>
              Save / Load
            </button>
            <button
              type="button"
              onClick={() => void nextChapter()}
              disabled={busy || awaitingReply || writing}
            >
              Next chapter
            </button>
            <button type="button" onClick={() => setPanel('routes')}>
              Routes ({view.routes.filter((r) => !r.hidden).length})
            </button>
          </div>
        </div>
      )}

      {panel && (
        <Dialog
          key={panel}
          title={PANEL_TITLES[panel]}
          wide={panel === 'context'}
          onClose={() => setPanel(panel === 'menu' || panel === 'edit' ? null : 'menu')}
          initialFocusId={
            panel === 'menu' ? 'pause-resume' : panel === 'edit' ? 'edit-action-input' : undefined
          }
        >
          {panel === 'menu' && (
            <nav className="menu-list" aria-label="Pause menu">
              <button id="pause-resume" type="button" onClick={() => setPanel(null)}>
                Resume
              </button>
              <button type="button" onClick={() => setPanel('saves')}>
                Save / Load
              </button>
              <button type="button" onClick={() => setPanel('chapters')}>
                Chapters
              </button>
              <button type="button" onClick={() => setPanel('routes')}>
                Routes
              </button>
              <div className="button-row">
                <span>Text size</span>
                <button type="button" aria-label="Smaller text" onClick={() => stepTextSize(-1)}>
                  A−
                </button>
                <button type="button" aria-label="Larger text" onClick={() => stepTextSize(1)}>
                  A+
                </button>
              </div>
              <button type="button" onClick={() => setPanel('context')}>
                Preview context
              </button>
              <button type="button" onClick={() => navigate({ name: 'settings' })}>
                Settings
              </button>
              <button type="button" onClick={() => navigate({ name: 'diagnostics' })}>
                Diagnostics
              </button>
              <button type="button" onClick={() => navigate({ name: 'library' })}>
                Back to library
              </button>
            </nav>
          )}
          {panel === 'saves' && (
            <SavesPanel
              storyId={view.story.id}
              routeId={view.route.id}
              onSaved={(s) => setSaveStatus(`Saved "${s.label}" ${timeNow()}`)}
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
          {panel === 'edit' && (
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                if (editText.trim()) void submitEdit();
              }}
            >
              <label htmlFor="edit-action-input">
                Your action. The story continues on a new branch; the original stays as it was.
              </label>
              <textarea
                id="edit-action-input"
                value={editText}
                rows={4}
                onChange={(e) => setEditText(e.target.value)}
              />
              <div className="button-row">
                <button type="button" onClick={() => setPanel(null)}>
                  Cancel
                </button>
                <button type="submit" className="primary" disabled={!editText.trim() || busy}>
                  Send changed action
                </button>
              </div>
            </form>
          )}
        </Dialog>
      )}
    </section>
  );
}

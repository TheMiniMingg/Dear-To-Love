import { useCallback, useEffect, useRef, useState } from 'react';
import { CommandError, commands, errorMessage } from '../../api/commands';
import { useUiStore } from '../../app/store';
import { isComposing, isEditableTarget, isModS } from '../../app/keyboard';
import { Dialog } from '../../components/Dialog';
import { ChaptersPanel } from '../routes/ChaptersPanel';
import { RoutesPanel } from '../routes/RoutesPanel';
import { SavesPanel } from '../saves/SavesPanel';
import type { RouteView, SaveView } from '../../types';
import { Composer } from './Composer';
import { NarrativeView } from './NarrativeView';

type Panel = null | 'menu' | 'saves' | 'routes' | 'chapters';

const PANEL_TITLES: Record<Exclude<Panel, null>, string> = {
  menu: 'Paused',
  saves: 'Save / Load',
  routes: 'Routes',
  chapters: 'Chapters',
};

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
  const narrativeHost = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    commands
      .getRouteView(routeId)
      .then((v) => {
        if (!cancelled) setView(v);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [routeId, reload]);

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

  const headKind = view?.history[view.history.length - 1]?.kind;
  const awaitingReply = headKind === 'player';

  const send = () =>
    view &&
    run(async () => {
      const text = draft;
      const v = await commands.playMockTurn({
        storyId: view.story.id,
        routeId: view.route.id,
        expectedHeadId: view.route.headEventId ?? '',
        text,
      });
      clearDraft(routeId);
      setView(v);
      setSaveStatus(`Autosaved ${timeNow()}`);
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
          <span
            className="chip"
            title="No AI model is connected; replies come from the built-in offline storyteller."
          >
            Offline storyteller
          </span>
          <span className="chip" role="status" aria-live="polite">
            {busy ? 'Writing…' : saveStatus}
          </span>
          <button type="button" onClick={() => setPanel('menu')} aria-label="Open menu (Escape)">
            Menu
          </button>
        </div>
      </header>

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
          {awaitingReply && (
            <p className="muted small">
              This branch is waiting for a reply to the last action. Live AI replies arrive in a
              later update; for now, branch from an earlier reply to keep playing.
            </p>
          )}
          <Composer
            value={draft}
            onChange={(t) => setDraft(routeId, t)}
            onSubmit={() => void send()}
            disabled={busy || awaitingReply}
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
              disabled={busy || awaitingReply}
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
          onClose={() => setPanel(panel === 'menu' ? null : 'menu')}
          initialFocusId={panel === 'menu' ? 'pause-resume' : undefined}
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
        </Dialog>
      )}
    </section>
  );
}

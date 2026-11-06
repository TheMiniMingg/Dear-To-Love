import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { describeImport, pickStorypackFile } from '../../api/archive';
import { describeRestoreResult } from '../../api/backups';
import { commands, errorMessage } from '../../api/commands';
import { useUiStore } from '../../app/store';
import { isEditableTarget, moveRovingFocus } from '../../app/keyboard';
import { Dialog } from '../../components/Dialog';
import { Thumb } from '../images/ImageGrid';
import type { StorySummary } from '../../types';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function LibraryScreen() {
  const navigate = useUiStore((s) => s.navigate);
  const [stories, setStories] = useState<StorySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<StorySummary | null>(null);
  const [reload, setReload] = useState(0);
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    commands
      .listStories()
      .then((s) => {
        if (!cancelled) {
          setStories(s);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  // After a restart that finished (or failed) a restore, say so once.
  useEffect(() => {
    let live = true;
    commands
      .takeRestoreResult()
      .then((r) => {
        if (!live || !r) return;
        if (r.ok) setStatus(describeRestoreResult(r));
        else setError(describeRestoreResult(r));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (isEditableTarget(e.target) || !listRef.current) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      moveRovingFocus(listRef.current, e.key === 'ArrowDown' ? 1 : -1);
    }
  };

  const doDelete = async (s: StorySummary) => {
    try {
      await commands.deleteStory(s.id);
      setConfirmDelete(null);
      setReload((n) => n + 1);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const importPack = async () => {
    setError(null);
    setStatus(null);
    try {
      const path = await pickStorypackFile();
      if (!path) return;
      setImporting(true);
      setStatus(describeImport(await commands.importStorypack(path)));
      setReload((n) => n + 1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setImporting(false);
    }
  };

  return (
    <section className="screen" aria-labelledby="library-title">
      <div className="screen-header">
        <h1 id="library-title">Your stories</h1>
        <div className="button-row">
          <button type="button" onClick={() => navigate({ name: 'create' })}>
            Create your own
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => navigate({ name: 'quickstart' })}
          >
            New story
          </button>
        </div>
      </div>
      <div className="button-row library-tools">
        <button type="button" onClick={() => navigate({ name: 'settings' })}>
          Settings
        </button>
        <button type="button" onClick={() => navigate({ name: 'images' })}>
          Images
        </button>
        <button type="button" disabled={importing} onClick={() => void importPack()}>
          Import storypack
        </button>
      </div>
      <div aria-live="polite">
        {importing && <p className="muted">Importing…</p>}
        {status && <p role="status">{status}</p>}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {stories && stories.length === 0 && (
        <div className="empty-state">
          <p>No stories yet.</p>
          <p className="muted">
            Start one with <strong>New story</strong> to pick from presets, or{' '}
            <strong>Create your own</strong> to set up the world, your character and the opening
            step by step. You can play offline with the built-in storyteller before connecting an AI
            model. A story someone shared as a storypack comes in with{' '}
            <strong>Import storypack</strong>.
          </p>
        </div>
      )}
      <div ref={listRef} className="story-list" onKeyDown={onKeyDown}>
        {stories?.map((s) => (
          <div key={s.id} className="story-card">
            <button
              type="button"
              className="story-open"
              data-roving
              onClick={() => navigate({ name: 'reader', routeId: s.lastRouteId })}
            >
              {s.coverAssetId && <Thumb assetId={s.coverAssetId} alt="" className="story-cover" />}
              <span className="story-text">
                <span className="story-title">{s.title}</span>
                {s.description && <span className="muted">{s.description}</span>}
                <span className="muted small">
                  {s.routeCount} {s.routeCount === 1 ? 'route' : 'routes'} · last played{' '}
                  {formatDate(s.updatedAt)}
                </span>
              </span>
            </button>
            <button
              type="button"
              className="danger-link"
              aria-label={`Delete ${s.title}`}
              onClick={() => setConfirmDelete(s)}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
      {confirmDelete && (
        <Dialog title="Delete story?" onClose={() => setConfirmDelete(null)}>
          <p>
            <strong>{confirmDelete.title}</strong> and all of its routes and saves will be deleted
            from this computer. This cannot be undone.
          </p>
          <div className="button-row">
            <button type="button" onClick={() => setConfirmDelete(null)}>
              Keep story
            </button>
            <button type="button" className="danger" onClick={() => void doDelete(confirmDelete)}>
              Delete story
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}

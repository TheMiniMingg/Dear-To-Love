import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { describeImport, pickStorypackFile } from '../../api/archive';
import { describeRestoreResult } from '../../api/backups';
import { commands, errorMessage } from '../../api/commands';
import { useUiStore } from '../../app/store';
import { isComposing, isEditableTarget, moveRovingFocus } from '../../app/keyboard';
import { ariaKeys, isShortcut, withKeys } from '../../app/shortcuts';
import { Dialog } from '../../components/Dialog';
import { Thumb } from '../images/ImageGrid';
import type { StorySummary } from '../../types';
import { formatWhen, t, tn, tr } from '../../i18n';

const formatDate = formatWhen;

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

  // A reply keeps writing while you play another story; look again until
  // every story here has finished.
  const writing = stories?.some((s) => s.writing) ?? false;
  useEffect(() => {
    if (!writing) return;
    const id = window.setTimeout(() => setReload((n) => n + 1), 1500);
    return () => window.clearTimeout(id);
  }, [writing, stories]);

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

  // Ctrl/Cmd+N starts a new story from anywhere on this screen.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (isComposing(e) || e.defaultPrevented || !isShortcut(e, 'newStory')) return;
      e.preventDefault();
      if (!document.querySelector('[role="dialog"]')) navigate({ name: 'quickstart' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

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
        <h1 id="library-title">{t('Your stories')}</h1>
        <div className="button-row">
          <button type="button" onClick={() => navigate({ name: 'create' })}>
            {t('Create your own')}
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => navigate({ name: 'quickstart' })}
            title={withKeys(t('New story'), 'newStory')}
            aria-keyshortcuts={ariaKeys('newStory')}
          >
            {t('New story')}
          </button>
        </div>
      </div>
      <div className="button-row library-tools">
        <button
          type="button"
          onClick={() => navigate({ name: 'settings' })}
          title={withKeys(t('Settings'), 'settings')}
          aria-keyshortcuts={ariaKeys('settings')}
        >
          {t('Settings')}
        </button>
        <button type="button" onClick={() => navigate({ name: 'images' })}>
          {t('Images')}
        </button>
        <button type="button" onClick={() => navigate({ name: 'guide' })}>
          {t('Setup guide')}
        </button>
        <button type="button" disabled={importing} onClick={() => void importPack()}>
          {t('Import storypack')}
        </button>
      </div>
      <div aria-live="polite">
        {importing && <p className="muted">{t('Importing…')}</p>}
        {status && <p role="status">{status}</p>}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {stories && stories.length === 0 && (
        <div className="empty-state">
          <p>{t('No stories yet.')}</p>
          <p className="muted">
            {tr(
              'Start one with {newStory} to pick from presets, or {createOwn} to set up the world, your character and the opening step by step. You can play offline with the built-in storyteller before connecting an AI model. A story someone shared as a storypack comes in with {importPack}.',
              {
                newStory: <strong>{t('New story')}</strong>,
                createOwn: <strong>{t('Create your own')}</strong>,
                importPack: <strong>{t('Import storypack')}</strong>,
              },
            )}
          </p>
          <p className="muted">
            {t(
              'The setup guide shows how to connect an AI model, with links to get a key from each service or to run one on this computer.',
            )}
          </p>
          <button type="button" onClick={() => navigate({ name: 'guide' })}>
            {t('Open the setup guide')}
          </button>
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
              {s.coverAssetId ? (
                <Thumb assetId={s.coverAssetId} alt="" className="story-cover" />
              ) : (
                // Without a cover, the story's first letter keeps the list even.
                <span className="story-letter" aria-hidden="true">
                  {[...s.title.trim()][0]?.toUpperCase() ?? '?'}
                </span>
              )}
              <span className="story-text">
                <span className="story-title">{s.title}</span>
                {s.writing && <span className="story-writing small">{t('Writing a reply…')}</span>}
                {s.description && <span className="muted">{s.description}</span>}
                <span className="muted small">
                  {t('{routes} · last played {when}', {
                    routes: tn(s.routeCount, '{n} route', '{n} routes'),
                    when: formatDate(s.updatedAt),
                  })}
                </span>
              </span>
            </button>
            <button
              type="button"
              className="danger-link"
              aria-label={t('Delete {title}', { title: s.title })}
              onClick={() => setConfirmDelete(s)}
            >
              {t('Delete')}
            </button>
          </div>
        ))}
      </div>
      {confirmDelete && (
        <Dialog title={t('Delete story?')} onClose={() => setConfirmDelete(null)}>
          <p>
            {tr(
              '{title} and all of its routes and saves will be deleted from this computer. This cannot be undone.',
              { title: <strong>{confirmDelete.title}</strong> },
            )}
          </p>
          <div className="button-row">
            <button type="button" onClick={() => setConfirmDelete(null)}>
              {t('Keep story')}
            </button>
            <button type="button" className="danger" onClick={() => void doDelete(confirmDelete)}>
              {t('Delete story')}
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}

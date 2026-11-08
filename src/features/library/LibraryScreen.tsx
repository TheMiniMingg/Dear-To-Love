import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  BookOpen,
  CircleHelp,
  Copy,
  Download,
  Ellipsis,
  ImageIcon,
  Images,
  MapPin,
  PenLine,
  Pencil,
  Pin,
  PinOff,
  Play,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  describeExport,
  describeImport,
  pickStorypackFile,
  pickStorypackTarget,
} from '../../api/archive';
import { describeRestoreResult } from '../../api/backups';
import { commands, errorMessage } from '../../api/commands';
import { useUiStore } from '../../app/store';
import { isComposing, isEditableTarget, moveRovingFocus } from '../../app/keyboard';
import { arrange, SORTS, useLibraryPrefs, type LibrarySort } from '../../app/library';
import { storyTheme, useLook } from '../../app/look';
import { useReplyWatch } from '../../app/replyWatch';
import { ariaKeys, isShortcut, withKeys } from '../../app/shortcuts';
import { Dialog } from '../../components/Dialog';
import { MenuButton } from '../../components/MenuButton';
import { Thumb } from '../images/ImageGrid';
import { lastLine } from '../reader/messages';
import { CoverDialog } from './CoverDialog';
import type { StorySummary } from '../../types';
import { formatAgo, formatWhen, intlLocale, t, tn, tr } from '../../i18n';

const ICON = { className: 'btn-icon', 'aria-hidden': true } as const;
const MENU_ICON = { className: 'menu-icon', 'aria-hidden': true, size: 16 } as const;

export function LibraryScreen() {
  const navigate = useUiStore((s) => s.navigate);
  const [stories, setStories] = useState<StorySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<StorySummary | null>(null);
  const [renaming, setRenaming] = useState<StorySummary | null>(null);
  const [presetting, setPresetting] = useState<StorySummary | null>(null);
  const [cover, setCover] = useState<StorySummary | null>(null);
  const [reload, setReload] = useState(0);
  const [working, setWorking] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const sort = useLibraryPrefs((s) => s.sort);
  const setSort = useLibraryPrefs((s) => s.setSort);
  const pinned = useLibraryPrefs((s) => s.pinned);
  const togglePin = useLibraryPrefs((s) => s.togglePin);
  const look = useLook();
  const watch = useReplyWatch((s) => s.watch);
  const listRef = useRef<HTMLUListElement>(null);

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
  // every story here has finished, and say so (with a chime) if you leave
  // for another story before it does.
  const writing = stories?.some((s) => s.writing) ?? false;
  useEffect(() => {
    for (const s of stories ?? []) if (s.writing) watch(s.id, s.title);
  }, [stories, watch]);
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

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    if (isEditableTarget(e.target) || !listRef.current) return;
    const forward = e.key === 'ArrowDown' || e.key === 'ArrowRight';
    if (forward || e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      if ((e.target as HTMLElement).closest('[role="menu"]')) return;
      e.preventDefault();
      moveRovingFocus(listRef.current, forward ? 1 : -1);
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

  /** Runs one library action, with a note while it works and its result after. */
  const act = async (note: string, f: () => Promise<string | null>) => {
    setError(null);
    setStatus(null);
    setWorking(note);
    try {
      const done = await f();
      if (done) setStatus(done);
      setReload((n) => n + 1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setWorking(null);
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

  const importPack = () =>
    act(t('Importing…'), async () => {
      const path = await pickStorypackFile();
      return path ? describeImport(await commands.importStorypack(path)) : null;
    });

  const duplicate = (s: StorySummary) =>
    act(t('Copying {title}…', { title: s.title }), async () => {
      const copy = await commands.duplicateStory(s.id, t('{title} (copy)', { title: s.title }));
      return t('Made a copy: {title}.', { title: copy.title });
    });

  const exportPack = (s: StorySummary) =>
    act(t('Exporting…'), async () => {
      const path = await pickStorypackTarget(s.title);
      return path ? describeExport(await commands.exportStorypack(s.id, path)) : null;
    });

  const shown = useMemo(
    () => (stories ? arrange(stories, query, sort, pinned, intlLocale()) : []),
    [stories, query, sort, pinned],
  );

  return (
    <section className="screen library" aria-labelledby="library-title">
      <div className="screen-header">
        <h1 id="library-title">{t('Your stories')}</h1>
        <div className="button-row">
          <button type="button" onClick={() => navigate({ name: 'create' })}>
            <PenLine {...ICON} />
            {t('Custom Story')}
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => navigate({ name: 'quickstart' })}
            title={withKeys(t('Preset Story'), 'newStory')}
            aria-keyshortcuts={ariaKeys('newStory')}
          >
            <Sparkles {...ICON} />
            {t('Preset Story')}
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
          <Settings {...ICON} />
          {t('Settings')}
        </button>
        <button type="button" onClick={() => navigate({ name: 'images' })}>
          <Images {...ICON} />
          {t('Images')}
        </button>
        <button type="button" onClick={() => navigate({ name: 'help' })}>
          <CircleHelp {...ICON} />
          {t('How to play')}
        </button>
        <button type="button" onClick={() => navigate({ name: 'guide' })}>
          <BookOpen {...ICON} />
          {t('Setup guide')}
        </button>
        <button type="button" disabled={working !== null} onClick={() => void importPack()}>
          <Upload {...ICON} />
          {t('Import storypack')}
        </button>
      </div>
      <div aria-live="polite">
        {working && <p className="muted">{working}</p>}
        {status && <p role="status">{status}</p>}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {stories && stories.length === 0 && (
        <section className="welcome" aria-labelledby="welcome-title">
          <p className="welcome-eyebrow">{t('No stories yet.')}</p>
          <h2 id="welcome-title">{t('Start your first story')}</h2>
          <p className="muted">
            {t(
              'Play right away with the built-in storyteller, and connect an AI model whenever you like.',
            )}
          </p>
          <div className="welcome-choices">
            <button
              type="button"
              className="welcome-choice main-choice"
              onClick={() => navigate({ name: 'quickstart' })}
            >
              <Sparkles aria-hidden={true} size={26} strokeWidth={1.75} />
              <strong>{t('Preset Story')}</strong>
              <span>{t('Pick a ready-made story and begin in a minute.')}</span>
            </button>
            <button
              type="button"
              className="welcome-choice"
              onClick={() => navigate({ name: 'create' })}
            >
              <PenLine aria-hidden={true} size={26} strokeWidth={1.75} />
              <strong>{t('Custom Story')}</strong>
              <span>{t('Make your own from a blank page. Fill in only what you want.')}</span>
            </button>
          </div>
          <p className="welcome-more muted">
            <button
              type="button"
              className="link-button"
              disabled={working !== null}
              onClick={() => void importPack()}
            >
              {t('Import a storypack someone shared')}
            </button>
            <button
              type="button"
              className="link-button"
              onClick={() => navigate({ name: 'guide' })}
            >
              {t('Open the setup guide')}
            </button>
            <button
              type="button"
              className="link-button"
              onClick={() => navigate({ name: 'help' })}
            >
              {t('How to play')}
            </button>
          </p>
          <p className="welcome-more muted small">
            {t(
              'No AI connection yet? Begin anyway: the built-in offline storyteller writes simple replies, enough to learn the controls. Add a connection in the Setup guide when you want a real story.',
            )}
          </p>
        </section>
      )}
      {stories && stories.length > 0 && (
        <div className="library-filter" role="search">
          <label className="search-field">
            <Search className="search-icon" aria-hidden={true} size={18} />
            <span className="visually-hidden">{t('Search your stories')}</span>
            <input
              type="search"
              value={query}
              placeholder={t('Search your stories')}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="sort-field">
            <span>{t('Sort by')}</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as LibrarySort)}>
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {t(s.label)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {stories && stories.length > 0 && shown.length === 0 && (
        <p className="muted">{t('No stories match.')}</p>
      )}
      <ul ref={listRef} className="story-grid" aria-label={t('Your stories')} onKeyDown={onKeyDown}>
        {shown.map((s) => (
          <StoryCard
            key={s.id}
            story={s}
            theme={storyTheme(look, s.id, s.genres)}
            pinned={pinned.includes(s.id)}
            busy={working !== null}
            onOpen={() => navigate({ name: 'reader', routeId: s.lastRouteId })}
            onPin={() => togglePin(s.id)}
            onRename={() => setRenaming(s)}
            onCover={() => setCover(s)}
            onDuplicate={() => void duplicate(s)}
            onPreset={() => setPresetting(s)}
            onExport={() => void exportPack(s)}
            onDelete={() => setConfirmDelete(s)}
          />
        ))}
      </ul>
      {presetting && (
        <PresetDialog
          story={presetting}
          onClose={() => setPresetting(null)}
          onSaved={(name) => {
            setPresetting(null);
            setStatus(t('Saved as a preset: {name}. Find it under Preset Story.', { name }));
          }}
        />
      )}
      {renaming && (
        <RenameDialog
          story={renaming}
          onClose={() => setRenaming(null)}
          onRenamed={(title) => {
            setRenaming(null);
            setStatus(t('Renamed to {title}.', { title }));
            setReload((n) => n + 1);
          }}
        />
      )}
      {cover && (
        <CoverDialog
          story={cover}
          onClose={() => setCover(null)}
          onChanged={(note) => {
            setCover(null);
            setStatus(note);
            setReload((n) => n + 1);
          }}
        />
      )}
      {confirmDelete && (
        <Dialog title={t('Delete story?')} onClose={() => setConfirmDelete(null)}>
          <p>
            {tr(
              '{title} and all of its routes and saves will be deleted from this computer. This cannot be undone.',
              { title: <strong>{confirmDelete.title}</strong> },
            )}
          </p>
          <div className="button-row dialog-actions">
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

/** "Chapter 3 · 48 turns · 2 routes", or that it hasn't started. */
function progressText(s: StorySummary): string {
  if (s.turns === 0) return t('Not started');
  const turns = tn(s.turns, '{n} turn', '{n} turns');
  const text = s.chapter ? t('Chapter {n} · {turns}', { n: s.chapter, turns }) : turns;
  return s.routeCount > 1 ? `${text} · ${tn(s.routeCount, '{n} route', '{n} routes')}` : text;
}

/**
 * One story in the library, like a book on a shelf: its cover with the
 * title over it, how far it got, its last line and Continue. Drawn in the
 * story's own look.
 */
function StoryCard({
  story: s,
  theme,
  pinned,
  busy,
  onOpen,
  onPin,
  onRename,
  onCover,
  onDuplicate,
  onPreset,
  onExport,
  onDelete,
}: {
  story: StorySummary;
  theme: string;
  pinned: boolean;
  busy: boolean;
  onOpen: () => void;
  onPin: () => void;
  onRename: () => void;
  onCover: () => void;
  onDuplicate: () => void;
  onPreset: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const line = (s.lastReply && lastLine(s.lastReply)) || s.description.trim();
  const letter = [...s.title.trim()][0]?.toUpperCase() ?? '?';
  return (
    <li className={pinned ? 'story-card is-pinned' : 'story-card'} data-theme-preview={theme}>
      {/* The cover opens the story too; Continue is the way in by keyboard. */}
      <div className="story-cover-wrap" onClick={onOpen}>
        {s.coverAssetId ? (
          <Thumb assetId={s.coverAssetId} alt="" size="full" className="story-cover" />
        ) : (
          <span className="story-letter" aria-hidden="true">
            {letter}
          </span>
        )}
        <span className="story-fade" aria-hidden="true" />
        <h2 className="story-title">{s.title}</h2>
        {s.writing && (
          <span className="story-writing small">
            <span className="pulse-dot" aria-hidden="true" />
            {t('Writing a reply…')}
          </span>
        )}
        {pinned && (
          <span className="story-pin" title={t('Pinned')}>
            <Pin aria-hidden={true} size={14} />
            <span className="visually-hidden">{t('Pinned')}</span>
          </span>
        )}
      </div>
      <div className="story-body">
        <p className="story-progress small">
          {progressText(s)}
          <span aria-hidden="true"> · </span>
          <span title={formatWhen(s.updatedAt)}>
            {s.turns > 0
              ? t('played {when}', { when: formatAgo(s.updatedAt) })
              : t('added {when}', { when: formatAgo(s.updatedAt) })}
          </span>
        </p>
        {line && <p className="story-teaser">{line}</p>}
        {s.place && (
          <p className="story-place small muted" data-testid="story-place">
            <MapPin aria-hidden={true} size={12} />
            {s.place}
          </p>
        )}
        <div className="story-actions">
          <button
            type="button"
            className="primary story-open"
            data-roving
            onClick={onOpen}
            aria-label={
              s.turns > 0
                ? t('Continue {title}', { title: s.title })
                : t('Begin {title}', { title: s.title })
            }
          >
            <Play {...ICON} />
            {s.turns > 0 ? t('Continue') : t('Begin')}
          </button>
          <MenuButton
            label={t('More for {title}', { title: s.title })}
            items={[
              {
                label: pinned ? t('Unpin') : t('Pin to the top'),
                icon: pinned ? <PinOff {...MENU_ICON} /> : <Pin {...MENU_ICON} />,
                onSelect: onPin,
              },
              { label: t('Rename'), icon: <Pencil {...MENU_ICON} />, onSelect: onRename },
              { label: t('Change cover'), icon: <ImageIcon {...MENU_ICON} />, onSelect: onCover },
              {
                label: t('Make a copy'),
                icon: <Copy {...MENU_ICON} />,
                onSelect: onDuplicate,
                disabled: busy,
              },
              {
                label: t('Export storypack'),
                icon: <Download {...MENU_ICON} />,
                onSelect: onExport,
                disabled: busy,
              },
              {
                label: t('Save as a preset…'),
                icon: <Sparkles {...MENU_ICON} />,
                onSelect: onPreset,
                disabled: busy,
              },
              {
                label: t('Delete'),
                icon: <Trash2 {...MENU_ICON} />,
                onSelect: onDelete,
                danger: true,
              },
            ]}
          >
            <Ellipsis aria-hidden={true} size={18} />
          </MenuButton>
        </div>
      </div>
    </li>
  );
}

/**
 * Keep this story's world, cast, rules and style as a preset, without its
 * turns, under Preset Story → Your presets.
 */
function PresetDialog({
  story,
  onClose,
  onSaved,
}: {
  story: StorySummary;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const [name, setName] = useState(story.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const draft = await commands.presetFromRoute(story.lastRouteId);
      const saved = await commands.saveUserPreset(name, draft, story.title);
      onSaved(saved.name);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  return (
    <Dialog title={t('Save as a preset')} onClose={onClose} initialFocusId="preset-name">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <p className="muted small">
          {t(
            'The world, characters, relationships, rules, style and scene of this story as they are now, without its turns, memory or pictures. Start new stories from it under Preset Story, or share it as a file.',
          )}
        </p>
        <div className="field">
          <label htmlFor="preset-name">{t('Preset name')}</label>
          <input
            id="preset-name"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="button-row dialog-actions">
          <button type="button" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button type="submit" className="primary" disabled={busy || !name.trim()}>
            {busy ? t('Saving…') : t('Save preset')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** A new title for a story; where it sits in the library stays the same. */
function RenameDialog({
  story,
  onClose,
  onRenamed,
}: {
  story: StorySummary;
  onClose: () => void;
  onRenamed: (title: string) => void;
}) {
  const [title, setTitle] = useState(story.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      onRenamed(await commands.renameStory(story.id, title));
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  return (
    <Dialog title={t('Rename story')} onClose={onClose} initialFocusId="rename-title">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="field">
          <label htmlFor="rename-title">{t('Title')}</label>
          <input
            id="rename-title"
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="button-row dialog-actions">
          <button type="button" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button
            type="submit"
            className="primary"
            disabled={busy || !title.trim() || title.trim() === story.title}
          >
            {t('Rename')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

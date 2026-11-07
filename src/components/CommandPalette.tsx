import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  BookOpen,
  Compass,
  DatabaseBackup,
  Gauge,
  Images,
  Keyboard,
  LibraryBig,
  PenLine,
  Search,
  Settings,
  Sparkles,
  Stethoscope,
} from 'lucide-react';
import { commands } from '../api/commands';
import { isComposing } from '../app/keyboard';
import { paletteSources, searchPalette, usePalette, type PaletteEntry } from '../app/palette';
import { isShortcut, shortcutKeys, useShortcutHelp } from '../app/shortcuts';
import { useUiStore, type Screen } from '../app/store';
import { goToSettingsSection, SETTINGS_SECTIONS } from '../features/settings/SettingsScreen';
import type { StorySummary } from '../types';
import { t } from '../i18n';
import { Dialog } from './Dialog';

/** Screens the palette always offers. */
const SCREENS: [Screen, string, PaletteEntry['icon']][] = [
  [{ name: 'library' }, 'Your stories', LibraryBig],
  [{ name: 'quickstart' }, 'Preset Story', Sparkles],
  [{ name: 'create' }, 'Custom Story', PenLine],
  [{ name: 'settings' }, 'Settings', Settings],
  [{ name: 'usage' }, 'Usage & budget', Gauge],
  [{ name: 'images' }, 'Image library', Images],
  [{ name: 'backups' }, 'Backups', DatabaseBackup],
  [{ name: 'guide' }, 'Setup guide', Compass],
  [{ name: 'diagnostics' }, 'Diagnostics', Stethoscope],
];

function entries(stories: StorySummary[]): PaletteEntry[] {
  const { navigate, screen } = useUiStore.getState();
  const go = (s: Screen) => {
    if (useUiStore.getState().screen.name !== s.name || s.name === 'reader') navigate(s);
  };
  const here = [...paletteSources.values()].flatMap((source) => source());
  const openRoute = screen.name === 'reader' ? screen.routeId : null;
  const storyGroup = t('Stories');
  const recent = [...stories].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const goGroup = t('Go to');
  const settingsGroup = t('Settings');
  return [
    ...here,
    ...recent
      .filter((s) => s.lastRouteId !== openRoute)
      .map((s) => ({
        id: `story:${s.id}`,
        group: storyGroup,
        label: s.title.trim() || t('Untitled story'),
        keywords: s.description,
        hint: s.description.trim().slice(0, 90) || undefined,
        icon: BookOpen,
        run: () => go({ name: 'reader', routeId: s.lastRouteId }),
      })),
    ...SCREENS.map(([s, label, icon]) => ({
      id: `screen:${s.name}`,
      group: goGroup,
      label: t(label),
      icon,
      keys: s.name === 'settings' ? ('settings' as const) : undefined,
      run: () => go(s),
    })),
    {
      id: 'shortcuts',
      group: goGroup,
      label: t('Keyboard shortcuts'),
      icon: Keyboard,
      keys: 'help',
      run: () => useShortcutHelp.getState().setOpen(true),
    },
    ...SETTINGS_SECTIONS.map(([id, label]) => ({
      id: `settings:${id}`,
      group: settingsGroup,
      label: t(label),
      keywords: t('Settings'),
      icon: Settings,
      run: () => goToSettingsSection(id),
    })),
  ];
}

/**
 * Ctrl/Cmd+K: a box that finds any story, chapter, window or setting as
 * you type. Up and Down choose, Enter goes, Escape closes.
 */
export function CommandPalette() {
  const open = usePalette((s) => s.open);
  const setOpen = usePalette((s) => s.setOpen);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (isComposing(e) || e.defaultPrevented || !isShortcut(e, 'palette')) return;
      e.preventDefault();
      if (usePalette.getState().open) return setOpen(false);
      // Not over another window: it could hold unsaved changes.
      if (document.querySelector('[role="dialog"]')) return;
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  if (!open) return null;
  return <PaletteDialog onClose={() => setOpen(false)} />;
}

function PaletteDialog({ onClose }: { onClose: () => void }) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [stories, setStories] = useState<StorySummary[]>([]);
  const [active, setActive] = useState(0);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    let live = true;
    commands
      .listStories()
      .then((s) => {
        if (live) setStories(s);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const all = useMemo(() => entries(stories), [stories]);
  const found = useMemo(() => searchPalette(all, query), [all, query]);
  const current = Math.min(active, Math.max(0, found.length - 1));

  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${current}"]`)
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [current]);

  const choose = (entry: PaletteEntry | undefined) => {
    if (!entry) return;
    onClose();
    // After the palette has closed and handed focus back.
    requestAnimationFrame(() => entry.run());
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (isComposing(e)) return;
    const move = (to: number) => {
      e.preventDefault();
      setActive(found.length ? (to + found.length) % found.length : 0);
    };
    if (e.key === 'ArrowDown') move(current + 1);
    else if (e.key === 'ArrowUp') move(current - 1);
    else if (e.key === 'PageDown') move(Math.min(found.length - 1, current + 8));
    else if (e.key === 'PageUp') move(Math.max(0, current - 8));
    else if (e.key === 'Enter') {
      e.preventDefault();
      choose(found[current]);
    }
  };

  return (
    <Dialog title={t('Go to')} onClose={onClose} initialFocusId={`${id}-input`}>
      <div className="palette">
        <div className="palette-search">
          <Search aria-hidden={true} size={18} className="palette-search-icon" />
          <input
            id={`${id}-input`}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={`${id}-list`}
            aria-activedescendant={found.length ? `${id}-${current}` : undefined}
            aria-autocomplete="list"
            aria-label={t('Find a story, chapter, window or setting')}
            placeholder={t('Find a story, chapter, window or setting…')}
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
        </div>
        <ul
          ref={list}
          id={`${id}-list`}
          role="listbox"
          aria-label={t('Places to go')}
          className="palette-list"
        >
          {found.map((entry, i) => {
            const heading = entry.group !== found[i - 1]?.group ? entry.group : null;
            const Icon = entry.icon;
            return (
              <li
                key={entry.id}
                id={`${id}-${i}`}
                role="option"
                aria-selected={i === current}
                data-index={i}
                data-group={heading ?? undefined}
                className="palette-option"
                onMouseMove={() => i !== current && setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(entry)}
              >
                {Icon && <Icon aria-hidden={true} size={17} className="palette-icon" />}
                <span className="palette-text">
                  <span className="palette-label">{entry.label}</span>
                  {entry.hint && <span className="palette-hint">{entry.hint}</span>}
                </span>
                <span className="palette-group">{entry.group}</span>
                {entry.keys && <kbd className="palette-keys">{shortcutKeys(entry.keys)}</kbd>}
              </li>
            );
          })}
        </ul>
        {found.length === 0 && (
          <p className="muted palette-empty" role="status">
            {t('Nothing matches “{query}”.', { query: query.trim() })}
          </p>
        )}
      </div>
    </Dialog>
  );
}

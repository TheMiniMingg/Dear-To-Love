import { create } from 'zustand';
import { msg } from '../i18n';
import type { StorySummary } from '../types';

/** How the library orders stories. */
export type LibrarySort = 'played' | 'title' | 'created';

export const SORTS: { id: LibrarySort; label: string }[] = [
  { id: 'played', label: msg('Last played') },
  { id: 'title', label: msg('Title') },
  { id: 'created', label: msg('Newest first') },
];

type Prefs = {
  sort: LibrarySort;
  /** Stories kept at the top of the library, by id. */
  pinned: string[];
  /** A soft chime when a reply finishes in a story you are not reading. */
  chime: boolean;
};

type PrefsState = Prefs & {
  setSort: (sort: LibrarySort) => void;
  togglePin: (storyId: string) => void;
  setChime: (on: boolean) => void;
};

const STORAGE_KEY = 'dtl.library';
const DEFAULTS: Prefs = { sort: 'played', pinned: [], chime: true };

function load(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Prefs> | null;
    if (!raw) return DEFAULTS;
    return {
      sort: SORTS.some((s) => s.id === raw.sort) ? (raw.sort as LibrarySort) : DEFAULTS.sort,
      pinned: Array.isArray(raw.pinned)
        ? raw.pinned.filter((x): x is string => typeof x === 'string')
        : [],
      chime: typeof raw.chime === 'boolean' ? raw.chime : DEFAULTS.chime,
    };
  } catch {
    return DEFAULTS;
  }
}

/**
 * The library's order, pinned stories and the reply chime: settings of
 * this computer, like the look, so they are not in backups or storypacks.
 */
export const useLibraryPrefs = create<PrefsState>((set, get) => {
  const update = (next: Partial<Prefs>) => {
    const { sort, pinned, chime } = { ...get(), ...next };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ sort, pinned, chime }));
    } catch {
      // A preference only; it still applies until the app closes.
    }
    set({ sort, pinned, chime });
  };
  return {
    ...load(),
    setSort: (sort) => update({ sort }),
    togglePin: (storyId) => {
      const pinned = get().pinned;
      update({
        pinned: pinned.includes(storyId)
          ? pinned.filter((x) => x !== storyId)
          : [...pinned, storyId],
      });
    },
    setChime: (chime) => update({ chime }),
  };
});

/** Words of a story the library search looks in. */
function haystack(s: StorySummary): string {
  return [s.title, s.description, ...s.genres].join('\n').toLowerCase();
}

/**
 * The stories to show: those matching `query` (every word somewhere in the
 * title, premise or genres), pinned ones first, each part in `sort` order.
 */
export function arrange(
  stories: StorySummary[],
  query: string,
  sort: LibrarySort,
  pinned: readonly string[],
  locale?: string,
): StorySummary[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = words.length
    ? stories.filter((s) => {
        const text = haystack(s);
        return words.every((w) => text.includes(w));
      })
    : [...stories];
  const order = (a: StorySummary, b: StorySummary) => {
    switch (sort) {
      case 'title':
        return a.title.localeCompare(b.title, locale, { sensitivity: 'base', numeric: true });
      case 'created':
        return b.createdAt.localeCompare(a.createdAt);
      case 'played':
        return b.updatedAt.localeCompare(a.updatedAt);
    }
  };
  const pin = (s: StorySummary) => (pinned.includes(s.id) ? 0 : 1);
  return shown.sort((a, b) => pin(a) - pin(b) || order(a, b) || a.id.localeCompare(b.id));
}

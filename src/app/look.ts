import { useEffect } from 'react';
import { create } from 'zustand';
import { msg } from '../i18n';

/** The app's colour themes. Rose follows the computer's light or dark mode. */
export type ThemeId = 'rose' | 'midnight' | 'parchment' | 'neon' | 'cafe' | 'gothic';

export type Theme = { id: ThemeId; label: string; hint: string };

export const THEMES: Theme[] = [
  {
    id: 'rose',
    label: msg('Rose'),
    hint: msg('Soft pink, light or dark with your computer.'),
  },
  {
    id: 'midnight',
    label: msg('Midnight'),
    hint: msg('Deep blue with moonlit text, for late reading.'),
  },
  {
    id: 'parchment',
    label: msg('Parchment'),
    hint: msg('Warm paper and dark ink, like an old book.'),
  },
  {
    id: 'neon',
    label: msg('Neon'),
    hint: msg('Near black with cyan and magenta, for science fiction.'),
  },
  {
    id: 'cafe',
    label: msg('Café'),
    hint: msg('Latte browns and a soft green, for cozy stories.'),
  },
  {
    id: 'gothic',
    label: msg('Gothic'),
    hint: msg('Charcoal and deep red, with serif headings, for horror.'),
  },
];

/** What a story looks like: its own theme, the app's, or one that fits its genre. */
export type StoryLook = ThemeId | 'app';

const isTheme = (v: unknown): v is ThemeId => THEMES.some((x) => x.id === v);

/**
 * Genres, in lower case, that suggest a theme. The first genre of a story
 * that is listed here decides its look.
 */
const GENRE_THEMES: [ThemeId, string[]][] = [
  [
    'gothic',
    [
      'horror',
      'gothic',
      'mystery',
      'supernatural',
      'vampire',
      'dark fantasy',
      'dark romance',
      'psychological',
      'paranormal',
    ],
  ],
  [
    'neon',
    [
      'cyberpunk',
      'sci-fi',
      'science fiction',
      'space',
      'space opera',
      'dystopian',
      'mecha',
      'tech',
    ],
  ],
  [
    'midnight',
    ['thriller', 'noir', 'crime', 'post-apocalyptic', 'survival', 'spy', 'heist', 'detective'],
  ],
  [
    'parchment',
    [
      'fantasy',
      'high fantasy',
      'historical',
      'adventure',
      'western',
      'fairy tale',
      'mythology',
      'myth',
      'medieval',
      'period drama',
      'regency',
      'pirate',
      'pirates',
      'steampunk',
      'wuxia',
      'xianxia',
      'cultivation',
      'isekai',
      'dungeon crawl',
      'rpg',
    ],
  ],
  [
    'cafe',
    ['slice of life', 'cozy', 'cosy', 'wholesome', 'everyday', 'friendship', 'family', 'cooking'],
  ],
  [
    'rose',
    [
      'romance',
      'romantic comedy',
      'comedy',
      'drama',
      'dating sim',
      'erotica',
      'erotic',
      'school',
      'school life',
      'workplace',
      'office',
    ],
  ],
];

/** The theme a story's genres suggest, or null when none of them does. */
export function themeForGenres(genres: readonly string[] | undefined): ThemeId | null {
  for (const g of genres ?? []) {
    const key = g.trim().toLowerCase();
    for (const [theme, names] of GENRE_THEMES) {
      if (names.includes(key)) return theme;
    }
  }
  return null;
}

type Look = {
  /** The theme of every screen, and of stories that keep the app's look. */
  theme: ThemeId;
  /** Stories without a look of their own take one that fits their genre. */
  fitGenre: boolean;
  /** Looks chosen for single stories, by story id. */
  stories: Record<string, StoryLook>;
};

type LookState = Look & {
  /** The story open in the reader, whose look covers the whole window. */
  open: { storyId: string; genres: string[] } | null;
  update: (next: Partial<Look>) => void;
  /** Choose a story's look; null goes back to the default. */
  setStoryLook: (storyId: string, look: StoryLook | null) => void;
  setOpen: (open: { storyId: string; genres: string[] } | null) => void;
};

const STORAGE_KEY = 'dtl.look';
const DEFAULTS: Look = { theme: 'rose', fitGenre: true, stories: {} };

function load(): Look {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Look> | null;
    if (!raw) return DEFAULTS;
    const stories: Record<string, StoryLook> = {};
    for (const [id, look] of Object.entries(raw.stories ?? {})) {
      if (look === 'app' || isTheme(look)) stories[id] = look;
    }
    return {
      theme: isTheme(raw.theme) ? raw.theme : DEFAULTS.theme,
      fitGenre: typeof raw.fitGenre === 'boolean' ? raw.fitGenre : DEFAULTS.fitGenre,
      stories,
    };
  } catch {
    return DEFAULTS;
  }
}

function save(look: Look) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(look));
  } catch {
    // A preference only; it still applies until the app closes.
  }
}

/**
 * How the app looks: a setting of this computer, like the background
 * picture, so it is not in backups or storypacks.
 */
export const useLook = create<LookState>((set, get) => ({
  ...load(),
  open: null,
  update: (next) => {
    const { theme, fitGenre, stories } = { ...get(), ...next };
    save({ theme, fitGenre, stories });
    set({ theme, fitGenre, stories });
  },
  setStoryLook: (storyId, look) => {
    const stories = { ...get().stories };
    if (look === null) delete stories[storyId];
    else stories[storyId] = look;
    get().update({ stories });
  },
  setOpen: (open) => set({ open }),
}));

/** The look a story gets when nothing was chosen for it. */
export function defaultStoryTheme(look: Pick<Look, 'theme' | 'fitGenre'>, genres: string[]) {
  return (look.fitGenre && themeForGenres(genres)) || look.theme;
}

/** The theme a story is shown in. */
export function storyTheme(look: Look, storyId: string, genres: string[]): ThemeId {
  const own = look.stories[storyId];
  if (own === 'app') return look.theme;
  return own ?? defaultStoryTheme(look, genres);
}

/** The app theme saved on this computer, for the first paint. */
export function initialTheme(): ThemeId {
  return useLook.getState().theme;
}

/** The theme the window shows now: the open story's, or the app's. */
export function useActiveTheme(): ThemeId {
  return useLook((s) => (s.open ? storyTheme(s, s.open.storyId, s.open.genres) : s.theme));
}

/** Puts the active theme on the page, where the stylesheet picks it up. */
export function useApplyTheme() {
  const theme = useActiveTheme();
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
}

/** While a story is open, its look covers the whole window. */
export function useStoryLook(storyId: string | null, genres: string[] | undefined) {
  const setOpen = useLook((s) => s.setOpen);
  const key = (genres ?? []).join('\n');
  useEffect(() => {
    if (!storyId) return;
    setOpen({ storyId, genres: key ? key.split('\n') : [] });
    return () => setOpen(null);
  }, [storyId, key, setOpen]);
}

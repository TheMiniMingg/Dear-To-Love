import { useEffect } from 'react';
import { create } from 'zustand';
import { msg } from '../i18n';

/** The app's colour themes. Rose follows the computer's light or dark mode. */
export type ThemeId =
  | 'rose'
  | 'midnight'
  | 'parchment'
  | 'neon'
  | 'cafe'
  | 'gothic'
  | 'forest'
  | 'ocean'
  | 'lavender'
  | 'ember'
  | 'terminal'
  | 'ink';

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
  {
    id: 'forest',
    label: msg('Forest'),
    hint: msg('Pine green and gold, for woodland and nature stories.'),
  },
  {
    id: 'ocean',
    label: msg('Ocean'),
    hint: msg('Sea glass and sand, for summers, islands and the sea.'),
  },
  {
    id: 'lavender',
    label: msg('Lavender'),
    hint: msg('Soft lilac and violet, for dreamy and whimsical stories.'),
  },
  {
    id: 'ember',
    label: msg('Ember'),
    hint: msg('Soot and firelight orange, for action, war and heroes.'),
  },
  {
    id: 'terminal',
    label: msg('Terminal'),
    hint: msg('Green on black in a typewriter face, for text adventures.'),
  },
  {
    id: 'ink',
    label: msg('Ink'),
    hint: msg('Black on white with the strongest contrast, for easy reading.'),
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
    'ember',
    ['action', 'superhero', 'war', 'military', 'martial arts', 'sports', 'disaster', 'battle'],
  ],
  [
    'terminal',
    ['text adventure', 'interactive fiction', 'hacker', 'retro', 'retro sci-fi', 'computer'],
  ],
  [
    'forest',
    ['nature', 'wilderness', 'woodland', 'cottagecore', 'druid', 'elves', 'animals', 'farming'],
  ],
  ['ocean', ['beach', 'summer', 'island', 'sailing', 'nautical', 'mermaid', 'seaside', 'vacation']],
  [
    'lavender',
    ['magical girl', 'whimsical', 'fairy', 'fae', 'magical realism', 'romantasy', 'dreamy'],
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

/** How wide the story's column is. */
export type ReadingWidth = 'narrow' | 'medium' | 'wide';
/** How much room there is between the story's lines. */
export type LineSpacing = 'compact' | 'normal' | 'roomy';

export const READING_WIDTHS: { id: ReadingWidth; label: string; rem: number }[] = [
  { id: 'narrow', label: msg('Narrow'), rem: 34 },
  { id: 'medium', label: msg('Medium'), rem: 41 },
  { id: 'wide', label: msg('Wide'), rem: 52 },
];

export const LINE_SPACINGS: { id: LineSpacing; label: string; lineHeight: number }[] = [
  { id: 'compact', label: msg('Compact'), lineHeight: 1.55 },
  { id: 'normal', label: msg('Normal'), lineHeight: 1.75 },
  { id: 'roomy', label: msg('Roomy'), lineHeight: 2 },
];

type Look = {
  /** The theme of every screen, and of stories that keep the app's look. */
  theme: ThemeId;
  /** Stories without a look of their own take one that fits their genre. */
  fitGenre: boolean;
  /** Looks chosen for single stories, by story id. */
  stories: Record<string, StoryLook>;
  /** How wide the story's column is, in every story. */
  width: ReadingWidth;
  /** The room between the story's lines, in every story. */
  spacing: LineSpacing;
  /** The typeface stories are read in; `theme` leaves it to the look. */
  font: ReadingFont;
};

export type ReadingFont = 'theme' | 'serif' | 'sans' | 'easy';
/** The story typefaces to choose from; `css` is what `--font-story` becomes. */
export const READING_FONTS: { id: ReadingFont; label: string; css: string | null }[] = [
  { id: 'theme', label: msg('Theme’s choice'), css: null },
  { id: 'serif', label: msg('Book (serif)'), css: 'var(--font-story-serif)' },
  { id: 'sans', label: msg('Plain (sans)'), css: 'var(--font-ui)' },
  { id: 'easy', label: msg('Easy to read'), css: "'Atkinson Hyperlegible', var(--font-ui)" },
];
const isFont = (v: unknown): v is ReadingFont => READING_FONTS.some((f) => f.id === v);

type LookState = Look & {
  /** The story open in the reader, whose look covers the whole window. */
  open: { storyId: string; genres: string[] } | null;
  update: (next: Partial<Look>) => void;
  /** Choose a story's look; null goes back to the default. */
  setStoryLook: (storyId: string, look: StoryLook | null) => void;
  setOpen: (open: { storyId: string; genres: string[] } | null) => void;
};

const STORAGE_KEY = 'dtl.look';
const DEFAULTS: Look = {
  theme: 'rose',
  fitGenre: true,
  stories: {},
  width: 'medium',
  spacing: 'normal',
  font: 'theme',
};

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
      width: READING_WIDTHS.some((x) => x.id === raw.width) ? raw.width! : DEFAULTS.width,
      spacing: LINE_SPACINGS.some((x) => x.id === raw.spacing) ? raw.spacing! : DEFAULTS.spacing,
      font: isFont(raw.font) ? raw.font : DEFAULTS.font,
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
    const { theme, fitGenre, stories, width, spacing, font } = { ...get(), ...next };
    save({ theme, fitGenre, stories, width, spacing, font });
    set({ theme, fitGenre, stories, width, spacing, font });
  },
  setStoryLook: (storyId, look) => {
    const stories = { ...get().stories };
    if (look === null) delete stories[storyId];
    else stories[storyId] = look;
    get().update({ stories });
  },
  setOpen: (open) => set({ open }),
}));

/** The story column's width and line spacing, as stylesheet variables. */
export function readingStyle(
  look: Pick<Look, 'width' | 'spacing'> & { font?: ReadingFont },
): Record<string, string> {
  const width = READING_WIDTHS.find((x) => x.id === look.width) ?? READING_WIDTHS[1]!;
  const spacing = LINE_SPACINGS.find((x) => x.id === look.spacing) ?? LINE_SPACINGS[1]!;
  const font = READING_FONTS.find((x) => x.id === look.font)?.css;
  return {
    '--reading-width': `${width.rem}rem`,
    '--reading-leading': String(spacing.lineHeight),
    ...(font ? { '--font-story': font } : {}),
  };
}

/** The look a story gets when nothing was chosen for it. */
export function defaultStoryTheme(look: Pick<Look, 'theme' | 'fitGenre'>, genres: string[]) {
  return (look.fitGenre && themeForGenres(genres)) || look.theme;
}

/** The theme a story is shown in. */
export function storyTheme(
  look: Pick<Look, 'theme' | 'fitGenre' | 'stories'>,
  storyId: string,
  genres: string[],
): ThemeId {
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

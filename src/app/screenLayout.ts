import { create } from 'zustand';
import { msg } from '../i18n';

/**
 * How the reader's screen is laid out: where the scene picture sits, how the
 * story is framed, and how big the picture is. A setting of this computer,
 * like the reading width, so it is the same in every story and is not in
 * backups or storypacks. None of it changes the story itself.
 */

/** Where the picture goes: above the story, beside it, or behind a text box. */
export type PicturePlace = 'top' | 'side' | 'behind';
/** How the story's text is framed. */
export type StoryFrame = 'plain' | 'page' | 'panel' | 'box';
export type Corners = 'round' | 'square';

export type ScreenLayout = {
  picture: PicturePlace;
  frame: StoryFrame;
  corners: Corners;
};

export type LayoutPresetId =
  'classic' | 'novel' | 'handheld' | 'dating' | 'storybook' | 'adventure';

export type LayoutPreset = {
  id: LayoutPresetId;
  label: string;
  hint: string;
  layout: ScreenLayout;
  /** Whether the preset shows pictures; a text adventure doesn't. */
  pictures: boolean;
};

/**
 * Ready-made layouts, each after a kind of game. They are our own designs,
 * borrowing only the general shape of each genre's screen.
 */
export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    id: 'classic',
    label: msg('Classic'),
    hint: msg('The picture above, the story in a column below.'),
    layout: { picture: 'top', frame: 'plain', corners: 'round' },
    pictures: true,
  },
  {
    id: 'novel',
    label: msg('Visual novel'),
    hint: msg('The scene fills the screen and the story sits in a glass box over it.'),
    layout: { picture: 'behind', frame: 'panel', corners: 'round' },
    pictures: true,
  },
  {
    id: 'handheld',
    label: msg('Handheld RPG'),
    hint: msg('A framed picture window over a chunky dialog box, like a pocket adventure.'),
    layout: { picture: 'top', frame: 'box', corners: 'square' },
    pictures: true,
  },
  {
    id: 'dating',
    label: msg('Dating sim'),
    hint: msg('A tall picture of who you are with beside the story.'),
    layout: { picture: 'side', frame: 'panel', corners: 'round' },
    pictures: true,
  },
  {
    id: 'storybook',
    label: msg('Storybook'),
    hint: msg('The picture over a page, like an illustrated book.'),
    layout: { picture: 'top', frame: 'page', corners: 'round' },
    pictures: true,
  },
  {
    id: 'adventure',
    label: msg('Text adventure'),
    hint: msg('Text only, with square corners, for the most room to read.'),
    layout: { picture: 'top', frame: 'plain', corners: 'square' },
    pictures: false,
  },
];

export const PICTURE_PLACES: { id: PicturePlace; label: string }[] = [
  { id: 'top', label: msg('Above') },
  { id: 'side', label: msg('Beside') },
  { id: 'behind', label: msg('Behind') },
];

export const STORY_FRAMES: { id: StoryFrame; label: string }[] = [
  { id: 'plain', label: msg('None') },
  { id: 'page', label: msg('Page') },
  { id: 'panel', label: msg('Glass') },
  { id: 'box', label: msg('Dialog box') },
];

export const CORNERS: { id: Corners; label: string }[] = [
  { id: 'round', label: msg('Round') },
  { id: 'square', label: msg('Square') },
];

/** The preset these settings are, or null when they are the player's own mix. */
export function matchingPreset(layout: ScreenLayout, pictures: boolean): LayoutPresetId | null {
  const found = LAYOUT_PRESETS.find(
    (p) =>
      p.pictures === pictures &&
      p.layout.picture === layout.picture &&
      p.layout.frame === layout.frame &&
      p.layout.corners === layout.corners,
  );
  return found?.id ?? null;
}

/** Picture sizes the player dragged to; null keeps the size that fits the window. */
export type StageSizes = {
  /** Height of the picture above the story, in pixels. */
  top: number | null;
  /** Width of the picture beside the story, in pixels. */
  side: number | null;
  /** Height of the text box over the picture, as a percentage of the reader. */
  box: number | null;
};

/** Smallest picture before letting go hides it (pixels). */
export const STAGE_MIN = { top: 72, side: 120 } as const;
/** Text box heights, in percent: beyond the most, the picture is hidden. */
export const BOX_RANGE = { min: 22, max: 88, standard: 42 } as const;

type State = ScreenLayout & {
  sizes: StageSizes;
  update: (next: Partial<ScreenLayout>) => void;
  /** Change a size; `keep` saves it on this computer (once a drag ends). */
  setSize: (next: Partial<StageSizes>, keep?: boolean) => void;
};

const STORAGE_KEY = 'dtl.screenLayout';
const DEFAULT_LAYOUT: ScreenLayout = LAYOUT_PRESETS[0]!.layout;
const NO_SIZES: StageSizes = { top: null, side: null, box: null };

const oneOf = <T extends string>(list: { id: T }[], v: unknown, fallback: T): T =>
  list.some((x) => x.id === v) ? (v as T) : fallback;
const size = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : null;

function load(): ScreenLayout & { sizes: StageSizes } {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as
      (Partial<ScreenLayout> & { sizes?: Partial<StageSizes> }) | null;
    if (!raw) return { ...DEFAULT_LAYOUT, sizes: NO_SIZES };
    return {
      picture: oneOf(PICTURE_PLACES, raw.picture, DEFAULT_LAYOUT.picture),
      frame: oneOf(STORY_FRAMES, raw.frame, DEFAULT_LAYOUT.frame),
      corners: oneOf(CORNERS, raw.corners, DEFAULT_LAYOUT.corners),
      sizes: {
        top: size(raw.sizes?.top),
        side: size(raw.sizes?.side),
        box: size(raw.sizes?.box),
      },
    };
  } catch {
    return { ...DEFAULT_LAYOUT, sizes: NO_SIZES };
  }
}

function save(state: ScreenLayout & { sizes: StageSizes }) {
  try {
    const { picture, frame, corners, sizes } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ picture, frame, corners, sizes }));
  } catch {
    // A preference only; it still applies until the app closes.
  }
}

export const useScreenLayout = create<State>((set, get) => ({
  ...load(),
  update: (next) => {
    set(next);
    save(get());
  },
  setSize: (next, keep = false) => {
    set({ sizes: { ...get().sizes, ...next } });
    if (keep) save(get());
  },
}));

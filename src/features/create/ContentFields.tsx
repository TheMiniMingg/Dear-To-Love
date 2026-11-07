import { useState } from 'react';
import { ArrowPicker, type PickerOption } from '../../components/ArrowPicker';
import { Dialog } from '../../components/Dialog';
import type { Character, ContentRating, Narration } from '../../types';
import { LinesField, ToggleList, uniq } from './fields';

/** Genres offered as checkboxes; any other genre can be typed in Custom mode. */
export const GENRES = [
  'Romance',
  'Fantasy',
  'Science fiction',
  'Mystery',
  'Horror',
  'Thriller',
  'Adventure',
  'Comedy',
  'Drama',
  'Historical',
  'Slice of life',
  'Noir',
  'Supernatural',
  'Dark romance',
  'Erotica',
  'School life',
  'Action',
  'Cyberpunk',
  'Post-apocalyptic',
  'Superhero',
  'Western',
  'Dating sim',
];

/** The first choice when making a story; it leads the story's genres. */
export const STORY_TYPES = [
  'Romance',
  'Adventure',
  'Fantasy',
  'Mystery',
  'Horror',
  'Science fiction',
  'Comedy',
  'Drama',
  'Slice of life',
  'School life',
  'Thriller',
  'Historical',
];

/** True when a world template is tagged with this story type. */
export function worldFits(genres: string[] | undefined, storyType: string): boolean {
  const t = storyType.trim().toLowerCase();
  return !t || (genres ?? []).some((g) => g.trim().toLowerCase() === t);
}

/** Genres led by `storyType` (moved to the front, not duplicated). */
export function withStoryType(genres: string[] | undefined, storyType: string): string[] {
  const t = storyType.trim();
  const rest = (genres ?? []).filter((g) => g.trim().toLowerCase() !== t.toLowerCase());
  return t ? [t, ...rest] : rest;
}

type RatingChoice = ContentRating | '';

export const RATINGS: PickerOption<RatingChoice>[] = [
  { value: '', label: 'Not set', hint: 'The storyteller decides, within its own rules.' },
  { value: 'general', label: 'All ages', hint: 'Nothing graphic. Romance stays off the page.' },
  {
    value: 'mature',
    label: 'Mature',
    hint: 'Violence, horror, strong language and sexual situations, without explicit sex.',
  },
  {
    value: 'explicit',
    label: 'Adults only (explicit)',
    hint: 'Anything between adults, written openly, including kinks and fetishes you list below.',
  },
];

export const RATING_LABELS: Record<ContentRating, string> = {
  general: 'All ages',
  mature: 'Mature',
  explicit: 'Adults only',
};

const ADULT_CONFIRMED_KEY = 'dtl.adultConfirmed';

function adultConfirmed(): boolean {
  try {
    return localStorage.getItem(ADULT_CONFIRMED_KEY) === 'yes';
  } catch {
    return false;
  }
}

function rememberAdultConfirmed() {
  try {
    localStorage.setItem(ADULT_CONFIRMED_KEY, 'yes');
  } catch {
    // Not remembered: the question comes back next time, which is fine.
  }
}

const MINOR_WORDS = new Set([
  'child',
  'children',
  'kid',
  'kids',
  'minor',
  'underage',
  'teen',
  'teens',
  'teenage',
  'teenager',
  'preteen',
  'tween',
  'adolescent',
  'toddler',
  'infant',
  'schoolgirl',
  'schoolboy',
  'schoolchild',
  'juvenile',
  'youngster',
  'loli',
  'shota',
]);
const SMALL_NUMBERS = new Set([
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
]);
const LARGE_NUMBERS = new Set([
  'eighteen',
  'nineteen',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
  'hundred',
  'thousand',
  'million',
]);

/**
 * Whether an age reads as under 18. Mirrors the app's own check, which
 * refuses such characters in adults-only stories.
 */
export function namesAMinor(age: string | undefined | null): boolean {
  const lower = (age ?? '').toLowerCase().replace(/,/g, '');
  const digits = /\d+/.exec(lower)?.[0] ?? '';
  if (digits && Number(digits) < 18) return true;
  const words = lower.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.some((w) => MINOR_WORDS.has(w))) return true;
  return (
    !digits && !words.some((w) => LARGE_NUMBERS.has(w)) && words.some((w) => SMALL_NUMBERS.has(w))
  );
}

/** Characters who cannot be in an adults-only story, by name. */
export function minorsIn(characters: Character[]): string[] {
  return characters.filter((c) => namesAMinor(c.age)).map((c) => c.name.trim() || 'Unnamed');
}

/** Trimmed, non-empty entries; undefined when nothing is left. */
export function cleanOptionalList(list: string[] | undefined): string[] | undefined {
  const out = (list ?? []).map((t) => t.trim()).filter(Boolean);
  return out.length ? out : undefined;
}

/**
 * Genre, content rating, themes and hard limits: what kind of story this is.
 * Everything here reaches the storyteller with every reply.
 */
export function ContentFields({
  narration,
  onChange,
  genrePresets = [],
  pickGenres = true,
}: {
  narration: Narration;
  onChange: (patch: Partial<Narration>) => void;
  /** Extra genres to offer (e.g. from the templates). */
  genrePresets?: string[];
  /** Checkboxes over presets; false types genres one per line instead. */
  pickGenres?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const rating: RatingChoice = narration.rating ?? '';
  const chooseRating = (r: RatingChoice) => {
    if (r === 'explicit' && !adultConfirmed()) {
      setAsking(true);
      return;
    }
    onChange({ rating: r || undefined });
  };
  return (
    <>
      {pickGenres ? (
        <ToggleList
          legend="Genre"
          columns
          presets={uniq([...GENRES, ...genrePresets])}
          value={narration.genres ?? []}
          onChange={(genres) => onChange({ genres })}
        />
      ) : (
        <LinesField
          label="Genre"
          rows={2}
          value={narration.genres ?? []}
          hint="One per line, such as Romance or Horror. Any genre works."
          onChange={(genres) => onChange({ genres })}
        />
      )}
      <ArrowPicker
        label="Content rating"
        options={RATINGS}
        value={rating}
        onChange={chooseRating}
      />
      <LinesField
        label="Themes and elements you want"
        rows={2}
        value={narration.themes ?? []}
        hint={
          rating === 'explicit'
            ? 'One per line: tropes, dynamics, kinks or fetishes the storyteller should weave in. Every character involved is an adult.'
            : 'One per line, such as slow burn, found family or a rivalry.'
        }
        onChange={(themes) => onChange({ themes })}
      />
      <LinesField
        label="Hard limits"
        rows={2}
        value={narration.limits ?? []}
        hint="One per line. The storyteller never writes these, even if the story drifts toward them."
        onChange={(limits) => onChange({ limits })}
      />
      {asking && (
        <Dialog title="Adults only" onClose={() => setAsking(false)}>
          <p>
            Adults-only stories can contain explicit sexual content. They are only for players who
            are 18 or older, and every character in them must be an adult.
          </p>
          <p className="muted small">
            Whether a model writes explicit scenes also depends on the provider you connect. Local
            models (Ollama, LM Studio) follow your settings; some hosted services refuse.
          </p>
          <div className="button-row">
            <button type="button" onClick={() => setAsking(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => {
                rememberAdultConfirmed();
                setAsking(false);
                onChange({ rating: 'explicit' });
              }}
            >
              I am 18 or older
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}

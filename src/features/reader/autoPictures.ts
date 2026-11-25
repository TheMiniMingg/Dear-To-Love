/**
 * Pictures as the story goes (Settings -> Pictures): when a reply brings
 * someone without a portrait into the scene, moves the story to a place with
 * no picture, or gives the player a new item, the reader can find a matching
 * picture in the library or make one with the picture connection, asking
 * first or on its own. Limits keep it from making too many: a number per
 * story, a number per day, and a few replies between pictures. Settings and
 * counts are kept on this computer.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { commands, errorMessage } from '../../api/commands';
import type {
  AssetDto,
  EventDto,
  PictureSubject,
  PortraitStyle,
  ProviderProfile,
  RouteView,
} from '../../types';
import { t } from '../../i18n';
import {
  BACKGROUND,
  itemKey,
  itemSlot,
  picture,
  placeKey,
  placeSlot,
  portraitSlot,
} from './pictures';
import { scenePlaces } from './stage';

/** Off, ask under the reply first, or make them without asking. */
export type AutoMode = 'off' | 'ask' | 'auto';

export type AutoPictureSettings = {
  mode: AutoMode;
  /** Portraits of people in the scene who have none. */
  people: boolean;
  /** Pictures of places the story moves to. */
  places: boolean;
  /** Pictures of items the player is given. */
  items: boolean;
  /** Pictures made for one story at most (0: no limit). Pictures found in the library don't count. */
  perStory: number;
  /** Pictures made in a day at most, across stories (0: no limit). */
  perDay: number;
  /** Replies from one made picture to the next (1: any reply). */
  gap: number;
  style: PortraitStyle;
  /** Keep made pictures for every story, so others can use them again. */
  share: boolean;
  /** Use a matching picture from the library before making one. */
  reuse: boolean;
};

export const AUTO_DEFAULTS: AutoPictureSettings = {
  mode: 'ask',
  people: true,
  places: true,
  items: false,
  perStory: 12,
  perDay: 20,
  gap: 3,
  style: 'painted',
  share: true,
  reuse: true,
};

const SETTINGS_KEY = 'dtl.autoPictures';
const LOG_KEY = 'dtl.autoPicturesLog';
const MODES: AutoMode[] = ['off', 'ask', 'auto'];
const STYLES: PortraitStyle[] = ['painted', 'anime', 'photo', 'sketch'];

function count(v: unknown, fallback: number, max: number): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : fallback;
}

/** Settings read back from storage; anything missing or wrong takes its default. */
export function readSettings(raw: unknown): AutoPictureSettings {
  const d = AUTO_DEFAULTS;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...d };
  const r = raw as Record<string, unknown>;
  const flag = (k: keyof AutoPictureSettings) =>
    typeof r[k] === 'boolean' ? (r[k] as boolean) : (d[k] as boolean);
  return {
    mode: MODES.includes(r.mode as AutoMode) ? (r.mode as AutoMode) : d.mode,
    people: flag('people'),
    places: flag('places'),
    items: flag('items'),
    perStory: count(r.perStory, d.perStory, 1000),
    perDay: count(r.perDay, d.perDay, 1000),
    gap: Math.max(1, count(r.gap, d.gap, 100)),
    style: STYLES.includes(r.style as PortraitStyle) ? (r.style as PortraitStyle) : d.style,
    share: flag('share'),
    reuse: flag('reuse'),
  };
}

function loadSettings(): AutoPictureSettings {
  try {
    return readSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null'));
  } catch {
    return { ...AUTO_DEFAULTS };
  }
}

/** Pictures as the story goes: the player's settings. Kept on this computer. */
export const useAutoPictureSettings = create<{
  settings: AutoPictureSettings;
  change: (patch: Partial<AutoPictureSettings>) => void;
}>((set, get) => ({
  settings: loadSettings(),
  change: (patch) => {
    const settings = { ...get().settings, ...patch };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // A preference only: the defaults are back next time.
    }
    set({ settings });
  },
}));

/** What happened with pictures in one story. */
export type StoryLog = {
  /** Pictures made for it. */
  made: number;
  /** The number of replies when the last one was made. */
  lastReply: number | null;
  /** Slots already handled (made, found, declined or failed): never asked again. */
  done: string[];
  /** The player turned pictures off for this story. */
  off?: boolean;
};

export type AutoLog = {
  stories: Record<string, StoryLog>;
  /** The day `today` counts (YYYY-MM-DD, this computer's time). */
  day: string;
  today: number;
};

const MAX_STORIES = 60;
const MAX_DONE = 300;

export function today(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export function readLog(raw: unknown): AutoLog {
  const empty: AutoLog = { stories: {}, day: today(), today: 0 };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty;
  const r = raw as Record<string, unknown>;
  const stories: Record<string, StoryLog> = {};
  if (r.stories && typeof r.stories === 'object') {
    for (const [id, v] of Object.entries(r.stories as Record<string, unknown>)) {
      if (!v || typeof v !== 'object') continue;
      const s = v as Record<string, unknown>;
      stories[id] = {
        made: count(s.made, 0, 1_000_000),
        lastReply: typeof s.lastReply === 'number' ? s.lastReply : null,
        done: Array.isArray(s.done)
          ? s.done.filter((x): x is string => typeof x === 'string').slice(-MAX_DONE)
          : [],
        off: s.off === true || undefined,
      };
    }
  }
  const day = typeof r.day === 'string' ? r.day : empty.day;
  return {
    stories,
    day: empty.day,
    today: day === empty.day ? count(r.today, 0, 1_000_000) : 0,
  };
}

export function loadLog(): AutoLog {
  try {
    return readLog(JSON.parse(localStorage.getItem(LOG_KEY) ?? 'null'));
  } catch {
    return readLog(null);
  }
}

function saveLog(log: AutoLog) {
  const ids = Object.keys(log.stories);
  const stories =
    ids.length > MAX_STORIES
      ? Object.fromEntries(ids.slice(-MAX_STORIES).map((id) => [id, log.stories[id]!]))
      : log.stories;
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify({ ...log, stories }));
  } catch {
    // A convenience only.
  }
}

export function storyLog(log: AutoLog, storyId: string): StoryLog {
  return log.stories[storyId] ?? { made: 0, lastReply: null, done: [] };
}

/** Changes one story's log and saves it. */
function update(storyId: string, f: (s: StoryLog, log: AutoLog) => void): AutoLog {
  const log = loadLog();
  const s = { ...storyLog(log, storyId) };
  s.done = [...s.done];
  f(s, log);
  s.done = s.done.slice(-MAX_DONE);
  // Re-inserted last, so the stories played most recently are kept.
  delete log.stories[storyId];
  log.stories[storyId] = s;
  saveLog(log);
  return log;
}

/** Turns pictures as the story goes on or off for one story. */
export function setStoryOff(storyId: string, off: boolean) {
  update(storyId, (s) => {
    s.off = off || undefined;
  });
}

/** Whether pictures as the story goes are off for one story. */
export function storyOff(storyId: string): boolean {
  return !!storyLog(loadLog(), storyId).off;
}

/** Something the story could have a picture of. */
export type Want =
  | { kind: 'portrait'; slot: string; name: string; characterId: string }
  | { kind: 'place'; slot: string; name: string; time: string }
  | { kind: 'item'; slot: string; name: string; description: string };

/** The replies in a route's history. */
export function replyCount(events: EventDto[]): number {
  return events.filter((e) => e.kind === 'assistant').length;
}

/**
 * What the story could have a picture of now, in order: people in the scene
 * without a portrait (not the player), the place it is in when that has no
 * picture, then items without one. The opening place is left to the story's
 * background when it has one.
 */
export function wanted(
  view: RouteView,
  kinds: Pick<AutoPictureSettings, 'people' | 'places' | 'items'>,
): Want[] {
  const s = view.state.state;
  const out: Want[] = [];
  if (kinds.people) {
    for (const id of s.scene?.participantIds ?? []) {
      const c = s.characters?.[id];
      if (!c || id === s.playerCharacterId || !c.name.trim()) continue;
      const slot = portraitSlot(id);
      if (picture(view, slot).assetId) continue;
      out.push({ kind: 'portrait', slot, name: c.name.trim(), characterId: id });
    }
  }
  const place = s.scene?.location?.trim() ?? '';
  if (kinds.places && place && !picture(view, placeSlot(place)).assetId) {
    const been = scenePlaces(view.history);
    const opening = been.length ? placeKey(been[been.length - 1]!) : placeKey(place);
    const hasBackground = !!picture(view, BACKGROUND).assetId;
    if (!(hasBackground && opening === placeKey(place))) {
      out.push({
        kind: 'place',
        slot: placeSlot(place),
        name: place,
        time: s.scene?.time?.trim() ?? '',
      });
    }
  }
  if (kinds.items && s.tracking?.inventory !== false) {
    for (const item of s.tracking?.items ?? []) {
      const name = item.name.trim();
      if (!name || picture(view, itemSlot(name)).assetId) continue;
      out.push({ kind: 'item', slot: itemSlot(name), name, description: item.description ?? '' });
    }
  }
  return out;
}

/** Why no picture can be made now, or null when one can. */
export type Limit = 'story' | 'day' | 'gap';

export function limitReached(
  settings: AutoPictureSettings,
  log: AutoLog,
  storyId: string,
  replies: number,
): Limit | null {
  const s = storyLog(log, storyId);
  if (settings.perStory > 0 && s.made >= settings.perStory) return 'story';
  if (settings.perDay > 0 && log.today >= settings.perDay) return 'day';
  if (s.lastReply !== null && replies - s.lastReply < settings.gap) return 'gap';
  return null;
}

const plain = (s: string) => s.trim().split(/\s+/).join(' ').toLowerCase();

/**
 * A library picture that fits, usable by this story: its own pictures first,
 * then shared ones. A portrait matches "Portrait of <name>" or the name; a
 * place or an item matches its name, tagged as a place, background or item.
 */
export function libraryMatch(
  want: Want,
  images: AssetDto[],
  storyId: string,
): AssetDto | undefined {
  const own = (a: AssetDto) => a.stories.some((s) => s.id === storyId);
  const usable = images.filter((a) => a.shared || own(a));
  const fits = (a: AssetDto) => {
    const label = plain(a.label);
    switch (want.kind) {
      case 'portrait':
        return (
          a.tags.includes('Portrait') &&
          (label === plain(`Portrait of ${want.name}`) || label === plain(want.name))
        );
      case 'place':
        return (
          (a.tags.includes('Place') || a.tags.includes('Background')) &&
          placeKey(a.label) === placeKey(want.name)
        );
      case 'item':
        return a.tags.includes('Item') && itemKey(a.label) === itemKey(want.name);
    }
  };
  const found = usable.filter(fits);
  return found.find(own) ?? found[0];
}

/** "Portrait of Mara", "Picture of the pier". */
export function wantLabel(want: Want): string {
  return want.kind === 'portrait'
    ? t('Portrait of {name}', { name: want.name })
    : t('Picture of {name}', { name: want.name });
}

export function subjectOf(view: RouteView, want: Want): PictureSubject | null {
  switch (want.kind) {
    case 'portrait': {
      const character = view.state.state.characters?.[want.characterId];
      return character ? { kind: 'portrait', character } : null;
    }
    case 'place':
      return { kind: 'place', name: want.name, time: want.time };
    case 'item':
      return { kind: 'item', name: want.name, description: want.description };
  }
}

/** A picture for the story: made, or found in the library. */
export type AutoMade = { want: Want; assetId: string; label: string; reused: boolean };

export type AutoPictureState = {
  /** The reply the card belongs under. */
  replyId: string | null;
  /** Asked first: the picture the player can make. */
  offer: Want | null;
  making: Want | null;
  made: AutoMade[];
  error: string | null;
};

const EMPTY: AutoPictureState = {
  replyId: null,
  offer: null,
  making: null,
  made: [],
  error: null,
};

/**
 * Watches the replies of the route being read and finds or makes pictures
 * for what they bring in, once per new reply. `onMade` puts a picture in
 * place on its route.
 */
export function useAutoPictures({
  view,
  free,
  painter,
  onMade,
}: {
  view: RouteView | null;
  /** No reply is being written or waited for. */
  free: boolean;
  /** The picture connection, when one is chosen. */
  painter: ProviderProfile | null | undefined;
  onMade: (view: RouteView, made: AutoMade) => void;
}) {
  const settings = useAutoPictureSettings((s) => s.settings);
  const [state, setState] = useState<AutoPictureState>(EMPTY);
  // The last reply looked at, by route: replies already there when a route
  // opens are not looked at, only new ones.
  const seen = useRef<{ routeId: string; replyId: string | null } | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const onMadeRef = useRef(onMade);
  onMadeRef.current = onMade;

  const make = useCallback(async (v: RouteView, want: Want, s: AutoPictureSettings) => {
    const subject = subjectOf(v, want);
    if (!subject) return;
    const storyId = v.story.id;
    update(storyId, (l) => {
      if (!l.done.includes(want.slot)) l.done.push(want.slot);
    });
    setState((st) => ({ ...st, offer: null, making: want, error: null }));
    try {
      const asset = await commands.makeStoryPicture({
        subject,
        world: v.state.state.world,
        style: s.style,
        storyId,
        share: s.share,
      });
      update(storyId, (l, log) => {
        l.made += 1;
        l.lastReply = replyCount(v.history);
        log.today += 1;
      });
      const made: AutoMade = { want, assetId: asset.id, label: wantLabel(want), reused: false };
      onMadeRef.current(v, made);
      setState((st) => ({ ...st, making: null, made: [...st.made, made] }));
    } catch (e) {
      setState((st) => ({
        ...st,
        making: null,
        error: t('{name} wasn’t made: {reason}', {
          name: wantLabel(want),
          reason: errorMessage(e),
        }),
      }));
    }
  }, []);

  const look = useCallback(
    async (v: RouteView, replyId: string, s: AutoPictureSettings) => {
      const storyId = v.story.id;
      const log = loadLog();
      const sl = storyLog(log, storyId);
      if (sl.off) return;
      let wants = wanted(v, s).filter((w) => !sl.done.includes(w.slot));
      if (!wants.length) return;
      setState({ ...EMPTY, replyId });
      if (s.reuse) {
        const images = await commands.listImages().catch(() => [] as AssetDto[]);
        const found: AutoMade[] = [];
        wants = wants.filter((w) => {
          const match = libraryMatch(w, images, storyId);
          if (match) found.push({ want: w, assetId: match.id, label: wantLabel(w), reused: true });
          return !match;
        });
        if (found.length) {
          update(storyId, (l) => {
            for (const f of found) if (!l.done.includes(f.want.slot)) l.done.push(f.want.slot);
          });
          for (const f of found) onMadeRef.current(v, f);
          setState((st) => ({ ...st, made: [...st.made, ...found] }));
        }
      }
      const want = wants[0];
      if (!want || !painter) return;
      if (limitReached(s, loadLog(), storyId, replyCount(v.history))) return;
      if (s.mode === 'ask') setState((st) => ({ ...st, offer: want }));
      else await make(v, want, s);
    },
    [painter, make],
  );

  useEffect(() => {
    if (!view) return;
    const latest = view.history.findLast((e) => e.kind === 'assistant')?.id ?? null;
    const prev = seen.current;
    if (!prev || prev.routeId !== view.route.id) {
      seen.current = { routeId: view.route.id, replyId: latest };
      setState(EMPTY);
      return;
    }
    if (!free || latest === prev.replyId || !latest) return;
    seen.current = { routeId: view.route.id, replyId: latest };
    setState(EMPTY);
    if (settings.mode === 'off' || painter === undefined) return;
    void look(view, latest, settings);
  }, [view, free, settings, painter, look]);

  return {
    state,
    /** Make the offered picture. */
    accept: () => {
      const v = viewRef.current;
      if (v && state.offer) void make(v, state.offer, settings);
    },
    /** Not this one: it isn't offered again in this story. */
    decline: () => {
      const v = viewRef.current;
      const want = state.offer;
      if (!v || !want) return;
      update(v.story.id, (l) => {
        if (!l.done.includes(want.slot)) l.done.push(want.slot);
      });
      setState((st) => ({ ...st, offer: null }));
    },
    /** No more pictures as this story goes (Pictures turns them back on). */
    offForStory: () => {
      const v = viewRef.current;
      if (!v) return;
      setStoryOff(v.story.id, true);
      setState((st) => ({ ...st, offer: null }));
    },
    dismissError: () => setState((st) => ({ ...st, error: null })),
  };
}

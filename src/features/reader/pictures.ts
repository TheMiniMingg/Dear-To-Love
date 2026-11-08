import type { RouteView, StateEdit } from '../../types';
import { t } from '../../i18n';

export const COVER = 'cover';
export const BACKGROUND = 'background';
export const portraitSlot = (characterId: string) => `portrait:${characterId}`;

/** An item's key, as `tracking::item_key` in Rust: lower case, single spaces. */
export const itemKey = (name: string) => name.trim().split(/\s+/).join(' ').toLowerCase();
export const itemSlot = (name: string) => `item:${itemKey(name)}`;

export const PLACE_PREFIX = 'place:';
/** A place's key: the same rules as an item's. */
export const placeKey = itemKey;
/** The slot of a place's picture, shown instead of the background while the story is there. */
export const placeSlot = (name: string) => `${PLACE_PREFIX}${placeKey(name)}`;
/** A place known only by its key, shown with a capital: "The pier" for "the pier". */
export const placeFromKey = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);

/** The picture for the scene's place when it has one, else the background. */
export function sceneBackground(view: RouteView): Picture {
  const place = view.state.state.scene?.location?.trim();
  if (place) {
    const own = picture(view, placeSlot(place));
    if (own.assetId) return own;
  }
  return picture(view, BACKGROUND);
}

export type PictureSource = 'route' | 'default' | 'none';

/** Where a slot's picture comes from on this route, and which image it is. */
export type Picture = { assetId: string | null; source: PictureSource; defaultId: string | null };

/** Story defaults, overridden by this route's own choices up to its head. */
export function picture(view: RouteView, slot: string): Picture {
  const defaultId = view.visuals?.find((v) => v.slot === slot)?.assetId ?? null;
  const own = view.state.state.visualRefs?.[slot];
  if (own) return { assetId: own, source: 'route', defaultId };
  return { assetId: defaultId, source: defaultId ? 'default' : 'none', defaultId };
}

/** True when an edit only changes pictures (shown as "Picture changed"). */
export function picturesOnly(changes: StateEdit[]): boolean {
  return changes.length > 0 && changes.every((c) => c.op === 'setVisualRef');
}

/** Readable slot name: "Background", "Cover", "Portrait of Mara Quill", "Picture of the pier". */
export function slotName(view: RouteView, slot: string): string {
  if (slot === COVER) return t('Cover');
  if (slot === BACKGROUND) return t('Background');
  if (slot.startsWith('item:')) {
    const key = slot.slice('item:'.length);
    const item = view.state.state.tracking?.items?.find((i) => itemKey(i.name) === key);
    return t('Picture of {name}', { name: item?.name ?? key });
  }
  if (slot.startsWith(PLACE_PREFIX)) {
    const key = slot.slice(PLACE_PREFIX.length);
    const place = view.state.state.scene?.location;
    return t('Picture of {name}', {
      name: place && placeKey(place) === key ? place.trim() : placeFromKey(key),
    });
  }
  const id = slot.startsWith('portrait:') ? slot.slice('portrait:'.length) : slot;
  const name = view.state.state.characters?.[id]?.name;
  return name ? t('Portrait of {name}', { name }) : t('Portrait of a character');
}

import type { RouteView, StateEdit } from '../../types';
import { t } from '../../i18n';

export const COVER = 'cover';
export const BACKGROUND = 'background';
export const portraitSlot = (characterId: string) => `portrait:${characterId}`;

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

/** Readable slot name: "Background", "Cover", "Portrait of Mara Quill". */
export function slotName(view: RouteView, slot: string): string {
  if (slot === COVER) return t('Cover');
  if (slot === BACKGROUND) return t('Background');
  const id = slot.startsWith('portrait:') ? slot.slice('portrait:'.length) : slot;
  const name = view.state.state.characters?.[id]?.name;
  return name ? t('Portrait of {name}', { name }) : t('Portrait of a character');
}

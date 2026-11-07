import type { EventDto } from '../../types';
import { parseBlocks } from './messages';

export type SceneLabel = { place: string; time: string };

/**
 * Where and when the story is now: the newest scene heading a reply wrote
 * (`<scene place time/>`), unless Story details changed the scene since;
 * then, or with no heading at all, the scene's location.
 */
export function currentScene(events: EventDto[], location: string): SceneLabel {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.kind === 'edit' && e.payload.changes.some((c) => c.op === 'setScene')) break;
    if (e.kind !== 'assistant') continue;
    const blocks = parseBlocks(e.payload.text);
    for (let j = blocks.length - 1; j >= 0; j--) {
      const b = blocks[j]!;
      if (b.kind === 'scene' && (b.attrs.place || b.attrs.time)) {
        return { place: b.attrs.place ?? '', time: b.attrs.time ?? '' };
      }
    }
  }
  return { place: location.trim(), time: '' };
}

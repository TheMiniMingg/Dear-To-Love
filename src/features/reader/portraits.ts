import { createContext } from 'react';
import type { RouteView } from '../../types';
import { samePerson } from './messages';
import { picture, portraitSlot } from './pictures';

/**
 * Finds the portrait of the character a message is from, by name, for the
 * avatar on text, call and post cards. Outside a story there are none.
 */
export const PortraitsContext = createContext<(name: string) => string | null>(() => null);

/** Portraits of the story's characters on this route, looked up by name. */
export function portraitFinder(view: RouteView): (name: string) => string | null {
  const characters = Object.values(view.state.state.characters ?? {});
  return (name) => {
    const c = characters.find((x) => samePerson(name, x.name));
    return c ? picture(view, portraitSlot(c.id)).assetId : null;
  };
}

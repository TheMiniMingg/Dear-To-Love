import { shortcutKeys, type ShortcutId } from '../app/shortcuts';

/**
 * The keys of a shortcut beside a menu item, such as "Ctrl+L". Screen
 * readers get them from the button's `aria-keyshortcuts` instead.
 */
export function KeyHint({ id }: { id: ShortcutId }) {
  return (
    <kbd className="key-hint" aria-hidden="true">
      {shortcutKeys(id)}
    </kbd>
  );
}

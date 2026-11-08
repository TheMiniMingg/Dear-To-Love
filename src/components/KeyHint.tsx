import { shortcutKeys, useShortcutKeys, type ShortcutId } from '../app/shortcuts';

/**
 * The keys of a shortcut beside a menu item, such as "Ctrl+L". Screen
 * readers get them from the button's `aria-keyshortcuts` instead.
 */
export function KeyHint({ id }: { id: ShortcutId }) {
  // Follows a change made in the Keyboard shortcuts window.
  useShortcutKeys((s) => s.custom[id]);
  const keys = shortcutKeys(id);
  if (!keys) return null;
  return (
    <kbd className="key-hint" aria-hidden="true">
      {keys}
    </kbd>
  );
}

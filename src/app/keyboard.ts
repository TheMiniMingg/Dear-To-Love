import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

type AnyKeyEvent = KeyboardEvent | ReactKeyboardEvent;

/** True when the event target edits text, so global shortcuts must not fire. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    return !['button', 'checkbox', 'radio', 'submit', 'reset', 'range'].includes(type);
  }
  return tag === 'SELECT';
}

/** True while an IME is composing (e.g. Japanese input); never treat Enter as submit then. */
export function isComposing(e: AnyKeyEvent): boolean {
  const native = 'nativeEvent' in e ? e.nativeEvent : e;
  return native.isComposing || native.keyCode === 229;
}

export function isModS(e: AnyKeyEvent): boolean {
  return (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's';
}

/** Move focus among `[data-roving]` items inside `container` with Up/Down. */
export function moveRovingFocus(container: HTMLElement, delta: 1 | -1): void {
  const items = Array.from(container.querySelectorAll<HTMLElement>('[data-roving]'));
  if (items.length === 0) return;
  const i = items.indexOf(document.activeElement as HTMLElement);
  const next =
    i < 0 ? (delta > 0 ? 0 : items.length - 1) : (i + delta + items.length) % items.length;
  items[next]?.focus();
}

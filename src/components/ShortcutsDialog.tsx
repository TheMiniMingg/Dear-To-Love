import { Fragment, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { isComposing } from '../app/keyboard';
import {
  checkCombo,
  comboFromEvent,
  isMac,
  isShortcut,
  keyLabel,
  shortcutLabel,
  SHORTCUT_GROUPS,
  useShortcutHelp,
  useShortcutKeys,
  type ShortcutId,
} from '../app/shortcuts';
import { useUiStore } from '../app/store';
import { t } from '../i18n';
import { Dialog } from './Dialog';

type Item = (typeof SHORTCUT_GROUPS)[number]['items'][number];

/** A question or a refusal after keys were pressed for a shortcut. */
type Pending =
  { id: ShortcutId; combo: string; clash: ShortcutId } | { id: ShortcutId; error: string };

function Keys({ keys }: { keys: string[] }) {
  if (keys.length === 0) return <span className="muted">{t('No key')}</span>;
  return (
    <>
      {keys.map((k, n) => (
        <Fragment key={k}>
          {n > 0 && <span className="muted"> / </span>}
          <kbd>{keyLabel(k)}</kbd>
        </Fragment>
      ))}
    </>
  );
}

/** One shortcut: its keys, and Change to press new ones. */
function ShortcutRow({
  item,
  capturing,
  onCapture,
  onPressed,
}: {
  item: Item;
  capturing: boolean;
  onCapture: (on: boolean) => void;
  onPressed: (combo: string) => void;
}) {
  const custom = useShortcutKeys((s) => s.custom[item.id]);
  const keys = custom ?? item.keys;
  const listen = useRef<HTMLButtonElement>(null);
  const change = useRef<HTMLButtonElement>(null);
  const was = useRef(false);
  useEffect(() => {
    if (capturing) listen.current?.focus();
    // Back on Change once the keys are in (or kept), unless the focus moved on.
    else if (was.current && document.activeElement === document.body) change.current?.focus();
    was.current = capturing;
  }, [capturing]);
  const label = t(item.label);
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (isComposing(e.nativeEvent)) return;
    // Nothing else hears these keys: not the story, not this window.
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape' && !e.ctrlKey && !e.metaKey && !e.altKey) return onCapture(false);
    const combo = comboFromEvent(e);
    if (combo) onPressed(combo);
  };
  return (
    <>
      <dt>{label}</dt>
      <dd>
        {capturing ? (
          <button
            ref={listen}
            type="button"
            className="shortcut-capture"
            aria-label={t('Press the new keys for {name}, or Esc to keep them', { name: label })}
            onKeyDown={onKeyDown}
            onBlur={() => onCapture(false)}
          >
            {t('Press the keys…')}
          </button>
        ) : (
          <Keys keys={keys} />
        )}
        {!item.fixed && !capturing && (
          <span className="shortcut-edit">
            <button
              ref={change}
              type="button"
              className="link-button"
              aria-label={t('Change the keys for {name}', { name: label })}
              onClick={() => onCapture(true)}
            >
              {t('Change')}
            </button>
            {custom && (
              <button
                type="button"
                className="link-button"
                aria-label={t('Put back the usual keys for {name}', { name: label })}
                onClick={() => useShortcutKeys.getState().setKeys(item.id, null)}
              >
                {t('Reset')}
              </button>
            )}
          </span>
        )}
      </dd>
    </>
  );
}

/**
 * The Keyboard shortcuts window (F1), and the shortcuts that work on every
 * screen: F1 or Ctrl+/ for this window, Ctrl+, for Settings. Any shortcut
 * but the few typing needs can be changed here: Change, then press the keys.
 */
export function ShortcutsDialog() {
  const open = useShortcutHelp((s) => s.open);
  const setOpen = useShortcutHelp((s) => s.setOpen);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (isComposing(e) || e.defaultPrevented) return;
      if (isShortcut(e, 'help')) {
        e.preventDefault();
        setOpen(!useShortcutHelp.getState().open);
        return;
      }
      if (isShortcut(e, 'settings')) {
        e.preventDefault();
        // Not over an open window: it could hold unsaved changes.
        if (document.querySelector('[role="dialog"]')) return;
        const ui = useUiStore.getState();
        if (ui.screen.name !== 'settings') ui.navigate({ name: 'settings' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  if (!open) return null;
  return <ShortcutsWindow onClose={() => setOpen(false)} />;
}

/** The window itself; what it is asking starts afresh each time it opens. */
function ShortcutsWindow({ onClose }: { onClose: () => void }) {
  const custom = useShortcutKeys((s) => s.custom);
  const id = useId();
  const [capturing, setCapturing] = useState<ShortcutId | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const give = (sid: ShortcutId, combo: string, from: ShortcutId | null) => {
    const { setKeys } = useShortcutKeys.getState();
    if (from) setKeys(from, []);
    setKeys(sid, [combo]);
    setPending(null);
    setDone(
      from
        ? t('{name} is now {keys}, and {other} has no key.', {
            name: t(shortcutLabel(sid)),
            keys: keyLabel(combo),
            other: t(shortcutLabel(from)),
          })
        : t('{name} is now {keys}.', { name: t(shortcutLabel(sid)), keys: keyLabel(combo) }),
    );
  };

  const pressed = (sid: ShortcutId, combo: string) => {
    setCapturing(null);
    setDone(null);
    const check = checkCombo(sid, combo);
    if (!check.ok) {
      const mod = isMac() ? '⌘' : 'Ctrl';
      setPending({
        id: sid,
        error:
          check.reason === 'needsModifier'
            ? t(
                'Hold {mod} or {alt} with that key, so typing in a story doesn’t set it off. Function keys (F1 to F12) work alone.',
                { mod, alt: isMac() ? '⌥' : 'Alt' },
              )
            : t('{keys} is kept for the system or for editing text; choose other keys.', {
                keys: keyLabel(combo),
              }),
      });
      return;
    }
    if (check.clash) setPending({ id: sid, combo, clash: check.clash });
    else give(sid, combo, null);
  };

  const changed = Object.keys(custom).length > 0;
  return (
    <Dialog title={t('Keyboard shortcuts')} onClose={onClose} wide>
      {/* The long story list in one column; the short ones share the other. */}
      <div className="shortcut-groups">
        {[SHORTCUT_GROUPS.slice(0, 1), SHORTCUT_GROUPS.slice(1)].map((column, c) => (
          <div key={c}>
            {column.map((g) => {
              const i = SHORTCUT_GROUPS.indexOf(g);
              return (
                <section key={g.title} aria-labelledby={`${id}-${i}`}>
                  <h3 id={`${id}-${i}`}>{t(g.title)}</h3>
                  <dl className="shortcut-list">
                    {g.items.map((s) => (
                      <ShortcutRow
                        key={s.id}
                        item={s}
                        capturing={capturing === s.id}
                        onCapture={(on) => {
                          setPending(null);
                          setDone(null);
                          setCapturing(on ? s.id : null);
                        }}
                        onPressed={(combo) => pressed(s.id, combo)}
                      />
                    ))}
                  </dl>
                </section>
              );
            })}
          </div>
        ))}
      </div>
      {pending && 'error' in pending && (
        <p role="alert" className="error small">
          {pending.error}
        </p>
      )}
      {pending && 'clash' in pending && (
        <div role="alert" className="shortcut-clash">
          <p className="small">
            {t('{keys} already does {other}. Use it for {name} instead?', {
              keys: keyLabel(pending.combo),
              other: t(shortcutLabel(pending.clash)),
              name: t(shortcutLabel(pending.id)),
            })}
          </p>
          <div className="button-row">
            <button type="button" onClick={() => setPending(null)}>
              {t('Keep it as it is')}
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => give(pending.id, pending.combo, pending.clash)}
            >
              {t('Use it for {name}', { name: t(shortcutLabel(pending.id)) })}
            </button>
          </div>
        </div>
      )}
      {done && (
        <p role="status" className="small note-ok">
          {done}
        </p>
      )}
      <p className="muted small">
        {t(
          'Shortcuts with {mod} work while you type in the action box too. An open window takes its own keys first. Change sets your own keys; they are kept on this computer.',
          { mod: isMac() ? '⌘' : 'Ctrl' },
        )}
      </p>
      {changed && (
        <div className="button-row">
          <button
            type="button"
            onClick={() => {
              useShortcutKeys.getState().resetAll();
              setPending(null);
              setDone(t('Every shortcut has its usual keys again.'));
            }}
          >
            {t('Put back all the usual keys')}
          </button>
        </div>
      )}
    </Dialog>
  );
}

import { Fragment, useEffect, useId } from 'react';
import { isComposing } from '../app/keyboard';
import { isMac, isShortcut, keyLabel, SHORTCUT_GROUPS, useShortcutHelp } from '../app/shortcuts';
import { useUiStore } from '../app/store';
import { t } from '../i18n';
import { Dialog } from './Dialog';

/**
 * The Keyboard shortcuts window (F1), and the shortcuts that work on every
 * screen: F1 or Ctrl+/ for this window, Ctrl+, for Settings.
 */
export function ShortcutsDialog() {
  const open = useShortcutHelp((s) => s.open);
  const setOpen = useShortcutHelp((s) => s.setOpen);
  const id = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
  return (
    <Dialog title={t('Keyboard shortcuts')} onClose={() => setOpen(false)} wide>
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
                      <Fragment key={s.id}>
                        <dt>{t(s.label)}</dt>
                        <dd>
                          {s.keys.map((k, n) => (
                            <Fragment key={k}>
                              {n > 0 && <span className="muted"> / </span>}
                              <kbd>{keyLabel(k)}</kbd>
                            </Fragment>
                          ))}
                        </dd>
                      </Fragment>
                    ))}
                  </dl>
                </section>
              );
            })}
          </div>
        ))}
      </div>
      <p className="muted small">
        {t(
          'Shortcuts with {mod} work while you type in the action box too. An open window takes its own keys first.',
          { mod: isMac() ? '⌘' : 'Ctrl' },
        )}
      </p>
    </Dialog>
  );
}

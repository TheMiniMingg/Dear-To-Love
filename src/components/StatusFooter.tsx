import { useEffect, useState } from 'react';
import { commands } from '../api/commands';
import { ariaKeys, useShortcutHelp, withKeys } from '../app/shortcuts';
import { useUiStore } from '../app/store';
import type { AppInfo } from '../types';
import { ProblemDialog, useProblemReport } from '../features/diagnostics/ProblemDialog';
import { t, tr } from '../i18n';

/** How often an open app repeats the daily update check (it reuses a recent result). */
const RECHECK_MS = 6 * 60 * 60 * 1000;

/**
 * Persistent footer: installed version, Diagnostics, the optional
 * "Support development" link and, after the user opted in, a notice when a
 * newer release is out. It sits under the reader, never over the composer.
 */
export function StatusFooter() {
  const navigate = useUiStore((s) => s.navigate);
  const updates = useUiStore((s) => s.updates);
  const setUpdates = useUiStore((s) => s.setUpdates);
  const setHelp = useShortcutHelp((s) => s.setOpen);
  const reporting = useProblemReport((s) => s.open);
  const setReporting = useProblemReport((s) => s.setOpen);
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    commands
      .getAppInfo()
      .then((i) => {
        if (!cancelled) setInfo(i);
      })
      .catch(() => {
        if (!cancelled) setInfo(null);
      });
    // The daily check does nothing unless the user turned checks on, and a
    // failure only shows in Settings.
    const check = () =>
      commands
        .checkForUpdates(false)
        .then((u) => {
          if (!cancelled) setUpdates(u);
        })
        .catch(() => undefined);
    void check();
    const timer = setInterval(() => void check(), RECHECK_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [setUpdates]);

  const latest = updates?.showNotice ? updates.latest : null;

  const acknowledge = (version: string) =>
    void commands
      .acknowledgeUpdate(version)
      .then(setUpdates)
      .catch(() => undefined);

  return (
    <footer className="status-footer">
      <span data-testid="app-version">{info ? `v${info.version}` : t('version unknown')}</span>
      <button
        type="button"
        className="link-button"
        onClick={() => navigate({ name: 'diagnostics' })}
      >
        {t('Diagnostics')}
      </button>
      <button type="button" className="link-button" onClick={() => setReporting(true)}>
        {t('Report a problem')}
      </button>
      {reporting && <ProblemDialog onClose={() => setReporting(false)} />}
      <button type="button" className="link-button" onClick={() => navigate({ name: 'guide' })}>
        {t('Setup guide')}
      </button>
      <button
        type="button"
        className="link-button"
        onClick={() => setHelp(true)}
        aria-keyshortcuts={ariaKeys('help')}
        title={withKeys(t('Keyboard shortcuts'), 'help')}
      >
        {t('Keyboard shortcuts')}
      </button>
      {info?.supportUrl && (
        <button
          type="button"
          className="link-button"
          title={t('Opens in your browser')}
          onClick={() => void commands.openSupportPage().catch(() => undefined)}
        >
          {t('Support development')}
        </button>
      )}
      {latest && (
        <span className="update-notice" role="status" aria-label={t('Update available')}>
          <span>
            {tr('Dear to Love {version} is available.', {
              version: <strong>v{latest.version}</strong>,
            })}
          </span>
          <button
            type="button"
            className="link-button"
            title={t('Opens the release page on GitHub in your browser')}
            onClick={() => void commands.openReleasePage().catch(() => undefined)}
          >
            {t('View release')}
          </button>
          <button
            type="button"
            className="link-button"
            aria-label={t('Hide the notice for v{version}', { version: latest.version })}
            onClick={() => acknowledge(latest.version)}
          >
            ✓ {t('Got it')}
          </button>
        </span>
      )}
    </footer>
  );
}

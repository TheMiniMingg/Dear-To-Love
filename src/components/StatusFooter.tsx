import { useEffect, useState } from 'react';
import { commands } from '../api/commands';
import { useUiStore } from '../app/store';
import type { AppInfo } from '../types';

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
      <span data-testid="app-version">{info ? `v${info.version}` : 'version unknown'}</span>
      <button
        type="button"
        className="link-button"
        onClick={() => navigate({ name: 'diagnostics' })}
      >
        Diagnostics
      </button>
      {info?.supportUrl && (
        <button
          type="button"
          className="link-button"
          title="Opens in your browser"
          onClick={() => void commands.openSupportPage().catch(() => undefined)}
        >
          Support development
        </button>
      )}
      {latest && (
        <span className="update-notice" role="status" aria-label="Update available">
          <span>
            Dear to Love <strong>v{latest.version}</strong> is available.
          </span>
          <button
            type="button"
            className="link-button"
            title="Opens the release page on GitHub in your browser"
            onClick={() => void commands.openReleasePage().catch(() => undefined)}
          >
            View release
          </button>
          <button
            type="button"
            className="link-button"
            aria-label={`Hide the notice for v${latest.version}`}
            onClick={() => acknowledge(latest.version)}
          >
            ✓ Got it
          </button>
        </span>
      )}
    </footer>
  );
}

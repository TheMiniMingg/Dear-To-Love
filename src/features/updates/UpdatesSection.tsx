import { useEffect, useState } from 'react';
import { commands, errorMessage } from '../../api/commands';
import { formatWhen } from '../../api/backups';
import { useUiStore } from '../../app/store';
import type { AppInfo, UpdateStatus } from '../../types';

/** One sentence on what the last check found. */
export function describeUpdates(u: UpdateStatus): string {
  const when = u.checkedAt ? ` (checked ${formatWhen(u.checkedAt)})` : '';
  switch (u.state) {
    case 'off':
      return 'Update checks are off. Check now asks GitHub once.';
    case 'notChecked':
      return 'Not checked yet. The first check runs shortly.';
    case 'upToDate':
      return `v${u.installed} is the newest release${when}.`;
    case 'available':
      return `v${u.latest?.version ?? '?'} is available; you have v${u.installed}${when}.`;
    case 'unavailable': {
      const known = u.latest ? ` The newest release seen before was v${u.latest.version}.` : '';
      return `The last check did not work: ${u.message ?? 'unknown problem'}${when}. Nothing else is affected.${known}`;
    }
  }
}

/**
 * Settings: opt-in update checks (off by default), Check now, and the page
 * of a newer release. Nothing is ever downloaded or installed.
 */
export function UpdatesSection() {
  const updates = useUiStore((s) => s.updates);
  const setUpdates = useUiStore((s) => s.setUpdates);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    commands
      .getUpdateStatus()
      .then((u) => {
        if (!cancelled) setUpdates(u);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [setUpdates]);

  const run = async (action: () => Promise<UpdateStatus>) => {
    setBusy(true);
    setError(null);
    try {
      setUpdates(await action());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (enabled: boolean) =>
    void run(async () => {
      const st = await commands.setUpdateChecks(enabled);
      // Turning checks on runs the first daily check straight away.
      return enabled ? commands.checkForUpdates(false) : st;
    });

  const openRelease = async () => {
    setError(null);
    try {
      await commands.openReleasePage();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <section className="settings-section" aria-labelledby="updates-title">
      <h2 id="updates-title">Updates</h2>
      <label className="check">
        <input
          type="checkbox"
          checked={updates?.enabled ?? false}
          disabled={!updates || busy}
          onChange={(e) => toggle(e.target.checked)}
        />
        Check GitHub for a new release once a day
      </label>
      <p className="muted small">
        Reads the public release list of the Dear to Love repository. Nothing about you or your
        stories is sent, and nothing is downloaded or installed: a newer release only shows a notice
        with a link to its page.
      </p>
      <div className="button-row">
        <button
          type="button"
          disabled={!updates || busy}
          onClick={() => void run(() => commands.checkForUpdates(true))}
        >
          {busy ? 'Checking…' : 'Check now'}
        </button>
        {updates?.state === 'available' && updates.latest && (
          <button
            type="button"
            title="Opens the release page on GitHub in your browser"
            onClick={() => void openRelease()}
          >
            View release v{updates.latest.version}
          </button>
        )}
      </div>
      {updates && (
        <p
          role="status"
          className={
            updates.state === 'unavailable'
              ? 'small note-warn'
              : updates.state === 'available'
                ? 'small note-ok'
                : 'small'
          }
        >
          {describeUpdates(updates)}
        </p>
      )}
      {error && (
        <p role="alert" className="error small">
          {error}
        </p>
      )}
    </section>
  );
}

/** Settings: version, license, source code and the optional support link. */
export function AboutSection() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    commands
      .getAppInfo()
      .then((i) => {
        if (!cancelled) setInfo(i);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const open = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <section className="settings-section" aria-labelledby="about-title">
      <h2 id="about-title">About</h2>
      <p>
        {info ? (
          <>
            {info.name} <strong>v{info.version}</strong> ({info.os} {info.arch}
            {info.buildProfile === 'debug' ? ', development build' : ''}).
          </>
        ) : (
          'Dear to Love.'
        )}{' '}
        Free and open source under the MIT License.
      </p>
      <div className="button-row">
        <button
          type="button"
          title={info ? `Opens ${info.repositoryUrl} in your browser` : undefined}
          onClick={() => void open(commands.openRepositoryPage)}
        >
          Source code
        </button>
        {info?.supportUrl && (
          <button
            type="button"
            title="Opens in your browser"
            onClick={() => void open(commands.openSupportPage)}
          >
            Support development
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="error small">
          {error}
        </p>
      )}
    </section>
  );
}

import { useEffect, useState } from 'react';
import { Info, RefreshCw } from 'lucide-react';
import { commands, errorMessage } from '../../api/commands';
import { formatWhen } from '../../api/backups';
import { useUiStore } from '../../app/store';
import type { AppInfo, UpdateStatus } from '../../types';
import { joinSentences, t } from '../../i18n';

/** One sentence on what the last check found. */
export function describeUpdates(u: UpdateStatus): string {
  const when = u.checkedAt ? t(' (checked {when})', { when: formatWhen(u.checkedAt) }) : '';
  switch (u.state) {
    case 'off':
      return t('Update checks are off. Check now asks GitHub once.');
    case 'notChecked':
      return t('Not checked yet. The first check runs shortly.');
    case 'upToDate':
      return t('v{version} is the newest release{when}.', { version: u.installed, when });
    case 'available':
      return t('v{latest} is available; you have v{version}{when}.', {
        latest: u.latest?.version ?? '?',
        version: u.installed,
        when,
      });
    case 'unavailable': {
      const parts = [
        t('The last check did not work: {problem}{when}. Nothing else is affected.', {
          problem: u.message ?? t('unknown problem'),
          when,
        }),
      ];
      if (u.latest)
        parts.push(
          t('The newest release seen before was v{version}.', { version: u.latest.version }),
        );
      return joinSentences(parts);
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
    <section
      id="settings-updates"
      className="settings-section"
      tabIndex={-1}
      aria-labelledby="updates-title"
    >
      <h2 id="updates-title" className="section-title">
        <RefreshCw className="section-icon" aria-hidden={true} />
        {t('Updates')}
      </h2>
      <label className="check">
        <input
          type="checkbox"
          checked={updates?.enabled ?? false}
          disabled={!updates || busy}
          onChange={(e) => toggle(e.target.checked)}
        />
        {t('Check GitHub for a new release once a day')}
      </label>
      <p className="muted small">
        {t(
          'Reads the public release list of the Dear to Love repository. Nothing about you or your stories is sent, and nothing is downloaded or installed: a newer release only shows a notice with a link to its page.',
        )}
      </p>
      <div className="button-row">
        <button
          type="button"
          disabled={!updates || busy}
          onClick={() => void run(() => commands.checkForUpdates(true))}
        >
          {busy ? t('Checking…') : t('Check now')}
        </button>
        {updates?.state === 'available' && updates.latest && (
          <button
            type="button"
            title={t('Opens the release page on GitHub in your browser')}
            onClick={() => void openRelease()}
          >
            {t('View release v{version}', { version: updates.latest.version })}
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
    <section
      id="settings-about"
      className="settings-section"
      tabIndex={-1}
      aria-labelledby="about-title"
    >
      <h2 id="about-title" className="section-title">
        <Info className="section-icon" aria-hidden={true} />
        {t('About')}
      </h2>
      <p>
        {info ? (
          <>
            {info.name} <strong>v{info.version}</strong> ({info.os} {info.arch}
            {info.buildProfile === 'debug' ? t(', development build') : ''}).
          </>
        ) : (
          'Dear to Love.'
        )}{' '}
        {t('Free and open source under the MIT License.')}
      </p>
      <div className="button-row">
        <button
          type="button"
          title={info ? t('Opens {url} in your browser', { url: info.repositoryUrl }) : undefined}
          onClick={() => void open(commands.openRepositoryPage)}
        >
          {t('Source code')}
        </button>
        {info?.supportUrl && (
          <button
            type="button"
            title={t('Opens in your browser')}
            onClick={() => void open(commands.openSupportPage)}
          >
            {t('Support development')}
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

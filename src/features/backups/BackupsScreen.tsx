import { useEffect, useState } from 'react';
import {
  describeBackup,
  describePlan,
  formatWhen,
  kindLabel,
  pickBackupFile,
  pickBackupTarget,
} from '../../api/backups';
import { commands, errorMessage } from '../../api/commands';
import { formatBytes } from '../../api/images';
import { useUiStore } from '../../app/store';
import { Dialog } from '../../components/Dialog';
import type { BackupInfo, RestorePlan, RestoreSource } from '../../types';
import { t, tn, tr } from '../../i18n';

/** Settings -> Backups: back up everything, kept copies, and restore. */
export function BackupsScreen() {
  const goBack = useUiStore((s) => s.goBack);
  const [backups, setBackups] = useState<BackupInfo[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<RestorePlan | null>(null);

  useEffect(() => {
    let live = true;
    commands
      .listBackups()
      .then((list) => {
        if (live) setBackups(list);
      })
      .catch((e: unknown) => {
        if (live) setError(errorMessage(e));
      });
    return () => {
      live = false;
    };
  }, []);

  const run = async (label: string, work: () => Promise<void>) => {
    setError(null);
    setStatus(null);
    setBusy(label);
    try {
      await work();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const backUp = async () => {
    setError(null);
    const path = await pickBackupTarget().catch((e: unknown) => {
      setError(errorMessage(e));
      return null;
    });
    if (!path) return;
    await run(t('Saving the backup…'), async () => {
      setStatus(describeBackup(await commands.exportBackup(path)));
    });
  };

  const prepare = (source: RestoreSource) =>
    run(t('Checking the backup…'), async () => {
      setPlan(await commands.prepareRestore(source));
    });

  const restoreFile = async () => {
    setError(null);
    const path = await pickBackupFile().catch((e: unknown) => {
      setError(errorMessage(e));
      return null;
    });
    if (path) await prepare({ from: 'file', path });
  };

  const cancel = () => {
    setPlan(null);
    void commands.cancelRestore().catch(() => undefined);
  };

  const confirm = (p: RestorePlan) =>
    run(t('Restarting to finish the restore…'), async () => {
      await commands.confirmRestore(p.token);
      setPlan(null);
      await commands.restartApp();
    });

  return (
    <section className="screen" aria-labelledby="backups-title">
      <div className="screen-header">
        <button type="button" onClick={goBack}>
          {t('Back')}
        </button>
        <h1 id="backups-title">{t('Backups')}</h1>
      </div>
      <div aria-live="polite">
        {busy && <p className="muted">{busy}</p>}
        {status && <p role="status">{status}</p>}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <section className="settings-section" aria-labelledby="backup-all-title">
        <h2 id="backup-all-title">{t('Back up everything')}</h2>
        <p className="muted">
          {t(
            "One file with all your stories, pictures, settings, AI connections and usage records. API keys stay in your system's credential store and are never included. Keep the file somewhere else, like a USB drive or a cloud folder.",
          )}
        </p>
        <div className="button-row">
          <button type="button" className="primary" disabled={!!busy} onClick={() => void backUp()}>
            {t('Back up everything…')}
          </button>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="kept-title">
        <h2 id="kept-title">{t('Kept on this computer')}</h2>
        <p className="muted">
          {t(
            "Once a day when you play, a copy of your stories is kept automatically (the newest five). Pictures stay in your image library and aren't copied again.",
          )}
        </p>
        {backups && backups.length === 0 && <p>{t('No backups yet.')}</p>}
        {backups && backups.length > 0 && (
          <ul className="connection-list" aria-labelledby="kept-title">
            {backups.map((b) => {
              const what = t('{kind} backup from {when}', {
                kind: kindLabel(b.kind),
                when: formatWhen(b.createdAt),
              });
              return (
                <li key={b.id} className="connection-card backup-row">
                  <span>
                    <strong>{kindLabel(b.kind)}</strong>
                    <span className="muted">
                      {' '}
                      · {formatWhen(b.createdAt)} · {formatBytes(b.bytes)}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={!!busy}
                    aria-label={t('Restore {what}', { what })}
                    onClick={() => void prepare({ from: 'kept', id: b.id })}
                  >
                    {t('Restore…')}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="settings-section" aria-labelledby="restore-file-title">
        <h2 id="restore-file-title">{t('Restore from a file')}</h2>
        <p className="muted">
          {t('A backup made with Back up everything, on this or another computer.')}
        </p>
        <div className="button-row">
          <button type="button" disabled={!!busy} onClick={() => void restoreFile()}>
            {t('Restore from file…')}
          </button>
        </div>
      </section>

      {plan && (
        <Dialog title={t('Restore this backup?')} onClose={cancel}>
          <p>
            {plan.appVersion
              ? tr('{source}, made {when} by Dear to Love {version}: {what}', {
                  source: <strong>{plan.source}</strong>,
                  when: formatWhen(plan.createdAt),
                  version: plan.appVersion,
                  what: describePlan(plan),
                })
              : tr('{source}, made {when}: {what}', {
                  source: <strong>{plan.source}</strong>,
                  when: formatWhen(plan.createdAt),
                  what: describePlan(plan),
                })}
          </p>
          {plan.upgraded && (
            <p>{t('It comes from an earlier version and has been upgraded to open.')}</p>
          )}
          {plan.missingImages > 0 && (
            <p className="notice">
              {tn(
                plan.missingImages,
                "{n} picture isn't in the backup or your library and will show as missing.",
                "{n} pictures aren't in the backup or your library and will show as missing.",
              )}
            </p>
          )}
          <p>
            {t(
              'This replaces all your stories, pictures, settings and connections on this computer. Your current data is saved first, as "Before a restore" on this screen, so you can go back. The app restarts to finish.',
            )}
          </p>
          <p className="muted small">
            {t("API keys aren't in backups. On another computer, enter them again in Settings.")}
          </p>
          <div className="button-row">
            <button type="button" onClick={cancel}>
              {t('Keep my current data')}
            </button>
            <button
              type="button"
              className="danger"
              disabled={!!busy}
              onClick={() => void confirm(plan)}
            >
              {t('Restore and restart')}
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}

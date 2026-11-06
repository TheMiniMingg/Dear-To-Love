import { useEffect, useState } from 'react';
import {
  KIND_LABELS,
  describeBackup,
  describePlan,
  formatWhen,
  pickBackupFile,
  pickBackupTarget,
} from '../../api/backups';
import { commands, errorMessage } from '../../api/commands';
import { formatBytes } from '../../api/images';
import { useUiStore } from '../../app/store';
import { Dialog } from '../../components/Dialog';
import type { BackupInfo, RestorePlan, RestoreSource } from '../../types';

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
    await run('Saving the backup…', async () => {
      setStatus(describeBackup(await commands.exportBackup(path)));
    });
  };

  const prepare = (source: RestoreSource) =>
    run('Checking the backup…', async () => {
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
    run('Restarting to finish the restore…', async () => {
      await commands.confirmRestore(p.token);
      setPlan(null);
      await commands.restartApp();
    });

  return (
    <section className="screen" aria-labelledby="backups-title">
      <div className="screen-header">
        <button type="button" onClick={goBack}>
          Back
        </button>
        <h1 id="backups-title">Backups</h1>
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
        <h2 id="backup-all-title">Back up everything</h2>
        <p className="muted">
          One file with all your stories, pictures, settings, AI connections and usage records. API
          keys stay in your system&apos;s credential store and are never included. Keep the file
          somewhere else, like a USB drive or a cloud folder.
        </p>
        <div className="button-row">
          <button type="button" className="primary" disabled={!!busy} onClick={() => void backUp()}>
            Back up everything…
          </button>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="kept-title">
        <h2 id="kept-title">Kept on this computer</h2>
        <p className="muted">
          Once a day when you play, a copy of your stories is kept automatically (the newest five).
          Pictures stay in your image library and aren&apos;t copied again.
        </p>
        {backups && backups.length === 0 && <p>No backups yet.</p>}
        {backups && backups.length > 0 && (
          <ul className="connection-list" aria-labelledby="kept-title">
            {backups.map((b) => {
              const what = `${KIND_LABELS[b.kind]} backup from ${formatWhen(b.createdAt)}`;
              return (
                <li key={b.id} className="connection-card backup-row">
                  <span>
                    <strong>{KIND_LABELS[b.kind]}</strong>
                    <span className="muted">
                      {' '}
                      · {formatWhen(b.createdAt)} · {formatBytes(b.bytes)}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={!!busy}
                    aria-label={`Restore ${what}`}
                    onClick={() => void prepare({ from: 'kept', id: b.id })}
                  >
                    Restore…
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="settings-section" aria-labelledby="restore-file-title">
        <h2 id="restore-file-title">Restore from a file</h2>
        <p className="muted">A backup made with Back up everything, on this or another computer.</p>
        <div className="button-row">
          <button type="button" disabled={!!busy} onClick={() => void restoreFile()}>
            Restore from file…
          </button>
        </div>
      </section>

      {plan && (
        <Dialog title="Restore this backup?" onClose={cancel}>
          <p>
            <strong>{plan.source}</strong>, made {formatWhen(plan.createdAt)}
            {plan.appVersion ? ` by Dear to Love ${plan.appVersion}` : ''}: {describePlan(plan)}
          </p>
          {plan.upgraded && <p>It comes from an earlier version and has been upgraded to open.</p>}
          {plan.missingImages > 0 && (
            <p className="notice">
              {plan.missingImages === 1
                ? "1 picture isn't in the backup or your library and will show as missing."
                : `${plan.missingImages} pictures aren't in the backup or your library and will show as missing.`}
            </p>
          )}
          <p>
            This replaces all your stories, pictures, settings and connections on this computer.
            Your current data is saved first, as &quot;Before a restore&quot; on this screen, so you
            can go back. The app restarts to finish.
          </p>
          <p className="muted small">
            API keys aren&apos;t in backups. On another computer, enter them again in Settings.
          </p>
          <div className="button-row">
            <button type="button" onClick={cancel}>
              Keep my current data
            </button>
            <button
              type="button"
              className="danger"
              disabled={!!busy}
              onClick={() => void confirm(plan)}
            >
              Restore and restart
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}

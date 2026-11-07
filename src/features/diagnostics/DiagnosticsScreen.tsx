import { useEffect, useState } from 'react';
import { CommandError, commands } from '../../api/commands';
import { useUiStore } from '../../app/store';
import type { CheckStatus, DiagnosticCheck } from '../../types';
import { ReportDialog } from './ReportDialog';
import { msg, t } from '../../i18n';

const STATUS: Record<CheckStatus, string> = {
  PASS: msg('PASS'),
  WARN: msg('WARN'),
  FAIL: msg('FAIL'),
  SKIPPED: msg('SKIPPED'),
};

export function DiagnosticsScreen() {
  const goBack = useUiStore((s) => s.goBack);
  const [checks, setChecks] = useState<DiagnosticCheck[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(true);
  const [request, setRequest] = useState({ count: 0, deep: false });
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    commands
      .runDiagnostics(request.deep)
      .then((result) => {
        if (cancelled) return;
        setChecks(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof CommandError ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setRunning(false);
      });
    return () => {
      cancelled = true;
    };
  }, [request]);

  const runAgain = (deep: boolean) => {
    setRunning(true);
    setRequest((r) => ({ count: r.count + 1, deep }));
  };

  return (
    <section className="screen" aria-labelledby="diagnostics-title">
      <div className="screen-header">
        <button type="button" onClick={goBack}>
          {t('Back')}
        </button>
        <h1 id="diagnostics-title">{t('Diagnostics')}</h1>
        <button type="button" onClick={() => runAgain(false)} disabled={running}>
          {running ? t('Running…') : t('Run again')}
        </button>
        <button type="button" onClick={() => runAgain(true)} disabled={running}>
          {t('Run deep check')}
        </button>
        <button
          type="button"
          onClick={() => setReporting(true)}
          disabled={running}
          title={t('A report to copy into a support request. No story text, keys or paths.')}
        >
          {t('Copy report…')}
        </button>
      </div>
      {error && <p role="alert">{t('Diagnostics could not run: {error}', { error })}</p>}
      {checks && (
        <ul className="check-list">
          {checks.map((c) => (
            <li key={c.id} className="check-row">
              <span className={`status-badge status-${c.status.toLowerCase()}`}>
                {t(STATUS[c.status])}
              </span>
              <div>
                <strong>{c.label}</strong>
                <div>{c.summary}</div>
                {c.remediation && <div className="muted">{c.remediation}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {reporting && <ReportDialog deep={request.deep} onClose={() => setReporting(false)} />}
    </section>
  );
}

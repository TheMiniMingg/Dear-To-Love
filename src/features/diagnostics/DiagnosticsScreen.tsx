import { useEffect, useState } from 'react';
import { CommandError, commands } from '../../api/commands';
import { useUiStore } from '../../app/store';
import type { DiagnosticCheck } from '../../types';

export function DiagnosticsScreen() {
  const navigate = useUiStore((s) => s.navigate);
  const [checks, setChecks] = useState<DiagnosticCheck[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(true);
  const [request, setRequest] = useState({ count: 0, deep: false });

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
        <button type="button" onClick={() => navigate('library')}>
          Back
        </button>
        <h1 id="diagnostics-title">Diagnostics</h1>
        <button type="button" onClick={() => runAgain(false)} disabled={running}>
          {running ? 'Running…' : 'Run again'}
        </button>
        <button type="button" onClick={() => runAgain(true)} disabled={running}>
          Run deep check
        </button>
      </div>
      {error && <p role="alert">Diagnostics could not run: {error}</p>}
      {checks && (
        <ul className="check-list">
          {checks.map((c) => (
            <li key={c.id} className="check-row">
              <span className={`status-badge status-${c.status.toLowerCase()}`}>{c.status}</span>
              <div>
                <strong>{c.label}</strong>
                <div>{c.summary}</div>
                {c.remediation && <div className="muted">{c.remediation}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

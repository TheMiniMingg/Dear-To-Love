import { useEffect, useState } from 'react';
import { commands } from '../api/commands';
import { useUiStore } from '../app/store';

/** Persistent footer: installed version and a Diagnostics shortcut. */
export function StatusFooter() {
  const navigate = useUiStore((s) => s.navigate);
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    commands
      .getAppInfo()
      .then((info) => {
        if (!cancelled) setVersion(info.version);
      })
      .catch(() => {
        if (!cancelled) setVersion(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <footer className="status-footer">
      <span data-testid="app-version">{version ? `v${version}` : 'version unknown'}</span>
      <button type="button" className="link-button" onClick={() => navigate('diagnostics')}>
        Diagnostics
      </button>
    </footer>
  );
}

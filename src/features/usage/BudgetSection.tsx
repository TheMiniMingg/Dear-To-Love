import { useEffect, useId, useState } from 'react';
import { commands, errorMessage, formatUsd } from '../../api/commands';
import type { BudgetMode, BudgetPolicy, BudgetStatus } from '../../types';

const LEVEL_TEXT = {
  none: 'Under the warning level',
  warning: 'Past the warning level',
  reached: 'Budget reached',
} as const;

function monthName(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString([], {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** The monthly budget: policy form plus this month's standing. */
export function BudgetSection() {
  const id = useId();
  const [status, setStatus] = useState<BudgetStatus | null>(null);
  const [form, setForm] = useState<BudgetPolicy | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    commands
      .getBudgetStatus()
      .then((s) => {
        setStatus(s);
        setForm(s.policy);
      })
      .catch((e: unknown) => setError(errorMessage(e)));
  }, []);

  if (!form) {
    return (
      <section className="settings-section" aria-labelledby={`${id}-budget`}>
        <h2 id={`${id}-budget`}>Monthly budget</h2>
        {error ? (
          <p role="alert" className="error">
            {error}
          </p>
        ) : (
          <p className="muted">Loading…</p>
        )}
      </section>
    );
  }

  const update = (patch: Partial<BudgetPolicy>) => {
    setSaved(false);
    setForm({ ...form, ...patch });
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await commands.setBudgetPolicy({
        ...form,
        monthlyLimitUsd: form.monthlyLimitUsd?.trim() || null,
      });
      setStatus(s);
      setForm(s.policy);
      setSaved(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const s = status;
  return (
    <section className="settings-section" aria-labelledby={`${id}-budget`}>
      <h2 id={`${id}-budget`}>Monthly budget</h2>
      <p className="muted small">
        Months follow UTC, so a new month may start in the evening or morning where you are. Only
        paid connections count; local models are never limited.
      </p>

      {s?.policy.enabled && s.limitMicroUsd != null && (
        <dl className="facts" aria-label="This month">
          <dt>{monthName(s.month)}</dt>
          <dd>
            <strong>{formatUsd(s.spentMicroUsd)}</strong> of {formatUsd(s.limitMicroUsd)}
            {s.percent != null && ` (${s.percent}%)`} · {LEVEL_TEXT[s.level]}
            {s.paused && <strong className="note-warn"> · Paid replies paused</strong>}
          </dd>
          {s.reservedMicroUsd > 0 && (
            <>
              <dt>Held back</dt>
              <dd>{formatUsd(s.reservedMicroUsd)} for calls in progress or with unknown cost</dd>
            </>
          )}
          {s.unknownCostRequests > 0 && (
            <>
              <dt>Unknown cost</dt>
              <dd>
                {s.unknownCostRequests} {s.unknownCostRequests === 1 ? 'call' : 'calls'} this month;
                the real total may be higher
              </dd>
            </>
          )}
        </dl>
      )}

      <form
        className="form"
        aria-label="Budget settings"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="check">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
          />
          Use a monthly budget
        </label>
        <fieldset disabled={!form.enabled}>
          <label htmlFor={`${id}-limit`}>Monthly budget (USD)</label>
          <input
            id={`${id}-limit`}
            inputMode="decimal"
            placeholder="5.00"
            required={form.enabled}
            value={form.monthlyLimitUsd ?? ''}
            onChange={(e) => update({ monthlyLimitUsd: e.target.value })}
          />
          <label htmlFor={`${id}-threshold`}>
            Warn me at {form.warningThresholdPercent}% of the budget
          </label>
          <input
            id={`${id}-threshold`}
            type="range"
            min={1}
            max={100}
            value={form.warningThresholdPercent}
            onChange={(e) => update({ warningThresholdPercent: Number(e.target.value) })}
          />
          <div role="radiogroup" aria-label="When the budget is reached" className="choice-list">
            {(
              [
                ['warn', 'Warn only', 'Show a warning; replies keep working.'],
                [
                  'pause_new_requests',
                  'Pause new paid replies',
                  'Refuse a paid reply that would pass the budget. A reply already being written finishes.',
                ],
              ] as [BudgetMode, string, string][]
            ).map(([mode, label, hint]) => (
              <label key={mode} className="choice">
                <input
                  type="radio"
                  name={`${id}-mode`}
                  checked={form.mode === mode}
                  onChange={() => update({ mode })}
                />
                <span>
                  {label} <span className="muted small">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {form.enabled && form.mode === 'pause_new_requests' && (
          <p className="muted small">
            The pause uses this app&apos;s estimates. Calls made outside the app, or ones the
            service never reports, are not counted.
          </p>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="button-row">
          <button type="submit" className="primary" disabled={busy}>
            Save budget
          </button>
          {saved && (
            <span role="status" className="muted small">
              Saved
            </span>
          )}
        </div>
      </form>
    </section>
  );
}

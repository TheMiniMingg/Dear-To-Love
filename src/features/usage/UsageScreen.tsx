import { useEffect, useId, useState } from 'react';
import { commands, errorMessage, formatUsd } from '../../api/commands';
import { useUiStore } from '../../app/store';
import type { ApiRequestRow, ProviderProfile, UsageScope, UsageSummary } from '../../types';
import { BudgetSection } from './BudgetSection';
import { RatesSection } from './RatesSection';

const SCOPES: { id: UsageScope; label: string }[] = [
  { id: 'session', label: 'This session' },
  { id: 'month_utc', label: 'This month (UTC)' },
  { id: 'all_time', label: 'All time' },
];

const PURPOSES: Record<string, string> = {
  story_reply: 'Story reply',
  memory_summary: 'Story summary',
  manual_test: 'Test message',
  character_suggestion: 'Character picture',
};

const SOURCES: Record<string, string> = {
  provider: 'Provider-reported',
  estimated: 'Estimated',
  unknown: 'Unknown',
};

const n = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString());

function costText(cost: number | null, billing: string, approximate: boolean, status: string) {
  if (billing === 'local') return '$0 (local)';
  if (status === 'sent') return 'In progress';
  if (cost == null) return 'Unknown';
  return `${formatUsd(cost)}${approximate ? ' (approx.)' : ''}`;
}

/** Settings -> Usage & budget: estimates, rates and the monthly budget. */
export function UsageScreen() {
  const goBack = useUiStore((s) => s.goBack);
  const id = useId();
  const [scope, setScope] = useState<UsageScope>('session');
  const [profileId, setProfileId] = useState<string | null>(null);
  const [connections, setConnections] = useState<ProviderProfile[]>([]);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [rows, setRows] = useState<ApiRequestRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    commands
      .listConnections()
      .then(setConnections)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      commands.getUsageSummary(scope, profileId),
      commands.listApiRequests(scope, profileId, 100),
    ])
      .then(([s, r]) => {
        if (cancelled) return;
        setSummary(s);
        setRows(r);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [scope, profileId, reload]);

  const t = summary?.totals;
  return (
    <section className="screen usage-screen" aria-labelledby="usage-title">
      <div className="screen-header">
        <button type="button" onClick={goBack}>
          Back
        </button>
        <h1 id="usage-title">Usage &amp; budget</h1>
      </div>

      <p className="notice" role="note">
        These are local estimates from what each AI service reports and the prices you enter, not
        your provider&apos;s bill. Failed or interrupted calls, missing usage reports and anything
        used outside this app can cost more than shown. To be sure you never spend more than you
        mean to, also set a spending limit in your provider&apos;s billing settings.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <section className="settings-section" aria-labelledby={`${id}-usage`}>
        <h2 id={`${id}-usage`}>Usage</h2>
        <div className="usage-filters">
          <div role="radiogroup" aria-label="Period" className="segmented">
            {SCOPES.map((s) => (
              <label key={s.id}>
                <input
                  type="radio"
                  name={`${id}-scope`}
                  checked={scope === s.id}
                  onChange={() => setScope(s.id)}
                />
                <span>{s.label}</span>
              </label>
            ))}
          </div>
          <label className="inline-field">
            Connection
            <select value={profileId ?? ''} onChange={(e) => setProfileId(e.target.value || null)}>
              <option value="">All connections</option>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {t && (
          <dl className="facts" aria-label="Totals">
            <dt>Estimated cost</dt>
            <dd>
              <strong>{formatUsd(t.estimatedCostMicroUsd)}</strong>
              {t.unknownCostRequestCount > 0 &&
                ` + ${t.unknownCostRequestCount} ${
                  t.unknownCostRequestCount === 1 ? 'call' : 'calls'
                } with unknown cost`}
              {t.approximateCostRequestCount > 0 && (
                <span className="muted small">
                  {' '}
                  ({t.approximateCostRequestCount} approximate: cached tokens priced at the input
                  rate)
                </span>
              )}
            </dd>
            <dt>Requests</dt>
            <dd>
              {t.requestCount}
              {t.localModelRequestCount > 0 &&
                `, ${t.localModelRequestCount} to local models ($0 API charge; your own hardware and power are not counted)`}
              {t.inFlightRequestCount > 0 && `, ${t.inFlightRequestCount} in progress`}
            </dd>
            <dt>Tokens</dt>
            <dd>
              {n(t.inputTokens)} in
              {t.cachedInputTokens ? ` (${n(t.cachedInputTokens)} cached)` : ''} ·{' '}
              {n(t.outputTokens)} out
            </dd>
          </dl>
        )}

        {summary && summary.byModel.length > 0 && (
          <div className="table-wrap">
            <table aria-label="By model">
              <thead>
                <tr>
                  <th scope="col">Connection · model</th>
                  <th scope="col">Requests</th>
                  <th scope="col">Tokens in / out</th>
                  <th scope="col">Estimated cost</th>
                </tr>
              </thead>
              <tbody>
                {summary.byModel.map((m) => (
                  <tr key={`${m.providerLabel}/${m.modelId}/${m.billing}`}>
                    <td>
                      {m.providerLabel} · {m.modelId}
                    </td>
                    <td>{m.totals.requestCount}</td>
                    <td>
                      {n(m.totals.inputTokens)} / {n(m.totals.outputTokens)}
                    </td>
                    <td>
                      {m.billing === 'local'
                        ? '$0 (local)'
                        : formatUsd(m.totals.estimatedCostMicroUsd)}
                      {m.totals.unknownCostRequestCount > 0 &&
                        ` + ${m.totals.unknownCostRequestCount} unknown`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h3>Recent requests</h3>
        <p className="muted small">
          Token counts are <strong>Provider-reported</strong> when the service sent them,{' '}
          <strong>Estimated</strong> when this app counted them, and <strong>Unknown</strong>{' '}
          otherwise. An unknown cost is never shown as $0.
        </p>
        {rows.length === 0 ? (
          <p className="muted">No requests in this period.</p>
        ) : (
          <div className="table-wrap">
            <table aria-label="Recent requests">
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Model</th>
                  <th scope="col">Purpose</th>
                  <th scope="col">Status</th>
                  <th scope="col">Tokens in / out</th>
                  <th scope="col">Cost</th>
                  <th scope="col">Source</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.startedAt).toLocaleString()}</td>
                    <td>
                      {r.providerLabel} · {r.modelId}
                    </td>
                    <td>{PURPOSES[r.purpose] ?? r.purpose}</td>
                    <td>{r.status === 'sent' ? 'in progress' : r.status}</td>
                    <td>
                      {n(r.inputTokens)} / {n(r.outputTokens)}
                    </td>
                    <td>{costText(r.costMicroUsd, r.billing, r.costApproximate, r.status)}</td>
                    <td>{SOURCES[r.usageSource] ?? r.usageSource}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <RatesSection onChanged={() => setReload((x) => x + 1)} />
      <BudgetSection />
    </section>
  );
}

import { useEffect, useId, useState } from 'react';
import { commands, errorMessage, formatUsd } from '../../api/commands';
import { useUiStore } from '../../app/store';
import { intlLocale, msg, t, tn, tr } from '../../i18n';
import type { ApiRequestRow, ProviderProfile, UsageScope, UsageSummary } from '../../types';
import { BudgetSection } from './BudgetSection';
import { RatesSection } from './RatesSection';

const SCOPES: { id: UsageScope; label: string }[] = [
  { id: 'session', label: msg('This session') },
  { id: 'month_utc', label: msg('This month (UTC)') },
  { id: 'all_time', label: msg('All time') },
];

const PURPOSES: Record<string, string> = {
  story_reply: msg('Story reply'),
  memory_summary: msg('Story summary'),
  manual_test: msg('Test message'),
  character_suggestion: msg('Character picture'),
};

const SOURCES: Record<string, string> = {
  provider: msg('Provider-reported'),
  estimated: msg('Estimated'),
  unknown: msg('Unknown'),
};

const STATUSES: Record<string, string> = {
  reserved: msg('reserved'),
  sent: msg('in progress'),
  completed: msg('completed'),
  failed: msg('failed'),
  cancelled: msg('cancelled'),
  unknown: msg('unknown'),
};

const fromTable = (table: Record<string, string>, key: string) => {
  const text = table[key];
  return text === undefined ? key : t(text);
};

const n = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString(intlLocale()));

function costText(cost: number | null, billing: string, approximate: boolean, status: string) {
  if (billing === 'local') return t('$0 (local)');
  if (status === 'sent') return t('In progress');
  if (cost == null) return t('Unknown');
  return approximate ? t('{cost} (approx.)', { cost: formatUsd(cost) }) : formatUsd(cost);
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

  const tot = summary?.totals;
  return (
    <section className="screen usage-screen" aria-labelledby="usage-title">
      <div className="screen-header">
        <button type="button" onClick={goBack}>
          {t('Back')}
        </button>
        <h1 id="usage-title">{t('Usage & budget')}</h1>
      </div>

      <p className="notice" role="note">
        {t(
          "These are local estimates from what each AI service reports and the prices you enter, not your provider's bill. Failed or interrupted calls, missing usage reports and anything used outside this app can cost more than shown. To be sure you never spend more than you mean to, also set a spending limit in your provider's billing settings.",
        )}
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <section className="settings-section" aria-labelledby={`${id}-usage`}>
        <h2 id={`${id}-usage`}>{t('Usage')}</h2>
        <div className="usage-filters">
          <div role="radiogroup" aria-label={t('Period')} className="segmented">
            {SCOPES.map((s) => (
              <label key={s.id}>
                <input
                  type="radio"
                  name={`${id}-scope`}
                  checked={scope === s.id}
                  onChange={() => setScope(s.id)}
                />
                <span>{t(s.label)}</span>
              </label>
            ))}
          </div>
          <label className="inline-field">
            {t('Connection')}
            <select value={profileId ?? ''} onChange={(e) => setProfileId(e.target.value || null)}>
              <option value="">{t('All connections')}</option>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {tot && (
          <dl className="facts" aria-label={t('Totals')}>
            <dt>{t('Estimated cost')}</dt>
            <dd>
              <strong>{formatUsd(tot.estimatedCostMicroUsd)}</strong>
              {tot.unknownCostRequestCount > 0 &&
                tn(
                  tot.unknownCostRequestCount,
                  ' + {n} call with unknown cost',
                  ' + {n} calls with unknown cost',
                )}
              {tot.approximateCostRequestCount > 0 && (
                <span className="muted small">
                  {' '}
                  {t('({n} approximate: cached tokens priced at the input rate)', {
                    n: tot.approximateCostRequestCount,
                  })}
                </span>
              )}
            </dd>
            <dt>{t('Requests')}</dt>
            <dd>
              {tot.requestCount}
              {tot.localModelRequestCount > 0 &&
                t(
                  ', {n} to local models ($0 API charge; your own hardware and power are not counted)',
                  { n: tot.localModelRequestCount },
                )}
              {tot.inFlightRequestCount > 0 &&
                t(', {n} in progress', { n: tot.inFlightRequestCount })}
            </dd>
            <dt>{t('Tokens')}</dt>
            <dd>
              {tot.cachedInputTokens
                ? t('{in} in ({cached} cached) · {out} out', {
                    in: n(tot.inputTokens),
                    cached: n(tot.cachedInputTokens),
                    out: n(tot.outputTokens),
                  })
                : t('{in} in · {out} out', { in: n(tot.inputTokens), out: n(tot.outputTokens) })}
            </dd>
          </dl>
        )}

        {summary && summary.byModel.length > 0 && (
          <div className="table-wrap">
            <table aria-label={t('By model')}>
              <thead>
                <tr>
                  <th scope="col">{t('Connection · model')}</th>
                  <th scope="col">{t('Requests')}</th>
                  <th scope="col">{t('Tokens in / out')}</th>
                  <th scope="col">{t('Estimated cost')}</th>
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
                        ? t('$0 (local)')
                        : formatUsd(m.totals.estimatedCostMicroUsd)}
                      {m.totals.unknownCostRequestCount > 0 &&
                        t(' + {n} unknown', { n: m.totals.unknownCostRequestCount })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h3>{t('Recent requests')}</h3>
        <p className="muted small">
          {tr(
            'Token counts are {provider} when the service sent them, {estimated} when this app counted them, and {unknown} otherwise. An unknown cost is never shown as $0.',
            {
              provider: <strong>{t('Provider-reported')}</strong>,
              estimated: <strong>{t('Estimated')}</strong>,
              unknown: <strong>{t('Unknown')}</strong>,
            },
          )}
        </p>
        {rows.length === 0 ? (
          <p className="muted">{t('No requests in this period.')}</p>
        ) : (
          <div className="table-wrap">
            <table aria-label={t('Recent requests')}>
              <thead>
                <tr>
                  <th scope="col">{t('Time')}</th>
                  <th scope="col">{t('Model')}</th>
                  <th scope="col">{t('Purpose')}</th>
                  <th scope="col">{t('Status')}</th>
                  <th scope="col">{t('Tokens in / out')}</th>
                  <th scope="col">{t('Cost')}</th>
                  <th scope="col">{t('Source')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.startedAt).toLocaleString(intlLocale())}</td>
                    <td>
                      {r.providerLabel} · {r.modelId}
                    </td>
                    <td>{fromTable(PURPOSES, r.purpose)}</td>
                    <td>{fromTable(STATUSES, r.status)}</td>
                    <td>
                      {n(r.inputTokens)} / {n(r.outputTokens)}
                    </td>
                    <td>{costText(r.costMicroUsd, r.billing, r.costApproximate, r.status)}</td>
                    <td>{fromTable(SOURCES, r.usageSource)}</td>
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

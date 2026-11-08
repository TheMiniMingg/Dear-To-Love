import { useEffect, useId, useState } from 'react';
import { commands, errorMessage } from '../../api/commands';
import type { RateCardView } from '../../types';
import { t } from '../../i18n';
import { CHECKED, knownModel, type Price } from '../settings/models';

type Draft = { input: string; output: string; cached: string };

const listedDraft = (p: Price): Draft => ({
  input: String(p.input),
  output: String(p.output),
  cached: p.cached != null ? String(p.cached) : '',
});

const emptyDraft = (v: RateCardView): Draft => ({
  input: v.card?.inputUsdPerMillion ?? '',
  output: v.card?.outputUsdPerMillion ?? '',
  cached: v.card?.cachedInputUsdPerMillion ?? '',
});

function RateRow({ view, onSaved }: { view: RateCardView; onSaved: (v: RateCardView[]) => void }) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(view));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listed, setListed] = useState(false);
  const card = view.card;
  const known = knownModel(view.modelId)?.price;
  const name = `${view.providerLabel} · ${view.modelId}`;

  if (view.billing === 'local') {
    return (
      <li>
        <strong>{name}</strong> <span className="muted">{t('Local model: $0 API charge.')}</span>
      </li>
    );
  }

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await commands.setRates({
        profileId: view.providerProfileId,
        inputUsdPerMillion: draft.input.trim(),
        outputUsdPerMillion: draft.output.trim(),
        cachedInputUsdPerMillion: draft.cached.trim() || null,
      });
      setEditing(false);
      onSaved(next);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li>
      <div className="rate-head">
        <strong>{name}</strong>
        {card ? (
          <span>
            {card.cachedInputUsdPerMillion != null
              ? t('${in} in · ${out} out · ${cached} cached', {
                  in: card.inputUsdPerMillion,
                  out: card.outputUsdPerMillion,
                  cached: card.cachedInputUsdPerMillion,
                })
              : t('${in} in · ${out} out', {
                  in: card.inputUsdPerMillion,
                  out: card.outputUsdPerMillion,
                })}{' '}
            <span className="muted small">{t('per 1M tokens')}</span>
          </span>
        ) : (
          <span className="note-warn">{t('No prices: costs show as unknown.')}</span>
        )}
        {!editing && !card && known && (
          <button
            type="button"
            className="primary"
            onClick={() => {
              setDraft(listedDraft(known));
              setListed(true);
              setEditing(true);
            }}
          >
            {t('Use the listed prices')}
          </button>
        )}
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(emptyDraft(view));
              setListed(false);
              setEditing(true);
            }}
          >
            {card ? t('Change prices') : t('Add prices')}
          </button>
        )}
      </div>
      {editing && (
        <form
          className="form rate-form"
          aria-label={t('Prices for {name}', { name })}
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="field-row">
            <label htmlFor={`${id}-in`}>
              {t('Input, USD per 1M tokens')}
              <input
                id={`${id}-in`}
                inputMode="decimal"
                required
                value={draft.input}
                onChange={(e) => setDraft({ ...draft, input: e.target.value })}
              />
            </label>
            <label htmlFor={`${id}-out`}>
              {t('Output, USD per 1M tokens')}
              <input
                id={`${id}-out`}
                inputMode="decimal"
                required
                value={draft.output}
                onChange={(e) => setDraft({ ...draft, output: e.target.value })}
              />
            </label>
            <label htmlFor={`${id}-cached`}>
              {t('Cached input (optional)')}
              <input
                id={`${id}-cached`}
                inputMode="decimal"
                value={draft.cached}
                onChange={(e) => setDraft({ ...draft, cached: e.target.value })}
              />
            </label>
          </div>
          {listed && (
            <p className="muted small">
              {t(
                'Filled in from the prices this app lists, checked {checked}. Check them against the service’s pricing page, then save.',
                { checked: t(CHECKED) },
              )}
            </p>
          )}
          <p className="muted small">
            {t(
              "Copy these from your provider's pricing page. New prices apply to requests from now on; past requests keep the prices they were estimated with. Without a cached price, cached tokens are counted at the input price and marked approximate.",
            )}
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="button-row">
            <button type="button" onClick={() => setEditing(false)}>
              {t('Cancel')}
            </button>
            <button type="submit" className="primary" disabled={busy}>
              {t('Save prices')}
            </button>
          </div>
        </form>
      )}
    </li>
  );
}

/** Per-connection prices used for estimates and the budget gate. */
export function RatesSection({ onChanged }: { onChanged: () => void }) {
  const id = useId();
  const [rates, setRates] = useState<RateCardView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    commands
      .listRates()
      .then(setRates)
      .catch((e: unknown) => setError(errorMessage(e)));
  }, []);

  return (
    <section className="settings-section" aria-labelledby={`${id}-rates`}>
      <h2 id={`${id}-rates`}>{t('Prices')}</h2>
      <p className="muted small">
        {t(
          "Each connection's current model. Prices are what you pay your provider per million tokens; the app never looks them up for you.",
        )}
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {rates && rates.length === 0 && <p className="muted">{t('No AI connections yet.')}</p>}
      {rates && rates.length > 0 && (
        <ul className="rate-list">
          {rates.map((r) => (
            <RateRow
              key={`${r.providerProfileId}/${r.modelId}/${r.card?.id ?? 'none'}`}
              view={r}
              onSaved={(next) => {
                setRates(next);
                onChanged();
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

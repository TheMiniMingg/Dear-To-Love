import { useId, useState } from 'react';
import { commands, errorMessage } from '../../api/commands';
import type { AdapterKind, Billing, ProviderProfile, ProviderProfileInput } from '../../types';
import { makesPictures } from './kinds';
import { GROUP_LABELS, PRESETS, type Preset, type PresetGroup } from './presets';
import { knownModel } from './models';
import { StepByStep, guideFor } from '../guide/StepByStep';
import { t, tr } from '../../i18n';

const GROUPS = Object.keys(GROUP_LABELS) as PresetGroup[];

const DEFAULT_CONTEXT_TOKENS = 16000;

/** Services whose current models think before they write (adapters/openai.rs). */
const THINKING_HOSTS =
  /^https?:\/\/(api\.openai\.com|generativelanguage\.googleapis\.com|api\.x\.ai|openrouter\.ai)(\/|:|$)/i;

type Props = {
  existing: ProviderProfile | null;
  /** For a new connection: the service to start from (a preset id). */
  preset?: string;
  /** For a new connection: a model the setup guide recommended. */
  model?: string;
  onSaved: (p: ProviderProfile) => void;
  onCancel: () => void;
};

/** Add or edit a connection to an AI service. The key goes to the OS credential store. */
export function ConnectionForm({
  existing,
  preset: startPreset,
  model: startModel,
  onSaved,
  onCancel,
}: Props) {
  const id = useId();
  const start = existing ? null : (PRESETS.find((x) => x.id === startPreset) ?? null);
  const from = start && start.id !== 'custom' ? start : null;
  const [label, setLabel] = useState(existing?.label ?? (from ? t(from.label) : ''));
  const [adapter, setAdapter] = useState<AdapterKind>(
    existing?.adapter ?? from?.adapter ?? 'openai_compatible',
  );
  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? from?.baseUrl ?? '');
  const [modelId, setModelId] = useState(
    existing?.modelId ?? startModel ?? (from?.model && makesPictures(from) ? from.model : ''),
  );
  const [billing, setBilling] = useState<Billing>(existing?.billing ?? from?.billing ?? 'paid');
  const [apiKey, setApiKey] = useState('');
  const [removeKey, setRemoveKey] = useState(false);
  const [temperature, setTemperature] = useState(String(existing?.settings.temperature ?? 0.9));
  const [maxTokens, setMaxTokens] = useState(
    String(existing?.settings.maxOutputTokens ?? from?.replyTokens ?? 700),
  );
  const [contextTokens, setContextTokens] = useState(
    String(existing?.settings.maxContextTokens ?? from?.contextTokens ?? DEFAULT_CONTEXT_TOKENS),
  );
  const [timeoutS, setTimeoutS] = useState(
    existing
      ? String(Math.round(existing.settings.timeoutMs / 1000))
      : from?.group === 'pictures'
        ? '300'
        : '120',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState<Preset | null>(start);
  const pictures = makesPictures({ adapter });
  const guide = existing ? undefined : guideFor(preset?.id);
  const thinking =
    !pictures &&
    (adapter === 'anthropic' ||
      (adapter === 'openai_compatible' && THINKING_HOSTS.test(baseUrl.trim())));

  const applyPreset = (presetId: string) => {
    const p = PRESETS.find((x) => x.id === presetId) ?? null;
    setPreset(p);
    if (!p || p.id === 'custom') return;
    setAdapter(p.adapter);
    setBaseUrl(p.baseUrl);
    setBilling(p.billing);
    setContextTokens(String(p.contextTokens));
    setMaxTokens(String(p.replyTokens ?? 700));
    // Pictures can take minutes on a home computer.
    if (p.group === 'pictures') setTimeoutS('300');
    if (p.model && makesPictures(p)) setModelId(p.model);
    if (!label.trim() || PRESETS.some((x) => t(x.label) === label || x.label === label))
      setLabel(t(p.label));
  };

  const submit = async () => {
    const temp = Number(temperature);
    const m = Number(maxTokens);
    const s = Number(timeoutS);
    const c = Number(contextTokens);
    if (![temp, m, s, c].every(Number.isFinite)) {
      setError(t('Temperature, reply length, context limit and timeout must be numbers.'));
      return;
    }
    const input: ProviderProfileInput = {
      ...(existing ? { id: existing.id } : {}),
      label,
      adapter,
      baseUrl,
      modelId,
      billing,
      ...(removeKey ? { apiKey: '' } : apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      settings: {
        temperature: temp,
        maxOutputTokens: Math.round(m),
        timeoutMs: Math.round(s * 1000),
        maxContextTokens: Math.round(c),
      },
    };
    setBusy(true);
    setError(null);
    try {
      onSaved(await commands.saveConnection(input));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {!existing && (
        <div className="field">
          <label htmlFor={`${id}-preset`}>{t('Service')}</label>
          <select
            id={`${id}-preset`}
            defaultValue={start?.id ?? 'custom'}
            onChange={(e) => applyPreset(e.target.value)}
          >
            {GROUPS.map((g) => (
              <optgroup key={g} label={t(GROUP_LABELS[g])}>
                {PRESETS.filter((p) => p.group === g).map((p) => (
                  <option key={p.id} value={p.id}>
                    {t(p.label)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <p className="muted small">
            {preset?.note
              ? t(preset.note)
              : t(
                  'Big AI labs, hosted open models and models on your own computer all work. Anything with an OpenAI-compatible API works through Other.',
                )}
          </p>
          {guide && <StepByStep guide={guide} where="form" onError={setError} />}
        </div>
      )}
      <div className="field">
        <label htmlFor={`${id}-adapter`}>{t('Type')}</label>
        <select
          id={`${id}-adapter`}
          value={adapter}
          onChange={(e) => setAdapter(e.target.value as AdapterKind)}
        >
          <option value="openai_compatible">{t('OpenAI-compatible API')}</option>
          <option value="anthropic">{t('Anthropic (Claude) API')}</option>
          <option value="ollama">Ollama</option>
          <option value="openai_images">{t('Images API, OpenAI-style (pictures)')}</option>
          <option value="stable_diffusion">{t('Stable Diffusion WebUI (pictures)')}</option>
        </select>
        {pictures && (
          <p className="muted small">
            {t(
              'Makes portraits and item pictures from their descriptions. It never writes story replies; choose it under Pictures in Settings.',
            )}
          </p>
        )}
        {adapter === 'anthropic' && (
          <p className="muted small">
            {t(
              "Uses Anthropic's own Messages API. Claude picks its own temperature, so that setting is not sent.",
            )}
          </p>
        )}
        {thinking && (
          <p className="muted small">
            {t(
              'Most current models from OpenAI, Anthropic, Google and xAI think before they write. For them the app asks for brief thinking and allows 2,000 more tokens for it, which usage and the budget count, and leaves out the temperature where the model keeps its own.',
            )}
          </p>
        )}
        {adapter === 'ollama' && (
          <p className="muted small">
            {tr(
              "Uses Ollama's own API so each request asks for the context limit below. Install a model first, for example with {command}.",
              { command: <code>ollama pull gemma4:12b</code> },
            )}
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor={`${id}-label`}>{t('Name')}</label>
        <input
          id={`${id}-label`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={80}
          required
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-url`}>{t('Address')}</label>
        <input
          id={`${id}-url`}
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder={
            adapter === 'ollama'
              ? 'http://localhost:11434'
              : adapter === 'anthropic'
                ? 'https://api.anthropic.com/v1'
                : adapter === 'stable_diffusion'
                  ? 'http://127.0.0.1:7860'
                  : 'https://api.example.com/v1'
          }
          inputMode="url"
          spellCheck={false}
          required
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-model`}>{t('Model')}</label>
        <input
          id={`${id}-model`}
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          placeholder={
            preset?.model
              ? t('For example {model}', { model: preset.model })
              : t('Model name, as the service spells it')
          }
          spellCheck={false}
          required
          aria-describedby={`${id}-model-hint`}
          list={preset?.suggestions ? `${id}-models` : undefined}
        />
        {preset?.suggestions && (
          <datalist id={`${id}-models`}>
            {preset.suggestions.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        )}
        {preset?.suggestions && !existing && (
          <div className="model-chips" role="group" aria-label={t('Suggested models')}>
            {preset.suggestions.map((m) => {
              const note = knownModel(m)?.note;
              return (
                <button
                  key={m}
                  type="button"
                  className="chip chip-button"
                  aria-pressed={modelId === m}
                  onClick={() => setModelId(m)}
                >
                  <code>{m}</code>
                  {note && <span className="muted"> · {t(note)}</span>}
                </button>
              );
            })}
          </div>
        )}
        <p id={`${id}-model-hint`} className="muted small">
          {tr(
            "After saving, {test} checks the name against the service's list of models, for free.",
            { test: <strong>{t('Test connection')}</strong> },
          )}
        </p>
      </div>
      <div className="field">
        <label htmlFor={`${id}-key`}>{t('API key')}</label>
        <input
          id={`${id}-key`}
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={
            existing?.hasKey
              ? t('Saved. Leave empty to keep it.')
              : preset && !preset.needsKey
                ? t('Not needed for local servers')
                : t('Paste your API key (not needed for local servers)')
          }
          autoComplete="off"
          spellCheck={false}
          disabled={removeKey}
        />
        {existing?.hasKey && (
          <label className="check">
            <input
              type="checkbox"
              checked={removeKey}
              onChange={(e) => setRemoveKey(e.target.checked)}
            />
            {t('Remove the saved key')}
          </label>
        )}
        <p className="muted small">
          {t("Stored in your system's credential store, never in the story database or exports.")}
        </p>
      </div>
      <fieldset className="field">
        <legend>{t('Charges')}</legend>
        <label className="check">
          <input
            type="radio"
            name={`${id}-billing`}
            checked={billing === 'paid'}
            onChange={() => setBilling('paid')}
          />
          {pictures
            ? t("Paid API (each picture is recorded; the app can't price pictures)")
            : t('Paid API (usage is estimated from your rates)')}
        </label>
        <label className="check">
          <input
            type="radio"
            name={`${id}-billing`}
            checked={billing === 'local'}
            onChange={() => setBilling('local')}
          />
          {t('Local model (no API charges)')}
        </label>
      </fieldset>
      <details>
        <summary>{t('Advanced')}</summary>
        <div className="field-row">
          {!pictures && (
            <>
              <div className="field">
                <label htmlFor={`${id}-temp`}>{t('Temperature')}</label>
                <input
                  id={`${id}-temp`}
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor={`${id}-max`}>{t('Longest reply (tokens)')}</label>
                <input
                  id={`${id}-max`}
                  type="number"
                  min={16}
                  max={32000}
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor={`${id}-context`}>{t('Context limit (tokens)')}</label>
                <input
                  id={`${id}-context`}
                  type="number"
                  min={2048}
                  max={2000000}
                  value={contextTokens}
                  onChange={(e) => setContextTokens(e.target.value)}
                  aria-describedby={`${id}-context-hint`}
                />
              </div>
            </>
          )}
          <div className="field">
            <label htmlFor={`${id}-timeout`}>{t('Give up after (seconds of silence)')}</label>
            <input
              id={`${id}-timeout`}
              type="number"
              min={5}
              max={600}
              value={timeoutS}
              onChange={(e) => setTimeoutS(e.target.value)}
            />
          </div>
        </div>
        {!pictures && (
          <p id={`${id}-context-hint`} className="muted small">
            {t(
              "The context limit covers the prompt and the reply. Use the model's context length, or the length your local server loads it with. Older story turns are summarized to fit; a lower limit also keeps paid requests cheaper.",
            )}
          </p>
        )}
      </details>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="button-row">
        <button type="button" onClick={onCancel}>
          {t('Cancel')}
        </button>
        <button type="submit" className="primary" disabled={busy}>
          {existing ? t('Save changes') : t('Save connection')}
        </button>
      </div>
    </form>
  );
}

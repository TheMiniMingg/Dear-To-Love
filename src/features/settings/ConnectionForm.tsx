import { useId, useState } from 'react';
import { commands, errorMessage } from '../../api/commands';
import type { AdapterKind, Billing, ProviderProfile, ProviderProfileInput } from '../../types';
import { GROUP_LABELS, PRESETS, type Preset, type PresetGroup } from './presets';

const GROUPS = Object.keys(GROUP_LABELS) as PresetGroup[];

const DEFAULT_CONTEXT_TOKENS = 16000;

type Props = {
  existing: ProviderProfile | null;
  onSaved: (p: ProviderProfile) => void;
  onCancel: () => void;
};

/** Add or edit a connection to an AI service. The key goes to the OS credential store. */
export function ConnectionForm({ existing, onSaved, onCancel }: Props) {
  const id = useId();
  const [label, setLabel] = useState(existing?.label ?? '');
  const [adapter, setAdapter] = useState<AdapterKind>(existing?.adapter ?? 'openai_compatible');
  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? '');
  const [modelId, setModelId] = useState(existing?.modelId ?? '');
  const [billing, setBilling] = useState<Billing>(existing?.billing ?? 'paid');
  const [apiKey, setApiKey] = useState('');
  const [removeKey, setRemoveKey] = useState(false);
  const [temperature, setTemperature] = useState(String(existing?.settings.temperature ?? 0.9));
  const [maxTokens, setMaxTokens] = useState(String(existing?.settings.maxOutputTokens ?? 700));
  const [contextTokens, setContextTokens] = useState(
    String(existing?.settings.maxContextTokens ?? DEFAULT_CONTEXT_TOKENS),
  );
  const [timeoutS, setTimeoutS] = useState(
    String(Math.round((existing?.settings.timeoutMs ?? 120000) / 1000)),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState<Preset | null>(null);

  const applyPreset = (presetId: string) => {
    const p = PRESETS.find((x) => x.id === presetId) ?? null;
    setPreset(p);
    if (!p || p.id === 'custom') return;
    setAdapter(p.adapter);
    setBaseUrl(p.baseUrl);
    setBilling(p.billing);
    setContextTokens(String(p.contextTokens));
    setMaxTokens(String(p.replyTokens ?? 700));
    if (!label.trim() || PRESETS.some((x) => x.label === label)) setLabel(p.label);
  };

  const submit = async () => {
    const t = Number(temperature);
    const m = Number(maxTokens);
    const s = Number(timeoutS);
    const c = Number(contextTokens);
    if (![t, m, s, c].every(Number.isFinite)) {
      setError('Temperature, reply length, context limit and timeout must be numbers.');
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
        temperature: t,
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
          <label htmlFor={`${id}-preset`}>Service</label>
          <select
            id={`${id}-preset`}
            defaultValue="custom"
            onChange={(e) => applyPreset(e.target.value)}
          >
            {GROUPS.map((g) => (
              <optgroup key={g} label={GROUP_LABELS[g]}>
                {PRESETS.filter((p) => p.group === g).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <p className="muted small">
            {preset?.note ??
              'Big AI labs, hosted open models and models on your own computer all work. Anything with an OpenAI-compatible API works through Other.'}
          </p>
        </div>
      )}
      <div className="field">
        <label htmlFor={`${id}-adapter`}>Type</label>
        <select
          id={`${id}-adapter`}
          value={adapter}
          onChange={(e) => setAdapter(e.target.value as AdapterKind)}
        >
          <option value="openai_compatible">OpenAI-compatible API</option>
          <option value="anthropic">Anthropic (Claude) API</option>
          <option value="ollama">Ollama</option>
        </select>
        {adapter === 'anthropic' && (
          <p className="muted small">
            Uses Anthropic&apos;s own Messages API. Claude picks its own temperature, so that
            setting is not sent. Some Claude models think before they write, so leave room in the
            reply length.
          </p>
        )}
        {adapter === 'ollama' && (
          <p className="muted small">
            Uses Ollama&apos;s own API so each request asks for the context limit below. Install a
            model first, for example with <code>ollama pull llama3.2</code>.
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor={`${id}-label`}>Name</label>
        <input
          id={`${id}-label`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={80}
          required
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-url`}>Address</label>
        <input
          id={`${id}-url`}
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder={
            adapter === 'ollama'
              ? 'http://localhost:11434'
              : adapter === 'anthropic'
                ? 'https://api.anthropic.com/v1'
                : 'https://api.example.com/v1'
          }
          inputMode="url"
          spellCheck={false}
          required
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-model`}>Model</label>
        <input
          id={`${id}-model`}
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          placeholder={
            preset?.model ? `For example ${preset.model}` : 'Model name, as the service spells it'
          }
          spellCheck={false}
          required
          aria-describedby={`${id}-model-hint`}
        />
        <p id={`${id}-model-hint`} className="muted small">
          After saving, <strong>Test connection</strong> checks the name against the service&apos;s
          list of models, for free.
        </p>
      </div>
      <div className="field">
        <label htmlFor={`${id}-key`}>API key</label>
        <input
          id={`${id}-key`}
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={
            existing?.hasKey
              ? 'Saved. Leave empty to keep it.'
              : preset && !preset.needsKey
                ? 'Not needed for local servers'
                : 'Paste your API key (not needed for local servers)'
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
            Remove the saved key
          </label>
        )}
        <p className="muted small">
          Stored in your system&apos;s credential store, never in the story database or exports.
        </p>
      </div>
      <fieldset className="field">
        <legend>Charges</legend>
        <label className="check">
          <input
            type="radio"
            name={`${id}-billing`}
            checked={billing === 'paid'}
            onChange={() => setBilling('paid')}
          />
          Paid API (usage is estimated from your rates)
        </label>
        <label className="check">
          <input
            type="radio"
            name={`${id}-billing`}
            checked={billing === 'local'}
            onChange={() => setBilling('local')}
          />
          Local model (no API charges)
        </label>
      </fieldset>
      <details>
        <summary>Advanced</summary>
        <div className="field-row">
          <div className="field">
            <label htmlFor={`${id}-temp`}>Temperature</label>
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
            <label htmlFor={`${id}-max`}>Longest reply (tokens)</label>
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
            <label htmlFor={`${id}-context`}>Context limit (tokens)</label>
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
          <div className="field">
            <label htmlFor={`${id}-timeout`}>Give up after (seconds of silence)</label>
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
        <p id={`${id}-context-hint`} className="muted small">
          The context limit covers the prompt and the reply. Use the model&apos;s context length, or
          the length your local server loads it with. Older story turns are summarized to fit; a
          lower limit also keeps paid requests cheaper.
        </p>
      </details>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="button-row">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={busy}>
          {existing ? 'Save changes' : 'Save connection'}
        </button>
      </div>
    </form>
  );
}

import { useId, useState } from 'react';
import { commands, errorMessage } from '../../api/commands';
import type { Billing, ProviderProfile, ProviderProfileInput } from '../../types';

type Preset = {
  id: string;
  label: string;
  baseUrl: string;
  billing: Billing;
  needsKey: boolean;
  /** Prompt plus reply, in tokens. Local servers often load models with 4096. */
  contextTokens: number;
};

const DEFAULT_CONTEXT_TOKENS = 16000;

// Addresses only; nothing is contacted until the user tests or plays.
const PRESETS: Preset[] = [
  {
    id: 'custom',
    label: 'Other (enter the address)',
    baseUrl: '',
    billing: 'paid',
    needsKey: true,
    contextTokens: 16_000,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    billing: 'paid',
    needsKey: true,
    contextTokens: 128_000,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    billing: 'paid',
    needsKey: true,
    contextTokens: 32_000,
  },
  {
    id: 'lmstudio',
    label: 'LM Studio on this computer',
    baseUrl: 'http://localhost:1234/v1',
    billing: 'local',
    needsKey: false,
    contextTokens: 4096,
  },
  {
    id: 'ollama',
    label: 'Ollama on this computer',
    baseUrl: 'http://localhost:11434/v1',
    billing: 'local',
    needsKey: false,
    contextTokens: 4096,
  },
];

type Props = {
  existing: ProviderProfile | null;
  onSaved: (p: ProviderProfile) => void;
  onCancel: () => void;
};

/** Add or edit an OpenAI-compatible connection. The key goes to the OS credential store. */
export function ConnectionForm({ existing, onSaved, onCancel }: Props) {
  const id = useId();
  const [label, setLabel] = useState(existing?.label ?? '');
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

  const applyPreset = (presetId: string) => {
    const p = PRESETS.find((x) => x.id === presetId);
    if (!p || p.id === 'custom') return;
    setBaseUrl(p.baseUrl);
    setBilling(p.billing);
    setContextTokens(String(p.contextTokens));
    if (!label.trim()) setLabel(p.label.replace(' on this computer', ''));
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
      adapter: 'openai_compatible',
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
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <p className="muted small">
            Any service that offers an OpenAI-compatible chat completions API works.
          </p>
        </div>
      )}
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
          placeholder="https://api.example.com/v1"
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
          placeholder="Model name, as the service spells it"
          spellCheck={false}
          required
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-key`}>API key</label>
        <input
          id={`${id}-key`}
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={
            existing?.hasKey ? 'Saved. Leave empty to keep it.' : 'Not needed for local servers'
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

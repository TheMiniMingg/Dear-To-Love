import { useId, useState } from 'react';
import { isComposing } from '../../app/keyboard';
import type { Stat } from '../../types';
import { ArrowPicker, type PickerOption } from '../../components/ArrowPicker';

/** Unique non-empty values, first spelling wins. */
export function uniq(values: (string | undefined | null)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = v?.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out;
}

/**
 * Picker over preset values that also shows a typed value (from Custom
 * mode or a template) as "Your own: …", so switching modes never loses it.
 */
export function PresetPicker({
  label,
  presets,
  value,
  onChange,
  noneLabel,
}: {
  label: string;
  presets: string[];
  value: string;
  onChange: (v: string) => void;
  /** Offer an empty choice with this label. */
  noneLabel?: string;
}) {
  const options: PickerOption<string>[] = presets.map((p) => ({ value: p, label: p }));
  const has = (v: string) => options.some((o) => o.value === v);
  if (value.trim() && !has(value)) options.unshift({ value, label: `Your own: ${value}` });
  if (noneLabel !== undefined && !has('')) options.unshift({ value: '', label: noneLabel });
  if (!value.trim() && !has(value)) options.unshift({ value, label: '(not set)' });
  return <ArrowPicker label={label} options={options} value={value} onChange={onChange} />;
}

export function TextField({
  label,
  value,
  onChange,
  required,
  hint,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  hint?: string;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required && <span className="muted small"> (required)</span>}
      </label>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && (
        <p id={`${id}-hint`} className="muted small">
          {hint}
        </p>
      )}
    </div>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  rows = 3,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        value={value}
        rows={rows}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && (
        <p id={`${id}-hint`} className="muted small">
          {hint}
        </p>
      )}
    </div>
  );
}

/** A list edited as one entry per line. Blank lines are dropped on create. */
export function LinesField({
  label,
  value,
  onChange,
  rows = 3,
  hint = 'One per line.',
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  rows?: number;
  hint?: string;
}) {
  return (
    <TextArea
      label={label}
      value={value.join('\n')}
      rows={rows}
      hint={hint}
      onChange={(t) => onChange(t.split('\n'))}
    />
  );
}

/** Checkboxes over preset entries; values already chosen stay listed. */
export function ToggleList({
  legend,
  presets,
  value,
  onChange,
  columns = false,
}: {
  legend: string;
  presets: string[];
  value: string[];
  onChange: (v: string[]) => void;
  /** Lay short entries out in columns. */
  columns?: boolean;
}) {
  const chosen = uniq(value);
  const all = uniq([...presets, ...chosen]);
  const isOn = (p: string) => chosen.some((c) => c.toLowerCase() === p.toLowerCase());
  return (
    <fieldset className={columns ? 'field toggle-list toggle-columns' : 'field toggle-list'}>
      <legend>{legend}</legend>
      {all.map((p) => (
        <label key={p} className="check">
          <input
            type="checkbox"
            checked={isOn(p)}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? [...chosen, p]
                  : chosen.filter((c) => c.toLowerCase() !== p.toLowerCase()),
              )
            }
          />
          {p}
        </label>
      ))}
    </fieldset>
  );
}

/** Stat names offered while typing; any name works. */
export const STAT_NAMES = [
  'Strength',
  'Agility',
  'Smarts',
  'Charm',
  'Nerve',
  'Luck',
  'Stealth',
  'Magic',
  'Study',
  'Fitness',
];

/**
 * A character's stats: a name and a number each, added to the dice rolls
 * that use them.
 */
export function StatsField({
  value,
  onChange,
  hint = 'Each stat is added to the dice rolls that use it, for example Smarts 2 on a test.',
}: {
  value: Stat[];
  onChange: (v: Stat[]) => void;
  hint?: string;
}) {
  const id = useId();
  const set = (i: number, patch: Partial<Stat>) =>
    onChange(value.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  return (
    <fieldset className="field stats-field" aria-describedby={`${id}-hint`}>
      <legend>Stats</legend>
      <p id={`${id}-hint`} className="muted small">
        {hint}
      </p>
      {value.map((s, i) => (
        <div key={i} className="stat-row">
          <label htmlFor={`${id}-name-${i}`} className="visually-hidden">
            Stat {i + 1} name
          </label>
          <input
            id={`${id}-name-${i}`}
            value={s.name}
            list={`${id}-names`}
            maxLength={60}
            placeholder="Name, e.g. Charm"
            onChange={(e) => set(i, { name: e.target.value })}
          />
          <label htmlFor={`${id}-value-${i}`} className="visually-hidden">
            {s.name.trim() || `Stat ${i + 1}`} value
          </label>
          <input
            id={`${id}-value-${i}`}
            type="number"
            inputMode="numeric"
            min={-1000}
            max={1000}
            value={Number.isFinite(s.value) ? s.value : 0}
            onChange={(e) => set(i, { value: Math.trunc(Number(e.target.value) || 0) })}
          />
          <button
            type="button"
            className="danger-link"
            aria-label={`Remove stat ${s.name.trim() || i + 1}`}
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            Remove
          </button>
        </div>
      ))}
      <datalist id={`${id}-names`}>
        {STAT_NAMES.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      {value.length < 30 && (
        <button type="button" onClick={() => onChange([...value, { name: '', value: 1 }])}>
          Add a stat
        </button>
      )}
    </fieldset>
  );
}

/**
 * A compact multi-choice: chosen entries as removable chips, a menu of the
 * rest, and a box to add your own. Keeps long preset lists off the page.
 */
export function MultiPicker({
  label,
  presets,
  value,
  onChange,
  hint,
}: {
  label: string;
  presets: string[];
  value: string[];
  onChange: (v: string[]) => void;
  hint?: string;
}) {
  const id = useId();
  const [own, setOwn] = useState('');
  const chosen = uniq(value);
  const has = (v: string) => chosen.some((c) => c.toLowerCase() === v.trim().toLowerCase());
  const rest = uniq(presets).filter((p) => !has(p));
  const add = (v: string) => {
    if (v.trim() && !has(v)) onChange([...chosen, v.trim()]);
  };
  const addOwn = () => {
    add(own);
    setOwn('');
  };
  return (
    <fieldset className="field multi-picker" aria-describedby={hint ? `${id}-hint` : undefined}>
      <legend>{label}</legend>
      {hint && (
        <p id={`${id}-hint`} className="muted small">
          {hint}
        </p>
      )}
      {chosen.length > 0 ? (
        <ul className="chip-list" aria-label={`Chosen ${label.toLowerCase()}`}>
          {chosen.map((c) => (
            <li key={c} className="pick-chip">
              <span>{c}</span>
              <button
                type="button"
                className="chip-remove"
                aria-label={`Remove ${c}`}
                onClick={() => onChange(chosen.filter((x) => x !== c))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">None chosen yet.</p>
      )}
      <div className="multi-add">
        {rest.length > 0 && (
          <>
            <label htmlFor={`${id}-pick`} className="visually-hidden">
              Add to {label.toLowerCase()} from the list
            </label>
            <select
              id={`${id}-pick`}
              value=""
              onChange={(e) => {
                add(e.target.value);
                e.target.blur();
              }}
            >
              <option value="">Add from the list…</option>
              {rest.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </>
        )}
        <label htmlFor={`${id}-own`} className="visually-hidden">
          Add your own to {label.toLowerCase()}
        </label>
        <input
          id={`${id}-own`}
          value={own}
          maxLength={200}
          placeholder="Or write your own"
          onChange={(e) => setOwn(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !isComposing(e)) {
              e.preventDefault();
              addOwn();
            }
          }}
        />
        <button type="button" disabled={!own.trim()} onClick={addOwn}>
          Add
        </button>
      </div>
    </fieldset>
  );
}

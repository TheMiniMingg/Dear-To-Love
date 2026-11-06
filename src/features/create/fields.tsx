import { useId } from 'react';
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

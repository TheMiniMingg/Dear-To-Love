import { useId, type KeyboardEvent } from 'react';
import { t } from '../i18n';

export type PickerOption<T extends string> = { value: T; label: string; hint?: string };

type Props<T extends string> = {
  label: string;
  options: PickerOption<T>[];
  value: T;
  onChange: (value: T) => void;
};

/**
 * Choice control usable three ways: Left/Right arrows while the dropdown is
 * focused, the previous/next buttons, or opening the dropdown (Up/Down, or a
 * click). All three set the same value and keep focus where it was.
 */
export function ArrowPicker<T extends string>({ label, options, value, onChange }: Props<T>) {
  const id = useId();
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const current = options[index];
  const step = (delta: 1 | -1) => {
    if (options.length === 0) return;
    const next = options[(index + delta + options.length) % options.length];
    if (next) onChange(next.value);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      step(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      step(1);
    }
  };
  return (
    <div
      className="arrow-picker"
      role="group"
      aria-labelledby={`${id}-label`}
      onKeyDown={onKeyDown}
    >
      <label id={`${id}-label`} htmlFor={`${id}-select`} className="arrow-picker-label">
        {label}
      </label>
      <div className="arrow-picker-row">
        <button
          type="button"
          className="icon-button"
          aria-label={t('Previous {label}', { label })}
          onClick={() => step(-1)}
          disabled={options.length < 2}
          tabIndex={-1}
        >
          ‹
        </button>
        <select
          id={`${id}-select`}
          value={current?.value ?? ''}
          aria-describedby={current?.hint ? `${id}-hint` : undefined}
          title={t('Left and right arrows change this')}
          onChange={(e) => onChange(e.target.value as T)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="icon-button"
          aria-label={t('Next {label}', { label })}
          onClick={() => step(1)}
          disabled={options.length < 2}
          tabIndex={-1}
        >
          ›
        </button>
      </div>
      {current?.hint && (
        <p id={`${id}-hint`} className="muted small">
          {current.hint}
        </p>
      )}
    </div>
  );
}

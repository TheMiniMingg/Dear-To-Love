import { useId } from 'react';
import type { ThemeId } from '../app/look';

export type ThemeOption = {
  /** The value chosen. */
  id: string;
  /** The theme its preview shows. */
  theme: ThemeId;
  label: string;
  hint?: string;
};

/**
 * Themes as cards, each with a small page drawn in its colours. A radio
 * group, so arrow keys move between them.
 */
export function ThemePicker({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string;
  value: string;
  options: ThemeOption[];
  onChange: (id: string) => void;
}) {
  const name = useId();
  return (
    <fieldset className="theme-picker">
      <legend>{legend}</legend>
      <div className="theme-options">
        {options.map((o) => (
          <label key={o.id} className="theme-option">
            <input
              type="radio"
              name={name}
              value={o.id}
              checked={value === o.id}
              onChange={() => onChange(o.id)}
            />
            <span className="theme-swatch" data-theme-preview={o.theme} aria-hidden="true">
              <span className="swatch-title">Aa</span>
              <span className="swatch-line" />
              <span className="swatch-line short" />
              <span className="swatch-button" />
            </span>
            <span className="theme-name">{o.label}</span>
            {o.hint && <span className="theme-hint">{o.hint}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { isComposing } from '../../app/keyboard';
import type { Stat } from '../../types';
import { ArrowPicker, type PickerOption } from '../../components/ArrowPicker';
import { msg, t } from '../../i18n';

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
  translate = false,
}: {
  label: string;
  presets: string[];
  value: string;
  onChange: (v: string) => void;
  /** Offer an empty choice with this label. */
  noneLabel?: string;
  /** Show each preset in the chosen language (the value stays as it is). */
  translate?: boolean;
}) {
  const options: PickerOption<string>[] = presets.map((p) => ({
    value: p,
    label: translate ? t(p) : p,
  }));
  const has = (v: string) => options.some((o) => o.value === v);
  if (value.trim() && !has(value)) {
    options.unshift({ value, label: t('Your own: {value}', { value }) });
  }
  if (noneLabel !== undefined && !has('')) options.unshift({ value: '', label: noneLabel });
  if (!value.trim() && !has(value)) options.unshift({ value, label: t('(not set)') });
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
        {required && <span className="muted small"> {t('(required)')}</span>}
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

/**
 * A text box that grows with what is written in it (from `rows` lines up
 * to most of the window, then it scrolls).
 */
export function TextArea({
  label,
  value,
  onChange,
  rows = 4,
  hint,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  hint?: string;
  placeholder?: string;
}) {
  const id = useId();
  const box = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    // Only grow: `rows` sets the smallest size.
    if (el.scrollHeight > el.clientHeight) el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        ref={box}
        value={value}
        rows={rows}
        placeholder={placeholder}
        className="grow"
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
  rows = 4,
  hint = t('One per line.'),
  placeholder,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  rows?: number;
  hint?: string;
  placeholder?: string;
}) {
  return (
    <TextArea
      label={label}
      value={value.join('\n')}
      rows={rows}
      hint={hint}
      placeholder={placeholder}
      onChange={(text) => onChange(text.split('\n'))}
    />
  );
}

/**
 * A box to type anything, with a list of suggestions to pick from instead
 * (opened with the arrow button, Down arrow or by typing) and a button to
 * clear it. `translate` shows suggestions in the chosen language while the
 * value stays as written in the list.
 */
export function ComboField({
  label,
  value,
  onChange,
  options,
  hint,
  placeholder,
  required = false,
  translate = false,
  maxLength = 200,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  hint?: string;
  placeholder?: string;
  required?: boolean;
  translate?: boolean;
  maxLength?: number;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(false);
  const [active, setActive] = useState(-1);
  const show = (v: string) => (translate ? t(v) : v);
  const presets = uniq(options);
  const preset = presets.find((p) => p === value);
  const text = preset !== undefined ? show(preset) : value;
  const q = text.trim().toLowerCase();
  // Typing narrows the list; opening it with the button shows everything.
  const list =
    typed && q
      ? presets.filter((p) => show(p).toLowerCase().includes(q) && show(p) !== text)
      : presets;
  const close = () => {
    setOpen(false);
    setActive(-1);
  };
  const pick = (p: string) => {
    onChange(p);
    close();
    setTyped(false);
    input.current?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (isComposing(e)) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(0);
        return;
      }
      const n = list.length;
      if (n) setActive((a) => (e.key === 'ArrowDown' ? (a + 1) % n : (a - 1 + n) % n));
    } else if (e.key === 'Enter' && open && list[active] !== undefined) {
      e.preventDefault();
      pick(list[active]!);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };
  const listId = `${id}-list`;
  return (
    <div className="field combo">
      <label htmlFor={id}>
        {label}
        {required && <span className="muted small"> {t('(required)')}</span>}
      </label>
      <div className="combo-row">
        <input
          id={id}
          ref={input}
          role="combobox"
          aria-expanded={open && list.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `${id}-opt-${active}` : undefined}
          aria-describedby={hint ? `${id}-hint` : undefined}
          value={text}
          maxLength={maxLength}
          placeholder={placeholder ?? t('Type your own or pick one')}
          autoComplete="off"
          onChange={(e) => {
            const v = e.target.value;
            // Typing a suggestion exactly as shown picks that suggestion.
            onChange(presets.find((p) => show(p) === v) ?? v);
            setTyped(true);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={onKeyDown}
          onBlur={close}
        />
        {value && (
          <button
            type="button"
            className="combo-clear"
            aria-label={t('Clear {label}', { label })}
            title={t('Clear')}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange('');
              setTyped(false);
              input.current?.focus();
            }}
          >
            ×
          </button>
        )}
        {presets.length > 0 && (
          <button
            type="button"
            className="combo-toggle"
            aria-label={t('Choices for {label}', { label })}
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setTyped(false);
              setOpen((o) => !o);
              setActive(-1);
              input.current?.focus();
            }}
          >
            ▾
          </button>
        )}
      </div>
      {open && list.length > 0 && (
        <ul id={listId} role="listbox" className="combo-list" aria-label={label}>
          {list.map((p, i) => (
            <li
              key={p}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={p === value}
              className={i === active ? 'active' : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p);
              }}
            >
              {show(p)}
            </li>
          ))}
        </ul>
      )}
      {hint && (
        <p id={`${id}-hint`} className="muted small">
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * Fields most people can skip, folded away under "More options". It starts
 * open when something in it is already filled in.
 */
export function MoreOptions({
  filled = 0,
  label = t('More options'),
  children,
}: {
  /** How many of the fields inside have something in them. */
  filled?: number;
  label?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(filled > 0);
  return (
    <details className="more-options" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        {label}
        <span className="muted small">
          {' · '}
          {filled > 0 ? t('{n} filled in', { n: filled }) : t('optional')}
        </span>
      </summary>
      <div className="more-options-body">{children}</div>
    </details>
  );
}

/** How many of these have something in them (text, a list entry). */
export function countFilled(...values: (string | string[] | undefined | null)[]): number {
  return values.filter((v) => (Array.isArray(v) ? v.some((x) => x.trim()) : !!v && v.trim() !== ''))
    .length;
}

/** Checkboxes over preset entries; values already chosen stay listed. */
export function ToggleList({
  legend,
  presets,
  value,
  onChange,
  columns = false,
  translate = false,
}: {
  legend: string;
  presets: string[];
  value: string[];
  onChange: (v: string[]) => void;
  /** Lay short entries out in columns. */
  columns?: boolean;
  /** Show each entry in the chosen language (the value stays as it is). */
  translate?: boolean;
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
          {translate ? t(p) : p}
        </label>
      ))}
    </fieldset>
  );
}

/** Stats offered with a word on what each is for; any name works. */
export const STATS: { name: string; about: string }[] = [
  { name: msg('Strength'), about: msg('Raw power: lifting, breaking, hitting hard.') },
  {
    name: msg('Fitness'),
    about: msg('Stamina and athletics: running, climbing, swimming, keeping going.'),
  },
  { name: msg('Agility'), about: msg('Speed and balance: dodging, catching, quick hands.') },
  { name: msg('Smarts'), about: msg('Knowing and working things out: puzzles, clues, memory.') },
  { name: msg('Charm'), about: msg('Winning people over: persuading, flirting, calming.') },
  {
    name: msg('Nerve'),
    about: msg('Courage under pressure: facing fear, bluffing, staying calm.'),
  },
  { name: msg('Stealth'), about: msg('Not being seen or heard: sneaking, hiding, slipping away.') },
  { name: msg('Magic'), about: msg('Casting spells and sensing magic.') },
  { name: msg('Study'), about: msg('Schoolwork and learning: tests, homework, research.') },
  { name: msg('Luck'), about: msg('Chance, when nothing else would help.') },
];
export const STAT_NAMES = STATS.map((s) => s.name);

/** What a stat is for, by its name in English or in the chosen language. */
export function statAbout(name: string): string | undefined {
  const key = name.trim().toLowerCase();
  const found = STATS.find((s) => s.name.toLowerCase() === key || t(s.name).toLowerCase() === key);
  return found && t(found.about);
}

/**
 * A character's stats: a name and a number each, added to the dice rolls
 * that use them. The usual ones are a click away, each with what it is for.
 */
export function StatsField({
  value,
  onChange,
  hint = t(
    'A stat is a bonus added to dice rolls that use it: 0 is ordinary, 1 or 2 is good, 3 or more is exceptional. Use any names you like.',
  ),
}: {
  value: Stat[];
  onChange: (v: Stat[]) => void;
  hint?: string;
}) {
  const id = useId();
  const set = (i: number, patch: Partial<Stat>) =>
    onChange(value.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const has = (name: string) =>
    value.some((s) => {
      const n = s.name.trim().toLowerCase();
      return n === name.toLowerCase() || n === t(name).toLowerCase();
    });
  const offered = STATS.filter((s) => !has(s.name));
  return (
    <fieldset className="field stats-field" aria-describedby={`${id}-hint`}>
      <legend>{t('Stats')}</legend>
      <p id={`${id}-hint`} className="muted small">
        {hint}
      </p>
      {value.map((s, i) => (
        <div key={i} className="stat-row">
          <label htmlFor={`${id}-name-${i}`} className="visually-hidden">
            {t('Stat {n} name', { n: i + 1 })}
          </label>
          <input
            id={`${id}-name-${i}`}
            value={s.name}
            list={`${id}-names`}
            maxLength={60}
            placeholder={t('Name, e.g. Charm')}
            onChange={(e) => set(i, { name: e.target.value })}
          />
          <label htmlFor={`${id}-value-${i}`} className="visually-hidden">
            {t('{stat} value', { stat: s.name.trim() || t('Stat {n}', { n: i + 1 }) })}
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
            aria-label={t('Remove stat {name}', { name: s.name.trim() || i + 1 })}
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            {t('Remove')}
          </button>
          {statAbout(s.name) && <p className="muted small stat-about">{statAbout(s.name)}</p>}
        </div>
      ))}
      <datalist id={`${id}-names`}>
        {STAT_NAMES.map((n) => (
          <option key={n} value={t(n)} />
        ))}
      </datalist>
      {value.length < 30 && (
        <div className="stat-picks" role="group" aria-label={t('Add a stat')}>
          {offered.map((st) => (
            <button
              key={st.name}
              type="button"
              className="pick-button"
              title={t(st.about)}
              aria-label={t('Add {stat}: {about}', { stat: t(st.name), about: t(st.about) })}
              onClick={() => onChange([...value, { name: t(st.name), value: 1 }])}
            >
              + {t(st.name)}
            </button>
          ))}
          <button
            type="button"
            className="pick-button"
            onClick={() => onChange([...value, { name: '', value: 1 }])}
          >
            {t('+ Your own')}
          </button>
        </div>
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
  translate = false,
}: {
  label: string;
  presets: string[];
  value: string[];
  onChange: (v: string[]) => void;
  hint?: string;
  /** Show presets in the chosen language (the value stays as it is). */
  translate?: boolean;
}) {
  const id = useId();
  const show = (v: string) => (translate ? t(v) : v);
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
        <ul className="chip-list" aria-label={t('Chosen {label}', { label: label.toLowerCase() })}>
          {chosen.map((c) => (
            <li key={c} className="pick-chip">
              <span>{show(c)}</span>
              <button
                type="button"
                className="chip-remove"
                aria-label={t('Remove {name}', { name: show(c) })}
                onClick={() => onChange(chosen.filter((x) => x !== c))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">{t('None chosen yet.')}</p>
      )}
      <div className="multi-add">
        {rest.length > 0 && (
          <>
            <label htmlFor={`${id}-pick`} className="visually-hidden">
              {t('Add to {label} from the list', { label: label.toLowerCase() })}
            </label>
            <select
              id={`${id}-pick`}
              value=""
              onChange={(e) => {
                add(e.target.value);
                e.target.blur();
              }}
            >
              <option value="">{t('Add from the list…')}</option>
              {rest.map((p) => (
                <option key={p} value={p}>
                  {show(p)}
                </option>
              ))}
            </select>
          </>
        )}
        <label htmlFor={`${id}-own`} className="visually-hidden">
          {t('Add your own to {label}', { label: label.toLowerCase() })}
        </label>
        <input
          id={`${id}-own`}
          value={own}
          maxLength={200}
          placeholder={t('Or write your own')}
          onChange={(e) => setOwn(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !isComposing(e)) {
              e.preventDefault();
              addOwn();
            }
          }}
        />
        <button type="button" disabled={!own.trim()} onClick={addOwn}>
          {t('Add')}
        </button>
      </div>
    </fieldset>
  );
}

import { memo, useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { isComposing } from '../../app/keyboard';
import { ListTools, useListView, type ListOption } from '../../components/ListTools';
import { t } from '../../i18n';
import { uniq } from './fields';
import { RULE_CATEGORIES, ruleCategory } from './ruleCategories';

/** From this many rules, the list gets search, kinds and an order. */
const TOOLS_FROM = 6;

type Row = { text: string; index: number };

const kindLabel = (rule: string) =>
  t(RULE_CATEGORIES.find((c) => c.id === ruleCategory(rule))?.label ?? 'Other');

const same = (s: string) => s;
const rowText = (r: Row) => r.text;
const rowKind = (r: Row) => ruleCategory(r.text);

const SORTS_CHOSEN = {
  written: null,
  az: (a: Row, b: Row) => a.text.localeCompare(b.text),
  kind: (a: Row, b: Row) => kindLabel(a.text).localeCompare(kindLabel(b.text)) || a.index - b.index,
};
const SORTS_SUGGESTED = {
  usual: null,
  az: (a: string, b: string) => a.localeCompare(b),
  kind: (a: string, b: string) => kindLabel(a).localeCompare(kindLabel(b)),
};

/**
 * One rule, edited where it is. The box wraps and grows to show the whole
 * rule (a hidden copy of the text sets its height), and a rule stays one
 * line: Enter adds no line break. Unchanged rows skip rendering while the
 * list is searched.
 */
const RuleRow = memo(function RuleRow({
  text,
  index,
  onEdit,
  onRemove,
}: {
  text: string;
  index: number;
  onEdit: (index: number, text: string) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <li className="rule-row">
      <div className="rule-text" data-text={text}>
        <textarea
          rows={1}
          aria-label={t('Rule {n}', { n: String(index + 1) })}
          value={text}
          maxLength={300}
          onChange={(e) => onEdit(index, e.target.value.replace(/[\r\n]+/g, ' '))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !isComposing(e)) e.preventDefault();
          }}
          onBlur={(e) => {
            if (!e.target.value.trim()) onRemove(index);
          }}
        />
      </div>
      <span className="rule-kind small">{kindLabel(text)}</span>
      <button
        type="button"
        className="chip-remove"
        aria-label={t('Remove {name}', { name: text })}
        onClick={() => onRemove(index)}
      >
        ×
      </button>
    </li>
  );
});

/** The suggested rules, browsed with their own search, kind and order. */
const SuggestedRules = memo(function SuggestedRules({
  suggestions,
  categories,
  onAdd,
}: {
  suggestions: string[];
  categories: ListOption[];
  onAdd: (rule: string) => void;
}) {
  const browse = useListView(suggestions, {
    text: same,
    category: ruleCategory,
    sorts: SORTS_SUGGESTED,
  });
  return (
    <details className="rule-browse">
      <summary>
        {t('Browse suggested rules ({count})', { count: String(suggestions.length) })}
      </summary>
      <ListTools
        what={t('suggested rules')}
        query={browse.query}
        onQuery={browse.setQuery}
        categories={categories}
        counts={browse.counts}
        category={browse.category}
        onCategory={browse.setCategory}
        sorts={[
          { id: 'usual', label: t('Usual order') },
          { id: 'az', label: t('A to Z') },
          { id: 'kind', label: t('By kind') },
        ]}
        sort={browse.sort}
        onSort={browse.setSort}
        shown={browse.shown.length}
        total={suggestions.length}
      />
      {browse.shown.length === 0 ? (
        <p className="muted small">{t('No rule matches.')}</p>
      ) : (
        <ul className="rule-suggestions">
          {browse.shown.map((s) => (
            <li key={s}>
              <button
                type="button"
                className="link-button"
                aria-label={t('Add the rule {name}', { name: s })}
                onClick={() => onAdd(s)}
              >
                + {s}
              </button>
              <span className="rule-kind small">{kindLabel(s)}</span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
});

/**
 * The rules the storyteller follows: each one editable where it is, a
 * search, a kind (magic, danger, romance…) and an order to find one in a
 * long list, and suggestions to browse the same way. Sorting only changes
 * what is shown; the rules stay in the order they were written.
 */
export function RulesField({
  label,
  value,
  onChange,
  presets,
  hint,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  presets: string[];
  hint?: string;
}) {
  const id = useId();
  const [own, setOwn] = useState('');
  const categories = useMemo(
    () => RULE_CATEGORIES.map((c) => ({ id: c.id, label: t(c.label) })),
    [],
  );
  const rows = useMemo(() => value.map((text, index) => ({ text, index })), [value]);
  const chosen = useListView(rows, { text: rowText, category: rowKind, sorts: SORTS_CHOSEN });

  const suggestions = useMemo(
    () =>
      uniq(presets).filter(
        (p) => !value.some((c) => c.trim().toLowerCase() === p.trim().toLowerCase()),
      ),
    [presets, value],
  );

  // Rows and suggestions keep the same handlers from render to render, so
  // typing in a search redraws only what it changes.
  const latest = useRef({ value, onChange });
  useLayoutEffect(() => {
    latest.current = { value, onChange };
  });
  const add = useCallback((v: string) => {
    const { value, onChange } = latest.current;
    const has = value.some((c) => c.trim().toLowerCase() === v.trim().toLowerCase());
    if (v.trim() && !has) onChange([...value, v.trim()]);
  }, []);
  const edit = useCallback((index: number, text: string) => {
    const { value, onChange } = latest.current;
    onChange(value.map((r, i) => (i === index ? text : r)));
  }, []);
  const remove = useCallback((index: number) => {
    const { value, onChange } = latest.current;
    onChange(value.filter((_, i) => i !== index));
  }, []);
  const addOwn = () => {
    add(own);
    setOwn('');
  };

  const orders = [
    { id: 'written', label: t('As written') },
    { id: 'az', label: t('A to Z') },
    { id: 'kind', label: t('By kind') },
  ];
  const tools = value.length >= TOOLS_FROM;

  return (
    <fieldset className="field rules-field" aria-describedby={hint ? `${id}-hint` : undefined}>
      <legend>{label}</legend>
      {hint && (
        <p id={`${id}-hint`} className="muted small">
          {hint}
        </p>
      )}
      {tools && (
        <ListTools
          what={t('your rules')}
          query={chosen.query}
          onQuery={chosen.setQuery}
          categories={categories}
          counts={chosen.counts}
          category={chosen.category}
          onCategory={chosen.setCategory}
          sorts={orders}
          sort={chosen.sort}
          onSort={chosen.setSort}
          shown={chosen.shown.length}
          total={value.length}
        />
      )}
      {value.length === 0 ? (
        <p className="muted small">{t('None chosen yet.')}</p>
      ) : chosen.shown.length === 0 ? (
        <p className="muted small">{t('No rule matches.')}</p>
      ) : (
        <ul className="rule-list" aria-label={t('Chosen {label}', { label: label.toLowerCase() })}>
          {chosen.shown.map((r) => (
            <RuleRow key={r.index} text={r.text} index={r.index} onEdit={edit} onRemove={remove} />
          ))}
        </ul>
      )}
      <div className="multi-add">
        <label htmlFor={`${id}-own`} className="visually-hidden">
          {t('Add your own to {label}', { label: label.toLowerCase() })}
        </label>
        <input
          id={`${id}-own`}
          value={own}
          maxLength={300}
          placeholder={t('Write a rule of your own')}
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
      {suggestions.length > 0 && (
        <SuggestedRules suggestions={suggestions} categories={categories} onAdd={add} />
      )}
    </fieldset>
  );
}

import { useId } from 'react';
import type { Item, Meter, Tracking } from '../../types';
import { joinList, msg, t, tn } from '../../i18n';

/** Names offered for bars and counters (translated when picked). */
const METER_NAMES = [
  msg('Health'),
  msg('Mana'),
  msg('Stamina'),
  msg('Sanity'),
  msg('Hunger'),
  msg('Gold'),
  msg('Money'),
  msg('Credits'),
  msg('Affection'),
  msg('Trust'),
  msg('Reputation'),
  msg('Experience'),
];

const ROMANCE = ['Romance', 'Dating sim', 'Dark romance', 'Erotica'];
const MAGIC = ['Fantasy', 'Adventure', 'Supernatural'];
const FUTURE = ['Science fiction', 'Cyberpunk', 'Post-apocalyptic'];

const bar = (name: string, value: number, max: number): Meter => ({ name: t(name), value, max });
const counter = (name: string, value: number): Meter => ({ name: t(name), value });

/** What a story starts tracking with, by its kind: a fantasy party gets mana. */
export function defaultTracking(genres: string[]): Tracking {
  const has = (list: string[]) => genres.some((g) => list.includes(g));
  if (has(ROMANCE) && !has(MAGIC)) {
    return { meters: [bar('Affection', 20, 100)], inventory: true, items: [] };
  }
  if (has(MAGIC)) {
    return {
      meters: [bar('Health', 100, 100), bar('Mana', 50, 50), counter('Gold', 10)],
      inventory: true,
      items: [],
    };
  }
  if (has(FUTURE)) {
    return {
      meters: [bar('Health', 100, 100), counter('Credits', 50)],
      inventory: true,
      items: [],
    };
  }
  return { meters: [bar('Health', 100, 100), counter('Money', 20)], inventory: true, items: [] };
}

/** "Health 80/100", or "Kira: Health 40/60". */
export function meterText(m: Meter): string {
  const value = m.max !== undefined ? `${m.value}/${m.max}` : String(m.value);
  return m.who
    ? t('{who}: {name} {value}', { who: m.who, name: m.name, value })
    : `${m.name} ${value}`;
}

/**
 * "Health 100/100, Gold 10, inventory of 2 items", or '' when off. Short:
 * others' bars are counted by whose they are ("bars for 4 others").
 */
export function trackingSummary(tr: Tracking | undefined, short = false): string {
  if (!tr) return '';
  const meters = tr.meters.filter((m) => m.name.trim());
  const parts = (short ? meters.filter((m) => !m.who) : meters).map(meterText);
  const others = new Set(meters.flatMap((m) => (m.who ? [m.who] : []))).size;
  if (short && others > 0) {
    parts.push(tn(others, 'bars for {n} other', 'bars for {n} others'));
  }
  if (tr.inventory) {
    const n = (tr.items ?? []).filter((i) => i.name.trim()).length;
    parts.push(tn(n, 'an inventory with {n} item', 'an inventory with {n} items'));
  }
  return joinList(parts);
}

const MAX_METERS = 24;
const MAX_ITEMS = 200;

/**
 * RPG-style tracking, set when a story is made and in Story details: bars
 * (Health 80/100), counters (Gold 35) and an inventory. The storyteller
 * changes them as things happen; the reader shows them.
 */
export function TrackingFields({
  tracking,
  onChange,
  genres,
}: {
  tracking: Tracking | undefined;
  onChange: (tracking: Tracking | undefined) => void;
  /** The story's kind, for what a story starts tracking with. */
  genres: string[];
}) {
  const id = useId();
  const on = !!tracking;
  const tr = tracking ?? { meters: [] };
  const items = tr.items ?? [];
  const setMeter = (i: number, patch: Partial<Meter>) =>
    onChange({ ...tr, meters: tr.meters.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  const setItem = (i: number, patch: Partial<Item>) =>
    onChange({ ...tr, items: items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const whole = (v: string, min: number, max: number) =>
    Math.min(max, Math.max(min, Math.trunc(Number(v) || 0)));
  return (
    <>
      <div className="field">
        <label className="check">
          <input
            type="checkbox"
            checked={on}
            aria-describedby={`${id}-hint`}
            onChange={(e) => onChange(e.target.checked ? defaultTracking(genres) : undefined)}
          />
          {t('Keep track of health, items and more')}
        </label>
        <p id={`${id}-hint`} className="muted small check-hint">
          {t(
            'Like an RPG: bars, counters and an inventory the storyteller updates as things happen.',
          )}
        </p>
      </div>
      {on && (
        <div className="sub-options tracking-fields">
          <fieldset className="field">
            <legend>{t('Bars and counters')}</legend>
            <p className="muted small">
              {t('A bar has a maximum (Health 80/100); leave it empty for a counter (Gold 35).')}
            </p>
            {tr.meters.map((m, i) => {
              const name = m.name.trim() || t('Bar {n}', { n: i + 1 });
              return (
                <div key={i} className="tracker-row">
                  <input
                    aria-label={t('Bar {n} name', { n: i + 1 })}
                    value={m.name}
                    list={`${id}-meter-names`}
                    maxLength={60}
                    placeholder={t('Name, e.g. Health')}
                    onChange={(e) => setMeter(i, { name: e.target.value })}
                  />
                  <input
                    aria-label={t('{name} now', { name })}
                    type="number"
                    inputMode="numeric"
                    value={m.value}
                    onChange={(e) => {
                      const value = whole(e.target.value, -1_000_000, 1_000_000);
                      setMeter(i, {
                        value: m.max !== undefined ? Math.min(Math.max(value, 0), m.max) : value,
                      });
                    }}
                  />
                  <input
                    aria-label={t('{name} maximum', { name })}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    placeholder={t('No max')}
                    value={m.max ?? ''}
                    onChange={(e) => {
                      if (e.target.value === '') {
                        setMeter(i, { max: undefined });
                        return;
                      }
                      const max = whole(e.target.value, 1, 1_000_000);
                      setMeter(i, { max, value: Math.min(Math.max(m.value, 0), max) });
                    }}
                  />
                  <input
                    aria-label={t('Whose {name}', { name })}
                    className="tracker-who"
                    value={m.who ?? ''}
                    maxLength={60}
                    placeholder={t('Yours')}
                    onChange={(e) => setMeter(i, { who: e.target.value || undefined })}
                  />
                  <button
                    type="button"
                    className="danger-link"
                    aria-label={t('Remove {name}', { name })}
                    onClick={() => onChange({ ...tr, meters: tr.meters.filter((_, j) => j !== i) })}
                  >
                    {t('Remove')}
                  </button>
                </div>
              );
            })}
            <datalist id={`${id}-meter-names`}>
              {METER_NAMES.map((n) => (
                <option key={n} value={t(n)} />
              ))}
            </datalist>
            {tr.meters.length < MAX_METERS && (
              <div className="button-row">
                <button
                  type="button"
                  onClick={() =>
                    onChange({ ...tr, meters: [...tr.meters, { name: '', value: 100, max: 100 }] })
                  }
                >
                  {t('Add a bar')}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChange({ ...tr, meters: [...tr.meters, { name: '', value: 0 }] })
                  }
                >
                  {t('Add a counter')}
                </button>
              </div>
            )}
          </fieldset>
          <div className="field">
            <label className="check">
              <input
                type="checkbox"
                checked={!!tr.inventory}
                onChange={(e) => onChange({ ...tr, inventory: e.target.checked || undefined })}
              />
              {t('Keep an inventory')}
            </label>
            <p className="muted small check-hint">
              {t(
                'What you find, buy or are given, each with a description and a picture if you make one.',
              )}
            </p>
          </div>
          {tr.inventory && (
            <fieldset className="field">
              <legend>{t('Starting items')}</legend>
              {items.map((it, i) => {
                const name = it.name.trim() || t('Item {n}', { n: i + 1 });
                return (
                  <div key={i} className="tracker-row tracker-item">
                    <input
                      aria-label={t('Item {n} name', { n: i + 1 })}
                      value={it.name}
                      maxLength={60}
                      placeholder={t('Name, e.g. Rope')}
                      onChange={(e) => setItem(i, { name: e.target.value })}
                    />
                    <input
                      aria-label={t('How many {name}', { name })}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={it.qty}
                      onChange={(e) => setItem(i, { qty: whole(e.target.value, 1, 9999) })}
                    />
                    <input
                      aria-label={t('{name} description', { name })}
                      className="tracker-description"
                      value={it.description ?? ''}
                      maxLength={600}
                      placeholder={t('What it is (optional)')}
                      onChange={(e) => setItem(i, { description: e.target.value || undefined })}
                    />
                    <button
                      type="button"
                      className="danger-link"
                      aria-label={t('Remove {name}', { name })}
                      onClick={() => onChange({ ...tr, items: items.filter((_, j) => j !== i) })}
                    >
                      {t('Remove')}
                    </button>
                  </div>
                );
              })}
              {items.length < MAX_ITEMS && (
                <div className="button-row">
                  <button
                    type="button"
                    onClick={() => onChange({ ...tr, items: [...items, { name: '', qty: 1 }] })}
                  >
                    {t('Add an item')}
                  </button>
                </div>
              )}
            </fieldset>
          )}
        </div>
      )}
    </>
  );
}

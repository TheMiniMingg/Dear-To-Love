import { useId } from 'react';
import type { Item, Meter, Rarity, Tracking } from '../../types';
import { joinList, msg, t, tn } from '../../i18n';
import {
  addKit,
  describeEffect,
  effectText,
  leastRarity,
  MAX_ITEM_BONUS,
  ODDS_PRESETS,
  oddsOf,
  parseEffect,
  percents,
  RARITIES,
  rarityLabel,
  STARTER_KITS,
  type DiceEffect,
} from '../reader/items';

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

/** Bars and counters a click away, with where they start. */
const QUICK: { name: string; value: number; max?: number }[] = [
  { name: msg('Health'), value: 100, max: 100 },
  { name: msg('Mana'), value: 50, max: 50 },
  { name: msg('Stamina'), value: 100, max: 100 },
  { name: msg('Gold'), value: 10 },
  { name: msg('Experience'), value: 0 },
  { name: msg('Affection'), value: 20, max: 100 },
  { name: msg('Trust'), value: 50, max: 100 },
  { name: msg('Sanity'), value: 100, max: 100 },
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
  alwaysOn = false,
}: {
  tracking: Tracking | undefined;
  onChange: (tracking: Tracking | undefined) => void;
  /** The story's kind, for what a story starts tracking with. */
  genres: string[];
  /** RPG mode: the fields without the box that turns them on. */
  alwaysOn?: boolean;
}) {
  const id = useId();
  const on = alwaysOn || !!tracking;
  const tr = tracking ?? { meters: [], inventory: alwaysOn || undefined, items: [] };
  const quick = QUICK.filter(
    (q) =>
      !tr.meters.some((m) => !m.who && m.name.trim().toLowerCase() === t(q.name).toLowerCase()),
  );
  const items = tr.items ?? [];
  const setMeter = (i: number, patch: Partial<Meter>) =>
    onChange({ ...tr, meters: tr.meters.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  const setItem = (i: number, patch: Partial<Item>) =>
    onChange({ ...tr, items: items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const whole = (v: string, min: number, max: number) =>
    Math.min(max, Math.max(min, Math.trunc(Number(v) || 0)));
  return (
    <>
      {!alwaysOn && (
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
      )}
      {on && (
        <div className={alwaysOn ? 'tracking-fields' : 'sub-options tracking-fields'}>
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
            {tr.meters.length < MAX_METERS && quick.length > 0 && (
              <div className="stat-picks" role="group" aria-label={t('Add a bar or counter')}>
                {quick.map((q) => (
                  <button
                    key={q.name}
                    type="button"
                    className="pick-button"
                    onClick={() =>
                      onChange({
                        ...tr,
                        meters: [...tr.meters, { name: t(q.name), value: q.value, max: q.max }],
                      })
                    }
                  >
                    + {t(q.name)}
                  </button>
                ))}
              </div>
            )}
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
              <div className="stat-picks" role="group" aria-label={t('Starter kits')}>
                <span className="muted small kit-label">{t('Starter kits:')}</span>
                {STARTER_KITS.map((k) => (
                  <button
                    key={k.name}
                    type="button"
                    className="pick-button"
                    title={k.items.map((i) => t(i.name)).join(', ')}
                    onClick={() => onChange({ ...tr, items: addKit(items, k.items) })}
                  >
                    + {t(k.name)}
                  </button>
                ))}
              </div>
              {items.map((it, i) => {
                const name = it.name.trim() || t('Item {n}', { n: i + 1 });
                return (
                  <div key={i} className="tracker-item-block">
                    <div className="tracker-row tracker-item">
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
                    <ItemPowers item={it} name={name} onChange={(patch) => setItem(i, patch)} />
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
          {tr.inventory && <LootOdds tracking={tr} onChange={onChange} />}
        </div>
      )}
    </>
  );
}

type EffectKind = DiceEffect['kind'] | '';

const EFFECT_KINDS: { value: EffectKind; label: string }[] = [
  { value: '', label: msg('No dice effect') },
  { value: 'bonus', label: msg('Adds to the roll') },
  { value: 'best', label: msg('Roll twice, keep the higher') },
  { value: 'odd', label: msg('Odd numbers only') },
  { value: 'even', label: msg('Even numbers only') },
  { value: 'faces', label: msg('Only some numbers') },
];

/**
 * An item's rarity and what it does to dice, folded under the item: the
 * rarity rises on its own when the effect is too strong for it.
 */
function ItemPowers({
  item,
  name,
  onChange,
}: {
  item: Item;
  name: string;
  onChange: (patch: Partial<Item>) => void;
}) {
  const id = useId();
  const effect = parseEffect(item.dice);
  const least = effect ? leastRarity(effect) : undefined;
  const order = RARITIES.map((r) => r.value);
  const rarity = item.rarity;
  const setEffect = (e: DiceEffect | null) => {
    const patch: Partial<Item> = { dice: e ? effectText(e) : undefined };
    if (e) {
      const need = leastRarity(e);
      if (!rarity || order.indexOf(rarity) < order.indexOf(need)) patch.rarity = need;
    }
    onChange(patch);
  };
  const kind: EffectKind = effect?.kind ?? '';
  const summary = [
    rarity && rarityLabel(rarity),
    effect && describeEffect(effect),
    item.keep && t('Lasts'),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <details className="item-powers">
      <summary>
        {t('Rarity and effect')}
        {summary && <span className="muted small"> · {summary}</span>}
      </summary>
      <div className="item-powers-body">
        <div className="field">
          <label htmlFor={`${id}-rarity`}>{t('Rarity')}</label>
          <select
            id={`${id}-rarity`}
            aria-label={t('{name} rarity', { name })}
            value={rarity ?? ''}
            onChange={(e) =>
              onChange({ rarity: (e.target.value || undefined) as Rarity | undefined })
            }
          >
            <option value="">{t('Not set')}</option>
            {RARITIES.map((r) => (
              <option
                key={r.value}
                value={r.value}
                disabled={!!least && order.indexOf(r.value) < order.indexOf(least)}
              >
                {t(r.label)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-effect`}>{t('On a roll')}</label>
          <select
            id={`${id}-effect`}
            aria-label={t('{name} dice effect', { name })}
            value={kind}
            onChange={(e) => {
              const k = e.target.value as EffectKind;
              setEffect(
                k === ''
                  ? null
                  : k === 'bonus'
                    ? { kind: 'bonus', n: 1 }
                    : k === 'faces'
                      ? { kind: 'faces', low: 1, high: 2 }
                      : { kind: k },
              );
            }}
          >
            {EFFECT_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {t(k.label)}
              </option>
            ))}
          </select>
        </div>
        {effect?.kind === 'bonus' && (
          <div className="field">
            <label htmlFor={`${id}-bonus`}>{t('Adds')}</label>
            <input
              id={`${id}-bonus`}
              type="number"
              min={1}
              max={MAX_ITEM_BONUS}
              value={effect.n}
              onChange={(e) =>
                setEffect({
                  kind: 'bonus',
                  n: Math.min(MAX_ITEM_BONUS, Math.max(1, Math.trunc(Number(e.target.value) || 1))),
                })
              }
            />
          </div>
        )}
        {effect?.kind === 'faces' && (
          <div className="field item-faces">
            <label htmlFor={`${id}-low`}>{t('Numbers from')}</label>
            <input
              id={`${id}-low`}
              type="number"
              min={1}
              value={effect.low}
              onChange={(e) => {
                const low = Math.max(1, Math.trunc(Number(e.target.value) || 1));
                setEffect({ kind: 'faces', low, high: Math.max(low, effect.high) });
              }}
            />
            <label htmlFor={`${id}-high`}>{t('to')}</label>
            <input
              id={`${id}-high`}
              type="number"
              min={effect.low}
              max={1000}
              value={effect.high}
              onChange={(e) => {
                const high = Math.min(
                  1000,
                  Math.max(effect.low, Math.trunc(Number(e.target.value) || 1)),
                );
                setEffect({ kind: 'faces', low: effect.low, high });
              }}
            />
          </div>
        )}
        <label className="check">
          <input
            type="checkbox"
            checked={!!item.keep}
            onChange={(e) => onChange({ keep: e.target.checked || undefined })}
          />
          {t('Lasts: using it does not use it up')}
        </label>
        {effect && (
          <p className="muted small">
            {t('{effect}. Needs at least {rarity}; stronger effects are rarer.', {
              effect: describeEffect(effect),
              rarity: rarityLabel(leastRarity(effect)),
            })}
          </p>
        )}
      </div>
    </details>
  );
}

/**
 * How likely each rarity is when the storyteller hands out something new:
 * a preset, or the player's own numbers. Folded away: the usual odds suit
 * most stories.
 */
function LootOdds({
  tracking: tr,
  onChange,
}: {
  tracking: Tracking;
  onChange: (tracking: Tracking) => void;
}) {
  const id = useId();
  const odds = oddsOf(tr);
  const pct = percents(odds);
  const preset = ODDS_PRESETS.find((p) => p.odds.every((w, i) => w === odds[i]));
  const set = (next: number[] | undefined) =>
    onChange({
      ...tr,
      lootOdds: next as Tracking['lootOdds'],
    });
  return (
    <details className="item-powers loot-odds">
      <summary>
        {t('Loot rarity odds')}
        <span className="muted small"> · {preset ? t(preset.name) : t('Your own')}</span>
      </summary>
      <div className="item-powers-body">
        <p className="muted small">
          {t(
            'When you find, earn or are given something, the app rolls its rarity with these odds and the storyteller makes an item to match.',
          )}
        </p>
        <div className="stat-picks" role="group" aria-label={t('Loot rarity odds')}>
          {ODDS_PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              className="pick-button"
              aria-pressed={preset === p}
              onClick={() => set(p === ODDS_PRESETS[1] ? undefined : p.odds)}
            >
              {t(p.name)}
            </button>
          ))}
        </div>
        <div className="loot-odds-grid">
          {RARITIES.map((r, i) => (
            <div key={r.value} className={`field rarity-${r.value}`}>
              <label htmlFor={`${id}-${r.value}`}>{t(r.label)}</label>
              <input
                id={`${id}-${r.value}`}
                type="number"
                min={0}
                max={1000}
                value={odds[i]}
                onChange={(e) => {
                  const next = [...odds];
                  next[i] = Math.min(1000, Math.max(0, Math.trunc(Number(e.target.value) || 0)));
                  if (!next.some((w) => w > 0)) next[0] = 1;
                  set(next);
                }}
              />
              <span className="muted small">{pct[i]}%</span>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

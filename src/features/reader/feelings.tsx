/**
 * How the people in a story feel about the player: the line and the heart
 * or trust bar the storyteller keeps with `<bond>` tags (`domain::bonds` in
 * Rust), shown in Story memory and changed in Story details.
 */
import { useId } from 'react';
import { Heart, ShieldCheck } from 'lucide-react';
import type { Bond, BondKind, Relationship, StoryStateV1 } from '../../types';
import { bondChanges, type BondChange } from './messages';
import { msg, t } from '../../i18n';

export const BOND_KINDS: { kind: BondKind; label: string; low: string; high: string }[] = [
  { kind: 'heart', label: msg('Heart'), low: msg('Cold'), high: msg('Devoted') },
  { kind: 'trust', label: msg('Trust'), low: msg('Suspicious'), high: msg('Complete trust') },
];

export const BOND_ICONS = { heart: Heart, trust: ShieldCheck } as const;

/** A neutral bar, where a new one starts. */
export const START_BOND = 50;

const key = (s: string) => s.trim().split(/\s+/).join(' ').toLowerCase();

/**
 * The id of the character `name` refers to, as `bonds::character_id` in
 * Rust: a whole name, or a first name only one person has. Never the player.
 */
export function characterIdByName(state: StoryStateV1, name: string): string | null {
  const wanted = key(name);
  const others = Object.values(state.characters).filter((c) => c.id !== state.playerCharacterId);
  const whole = others.find((c) => key(c.name) === wanted);
  if (whole) return whole.id;
  const first = others.filter((c) => key(c.name).split(' ')[0] === wanted);
  return first.length === 1 ? first[0]!.id : null;
}

/** The relationship from `id` to the player, if the story keeps one. */
export function towardsPlayer(state: StoryStateV1, id: string): Relationship | undefined {
  return state.relationships.find((r) => r.fromId === id && r.toId === state.playerCharacterId);
}

/** `state` with the relationship from `id` to the player changed (or begun). */
export function withFeeling(
  state: StoryStateV1,
  id: string,
  patch: Partial<Pick<Relationship, 'label' | 'status' | 'bond'>>,
): StoryStateV1 {
  const i = state.relationships.findIndex(
    (r) => r.fromId === id && r.toId === state.playerCharacterId,
  );
  const base: Relationship =
    i >= 0
      ? state.relationships[i]!
      : { fromId: id, toId: state.playerCharacterId, label: '', status: '' };
  const next: Relationship = { ...base, ...patch };
  if (!next.bond) delete next.bond;
  const relationships =
    i >= 0
      ? state.relationships.map((r, j) => (j === i ? next : r))
      : [...state.relationships, next];
  return { ...state, relationships };
}

/**
 * The bond tags of a reply that still stand as it left them, as far as the
 * story shows: what its Undo would take back.
 */
export function standingBonds(text: string, state: StoryStateV1): BondChange[] {
  return bondChanges(text).filter((c) => {
    const id = characterIdByName(state, c.name);
    const r = id ? towardsPlayer(state, id) : undefined;
    return !!r && (!c.line || r.status === c.line);
  });
}

/** A heart or trust bar, from 0 to 100, with its icon. */
export function BondBar({ bond, name }: { bond: Bond; name: string }) {
  const kind = BOND_KINDS.find((k) => k.kind === bond.kind) ?? BOND_KINDS[0]!;
  const Icon = BOND_ICONS[bond.kind];
  const label = t('{name}: {bar} {value} of 100', {
    name,
    bar: t(kind.label),
    value: bond.value,
  });
  return (
    <span className={`bond-bar kind-${bond.kind}`} title={label}>
      <Icon className="bond-icon" aria-hidden={true} size={14} />
      <span
        className="bond-track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={bond.value}
      >
        <span className="bond-fill" style={{ width: `${bond.value}%` }} />
      </span>
      <span className="bond-value" aria-hidden="true">
        {bond.value}
      </span>
    </span>
  );
}

/**
 * Story details: how someone knows the player, how they feel now, and a bar
 * to drag. Empty fields and no bar leave nothing behind.
 */
export function FeelingFields({
  name,
  relationship,
  onChange,
}: {
  name: string;
  relationship: Relationship | undefined;
  onChange: (patch: Partial<Pick<Relationship, 'label' | 'status' | 'bond'>>) => void;
}) {
  const id = useId();
  const bond = relationship?.bond;
  const kind = BOND_KINDS.find((k) => k.kind === bond?.kind);
  return (
    <fieldset className="field feeling-fields">
      <legend>{t('How {name} feels about you', { name: name || t('they') })}</legend>
      <div className="field-row">
        <div className="field">
          <label htmlFor={`${id}-label`}>{t('How they know you')}</label>
          <input
            id={`${id}-label`}
            type="text"
            value={relationship?.label ?? ''}
            placeholder={t('Your landlady, an old friend…')}
            onChange={(e) => onChange({ label: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-status`}>{t('How they feel now')}</label>
          <input
            id={`${id}-status`}
            type="text"
            value={relationship?.status ?? ''}
            placeholder={t('Warmer since you fixed the lamp…')}
            onChange={(e) => onChange({ status: e.target.value })}
          />
        </div>
      </div>
      <div className="feeling-bar-row">
        <div className="segmented" role="radiogroup" aria-label={t('Bar')}>
          <label>
            <input
              type="radio"
              name={`${id}-kind`}
              checked={!bond}
              onChange={() => onChange({ bond: undefined })}
            />
            <span>{t('No bar')}</span>
          </label>
          {BOND_KINDS.map((k) => (
            <label key={k.kind}>
              <input
                type="radio"
                name={`${id}-kind`}
                checked={bond?.kind === k.kind}
                onChange={() =>
                  onChange({ bond: { kind: k.kind, value: bond?.value ?? START_BOND } })
                }
              />
              <span>{t(k.label)}</span>
            </label>
          ))}
        </div>
        {bond && kind && (
          <div className="feeling-range">
            <span className="muted small">{t(kind.low)}</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={bond.value}
              aria-label={t('{bar} of {name}', { bar: t(kind.label), name: name || t('they') })}
              aria-valuetext={`${bond.value} / 100`}
              onChange={(e) =>
                onChange({ bond: { kind: bond.kind, value: Number(e.target.value) } })
              }
            />
            <span className="muted small">{t(kind.high)}</span>
            <output className="feeling-value">{bond.value}</output>
          </div>
        )}
      </div>
      <p className="muted small">
        {t(
          'The storyteller moves the bar and the words as the story goes, and reads them before every reply.',
        )}
      </p>
    </fieldset>
  );
}

import { createContext, useContext } from 'react';
import type { DiceRoll, DiceRules, RollRequest } from '../../types';
import { t } from '../../i18n';

/** The story's dice rules, for cards that hide the number needed. */
export const DiceRulesContext = createContext<DiceRules>({});

/** A die outline, for a roll that is still to be made. */
function DieIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="roll-icon">
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <circle cx="8.5" cy="8.5" r="1.4" />
      <circle cx="15.5" cy="15.5" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
    </svg>
  );
}

const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));

/** What was rolled, for example "2d6+1 (3 + 5) + Charm +2 · needs 12". */
function rollDetail(r: {
  dice: string;
  faces?: number[];
  stat?: string;
  bonus?: number;
  target?: number;
}): string {
  let out = r.dice;
  if (r.faces && r.faces.length > 1) out += ` (${r.faces.join(' + ')})`;
  if (r.stat) out += ` + ${r.stat} ${signed(r.bonus ?? 0)}`;
  if (r.target !== undefined) out += ` · ${t('needs {n}', { n: r.target })}`;
  return out;
}

/**
 * A roll that was made. `fresh` gives the die a short tumble (not when the
 * system asks for reduced motion).
 */
export function RollResult({
  roll,
  fresh = false,
}: {
  roll: Pick<DiceRoll, 'label' | 'dice' | 'total'> & Partial<DiceRoll>;
  fresh?: boolean;
}) {
  const outcome =
    roll.critical ??
    (roll.target === undefined ? null : roll.total >= roll.target ? 'success' : 'failure');
  const outcomeText =
    roll.critical === 'success'
      ? t('Critical success')
      : roll.critical === 'failure'
        ? t('Critical failure')
        : outcome === 'success'
          ? t('Success')
          : outcome === 'failure'
            ? t('Failed')
            : '';
  return (
    <div
      className={['msg-roll', 'rolled', outcome, roll.critical && 'critical', fresh && 'fresh']
        .filter(Boolean)
        .join(' ')}
      role="group"
      aria-label={
        outcomeText
          ? t('Roll for {label}: {total}, {outcome}', {
              label: roll.label,
              total: roll.total,
              outcome: outcomeText,
            })
          : t('Roll for {label}: {total}', { label: roll.label, total: roll.total })
      }
    >
      <span className="roll-die" aria-hidden="true">
        {roll.total}
      </span>
      <div className="roll-body">
        <span className="msg-label">{roll.asked ? t('You rolled for') : t('Roll for')}</span>{' '}
        <strong>{roll.label}</strong>
        <span className="roll-detail">{rollDetail(roll)}</span>
      </div>
      {outcomeText && <span className="roll-outcome">{outcomeText}</span>}
    </div>
  );
}

/** A roll the storyteller asks for; `onRoll` offers the button. */
export function RollAsk({
  request,
  onRoll,
}: {
  request: RollRequest;
  onRoll?: (request: RollRequest) => void;
}) {
  const rules = useContext(DiceRulesContext);
  const stat = rules.noStats ? undefined : request.stat;
  // A story with its own dice rolls them for every roll asked for.
  const dice = rules.dice ?? request.dice;
  const detail = [
    stat ? t('{dice} + your {stat}', { dice, stat }) : dice,
    request.target !== undefined && !rules.hideTarget && t('needs {n}', { n: request.target }),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div
      className="msg-roll ask"
      role="group"
      aria-label={t('Roll for {label}', { label: request.label })}
    >
      <span className="roll-die" aria-hidden="true">
        <DieIcon />
      </span>
      <div className="roll-body">
        <span className="msg-label">{t('Roll for')}</span> <strong>{request.label}</strong>
        <span className="roll-detail">{detail}</span>
      </div>
      {onRoll && (
        <button type="button" className="primary" onClick={() => onRoll(request)}>
          {t('Roll {dice}', { dice })}
        </button>
      )}
    </div>
  );
}

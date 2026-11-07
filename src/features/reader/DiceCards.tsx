import type { DiceRoll, RollRequest } from '../../types';

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
  if (r.target !== undefined) out += ` · needs ${r.target}`;
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
    roll.target === undefined ? null : roll.total >= roll.target ? 'success' : 'failure';
  const outcomeText = outcome === 'success' ? 'Success' : outcome === 'failure' ? 'Failed' : '';
  return (
    <div
      className={['msg-roll', 'rolled', outcome, fresh && 'fresh'].filter(Boolean).join(' ')}
      role="group"
      aria-label={`Roll for ${roll.label}: ${roll.total}${outcomeText ? `, ${outcomeText}` : ''}`}
    >
      <span className="roll-die" aria-hidden="true">
        {roll.total}
      </span>
      <div className="roll-body">
        <span className="msg-label">{roll.asked ? 'You rolled for' : 'Roll for'}</span>{' '}
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
  const detail = [
    request.stat ? `${request.dice} + your ${request.stat}` : request.dice,
    request.target !== undefined && `needs ${request.target}`,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="msg-roll ask" role="group" aria-label={`Roll for ${request.label}`}>
      <span className="roll-die" aria-hidden="true">
        <DieIcon />
      </span>
      <div className="roll-body">
        <span className="msg-label">Roll for</span> <strong>{request.label}</strong>
        <span className="roll-detail">{detail}</span>
      </div>
      {onRoll && (
        <button type="button" className="primary" onClick={() => onRoll(request)}>
          Roll {request.dice}
        </button>
      )}
    </div>
  );
}

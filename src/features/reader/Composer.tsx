import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  Cloud,
  Dices,
  Drama,
  Lightbulb,
  Phone,
  Send,
  Smartphone,
  type LucideIcon,
} from 'lucide-react';
import { isComposing } from '../../app/keyboard';
import type { DiceRules, RollRequest, Stat } from '../../types';
import { isDice, rollFromComposer, wrapAction, type ComposeMode } from './messages';
import { msg, t } from '../../i18n';

/** The longest action the app accepts. */
const MAX_ACTION = 20_000;

type Props = {
  value: string;
  onChange: (text: string) => void;
  /**
   * Sends `text`: the box's value, or it wrapped as a text, call or
   * thought. A roll comes with what it is for; the app rolls it.
   */
  onSubmit: (text: string, roll?: RollRequest) => void;
  disabled: boolean;
  placeholder: string;
  /** Who you can text or call: the other characters' names. */
  contacts?: string[];
  playerName?: string;
  /** Offer "Roll dice" (stories with dice on), with the player's stats. */
  dice?: boolean;
  stats?: Stat[];
  /** The story's dice settings: its own dice, and whether stats count. */
  diceRules?: DiceRules;
  /** Buttons shown at the end of the row of kinds (the reader's toolbar). */
  tools?: ReactNode;
  /**
   * The storyteller's ideas for what to do next. Shown above the box while
   * it is empty; picking one puts it in the box to send or change.
   */
  ideas?: string[];
};

type Mode = ComposeMode | 'roll';

const MODES: { value: Mode; label: string; icon: LucideIcon }[] = [
  { value: 'act', label: msg('Do or say'), icon: Drama },
  { value: 'text', label: msg('Send a text'), icon: Smartphone },
  { value: 'call', label: msg('Call'), icon: Phone },
  { value: 'think', label: msg('Think'), icon: Cloud },
  { value: 'roll', label: msg('Roll dice'), icon: Dices },
];

const PLACEHOLDERS: Record<Exclude<Mode, 'act'>, string> = {
  text: msg('Your message (Enter to send)'),
  call: msg('What you say when they pick up, or leave empty to just call'),
  think: msg('What goes through your head (Enter to send)'),
  roll: msg('What you try, for example: climb the wall (optional)'),
};

const DICE = ['1d20', '1d6', '2d6', '1d100', '1d4', '1d8', '1d10', '1d12', '0-100'];

/**
 * Free-text action box. Enter sends, Shift+Enter adds a new line, and Enter
 * that confirms an IME composition never sends. The row of kinds above it
 * turns the action into a text message, a phone call, a thought or a dice
 * roll.
 */
export function Composer({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder,
  contacts = [],
  playerName = t('You'),
  dice = false,
  stats = [],
  diceRules = {},
  tools,
  ideas = [],
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const [chosen, setMode] = useState<Mode>('act');
  const [to, setTo] = useState('');
  const [roll, setRoll] = useState({ dice: diceRules.dice ?? '1d20', stat: '', target: '' });
  const mode = chosen === 'roll' && !dice ? 'act' : chosen;
  const needsTo = mode === 'text' || mode === 'call';
  const ready =
    !disabled &&
    (mode === 'roll'
      ? isDice(roll.dice)
      : (!needsTo || to.trim() !== '') && (mode === 'call' || value.trim() !== ''));

  const submit = () => {
    if (!ready) return;
    if (mode === 'roll') {
      const r = rollFromComposer(value, roll);
      onSubmit(r.text, r.roll);
      return;
    }
    onSubmit(wrapAction(mode, value, { to, player: playerName }));
  };
  const pickIdea = (idea: string) => {
    onChange(idea);
    // After React puts the words in, so the caret lands at their end.
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  };
  const showIdeas = !disabled && mode === 'act' && !value.trim() && ideas.length > 0;
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing(e)) {
      e.preventDefault();
      submit();
    }
  };
  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {showIdeas && (
        <div className="next-moves" role="group" aria-label={t('Ideas for what to do next')}>
          <Lightbulb className="next-moves-icon" aria-hidden={true} size={15} />
          {ideas.map((idea) => (
            <button
              key={idea}
              type="button"
              className="next-move"
              title={t('Put this in the box, to send or change')}
              onClick={() => pickIdea(idea)}
            >
              {idea}
            </button>
          ))}
        </div>
      )}
      <div className="composer-mode">
        <fieldset className="mode-pills">
          <legend className="visually-hidden">{t('Kind of action')}</legend>
          {MODES.filter((m) => dice || m.value !== 'roll').map((m) => (
            <label key={m.value} className="mode-pill">
              <input
                type="radio"
                name={`${id}-mode`}
                value={m.value}
                checked={mode === m.value}
                onChange={() => setMode(m.value)}
              />
              <m.icon className="mode-icon" aria-hidden={true} size={15} />
              <span>{t(m.label)}</span>
            </label>
          ))}
        </fieldset>
        {needsTo && (
          <>
            <label htmlFor={`${id}-to`}>{mode === 'text' ? t('To') : t('Who')}</label>
            <input
              id={`${id}-to`}
              value={to}
              list={`${id}-contacts`}
              maxLength={80}
              placeholder={t('Name')}
              onChange={(e) => setTo(e.target.value)}
            />
            <datalist id={`${id}-contacts`}>
              {contacts.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </>
        )}
        {mode === 'roll' && (
          <>
            <label htmlFor={`${id}-dice`}>{t('Dice')}</label>
            <input
              id={`${id}-dice`}
              className="roll-dice-input"
              value={roll.dice}
              list={`${id}-dice-list`}
              maxLength={24}
              aria-invalid={!isDice(roll.dice)}
              title={t('Dice such as 1d20 or 2d6+1, or a range such as 40-100')}
              onChange={(e) => setRoll({ ...roll, dice: e.target.value })}
            />
            <datalist id={`${id}-dice-list`}>
              {DICE.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
            {!diceRules.noStats && stats.some((s) => s.name.trim()) && (
              <>
                <label htmlFor={`${id}-stat`}>{t('With')}</label>
                <select
                  id={`${id}-stat`}
                  value={roll.stat}
                  onChange={(e) => setRoll({ ...roll, stat: e.target.value })}
                >
                  <option value="">{t('No stat')}</option>
                  {stats
                    .filter((s) => s.name.trim())
                    .map((s) => (
                      <option key={s.name} value={s.name.trim()}>
                        {s.name.trim()} ({s.value >= 0 ? '+' : ''}
                        {s.value})
                      </option>
                    ))}
                </select>
              </>
            )}
            <label htmlFor={`${id}-target`}>{t('Need')}</label>
            <input
              id={`${id}-target`}
              className="roll-target-input"
              type="number"
              inputMode="numeric"
              value={roll.target}
              placeholder={t('Any')}
              onChange={(e) => setRoll({ ...roll, target: e.target.value })}
            />
          </>
        )}
        {tools && <div className="composer-tools">{tools}</div>}
      </div>
      <label htmlFor="composer-input" className="visually-hidden">
        {t('What do you do?')}
      </label>
      <textarea
        id="composer-input"
        ref={ref}
        value={value}
        rows={2}
        maxLength={MAX_ACTION}
        placeholder={mode === 'act' ? placeholder : t(PLACEHOLDERS[mode])}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        aria-describedby={disabled ? 'composer-busy' : undefined}
      />
      {disabled && (
        <span id="composer-busy" className="visually-hidden">
          {t('Sending is paused until the current reply finishes.')}
        </span>
      )}
      <button type="submit" className="primary" disabled={!ready}>
        {mode === 'call' ? (
          <Phone className="btn-icon" aria-hidden={true} />
        ) : mode === 'roll' ? (
          <Dices className="btn-icon" aria-hidden={true} />
        ) : (
          <Send className="btn-icon" aria-hidden={true} />
        )}
        {mode === 'call' ? t('Call') : mode === 'roll' ? t('Roll') : t('Send')}
      </button>
    </form>
  );
}

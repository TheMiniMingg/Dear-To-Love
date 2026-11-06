import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { isComposing } from '../../app/keyboard';
import { wrapAction, type ComposeMode } from './messages';

/** The longest action the app accepts. */
const MAX_ACTION = 20_000;

type Props = {
  value: string;
  onChange: (text: string) => void;
  /** Sends `text`: the box's value, or it wrapped as a text, call or thought. */
  onSubmit: (text: string) => void;
  disabled: boolean;
  placeholder: string;
  /** Who you can text or call: the other characters' names. */
  contacts?: string[];
  playerName?: string;
};

const MODES: { value: ComposeMode; label: string }[] = [
  { value: 'act', label: 'Do or say' },
  { value: 'text', label: 'Send a text' },
  { value: 'call', label: 'Call' },
  { value: 'think', label: 'Think' },
];

const PLACEHOLDERS: Record<Exclude<ComposeMode, 'act'>, string> = {
  text: 'Your message (Enter to send)',
  call: 'What you say when they pick up, or leave empty to just call',
  think: 'What goes through your head (Enter to send)',
};

/**
 * Free-text action box. Enter sends, Shift+Enter adds a new line, and Enter
 * that confirms an IME composition never sends. The mode menu turns the
 * action into a text message, a phone call or a thought.
 */
export function Composer({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder,
  contacts = [],
  playerName = 'You',
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const [mode, setMode] = useState<ComposeMode>('act');
  const [to, setTo] = useState('');
  const needsTo = mode === 'text' || mode === 'call';
  const ready =
    !disabled && (!needsTo || to.trim() !== '') && (mode === 'call' || value.trim() !== '');

  const submit = () => {
    if (!ready) return;
    onSubmit(wrapAction(mode, value, { to, player: playerName }));
  };
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
      <div className="composer-mode">
        <label htmlFor={`${id}-mode`} className="visually-hidden">
          Kind of action
        </label>
        <select
          id={`${id}-mode`}
          value={mode}
          onChange={(e) => setMode(e.target.value as ComposeMode)}
        >
          {MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        {needsTo && (
          <>
            <label htmlFor={`${id}-to`}>{mode === 'text' ? 'To' : 'Who'}</label>
            <input
              id={`${id}-to`}
              value={to}
              list={`${id}-contacts`}
              maxLength={80}
              placeholder="Name"
              onChange={(e) => setTo(e.target.value)}
            />
            <datalist id={`${id}-contacts`}>
              {contacts.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </>
        )}
      </div>
      <label htmlFor="composer-input" className="visually-hidden">
        What do you do?
      </label>
      <textarea
        id="composer-input"
        ref={ref}
        value={value}
        rows={2}
        maxLength={MAX_ACTION}
        placeholder={mode === 'act' ? placeholder : PLACEHOLDERS[mode]}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        aria-describedby={disabled ? 'composer-busy' : undefined}
      />
      {disabled && (
        <span id="composer-busy" className="visually-hidden">
          Sending is paused until the current reply finishes.
        </span>
      )}
      <button type="submit" className="primary" disabled={!ready}>
        {mode === 'call' ? 'Call' : 'Send'}
      </button>
    </form>
  );
}

import { useRef, type KeyboardEvent } from 'react';
import { isComposing } from '../../app/keyboard';

/** The longest action the app accepts. */
const MAX_ACTION = 20_000;

type Props = {
  value: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  placeholder: string;
};

/**
 * Free-text action box. Enter sends, Shift+Enter adds a new line, and Enter
 * that confirms an IME composition never sends.
 */
export function Composer({ value, onChange, onSubmit, disabled, placeholder }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing(e)) {
      e.preventDefault();
      if (!disabled && value.trim()) onSubmit();
    }
  };
  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled && value.trim()) onSubmit();
      }}
    >
      <label htmlFor="composer-input" className="visually-hidden">
        What do you do?
      </label>
      <textarea
        id="composer-input"
        ref={ref}
        value={value}
        rows={2}
        maxLength={MAX_ACTION}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        aria-describedby={disabled ? 'composer-busy' : undefined}
      />
      {disabled && (
        <span id="composer-busy" className="visually-hidden">
          Sending is paused until the current reply finishes.
        </span>
      )}
      <button type="submit" className="primary" disabled={disabled || !value.trim()}>
        Send
      </button>
    </form>
  );
}

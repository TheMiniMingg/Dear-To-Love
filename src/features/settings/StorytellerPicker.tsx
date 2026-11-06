import { useId } from 'react';
import type { ProviderProfile, StorytellerChoice } from '../../types';

/** Short description of one connection: "story-model · paid API". */
export function connectionDetail(c: ProviderProfile): string {
  return `${c.modelId} · ${c.billing === 'local' ? 'local, no API charges' : 'paid API'}`;
}

const key = (c: StorytellerChoice | null): string =>
  c === null ? 'app' : c.kind === 'offline' ? 'offline' : `connection:${c.id}`;

/**
 * Who writes one story's replies: the app's storyteller (Settings), the
 * offline storyteller, or one saved connection. A connection that was
 * removed is shown as such until another choice is made.
 */
export function StorytellerPicker({
  value,
  onChange,
  connections,
  appLabel,
  legend = 'Who writes the replies',
  disabled = false,
}: {
  value: StorytellerChoice | null;
  onChange: (c: StorytellerChoice | null) => void;
  connections: ProviderProfile[];
  /** The app's storyteller right now, e.g. "Offline storyteller". */
  appLabel: string;
  legend?: string;
  disabled?: boolean;
}) {
  const name = useId();
  const current = key(value);
  const missing = value?.kind === 'connection' && !connections.some((c) => c.id === value.id);
  const option = (choice: StorytellerChoice | null, title: string, detail: string) => (
    <label className="choice" key={key(choice)}>
      <input
        type="radio"
        name={name}
        checked={current === key(choice)}
        disabled={disabled}
        onChange={() => onChange(choice)}
      />
      <span>
        <strong>{title}</strong>
        <span className="muted small">{detail}</span>
      </span>
    </label>
  );
  return (
    <fieldset className="choice-list storyteller-picker">
      <legend>{legend}</legend>
      {option(null, 'Same as the app', `Whatever Settings uses; now ${appLabel}.`)}
      {option(
        { kind: 'offline' },
        'Offline storyteller',
        'Built in. Simple replies, works without internet, never costs anything.',
      )}
      {connections.map((c) =>
        option({ kind: 'connection', id: c.id }, c.label, connectionDetail(c)),
      )}
      {missing && (
        <p className="muted small" role="status">
          The connection this story used was removed. Pick another one.
        </p>
      )}
    </fieldset>
  );
}

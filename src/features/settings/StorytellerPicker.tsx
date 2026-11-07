import { useId } from 'react';
import type { ProviderProfile, StorytellerChoice } from '../../types';
import { storyConnections } from './kinds';
import { t, tKnown } from '../../i18n';

/** Short description of one connection: "story-model · paid API". */
export function connectionDetail(c: ProviderProfile): string {
  return `${c.modelId} · ${c.billing === 'local' ? t('local, no API charges') : t('paid API')}`;
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
  legend,
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
  // Picture connections never write replies.
  const writers = storyConnections(connections);
  const missing = value?.kind === 'connection' && !writers.some((c) => c.id === value.id);
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
      <legend>{legend ?? t('Who writes the replies')}</legend>
      {option(
        null,
        t('Same as the app'),
        t('Whatever Settings uses; now {name}.', { name: tKnown(appLabel) }),
      )}
      {option(
        { kind: 'offline' },
        t('Offline storyteller'),
        t('Built in. Simple replies in English, works without internet, never costs anything.'),
      )}
      {writers.map((c) => option({ kind: 'connection', id: c.id }, c.label, connectionDetail(c)))}
      {missing && (
        <p className="muted small" role="status">
          {t('The connection this story used was removed. Pick another one.')}
        </p>
      )}
    </fieldset>
  );
}

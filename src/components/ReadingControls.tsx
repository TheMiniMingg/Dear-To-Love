import { useId } from 'react';
import {
  LINE_SPACINGS,
  READING_FONTS,
  READING_WIDTHS,
  readingStyle,
  useLook,
  type LineSpacing,
  type ReadingFont,
  type ReadingWidth,
  type ThemeId,
} from '../app/look';
import { TEXT_SIZES, useUiStore } from '../app/store';
import { msg, t } from '../i18n';

const SIZE_LABELS: Record<number, string> = {
  0.9: msg('Small'),
  1: msg('Normal'),
  1.15: msg('Large'),
  1.3: msg('Larger'),
  1.5: msg('Largest'),
};

/** A row of choices where one is picked, like Short / Normal / Long. */
function Choices<T extends string | number>({
  legend,
  hint,
  value,
  options,
  onChange,
}: {
  legend: string;
  hint?: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const id = useId();
  return (
    <div className="field reading-choice">
      <span id={`${id}-legend`} className="field-label">
        {legend}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={`${id}-legend`}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="segmented"
      >
        {options.map((o) => (
          <label key={String(o.id)}>
            <input
              type="radio"
              name={`${id}-choice`}
              checked={o.id === value}
              onChange={() => onChange(o.id)}
            />
            <span>{t(o.label)}</span>
          </label>
        ))}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="muted small">
          {hint}
        </p>
      )}
    </div>
  );
}

/** Text size, column width and line spacing of every story, on this computer. */
export function ReadingControls() {
  const textSize = useUiStore((s) => s.textSize);
  const setTextSize = useUiStore((s) => s.setTextSize);
  const width = useLook((s) => s.width);
  const spacing = useLook((s) => s.spacing);
  const font = useLook((s) => s.font);
  const update = useLook((s) => s.update);
  return (
    <div className="reading-controls">
      <Choices
        legend={t('Text size')}
        value={textSize}
        options={TEXT_SIZES.map((size) => ({ id: size as number, label: SIZE_LABELS[size] ?? '' }))}
        onChange={setTextSize}
      />
      <Choices<ReadingWidth>
        legend={t('Column width')}
        value={width}
        options={READING_WIDTHS}
        onChange={(w) => update({ width: w })}
      />
      <Choices<LineSpacing>
        legend={t('Line spacing')}
        value={spacing}
        options={LINE_SPACINGS}
        onChange={(s) => update({ spacing: s })}
      />
      <Choices<ReadingFont>
        legend={t('Story typeface')}
        hint={t(
          'Book is Literata, Plain is the interface’s Inter, and Easy to read is Atkinson Hyperlegible, a face made for low vision and dyslexia. Theme’s choice lets a look such as Terminal pick its own.',
        )}
        value={font}
        options={READING_FONTS}
        onChange={(f) => update({ font: f })}
      />
    </div>
  );
}

/**
 * A few lines set the way stories will be, in `theme`: the reading font,
 * the text size, width and line spacing chosen above.
 */
export function ReadingSample({ theme }: { theme: ThemeId }) {
  const textSize = useUiStore((s) => s.textSize);
  const width = useLook((s) => s.width);
  const spacing = useLook((s) => s.spacing);
  const font = useLook((s) => s.font);
  return (
    <figure
      className="reading-sample"
      aria-label={t('Sample of how stories look')}
      data-theme-preview={theme}
      style={{ fontSize: `${textSize}rem`, ...readingStyle({ width, spacing, font }) }}
    >
      <div className="narrative-column reading-sample-column" aria-hidden="true">
        <p className="chapter-number">{t('Chapter {n}', { n: 1 })}</p>
        <p className="reading-sample-text">
          {t(
            'The bell over the door rings. Mina looks up from the espresso machine, and for a moment she forgets the cup in her hand.',
          )}
        </p>
        <p>
          <strong className="speaker-name">{t('Mina:')}</strong>{' '}
          {t('“You came back. I was starting to think the scone scared you off.”')}
        </p>
      </div>
    </figure>
  );
}

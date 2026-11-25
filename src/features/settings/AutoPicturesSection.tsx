/**
 * Settings -> Pictures -> Pictures as the story goes: whether the reader
 * finds or makes pictures for people, places and items as a story brings
 * them in, asking first or on its own, and the limits that keep it from
 * making too many.
 */
import { useId, useState } from 'react';
import { msg, t } from '../../i18n';
import type { PortraitStyle } from '../../types';
import { PICTURE_STYLES } from '../images/MakePortrait';
import {
  loadLog,
  useAutoPictureSettings,
  type AutoMode,
  type AutoPictureSettings,
} from '../reader/autoPictures';

const MODES: { value: AutoMode; label: string; hint: string }[] = [
  {
    value: 'off',
    label: msg('Off'),
    hint: msg('Pictures change only when you choose them.'),
  },
  {
    value: 'ask',
    label: msg('Ask me first'),
    hint: msg('A card under the reply offers each picture; nothing is made until you say so.'),
  },
  {
    value: 'auto',
    label: msg('Make them on their own'),
    hint: msg('Pictures are made and put in place as the story goes, within the limits below.'),
  },
];

const PER_STORY = [3, 5, 8, 12, 20, 50, 0];
const PER_DAY = [5, 10, 20, 50, 0];
const GAPS = [1, 2, 3, 5, 10];

function limitLabel(n: number): string {
  return n === 0 ? t('No limit') : String(n);
}

function gapLabel(n: number): string {
  return n === 1 ? t('Any reply') : t('Every {count} replies', { count: n });
}

export function AutoPicturesSection({ hasPainter }: { hasPainter: boolean }) {
  const id = useId();
  const settings = useAutoPictureSettings((s) => s.settings);
  const change = useAutoPictureSettings((s) => s.change);
  const [madeToday] = useState(() => loadLog().today);
  const on = settings.mode !== 'off';
  const check = (key: keyof AutoPictureSettings, label: string, hint?: string) => (
    <label className="check">
      <input
        type="checkbox"
        checked={settings[key] as boolean}
        disabled={!on}
        onChange={(e) => change({ [key]: e.target.checked })}
      />
      <span>
        {label}
        {hint && <span className="muted small"> {hint}</span>}
      </span>
    </label>
  );
  const select = (
    key: 'perStory' | 'perDay' | 'gap',
    label: string,
    values: number[],
    show: (n: number) => string,
  ) => (
    <label className="field">
      <span className="field-label">{label}</span>
      <select
        value={settings[key]}
        disabled={!on}
        onChange={(e) => change({ [key]: Number(e.target.value) })}
      >
        {values.map((n) => (
          <option key={n} value={n}>
            {show(n)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="auto-pictures" role="group" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="small-heading">
        {t('Pictures as the story goes')}
      </h3>
      <p className="muted small">
        {t(
          'When a reply brings in someone with no portrait, moves the story to a new place, or gives you an item, the story can show a picture of it with that reply. A matching picture from your images is used first; otherwise the picture connection makes one.',
        )}
      </p>
      {!hasPainter && (
        <p className="muted small">
          {t('With no picture connection chosen, only pictures already in your images are used.')}
        </p>
      )}
      <div role="radiogroup" aria-labelledby={`${id}-title`} className="choice-list">
        {MODES.map((m) => (
          <label key={m.value} className="choice">
            <input
              type="radio"
              name={`${id}-mode`}
              checked={settings.mode === m.value}
              onChange={() => change({ mode: m.value })}
            />
            <span>
              <strong>{t(m.label)}</strong>
              <span className="muted small">{t(m.hint)}</span>
            </span>
          </label>
        ))}
      </div>
      <fieldset className="auto-pictures-what" disabled={!on}>
        <legend className="field-label">{t('Pictures of')}</legend>
        {check('people', t('People in the scene with no portrait'))}
        {check('places', t('Places the story moves to'))}
        {check('items', t('Items you are given'))}
      </fieldset>
      <div className="field-row">
        {select('perStory', t('At most per story'), PER_STORY, limitLabel)}
        {select('perDay', t('At most per day'), PER_DAY, limitLabel)}
        {select('gap', t('How often'), GAPS, gapLabel)}
        <label className="field">
          <span className="field-label">{t('Style')}</span>
          <select
            value={settings.style}
            disabled={!on}
            onChange={(e) => change({ style: e.target.value as PortraitStyle })}
          >
            {PICTURE_STYLES.map((s) => (
              <option key={s.value} value={s.value}>
                {t(s.label)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted small">
        {t(
          'Only made pictures count toward the limits; pictures found in your images are free. Each person, place or item is offered once per story.',
        )}{' '}
        {t('Made today: {count}', { count: madeToday })}
      </p>
      {check('reuse', t('Use a matching picture from your images first'))}
      {check(
        'share',
        t('Keep made pictures for every story'),
        t(
          'So other stories can use them again. Off: each stays with the story it was made for, and can be shared later in Images.',
        ),
      )}
    </div>
  );
}

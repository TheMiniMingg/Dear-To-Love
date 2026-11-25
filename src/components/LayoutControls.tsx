import { useId } from 'react';
import {
  CORNERS,
  LAYOUT_PRESETS,
  matchingPreset,
  PICTURE_PLACES,
  STORY_FRAMES,
  useScreenLayout,
  type Corners,
  type PicturePlace,
  type ScreenLayout,
  type StoryFrame,
} from '../app/screenLayout';
import { usePictureView } from '../features/reader/stage';
import { Choices } from './ReadingControls';
import { msg, t } from '../i18n';

/** A tiny drawing of a layout: where the picture and the text go. */
export function LayoutSketch({ layout, pictures }: { layout: ScreenLayout; pictures: boolean }) {
  return (
    <span
      className="layout-sketch"
      data-picture={pictures ? layout.picture : 'none'}
      data-frame={layout.frame}
      data-corners={layout.corners}
      aria-hidden="true"
    >
      {pictures && (
        <span className="sketch-pic">
          <span className="sketch-person" />
        </span>
      )}
      <span className="sketch-text">
        <span className="sketch-line" />
        <span className="sketch-line" />
        <span className="sketch-line short" />
      </span>
    </span>
  );
}

/**
 * The screen layout of every story: ready-made presets after kinds of games,
 * and the parts to mix your own. Shown in Look while reading and in Settings.
 */
export function LayoutControls() {
  const name = useId();
  const picture = useScreenLayout((s) => s.picture);
  const frame = useScreenLayout((s) => s.frame);
  const corners = useScreenLayout((s) => s.corners);
  const sizes = useScreenLayout((s) => s.sizes);
  const update = useScreenLayout((s) => s.update);
  const setSize = useScreenLayout((s) => s.setSize);
  const shown = usePictureView((s) => s.shown);
  const setShown = usePictureView((s) => s.setShown);
  const current = matchingPreset({ picture, frame, corners }, shown);
  const resized = sizes.top !== null || sizes.side !== null || sizes.box !== null;
  return (
    <div className="layout-controls">
      <fieldset className="theme-picker layout-picker">
        <legend>{t('Screen layout')}</legend>
        <div className="theme-options layout-options">
          {LAYOUT_PRESETS.map((p) => (
            <label key={p.id} className="theme-option layout-option">
              <input
                type="radio"
                name={name}
                value={p.id}
                checked={current === p.id}
                onChange={() => {
                  update(p.layout);
                  setShown(p.pictures);
                }}
              />
              <LayoutSketch layout={p.layout} pictures={p.pictures} />
              <span className="theme-name">{t(p.label)}</span>
              <span className="theme-hint">{t(p.hint)}</span>
            </label>
          ))}
        </div>
        {current === null && (
          <p className="muted small layout-custom" data-testid="layout-custom">
            {t('Your own mix. Pick a layout above to start again from it.')}
          </p>
        )}
      </fieldset>
      <div className="reading-controls layout-parts">
        <Choices<'on' | 'off'>
          legend={t('Scene pictures')}
          value={shown ? 'on' : 'off'}
          options={[
            { id: 'on', label: msg('Shown') },
            { id: 'off', label: msg('Text only') },
          ]}
          onChange={(v) => setShown(v === 'on')}
        />
        <Choices<PicturePlace>
          legend={t('Picture place')}
          value={picture}
          options={PICTURE_PLACES}
          onChange={(v) => update({ picture: v })}
        />
        <Choices<StoryFrame>
          legend={t('Story frame')}
          value={frame}
          options={STORY_FRAMES}
          onChange={(v) => update({ frame: v })}
        />
        <Choices<Corners>
          legend={t('Corners')}
          value={corners}
          options={CORNERS}
          onChange={(v) => update({ corners: v })}
        />
      </div>
      <p className="muted small">
        {t(
          'Drag the bar between the picture and the story to resize the picture, or drag it closed for text only.',
        )}{' '}
        {resized && (
          <button
            type="button"
            className="link-button"
            onClick={() => setSize({ top: null, side: null, box: null }, true)}
          >
            {t('Usual picture size')}
          </button>
        )}
      </p>
    </div>
  );
}

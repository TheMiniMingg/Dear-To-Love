import { usePictureView } from './stage';
import { t } from '../../i18n';

function PictureIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="rail-icon">
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4.5 17.5l5-5 3.5 3.5 2.5-2.5 4 4" />
    </svg>
  );
}

/**
 * Buttons along the side of the story for things changed while reading,
 * so they don't need the menu: for now, pictures or text only.
 */
export function ReaderRail() {
  const pictures = usePictureView((s) => s.shown);
  const setPictures = usePictureView((s) => s.setShown);
  return (
    <div
      className="reader-rail"
      role="toolbar"
      aria-orientation="vertical"
      aria-label={t('Reading options')}
    >
      <button
        type="button"
        className="rail-button"
        aria-pressed={pictures}
        onClick={() => setPictures(!pictures)}
        title={
          pictures
            ? t('Pictures are shown above the story. Click for text only.')
            : t('Text only. Click to show pictures above the story.')
        }
      >
        <PictureIcon />
        <span className="rail-label">{t('Picture view')}</span>
      </button>
    </div>
  );
}

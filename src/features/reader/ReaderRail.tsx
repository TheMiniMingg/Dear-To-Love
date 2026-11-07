import { usePictureView } from './stage';
import { useUiStore } from '../../app/store';
import { ariaKeys, useShortcutHelp, withKeys } from '../../app/shortcuts';
import { t } from '../../i18n';

function BooksIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="rail-icon">
      <rect x="4" y="4.5" width="4" height="15" rx="1" />
      <rect x="9.5" y="4.5" width="4" height="15" rx="1" />
      <path d="M15.4 6.2l3.6-1 3 13.6-3.6 1z" />
    </svg>
  );
}

function PictureIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="rail-icon">
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4.5 17.5l5-5 3.5 3.5 2.5-2.5 4 4" />
    </svg>
  );
}

function KeyboardIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="rail-icon">
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6 10h1M9.5 10h1M13 10h1M16.5 10h1M6 13.5h1M17 13.5h1M9.5 13.5h5" />
    </svg>
  );
}

/**
 * Buttons along the side of the story for things changed while reading,
 * so they don't need the menu: back to your other stories, pictures or
 * text only, and the list of keyboard shortcuts.
 */
export function ReaderRail() {
  const pictures = usePictureView((s) => s.shown);
  const setPictures = usePictureView((s) => s.setShown);
  const setHelp = useShortcutHelp((s) => s.setOpen);
  const navigate = useUiStore((s) => s.navigate);
  return (
    <div className="reader-rail" role="group" aria-label={t('Reading options')}>
      <button
        type="button"
        className="rail-button"
        onClick={() => navigate({ name: 'library' })}
        title={t('Back to your stories. A reply being written here keeps going.')}
      >
        <BooksIcon />
        <span className="rail-label">{t('Stories')}</span>
      </button>
      <button
        type="button"
        className="rail-button"
        aria-pressed={pictures}
        onClick={() => setPictures(!pictures)}
        title={withKeys(
          pictures
            ? t('Pictures are shown above the story. Click for text only.')
            : t('Text only. Click to show pictures above the story.'),
          'pictures',
        )}
        aria-keyshortcuts={ariaKeys('pictures')}
      >
        <PictureIcon />
        <span className="rail-label">{t('Picture view')}</span>
      </button>
      <button
        type="button"
        className="rail-button"
        onClick={() => setHelp(true)}
        title={withKeys(t('Keyboard shortcuts'), 'help')}
        aria-keyshortcuts={ariaKeys('help')}
      >
        <KeyboardIcon />
        <span className="rail-label">{t('Shortcuts')}</span>
      </button>
    </div>
  );
}

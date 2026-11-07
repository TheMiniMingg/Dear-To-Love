import { useState } from 'react';
import { Image, Keyboard, LibraryBig, Palette } from 'lucide-react';
import { usePictureView } from './stage';
import { useUiStore } from '../../app/store';
import { ariaKeys, useShortcutHelp, withKeys } from '../../app/shortcuts';
import { defaultStoryTheme, themeForGenres, THEMES, useLook } from '../../app/look';
import { Dialog } from '../../components/Dialog';
import { ThemePicker } from '../../components/ThemePicker';
import { t } from '../../i18n';

const ICON = { className: 'rail-icon', 'aria-hidden': true, strokeWidth: 1.75 } as const;

/**
 * Buttons along the side of the story for things changed while reading,
 * so they don't need the menu: back to your other stories, pictures or
 * text only, this story's look, and the list of keyboard shortcuts.
 */
export function ReaderRail({ storyId, genres }: { storyId: string; genres?: string[] }) {
  const pictures = usePictureView((s) => s.shown);
  const setPictures = usePictureView((s) => s.setShown);
  const setHelp = useShortcutHelp((s) => s.setOpen);
  const navigate = useUiStore((s) => s.navigate);
  const [look, setLook] = useState(false);
  return (
    <div className="reader-rail" role="group" aria-label={t('Reading options')}>
      <button
        type="button"
        className="rail-button"
        onClick={() => navigate({ name: 'library' })}
        title={t('Back to your stories. A reply being written here keeps going.')}
      >
        <LibraryBig {...ICON} />
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
        <Image {...ICON} />
        <span className="rail-label">{t('Picture view')}</span>
      </button>
      <button
        type="button"
        className="rail-button"
        onClick={() => setLook(true)}
        title={t('Choose the colors this story is read in')}
      >
        <Palette {...ICON} />
        <span className="rail-label">{t('Look')}</span>
      </button>
      <button
        type="button"
        className="rail-button"
        onClick={() => setHelp(true)}
        title={withKeys(t('Keyboard shortcuts'), 'help')}
        aria-keyshortcuts={ariaKeys('help')}
      >
        <Keyboard {...ICON} />
        <span className="rail-label">{t('Shortcuts')}</span>
      </button>
      {look && (
        <StoryLookDialog storyId={storyId} genres={genres ?? []} onClose={() => setLook(false)} />
      )}
    </div>
  );
}

/** Choose the theme one story is read in; it shows at once behind the dialog. */
export function StoryLookDialog({
  storyId,
  genres,
  onClose,
}: {
  storyId: string;
  genres: string[];
  onClose: () => void;
}) {
  const own = useLook((s) => s.stories[storyId]);
  const appTheme = useLook((s) => s.theme);
  const fitGenre = useLook((s) => s.fitGenre);
  const setStoryLook = useLook((s) => s.setStoryLook);
  const fallback = defaultStoryTheme({ theme: appTheme, fitGenre }, genres);
  const name = (id: string) => t(THEMES.find((x) => x.id === id)?.label ?? id);
  const fits = fitGenre && themeForGenres(genres) !== null;
  return (
    <Dialog title={t('Look of this story')} onClose={onClose}>
      <ThemePicker
        legend={t('Colors')}
        value={own && own !== 'app' ? own : 'default'}
        options={[
          {
            id: 'default',
            theme: fallback,
            label: fits
              ? t('Fits the genre ({theme})', { theme: name(fallback) })
              : t('Same as the app ({theme})', { theme: name(fallback) }),
          },
          ...THEMES.map((x) => ({ id: x.id, theme: x.id, label: t(x.label) })),
        ]}
        onChange={(id) =>
          setStoryLook(storyId, id === 'default' ? null : (id as (typeof THEMES)[number]['id']))
        }
      />
      <p className="muted small">
        {t('Only on this computer. The app theme is in Settings, under Look.')}
      </p>
      <div className="button-row dialog-actions">
        <button type="button" className="primary" onClick={onClose}>
          {t('Done')}
        </button>
      </div>
    </Dialog>
  );
}

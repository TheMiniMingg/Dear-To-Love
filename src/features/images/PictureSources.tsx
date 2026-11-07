/**
 * The two places a picture added while choosing one can go, said plainly:
 * kept with this story only, or kept in the picture library where every
 * story can use it. Shared by the wizard, the reader's Pictures panel and
 * the cover dialog, with the two groups of pictures to pick from.
 */
import type { ReactNode } from 'react';
import { Images, Lock } from 'lucide-react';
import type { AssetDto } from '../../types';
import { t } from '../../i18n';
import { ImageGrid } from './ImageGrid';

const ICON = { 'aria-hidden': true, size: 16, strokeWidth: 1.9 } as const;

/** "Add for this story only" and "Add to your library (any story)", with what each means. */
export function AddPictureButtons({
  adding,
  onAddForStory,
  onAddToLibrary,
}: {
  adding: boolean;
  onAddForStory: () => void;
  onAddToLibrary: () => void;
}) {
  return (
    <div className="add-pictures">
      <p className="muted small">
        {t(
          'Add a picture from this computer. "This story only" keeps it for this story alone. "Your library" shares it with every story, so you can use it again anywhere.',
        )}
      </p>
      <div className="button-row">
        <button
          type="button"
          disabled={adding}
          onClick={onAddForStory}
          title={t('Only this story can use it')}
        >
          <Lock {...ICON} />
          {adding ? t('Adding…') : t('Add for this story only')}
        </button>
        <button
          type="button"
          disabled={adding}
          onClick={onAddToLibrary}
          title={t('Kept in Images; any story can use it')}
        >
          <Images {...ICON} />
          {t('Add to your library (any story)')}
        </button>
      </div>
    </div>
  );
}

/** The pictures to pick from: this story's own, then the library's. */
export function PictureGroups({
  own,
  shared,
  pick,
  onPick,
  empty,
  heading: Heading = 'h4',
}: {
  own: AssetDto[] | undefined;
  shared: AssetDto[] | undefined;
  pick: string | null;
  onPick: (a: AssetDto) => void;
  empty: ReactNode;
  heading?: 'h3' | 'h4';
}) {
  return (
    <>
      {own && shared && own.length + shared.length === 0 && <p className="muted">{empty}</p>}
      {own && own.length > 0 && (
        <section className="image-group" aria-label={t('This story only')}>
          <Heading className="small-heading">{t('This story only')}</Heading>
          <ImageGrid
            images={own}
            selectedId={pick}
            onSelect={onPick}
            label={t('This story only')}
          />
        </section>
      )}
      {shared && shared.length > 0 && (
        <section className="image-group" aria-label={t('Your library (any story)')}>
          <Heading className="small-heading">{t('Your library (any story)')}</Heading>
          <ImageGrid
            images={shared}
            selectedId={pick}
            onSelect={onPick}
            label={t('Your library (any story)')}
          />
        </section>
      )}
    </>
  );
}

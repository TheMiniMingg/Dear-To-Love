/**
 * The card under a reply for pictures as the story goes: an offer to make a
 * picture of someone or somewhere the reply brought in (when the player
 * chose to be asked first), the picture being made, and the pictures that
 * were made or found in the library, shown with the reply that brought
 * them in.
 */
import { ImagePlus } from 'lucide-react';
import type { ProviderProfile } from '../../types';
import { t } from '../../i18n';
import { Thumb } from '../images/ImageGrid';
import { wantLabel, type AutoPictureState, type Want } from './autoPictures';

function question(want: Want): string {
  switch (want.kind) {
    case 'portrait':
      return t('Make a portrait of {name}?', { name: want.name });
    case 'place':
      return t('Make a picture of {name}, where the story is now?', { name: want.name });
    case 'item':
      return t('Make a picture of {name}, which you carry?', { name: want.name });
  }
}

export function AutoPictureCard({
  state,
  painter,
  onAccept,
  onDecline,
  onOffForStory,
  onOpenPictures,
}: {
  state: AutoPictureState;
  painter: ProviderProfile | null | undefined;
  onAccept: () => void;
  onDecline: () => void;
  onOffForStory: () => void;
  /** Opens the story's pictures, to change one. */
  onOpenPictures?: () => void;
}) {
  const { offer, making, made, error } = state;
  if (!offer && !making && !made.length && !error) return null;
  return (
    <section className="newcomer auto-picture" aria-label={t('Pictures for this moment')}>
      <ImagePlus aria-hidden={true} size={18} className="newcomer-icon" />
      <div className="newcomer-body">
        <p className="newcomer-label">{t('Pictures for this moment')}</p>
        {made.length > 0 && (
          <ul className="auto-picture-made">
            {made.map((m) => (
              <li key={m.want.slot}>
                <figure>
                  <Thumb assetId={m.assetId} alt={m.label} />
                  <figcaption>
                    {m.label}
                    <span className="muted small">
                      {m.reused ? t('From your images') : t('New picture')}
                    </span>
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        )}
        {making && (
          <p className="muted" role="status">
            {t('Making {name}…', { name: wantLabel(making) })}
          </p>
        )}
        {error && (
          <p role="alert" className="error small">
            {error}
          </p>
        )}
        {offer && (
          <>
            <p className="newcomer-name">
              <strong>{question(offer)}</strong>
              {painter && (
                <span className="muted small">
                  {' '}
                  {painter.billing === 'local'
                    ? t('(with {name}, on this computer)', { name: painter.label })
                    : t('(with {name}, one paid picture)', { name: painter.label })}
                </span>
              )}
            </p>
            <div className="newcomer-actions">
              <button type="button" className="primary" onClick={onAccept}>
                {t('Make it')}
              </button>
              <button type="button" onClick={onDecline}>
                {t('Not this one')}
              </button>
              <button type="button" className="link-button" onClick={onOffForStory}>
                {t('No pictures in this story')}
              </button>
            </div>
          </>
        )}
        {!offer && !making && made.length > 0 && onOpenPictures && (
          <div className="newcomer-actions">
            <button type="button" className="link-button" onClick={onOpenPictures}>
              {t('Change in Pictures')}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

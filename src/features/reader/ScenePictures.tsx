import { Thumb } from '../images/ImageGrid';
import type { RouteView } from '../../types';
import { BACKGROUND, picture, portraitSlot } from './pictures';
import { t } from '../../i18n';

/** The current scene's background and the portraits of who is there. */
export function ScenePictures({ view }: { view: RouteView }) {
  const s = view.state.state;
  const bg = picture(view, BACKGROUND).assetId;
  const people = (s.scene?.participantIds ?? []).flatMap((cid) => {
    const c = s.characters?.[cid];
    const a = picture(view, portraitSlot(cid)).assetId;
    return c && a ? [{ c, a }] : [];
  });
  if (!bg && people.length === 0) return null;
  return (
    <div
      className={`scene-pictures${bg ? ' has-bg' : ''}`}
      role="group"
      aria-label={t('Scene pictures')}
      data-testid="scene-pictures"
    >
      {bg && (
        <Thumb
          assetId={bg}
          size="full"
          alt={
            s.scene?.location
              ? t('Scene: {place}', { place: s.scene.location })
              : t('Scene background')
          }
          className="scene-bg"
        />
      )}
      {people.length > 0 && (
        <ul className="scene-portraits">
          {people.map(({ c, a }) => (
            <li key={c.id}>
              <Thumb assetId={a} alt={t('Portrait of {name}', { name: c.name })} />
              <span>{c.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

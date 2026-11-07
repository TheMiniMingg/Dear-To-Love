import { useEffect, useId, useState } from 'react';
import { commands, errorMessage } from '../../api/commands';
import { useBackdrop, VEILS, type Veil } from '../../app/backdropStore';
import { Dialog } from '../../components/Dialog';
import type { AssetDto } from '../../types';
import { ImageGrid, Thumb } from '../images/ImageGrid';
import { ImportResult, useAddImages } from '../images/ImagesScreen';
import { t } from '../../i18n';

/** Settings: a picture from the library behind every screen. */
export function BackdropSection() {
  const id = useId();
  const assetId = useBackdrop((s) => s.assetId);
  const veil = useBackdrop((s) => s.veil);
  const update = useBackdrop((s) => s.update);
  const [choosing, setChoosing] = useState(false);
  return (
    <section className="settings-section" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{t('Background picture')}</h2>
      <p className="muted">
        {t(
          'A picture of your own behind every screen, softened so the text stays easy to read. It is a setting of this computer.',
        )}
      </p>
      <div className="backdrop-current">
        {assetId ? (
          <Thumb assetId={assetId} alt={t('The current background picture')} />
        ) : (
          <span className="muted">{t('No background picture.')}</span>
        )}
        <div className="button-row">
          <button type="button" onClick={() => setChoosing(true)}>
            {assetId ? t('Change picture…') : t('Choose a picture…')}
          </button>
          {assetId && (
            <button type="button" onClick={() => update({ assetId: null })}>
              {t('Remove')}
            </button>
          )}
        </div>
      </div>
      {assetId && (
        <div className="field backdrop-veil">
          <label htmlFor={`${id}-veil`}>{t('How much of the picture shows')}</label>
          <select
            id={`${id}-veil`}
            value={veil}
            onChange={(e) => update({ veil: e.target.value as Veil })}
          >
            {VEILS.map((v) => (
              <option key={v.id} value={v.id}>
                {t(v.label)}
              </option>
            ))}
          </select>
        </div>
      )}
      {choosing && (
        <BackdropChooser
          current={assetId}
          onChoose={(a) => {
            update({ assetId: a.id });
            setChoosing(false);
          }}
          onClose={() => setChoosing(false)}
        />
      )}
    </section>
  );
}

function BackdropChooser({
  current,
  onChoose,
  onClose,
}: {
  current: string | null;
  onChoose: (a: AssetDto) => void;
  onClose: () => void;
}) {
  const [images, setImages] = useState<AssetDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    commands
      .listImages()
      .then((all) => {
        if (live) setImages([...all.filter((a) => a.shared), ...all.filter((a) => !a.shared)]);
      })
      .catch((e: unknown) => {
        if (live) setError(errorMessage(e));
      });
    return () => {
      live = false;
    };
  }, []);
  // Added here, a picture is for all stories, like one added in Images.
  const { add, adding, result } = useAddImages((added) => {
    if (added[0]) onChoose(added[0]);
  });
  return (
    <Dialog title={t('Choose a background picture')} onClose={onClose} wide>
      <div className="panel">
        <p className="muted">
          {t('Pictures from your image library. A wide picture, such as a landscape, works best.')}
        </p>
        <div className="button-row">
          <button type="button" onClick={() => void add()} disabled={adding}>
            {adding ? t('Adding…') : t('Add a picture from this computer…')}
          </button>
        </div>
        <ImportResult result={result} />
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {images?.length === 0 && <p className="muted">{t('Your image library is empty.')}</p>}
        {images && images.length > 0 && (
          <ImageGrid
            images={images}
            selectedId={current}
            onSelect={onChoose}
            label={t('Pictures in your library')}
          />
        )}
      </div>
    </Dialog>
  );
}

import { useEffect, useState } from 'react';
import { commands, errorMessage } from '../../api/commands';
import { Dialog } from '../../components/Dialog';
import { ImageGrid } from '../images/ImageGrid';
import { ImportResult, useAddImages } from '../images/ImagesScreen';
import type { AssetDto, StorySummary } from '../../types';
import { t } from '../../i18n';

/**
 * Library -> a story's menu -> Change cover: pick the picture its card
 * shows from the story's own images or those for all stories, or add one.
 */
export function CoverDialog({
  story,
  onClose,
  onChanged,
}: {
  story: StorySummary;
  onClose: () => void;
  onChanged: (status: string) => void;
}) {
  const [images, setImages] = useState<AssetDto[] | null>(null);
  const [pick, setPick] = useState<string | null>(story.coverAssetId);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    commands
      .listImages()
      .then((list) => {
        if (live) setImages(list);
      })
      .catch((e: unknown) => {
        if (live) setError(errorMessage(e));
      });
    return () => {
      live = false;
    };
  }, [reload]);

  const { add, adding, result } = useAddImages((added) => {
    setReload((n) => n + 1);
    if (added[0]) setPick(added[0].id);
  });
  const own = images?.filter((a) => !a.shared && a.stories.some((s) => s.id === story.id));
  const shared = images?.filter((a) => a.shared);

  const apply = async (assetId: string | null) => {
    setBusy(true);
    setError(null);
    try {
      await commands.setStoryPicture(story.id, 'cover', assetId);
      onChanged(
        assetId
          ? t('New cover for {title}.', { title: story.title })
          : t('Cover removed from {title}.', { title: story.title }),
      );
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Dialog title={t('Cover for {title}', { title: story.title })} onClose={onClose} wide>
      <div className="picture-chooser">
        <div className="button-row">
          <button
            type="button"
            disabled={adding}
            onClick={() => void add({ storyId: story.id })}
            title={t('Only this story can use them')}
          >
            {adding ? t('Adding…') : t('Add for this story')}
          </button>
          <button
            type="button"
            disabled={adding}
            onClick={() => void add()}
            title={t('Every story can use them')}
          >
            {t('Add for all stories')}
          </button>
        </div>
        <ImportResult result={result} />
        {own && shared && own.length + shared.length === 0 && (
          <p className="muted">{t('No images yet. Add some from this computer first.')}</p>
        )}
        {own && own.length > 0 && (
          <section className="image-group" aria-label={t("This story's pictures")}>
            <h3 className="small-heading">{t("This story's pictures")}</h3>
            <ImageGrid
              images={own}
              selectedId={pick}
              onSelect={(a) => setPick(a.id)}
              label={t("This story's pictures")}
            />
          </section>
        )}
        {shared && shared.length > 0 && (
          <section className="image-group" aria-label={t('Pictures for all stories')}>
            <h3 className="small-heading">{t('For all stories')}</h3>
            <ImageGrid
              images={shared}
              selectedId={pick}
              onSelect={(a) => setPick(a.id)}
              label={t('Pictures for all stories')}
            />
          </section>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="button-row dialog-actions">
          {story.coverAssetId && (
            <button type="button" disabled={busy} onClick={() => void apply(null)}>
              {t('Remove cover')}
            </button>
          )}
          <button type="button" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button
            type="button"
            className="primary"
            disabled={!pick || pick === story.coverAssetId || busy}
            onClick={() => pick && void apply(pick)}
          >
            {t('Use this picture')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

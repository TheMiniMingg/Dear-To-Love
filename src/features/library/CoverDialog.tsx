import { AddPictureButtons, PictureGroups } from '../images/PictureSources';
import { useEffect, useState } from 'react';
import { commands, errorMessage } from '../../api/commands';
import { Dialog } from '../../components/Dialog';
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
        <AddPictureButtons
          adding={adding}
          onAddForStory={() => void add({ storyId: story.id })}
          onAddToLibrary={() => void add()}
        />
        <ImportResult result={result} />
        <PictureGroups
          own={own}
          shared={shared}
          pick={pick}
          onPick={(a) => setPick(a.id)}
          empty={t('No images yet. Add some from this computer first.')}
          heading="h3"
        />
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

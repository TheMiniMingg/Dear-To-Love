import { useState } from 'react';
import { Thumb } from '../images/ImageGrid';
import type { EventDto, RouteView } from '../../types';
import { picture, placeSlot, portraitSlot, sceneBackground } from './pictures';
import { replyTexts, stageCast, stageGroup, trimGroup, usePictureView } from './stage';
import { t } from '../../i18n';

/**
 * The stage above the story (visual-novel style): the scene's background with
 * the portraits of the characters the story is with, side by side when there
 * are several, the one in focus to the fore. It changes as people come and
 * go. A place with a picture of its own shows that picture while
 * the story is there. Others in the scene can be shown with a click. Hidden
 * when the reader chooses text only.
 */
export function ScenePictures({
  view,
  events,
  draft,
}: {
  view: RouteView;
  events: EventDto[];
  draft?: string | null;
}) {
  const shown = usePictureView((s) => s.shown);
  // A character the reader picked stays until the next reply.
  const [picked, setPicked] = useState<{ id: string; at: number } | null>(null);
  if (!shown) return null;
  const s = view.state.state;
  const bg = sceneBackground(view).assetId;
  const place = s.scene?.location?.trim() ?? '';
  // A generic background says nothing about where we are: caption it.
  const captioned = !!bg && !!place && !picture(view, placeSlot(place)).assetId;
  const when = s.scene?.time?.trim() ?? '';
  const cast = stageCast(view);
  const replies = replyTexts(events, draft);
  const participants = s.scene?.participantIds ?? [];
  const found = stageGroup(replies, cast, participants);
  // Before anyone is mentioned: the first one in the scene with a portrait.
  const auto = found.focus ?? participants.find((id) => cast.some((c) => c.id === id)) ?? null;
  const pickedId = picked && picked.at === replies.length ? picked.id : null;
  const focusId = pickedId ?? auto;
  let group = found.group.length ? found.group : auto ? [auto] : [];
  if (focusId && !group.includes(focusId)) group = trimGroup([...group, focusId], focusId);
  const onStage = group
    .map((id) => ({ c: s.characters?.[id], asset: picture(view, portraitSlot(id)).assetId }))
    .filter((x): x is { c: NonNullable<typeof x.c>; asset: string } => !!x.c && !!x.asset);
  // Who can be brought forward: those in the scene, and whoever is there now.
  const choices = cast
    .filter((c) => group.includes(c.id) || participants.includes(c.id))
    .map((c) => s.characters[c.id]!)
    .filter(Boolean);
  if (!bg && !onStage.length) return null;
  return (
    <div
      className={`scene-pictures stage${bg ? ' has-bg' : ''}`}
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
      {captioned && (
        <p className="stage-caption" data-testid="stage-caption">
          <span>{place}</span>
          {when && <span className="muted"> · {when}</span>}
        </p>
      )}
      {onStage.length > 0 && (
        <div
          className={`stage-cast${choices.length > 1 ? ' has-chooser' : ''}`}
          data-count={onStage.length}
          data-testid="stage-cast"
        >
          {onStage.map(({ c, asset }) => (
            <figure
              className={`stage-figure${c.id === focusId ? ' stage-focus' : ''}`}
              key={c.id}
              aria-current={onStage.length > 1 && c.id === focusId ? 'true' : undefined}
            >
              <Thumb assetId={asset} size="full" alt={t('Portrait of {name}', { name: c.name })} />
              <figcaption>{c.name}</figcaption>
            </figure>
          ))}
        </div>
      )}
      {choices.length > 1 && (
        <ul className="scene-portraits" aria-label={t('Show on stage')}>
          {choices.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                aria-pressed={c.id === focusId}
                title={c.name}
                aria-label={t('Show {name}', { name: c.name })}
                onClick={() => setPicked({ id: c.id, at: replies.length })}
              >
                <Thumb assetId={picture(view, portraitSlot(c.id)).assetId!} alt="" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { useState } from 'react';
import { Thumb } from '../images/ImageGrid';
import type { EventDto, RouteView } from '../../types';
import { BACKGROUND, picture, portraitSlot } from './pictures';
import { replyTexts, stageCast, stageFocus, usePictureView } from './stage';
import { t } from '../../i18n';

/**
 * The stage above the story (visual-novel style): the scene's background with
 * the portrait of the character the story is with, which changes when someone
 * new appears. Others in the scene can be shown with a click. Hidden when the
 * reader chooses text only.
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
  const bg = picture(view, BACKGROUND).assetId;
  const cast = stageCast(view);
  const replies = replyTexts(events, draft);
  const auto =
    stageFocus(replies, cast) ??
    // Before anyone is mentioned: the first one in the scene with a portrait.
    (s.scene?.participantIds ?? []).find((id) => cast.some((c) => c.id === id)) ??
    null;
  const focusId = picked && picked.at === replies.length ? picked.id : auto;
  const focus = focusId ? s.characters?.[focusId] : undefined;
  const focusAsset = focusId ? picture(view, portraitSlot(focusId)).assetId : null;
  // Who can be put on stage: those in the scene, and whoever is there now.
  const choices = cast
    .filter((c) => c.id === focusId || (s.scene?.participantIds ?? []).includes(c.id))
    .map((c) => s.characters[c.id]!)
    .filter(Boolean);
  if (!bg && !focusAsset) return null;
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
      {focus && focusAsset && (
        <figure className="stage-focus" key={focus.id}>
          <Thumb
            assetId={focusAsset}
            size="full"
            alt={t('Portrait of {name}', { name: focus.name })}
          />
          <figcaption>{focus.name}</figcaption>
        </figure>
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

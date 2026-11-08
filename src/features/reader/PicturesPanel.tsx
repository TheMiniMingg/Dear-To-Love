import { AddPictureButtons, PictureGroups } from '../images/PictureSources';
import { useEffect, useId, useRef, useState } from 'react';
import { commands, errorMessage } from '../../api/commands';
import { Thumb } from '../images/ImageGrid';
import { ImportResult, useAddImages } from '../images/ImagesScreen';
import { MadeFrom } from '../images/MadeFrom';
import { MakePortrait } from '../images/MakePortrait';
import type { AssetDto, RouteView } from '../../types';
import { isComposing } from '../../app/keyboard';
import {
  BACKGROUND,
  COVER,
  PLACE_PREFIX,
  picture,
  placeFromKey,
  placeKey,
  placeSlot,
  portraitSlot,
  slotName,
  type Picture,
} from './pictures';
import { t, tr } from '../../i18n';
import { routeName } from '../../i18n/names';

type Props = {
  view: RouteView;
  /** The head is an action waiting for its reply: the route can't change yet. */
  awaitingReply: boolean;
  /** Places the story has been (from its scene marks), the latest first. */
  places?: string[];
  onChanged: (view: RouteView, status: string) => void;
};

type Scope = 'route' | 'default';

/**
 * The places that can have a picture: where the story is now, the places
 * it has been, the places in its memory notes, and the ones that already
 * have a picture; each once, by its key, under the name it was first seen.
 */
export function placeChoices(view: RouteView, places: string[]): { slot: string; name: string }[] {
  const state = view.state.state;
  const named: string[] = [
    state.scene?.location ?? '',
    ...places,
    ...(state.notes ?? []).filter((n) => n.kind === 'place').map((n) => n.name),
  ];
  const withPictures = [
    ...Object.keys(state.visualRefs ?? {}),
    ...(view.visuals ?? []).map((v) => v.slot),
  ]
    .filter((s) => s.startsWith(PLACE_PREFIX))
    .map((s) => placeFromKey(s.slice(PLACE_PREFIX.length)));
  const out: { slot: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const name of [...named.map((n) => n.trim()), ...withPictures]) {
    if (!name) continue;
    const key = placeKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ slot: `${PLACE_PREFIX}${key}`, name });
  }
  return out;
}

/**
 * Reader -> Pictures: the background, each character's portrait, the
 * cover, and a picture for each place the story goes (shown instead of
 * the background while the story is there). A route's own choice applies
 * from now on that route only; a story default shows on every route that
 * hasn't chosen its own.
 */
export function PicturesPanel({ view, awaitingReply, places = [], onChanged }: Props) {
  const id = useId();
  const [images, setImages] = useState<AssetDto[] | null>(null);
  const [choosing, setChoosing] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>('route');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPlace, setNewPlace] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  /** The slot whose Choose button gets focus back when the chooser closes. */
  const lastSlot = useRef<string | null>(null);

  // Opening or closing the chooser replaces the focused button; keep focus
  // in the dialog (on the chooser's heading, or back on that row's button).
  useEffect(() => {
    const root = panelRef.current;
    if (!root) return;
    if (choosing) {
      root.querySelector<HTMLElement>('.picture-chooser h3')?.focus();
    } else if (lastSlot.current) {
      root.querySelector<HTMLElement>(`[data-slot="${CSS.escape(lastSlot.current)}"]`)?.focus();
    }
  }, [choosing]);

  const [reload, setReload] = useState(0);
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
  const storyId = view.story.id;
  const ownImages = images?.filter((a) => !a.shared && a.stories.some((s) => s.id === storyId));
  const sharedImages = images?.filter((a) => a.shared);

  const state = view.state.state;
  const characters = Object.values(state.characters ?? {}).sort((a, b) =>
    a.id === state.playerCharacterId
      ? -1
      : b.id === state.playerCharacterId
        ? 1
        : a.name.localeCompare(b.name),
  );
  // The same order as the Pictures step when a story is made.
  const slots = [COVER, BACKGROUND, ...characters.map((c) => portraitSlot(c.id))];
  const placeRows = placeChoices(view, places);
  const here = state.scene?.location?.trim() ? placeSlot(state.scene.location) : null;
  const route = routeName(view.route.label);
  /** A slot's name: a place's as it was seen in the story, not its key. */
  const nameOf = (slot: string) => {
    const place = placeRows.find((p) => p.slot === slot)?.name;
    return place ? t('Picture of {name}', { name: place }) : slotName(view, slot);
  };

  const apply = async (slot: string, assetId: string | null, where: Scope) => {
    const name = nameOf(slot);
    setBusy(true);
    setError(null);
    try {
      if (where === 'route') {
        const next = await commands.editStoryDetails({
          storyId: view.story.id,
          routeId: view.route.id,
          expectedHeadId: view.state.headEventId,
          changes: [{ op: 'setVisualRef', slot, assetId }],
          note: assetId ? name : t('{name} removed', { name }),
        });
        onChanged(
          next,
          assetId
            ? t('{name} changed on {route}', { name, route })
            : t('{name} removed on {route}', { name, route }),
        );
      } else {
        const visuals = await commands.setStoryPicture(view.story.id, slot, assetId);
        onChanged(
          { ...view, visuals },
          assetId
            ? t('{name} set for the story', { name })
            : t('{name} cleared for the story', { name }),
        );
      }
      setChoosing(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const open = (slot: string, p: Picture) => {
    lastSlot.current = slot;
    setChoosing(slot);
    setPick(p.assetId);
    setScope(slot === COVER || awaitingReply ? 'default' : 'route');
    setError(null);
  };

  const remove = (slot: string, p: Picture) => {
    // The Remove button goes away once nothing is chosen; keep focus nearby.
    panelRef.current?.querySelector<HTMLElement>(`[data-slot="${CSS.escape(slot)}"]`)?.focus();
    if (p.source === 'route') {
      if (awaitingReply) {
        setError(t('This route can change its pictures once the waiting action has its reply.'));
        return;
      }
      void apply(slot, null, 'route');
    } else {
      void apply(slot, null, 'default');
    }
  };

  const addPlace = () => {
    const name = newPlace.trim();
    if (!name) return;
    const slot = placeSlot(name);
    setNewPlace('');
    open(slot, picture(view, slot));
  };

  if (choosing) {
    const name = nameOf(choosing);
    const routeScoped = choosing !== COVER;
    const portrayed = choosing.startsWith('portrait:')
      ? state.characters?.[choosing.slice('portrait:'.length)]
      : undefined;
    return (
      <div className="picture-chooser" ref={panelRef}>
        <h3 className="small-heading" tabIndex={-1}>
          {t('Choose: {name}', { name })}
        </h3>
        <AddPictureButtons
          adding={adding}
          onAddForStory={() => void add({ storyId })}
          onAddToLibrary={() => void add()}
        />
        <ImportResult result={result} />
        {portrayed && (
          <MakePortrait
            character={portrayed}
            world={state.world}
            storyId={storyId}
            onMade={(a) => {
              setReload((n) => n + 1);
              setPick(a.id);
            }}
          />
        )}
        <PictureGroups
          own={ownImages}
          shared={sharedImages}
          pick={pick}
          onPick={(a) => setPick(a.id)}
          empty={t('No images yet. Add some from this computer first.')}
        />
        <MadeFrom text={images?.find((a) => a.id === pick)?.madeFrom} />
        {routeScoped && (
          <fieldset className="choice-list">
            <legend>{t('Use it')}</legend>
            <label>
              <input
                type="radio"
                name={`${id}-scope`}
                checked={scope === 'route'}
                disabled={awaitingReply}
                onChange={() => setScope('route')}
              />{' '}
              {tr('From now on, on {route} only', { route: <strong>{route}</strong> })}
              <span className="muted small">
                {' '}
                {t('Earlier turns and other routes keep theirs.')}
              </span>
            </label>
            <label>
              <input
                type="radio"
                name={`${id}-scope`}
                checked={scope === 'default'}
                onChange={() => setScope('default')}
              />{' '}
              {t('As the story default')}
              <span className="muted small">
                {' '}
                {t("On every route that hasn't chosen its own.")}
              </span>
            </label>
          </fieldset>
        )}
        {routeScoped && awaitingReply && (
          <p className="muted small">
            {t('This route can choose its own picture once the waiting action has its reply.')}
          </p>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="button-row">
          <button type="button" onClick={() => setChoosing(null)}>
            {t('Back')}
          </button>
          <button
            type="button"
            className="primary"
            disabled={!pick || busy}
            onClick={() => pick && void apply(choosing, pick, routeScoped ? scope : 'default')}
          >
            {t('Use this picture')}
          </button>
        </div>
      </div>
    );
  }

  const row = (slot: string, name: string, note?: string) => {
    const p = picture(view, slot);
    return (
      <li key={slot} className="picture-row">
        <div className="picture-thumb">
          {p.assetId ? (
            <Thumb assetId={p.assetId} alt={name} />
          ) : (
            <span className="thumb-empty" aria-hidden="true">
              {t('None')}
            </span>
          )}
        </div>
        <div className="picture-text">
          <strong>{name}</strong>
          <span className="muted small">
            {[note, sourceText(slot, p, route)].filter(Boolean).join(' ')}
          </span>
        </div>
        <div className="button-row">
          <button
            type="button"
            data-slot={slot}
            aria-label={t('Choose {name}', { name })}
            onClick={() => open(slot, p)}
          >
            {t('Choose…')}
          </button>
          {p.source !== 'none' && (
            <button
              type="button"
              aria-label={t('Remove {name}', { name })}
              disabled={busy}
              onClick={() => remove(slot, p)}
            >
              {t('Remove')}
            </button>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="pictures-panel" ref={panelRef}>
      <ul className="picture-list" aria-label={t('Pictures')}>
        {slots.map((slot) => row(slot, slotName(view, slot)))}
      </ul>
      <section className="picture-places" aria-labelledby={`${id}-places`}>
        <h3 id={`${id}-places`} className="small-heading">
          {t('Places')}
        </h3>
        <p className="muted small">
          {t(
            'While the story is at a place with a picture of its own, the stage shows it instead of the background. The storyteller marks each change of scene with its place.',
          )}
        </p>
        {placeRows.length > 0 && (
          <ul className="picture-list" aria-label={t('Places')}>
            {placeRows.map((p) =>
              row(
                p.slot,
                t('Picture of {name}', { name: p.name }),
                p.slot === here ? t('The story is here now.') : undefined,
              ),
            )}
          </ul>
        )}
        <div className="multi-add">
          <label htmlFor={`${id}-place`} className="visually-hidden">
            {t('Another place')}
          </label>
          <input
            id={`${id}-place`}
            value={newPlace}
            maxLength={80}
            placeholder={t('Another place, for example: the pier')}
            onChange={(e) => setNewPlace(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isComposing(e)) {
                e.preventDefault();
                addPlace();
              }
            }}
          />
          <button type="button" disabled={!newPlace.trim()} onClick={addPlace}>
            {t('Choose a picture…')}
          </button>
        </div>
      </section>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}

function sourceText(slot: string, p: Picture, route: string): string {
  if (slot === COVER) return p.assetId ? t('Shown in your library.') : t('No cover yet.');
  switch (p.source) {
    case 'route':
      return p.defaultId
        ? t('Chosen on {route}. Other routes show the story default.', { route })
        : t('Chosen on {route}.', { route });
    case 'default':
      return t('Story default.');
    case 'none':
      return t('No picture.');
  }
}

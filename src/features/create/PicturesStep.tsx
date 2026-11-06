import { useEffect, useRef, useState } from 'react';
import { commands, errorMessage } from '../../api/commands';
import { ImageGrid, Thumb } from '../images/ImageGrid';
import { ImportResult, useAddImages } from '../images/ImagesScreen';
import { MakePortrait } from '../images/MakePortrait';
import { StorytellerPicker } from '../settings/StorytellerPicker';
import type {
  AssetDto,
  Character,
  CreateStoryDraft,
  DraftPicture,
  ProviderProfile,
  StorytellerInfo,
} from '../../types';
import type { StepProps } from './WizardSteps';

/** Stands for the player character in a draft (as in relationships). */
const PLAYER = '@player';

export const COVER_SLOT = 'cover';
export const BACKGROUND_SLOT = 'background';
export const portraitOf = (characterId: string) => `portrait:${characterId}`;

type Slot = { slot: string; name: string; hint: string };

/** The pictures a draft can have: cover, background, then each character. */
export function draftSlots(draft: CreateStoryDraft): Slot[] {
  return [
    { slot: COVER_SLOT, name: 'Cover', hint: 'Shown in your library.' },
    { slot: BACKGROUND_SLOT, name: 'Scene background', hint: 'Shown above the story.' },
    {
      slot: portraitOf(PLAYER),
      name: `Your portrait${draft.player.name.trim() ? ` (${draft.player.name.trim()})` : ''}`,
      hint: 'You, as the story shows you.',
    },
    ...draft.npcs.map((c) => ({
      slot: portraitOf(c.id),
      name: `Portrait of ${c.name.trim() || 'Unnamed'}`,
      hint: c.role?.trim() || c.species?.trim() || 'Someone in the story.',
    })),
  ];
}

/** Pictures picked for slots that still exist (a removed character's portrait is left out). */
export function livePictures(draft: CreateStoryDraft): DraftPicture[] {
  const slots = new Set(draftSlots(draft).map((s) => s.slot));
  return (draft.pictures ?? []).filter((p) => slots.has(p.slot) && p.assetId);
}

/**
 * Wizard -> Pictures and storyteller: the story's cover, background and
 * character portraits, pictures added for this story only, and who writes
 * its replies.
 */
export function PicturesStep({ draft, update }: StepProps) {
  const [images, setImages] = useState<AssetDto[] | null>(null);
  const [connections, setConnections] = useState<ProviderProfile[] | null>(null);
  const [app, setApp] = useState<StorytellerInfo | null>(null);
  const [choosing, setChoosing] = useState<Slot | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const lastSlot = useRef<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([commands.listImages(), commands.listConnections(), commands.getStoryteller()])
      .then(([i, c, a]) => {
        if (!live) return;
        setImages(i);
        setConnections(c);
        setApp(a);
      })
      .catch((e: unknown) => {
        if (live) setError(errorMessage(e));
      });
    return () => {
      live = false;
    };
  }, [reload]);

  // Keep focus in the step when the chooser opens or closes.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (choosing) root.querySelector<HTMLElement>('.picture-chooser h3')?.focus();
    else if (lastSlot.current)
      root.querySelector<HTMLElement>(`[data-slot="${CSS.escape(lastSlot.current)}"]`)?.focus();
  }, [choosing]);

  const own = new Set(draft.storyImages ?? []);
  const added = (list: AssetDto[]) => {
    // Pictures added for this story that aren't shared become its own
    // (even one another story already keeps: it is then in both).
    const mine = list.filter((a) => !a.shared).map((a) => a.id);
    if (mine.length) update({ storyImages: [...new Set([...(draft.storyImages ?? []), ...mine])] });
    if (list[0]) setPick(list[0].id);
    setReload((n) => n + 1);
  };
  const { add, adding, result } = useAddImages(added);

  /** The character a portrait slot is for. */
  const characterFor = (slot: string): Character | null =>
    slot === portraitOf(PLAYER)
      ? draft.player
      : (draft.npcs.find((c) => portraitOf(c.id) === slot) ?? null);

  const ownImages = images?.filter((a) => own.has(a.id) && !a.shared);
  const sharedImages = images?.filter((a) => a.shared);
  const chosen = (slot: string) => (draft.pictures ?? []).find((p) => p.slot === slot)?.assetId;
  const known = (id: string | undefined) => !!id && !!images?.some((a) => a.id === id);

  const setPicture = (slot: string, assetId: string | null) => {
    const rest = (draft.pictures ?? []).filter((p) => p.slot !== slot);
    update({ pictures: assetId ? [...rest, { slot, assetId }] : rest });
  };

  if (choosing) {
    const portrayed = characterFor(choosing.slot);
    return (
      <div className="picture-chooser" ref={rootRef}>
        <h3 className="small-heading" tabIndex={-1}>
          Choose: {choosing.name}
        </h3>
        <div className="button-row">
          <button
            type="button"
            disabled={adding}
            onClick={() => void add({ newStory: true })}
            title="Only this story can use them"
          >
            {adding ? 'Adding…' : 'Add for this story'}
          </button>
          <button
            type="button"
            disabled={adding}
            onClick={() => void add()}
            title="Every story can use them"
          >
            Add for all stories
          </button>
        </div>
        <ImportResult result={result} />
        {portrayed && (
          <MakePortrait character={portrayed} world={draft.world} onMade={(a) => added([a])} />
        )}
        {ownImages && sharedImages && ownImages.length + sharedImages.length === 0 && (
          <p className="muted">No pictures yet. Add some from this computer.</p>
        )}
        {ownImages && ownImages.length > 0 && (
          <section className="image-group" aria-label="This story's pictures">
            <h4 className="small-heading">This story&apos;s pictures</h4>
            <ImageGrid
              images={ownImages}
              selectedId={pick}
              onSelect={(a) => setPick(a.id)}
              label="This story's pictures"
            />
          </section>
        )}
        {sharedImages && sharedImages.length > 0 && (
          <section className="image-group" aria-label="Pictures for all stories">
            <h4 className="small-heading">For all stories</h4>
            <ImageGrid
              images={sharedImages}
              selectedId={pick}
              onSelect={(a) => setPick(a.id)}
              label="Pictures for all stories"
            />
          </section>
        )}
        <div className="button-row">
          <button type="button" onClick={() => setChoosing(null)}>
            Back
          </button>
          <button
            type="button"
            className="primary"
            disabled={!pick}
            onClick={() => {
              if (!pick) return;
              setPicture(choosing.slot, pick);
              setChoosing(null);
            }}
          >
            Use this picture
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pictures-step" ref={rootRef}>
      <p className="muted">
        All optional. Pictures you add here belong to this story only; pictures from your library
        can be used in any story. You can change all of this later from the story&apos;s menu.
      </p>
      <h3 className="small-heading">Pictures</h3>
      <ul className="picture-list" aria-label="Pictures">
        {draftSlots(draft).map((s) => {
          const id = chosen(s.slot);
          const has = known(id);
          return (
            <li key={s.slot} className="picture-row">
              <div className="picture-thumb">
                {has && id ? (
                  <Thumb assetId={id} alt={s.name} />
                ) : (
                  <span className="thumb-empty" aria-hidden="true">
                    None
                  </span>
                )}
              </div>
              <div className="picture-text">
                <strong>{s.name}</strong>
                <span className="muted small">
                  {id && images && !has ? 'That picture is no longer in your library.' : s.hint}
                </span>
              </div>
              <div className="button-row">
                <button
                  type="button"
                  data-slot={s.slot}
                  aria-label={`Choose ${s.name}`}
                  onClick={() => {
                    lastSlot.current = s.slot;
                    setPick(has ? (id ?? null) : null);
                    setChoosing(s);
                  }}
                >
                  Choose…
                </button>
                {id && (
                  <button
                    type="button"
                    aria-label={`Remove ${s.name}`}
                    onClick={() => setPicture(s.slot, null)}
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <h3 className="small-heading">Storyteller</h3>
      {connections && app ? (
        <StorytellerPicker
          value={draft.storyteller ?? null}
          connections={connections}
          appLabel={app.label}
          onChange={(c) => update({ storyteller: c ?? undefined })}
        />
      ) : (
        !error && <p className="muted small">Loading…</p>
      )}
      <p className="muted small">
        To use your own AI model or API key, add a connection in Settings first.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}

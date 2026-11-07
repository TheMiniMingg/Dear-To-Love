import { useEffect, useId, useState } from 'react';
import { CommandError, commands, errorMessage, sentence } from '../../api/commands';
import type {
  AssetDto,
  Character,
  PortraitInput,
  PortraitStyle,
  Prompt,
  ProviderProfile,
  World,
} from '../../types';
import { joinSentences, msg, t } from '../../i18n';

const STYLES: { value: PortraitStyle; label: string }[] = [
  { value: 'painted', label: msg('Painted') },
  { value: 'anime', label: msg('Anime') },
  { value: 'photo', label: msg('Photo') },
  { value: 'sketch', label: msg('Pencil sketch') },
];

type Props = {
  character: Character;
  world: World;
  /** The story it is for; absent while the story is being created. */
  storyId?: string;
  onMade: (asset: AssetDto) => void;
};

function portraitInput(
  character: Character,
  world: World,
  style: PortraitStyle,
  storyId: string | undefined,
  budgetOverride = false,
): PortraitInput {
  return {
    character,
    world,
    style,
    ...(storyId ? { storyId } : { newStory: true }),
    ...(budgetOverride ? { budgetOverride: true } : {}),
  };
}

/**
 * "Make one from the description": asks the picture connection (Settings ->
 * Pictures) for a portrait of the character. The picture is kept for this
 * story only. Shows exactly what is sent, on request.
 */
export function MakePortrait({ character, world, storyId, onMade }: Props) {
  const id = useId();
  /** `undefined` while loading; `null` when no picture connection is chosen. */
  const [maker, setMaker] = useState<ProviderProfile | null | undefined>(undefined);
  const [style, setStyle] = useState<PortraitStyle>('painted');
  const [showPrompt, setShowPrompt] = useState(false);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsOverride, setNeedsOverride] = useState(false);
  const [made, setMade] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([commands.getPictureMaker(), commands.listConnections()])
      .then(([pid, list]) => {
        if (live) setMaker(list.find((c) => c.id === pid) ?? null);
      })
      .catch(() => {
        if (live) setMaker(null);
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!showPrompt) return;
    let live = true;
    commands
      .previewPortrait(portraitInput(character, world, style, storyId))
      .then((p) => {
        if (live) setPrompt(p);
      })
      .catch((e: unknown) => {
        if (live) setError(errorMessage(e));
      });
    return () => {
      live = false;
    };
  }, [showPrompt, character, world, style, storyId]);

  const name = character.name.trim();

  const make = async (budgetOverride = false) => {
    setBusy(true);
    setError(null);
    setNeedsOverride(false);
    setMade(null);
    try {
      const asset = await commands.makePortrait(
        portraitInput(character, world, style, storyId, budgetOverride),
      );
      setMade(t('Made “{name}”. It is selected below.', { name: asset.label }));
      onMade(asset);
    } catch (e) {
      if (e instanceof CommandError && e.code === 'BUDGET_OVERRIDE_REQUIRED') {
        setNeedsOverride(true);
        setError(
          t(
            "Your budget pauses paid requests, and the app can't price pictures, so it can't tell whether this one fits.",
          ),
        );
      } else if (e instanceof CommandError && e.code === 'NO_PROVIDER') {
        setError(sentence(e.message));
      } else {
        setError(errorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  };

  if (maker === undefined) return null;
  if (maker === null) {
    return (
      <p className="muted small make-portrait">
        {name
          ? t(
              "To make a portrait from {name}'s description instead, add a picture connection in Settings and choose it under Pictures.",
              { name },
            )
          : t(
              "To make a portrait from the character's description instead, add a picture connection in Settings and choose it under Pictures.",
            )}
      </p>
    );
  }
  return (
    <section className="make-portrait" aria-labelledby={`${id}-title`}>
      <h4 id={`${id}-title`} className="small-heading">
        {t('Make one from the description')}
      </h4>
      <p className="muted small">
        {joinSentences([
          t('Uses {name} ({model}).', { name: maker.label, model: maker.modelId }),
          maker.billing === 'local'
            ? t('It runs on your computer, with no charges.')
            : t('One request; the service charges for each picture.'),
          t(
            'The portrait is kept for this story only, and is always asked for as a safe-for-work picture.',
          ),
        ])}
      </p>
      <div className="field">
        <label htmlFor={`${id}-style`}>{t('Style')}</label>
        <select
          id={`${id}-style`}
          value={style}
          onChange={(e) => setStyle(e.target.value as PortraitStyle)}
        >
          {STYLES.map((s) => (
            <option key={s.value} value={s.value}>
              {t(s.label)}
            </option>
          ))}
        </select>
      </div>
      <div className="button-row">
        <button type="button" disabled={busy || !name} onClick={() => void make()}>
          {busy ? t('Making the portrait…') : t('Make portrait')}
        </button>
        <button type="button" aria-expanded={showPrompt} onClick={() => setShowPrompt((v) => !v)}>
          {showPrompt ? t('Hide what is sent') : t('Show what is sent')}
        </button>
      </div>
      {!name && <p className="muted small">{t('Give the character a name first.')}</p>}
      {busy && (
        <p role="status" className="muted small">
          {t('This can take a minute.')}
        </p>
      )}
      {made && (
        <p role="status" className="small note-ok">
          {made}
        </p>
      )}
      {showPrompt && prompt && (
        <div className="portrait-prompt small" aria-label={t('What is sent')}>
          <p>{prompt.text}</p>
          <p className="muted">Avoid: {prompt.avoid}</p>
        </div>
      )}
      {error && (
        <div role="alert" className="error">
          <p>{error}</p>
          {needsOverride && (
            <button type="button" disabled={busy} onClick={() => void make(true)}>
              {t('Make it anyway')}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

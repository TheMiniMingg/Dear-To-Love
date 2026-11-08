import { useEffect, useRef, useState } from 'react';
import { Play, Shuffle } from 'lucide-react';
import { commands, errorMessage } from '../../api/commands';
import { useUiStore } from '../../app/store';
import { ArrowPicker } from '../../components/ArrowPicker';
import type { Detail, Perspective, TemplateCatalog } from '../../types';
import { STORY_TYPES, withStoryType, worldFits } from './ContentFields';
import { charactersFor, fittingScenarios, suits } from './WizardSteps';
import { t, tOptions } from '../../i18n';
import { DETAILS, PERSPECTIVES, appStoryLanguage, storyLanguageLabel } from './StyleFields';
import { trackingSummary } from './TrackingFields';
import { StoryCover } from './StoryCover';

/** Preset Story: pick a ready-made story with arrows or menus. No typing required. */
export function QuickStartScreen() {
  const navigate = useUiStore((s) => s.navigate);
  const [catalog, setCatalog] = useState<TemplateCatalog | null>(null);
  const [storyType, setStoryType] = useState('');
  const [worldId, setWorldId] = useState('');
  const [scenarioId, setScenarioId] = useState('');
  const [characterId, setCharacterId] = useState('');
  const [perspective, setPerspective] = useState<Perspective | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Until you pick a character yourself, the character follows the world.
  const ownCharacter = useRef(false);

  useEffect(() => {
    let cancelled = false;
    commands
      .getTemplateCatalog()
      .then((c) => {
        if (cancelled) return;
        setCatalog(c);
        const firstWorld = c.worlds[0]?.id ?? '';
        setWorldId(firstWorld);
        setScenarioId(fittingScenarios(c, firstWorld)[0]?.id ?? '');
        setCharacterId(charactersFor(c, firstWorld)[0]?.id ?? '');
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const scenarios = catalog ? fittingScenarios(catalog, worldId) : [];
  const chooseWorld = (id: string) => {
    setWorldId(id);
    if (catalog && !fittingScenarios(catalog, id).some((s) => s.id === scenarioId)) {
      setScenarioId(fittingScenarios(catalog, id)[0]?.id ?? '');
    }
    if (catalog && !ownCharacter.current) setCharacterId(charactersFor(catalog, id)[0]?.id ?? '');
  };
  const chooseCharacter = (id: string) => {
    ownCharacter.current = true;
    setCharacterId(id);
  };
  const fitting = catalog?.worlds.filter((w) => worldFits(w.narration.genres, storyType)) ?? [];
  const worlds = fitting.length > 0 ? fitting : (catalog?.worlds ?? []);
  const chooseType = (type: string) => {
    setStoryType(type);
    const next = catalog?.worlds.filter((w) => worldFits(w.narration.genres, type)) ?? [];
    if (next.length > 0 && !next.some((w) => w.id === worldId)) chooseWorld(next[0]!.id);
  };
  const world = catalog?.worlds.find((w) => w.id === worldId);
  const scenario = catalog?.scenarios.find((s) => s.id === scenarioId);
  const character = catalog?.characters.find((c) => c.id === characterId);
  const effectivePerspective = perspective ?? world?.narration.perspective ?? 'second';
  const effectiveDetail = detail ?? world?.narration.detail ?? 'balanced';

  const storyLanguage = appStoryLanguage();
  const genres = withStoryType(world?.narration.genres, storyType);

  /** A random world, scenario and character, for when you can't choose. */
  const surprise = () => {
    if (!catalog) return;
    const pick = <T,>(list: T[]): T | undefined => list[Math.floor(Math.random() * list.length)];
    // A different world when there is one, so the press shows a change.
    const others = worlds.filter((w) => w.id !== worldId);
    const w = pick(others.length > 0 ? others : worlds);
    if (!w) return;
    setWorldId(w.id);
    setScenarioId(pick(fittingScenarios(catalog, w.id))?.id ?? '');
    // Someone who belongs there: no lizardfolk on a modern campus.
    setCharacterId(pick(catalog.characters.filter((c) => suits(c, w.id)))?.id ?? '');
    ownCharacter.current = false;
  };

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await commands.quickStart({
        worldId,
        scenarioId,
        characterId,
        perspective: effectivePerspective,
        detail: effectiveDetail,
        storyType: storyType || undefined,
        language: storyLanguage,
      });
      navigate({ name: 'reader', routeId: created.mainRouteId });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <section className="screen" aria-labelledby="qs-title">
      <div className="screen-header">
        <button type="button" onClick={() => navigate({ name: 'library' })}>
          {t('Back')}
        </button>
        <h1 id="qs-title">{t('Preset Story')}</h1>
        {catalog && (
          <button
            type="button"
            onClick={surprise}
            title={t('Pick a world, story and character at random')}
          >
            <Shuffle className="btn-icon" aria-hidden={true} />
            {t('Surprise me')}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {catalog && (
        <div className="quickstart-grid">
          <div className="picker-column">
            <ArrowPicker
              label={t('Type of story')}
              options={[
                { value: '', label: t('Any') },
                ...STORY_TYPES.map((type) => ({ value: type, label: t(type) })),
              ]}
              value={storyType}
              onChange={chooseType}
            />
            {storyType && fitting.length === 0 && (
              <p className="muted small">
                {t(
                  'No preset world is tagged {type} yet, so every world is listed. The story is still a {type} story.',
                  { type: t(storyType) },
                )}
              </p>
            )}
            <ArrowPicker
              label={t('World')}
              options={worlds.map((w) => ({
                value: w.id,
                label: w.label,
                hint: w.summary,
              }))}
              value={worldId}
              onChange={chooseWorld}
            />
            <ArrowPicker
              label={t('Scenario')}
              options={scenarios.map((s) => ({
                value: s.id,
                label: s.label,
                hint: s.summary,
              }))}
              value={scenarioId}
              onChange={setScenarioId}
            />
            <ArrowPicker
              label={t('Your character')}
              options={charactersFor(catalog, worldId).map((c) => ({
                value: c.id,
                label: c.label,
                hint: c.summary,
              }))}
              value={characterId}
              onChange={chooseCharacter}
            />
            <ArrowPicker
              label={t('Narration')}
              options={tOptions(PERSPECTIVES)}
              value={effectivePerspective}
              onChange={setPerspective}
            />
            <ArrowPicker
              label={t('Detail')}
              options={tOptions(DETAILS)}
              value={effectiveDetail}
              onChange={setDetail}
            />
          </div>
          <StoryCover
            label={t('Story preview')}
            title={scenario?.title ?? ''}
            genres={genres}
            premise={scenario?.description}
            cast={[
              ...(character
                ? [
                    {
                      id: '@player',
                      name: character.character.name,
                      role: character.character.role,
                      you: true,
                    },
                  ]
                : []),
              ...(scenario?.npcs ?? []).map((c) => ({
                id: c.id,
                name: c.name,
                role: c.role,
                color: c.color,
              })),
            ]}
            chapterTitle={scenario?.firstChapterTitle}
            opening={scenario?.scene.summary}
          >
            <dl className="cover-facts">
              <dt>{t('Setting')}</dt>
              <dd>{world?.world.setting}</dd>
              {scenario?.tracking && (
                <>
                  <dt>{t('Tracking')}</dt>
                  <dd>{trackingSummary(scenario.tracking, true)}</dd>
                </>
              )}
              <dt>{t('Tone')}</dt>
              <dd>{world?.narration.tone}</dd>
              {storyLanguage && (
                <>
                  <dt>{t('Story language')}</dt>
                  <dd>{storyLanguageLabel(storyLanguage)}</dd>
                </>
              )}
            </dl>
            <button
              type="button"
              className="primary cover-start"
              disabled={busy || !worldId || !scenarioId || !characterId}
              onClick={() => void start()}
            >
              <Play className="btn-icon" aria-hidden={true} />
              {busy ? t('Creating…') : t('Start story')}
            </button>
          </StoryCover>
        </div>
      )}
    </section>
  );
}

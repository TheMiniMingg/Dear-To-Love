import { useEffect, useState } from 'react';
import { commands, errorMessage } from '../../api/commands';
import { useUiStore } from '../../app/store';
import { ArrowPicker } from '../../components/ArrowPicker';
import type { Detail, Perspective, TemplateCatalog } from '../../types';
import { STORY_TYPES, withStoryType, worldFits } from './ContentFields';
import { fittingScenarios } from './WizardSteps';
import { joinList, t, tOptions } from '../../i18n';
import { DETAILS, PERSPECTIVES, appStoryLanguage, storyLanguageLabel } from './StyleFields';

/** Quick Start: pick presets with arrows or menus. No typing required. */
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
        setCharacterId(c.characters[0]?.id ?? '');
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
        <h1 id="qs-title">{t('Quick Start')}</h1>
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
              options={catalog.characters.map((c) => ({
                value: c.id,
                label: c.label,
                hint: c.summary,
              }))}
              value={characterId}
              onChange={setCharacterId}
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
          <aside className="preview" aria-label={t('Story preview')}>
            <h2>{scenario?.title}</h2>
            <p>{scenario?.description}</p>
            <dl>
              <dt>{t('Setting')}</dt>
              <dd>{world?.world.setting}</dd>
              <dt>{t('You play')}</dt>
              <dd>
                {character?.character.name}
                {character?.character.role ? `, ${character.character.role}` : ''}
              </dd>
              <dt>{t('First chapter')}</dt>
              <dd>{scenario?.firstChapterTitle}</dd>
              <dt>{t('Tone')}</dt>
              <dd>{world?.narration.tone}</dd>
              {(storyType || (world?.narration.genres?.length ?? 0) > 0) && (
                <>
                  <dt>{t('Genre')}</dt>
                  <dd>
                    {joinList(withStoryType(world?.narration.genres, storyType).map((g) => t(g)))}
                  </dd>
                </>
              )}
              {storyLanguage && (
                <>
                  <dt>{t('Story language')}</dt>
                  <dd>{storyLanguageLabel(storyLanguage)}</dd>
                </>
              )}
            </dl>
            <button
              type="button"
              className="primary"
              disabled={busy || !worldId || !scenarioId || !characterId}
              onClick={() => void start()}
            >
              {busy ? t('Creating…') : t('Start story')}
            </button>
          </aside>
        </div>
      )}
    </section>
  );
}

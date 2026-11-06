import { useEffect, useState } from 'react';
import { commands, errorMessage } from '../../api/commands';
import { useUiStore } from '../../app/store';
import { ArrowPicker } from '../../components/ArrowPicker';
import type { Detail, Perspective, TemplateCatalog } from '../../types';
import { STORY_TYPES, withStoryType, worldFits } from './ContentFields';
import { DETAILS, PERSPECTIVES, fittingScenarios } from './WizardSteps';

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
  const chooseType = (t: string) => {
    setStoryType(t);
    const next = catalog?.worlds.filter((w) => worldFits(w.narration.genres, t)) ?? [];
    if (next.length > 0 && !next.some((w) => w.id === worldId)) chooseWorld(next[0]!.id);
  };
  const world = catalog?.worlds.find((w) => w.id === worldId);
  const scenario = catalog?.scenarios.find((s) => s.id === scenarioId);
  const character = catalog?.characters.find((c) => c.id === characterId);
  const effectivePerspective = perspective ?? world?.narration.perspective ?? 'second';
  const effectiveDetail = detail ?? world?.narration.detail ?? 'balanced';

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
          Back
        </button>
        <h1 id="qs-title">Quick Start</h1>
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
              label="Type of story"
              options={[
                { value: '', label: 'Any' },
                ...STORY_TYPES.map((t) => ({ value: t, label: t })),
              ]}
              value={storyType}
              onChange={chooseType}
            />
            {storyType && fitting.length === 0 && (
              <p className="muted small">
                No preset world is tagged {storyType} yet, so every world is listed. The story is
                still a {storyType} story.
              </p>
            )}
            <ArrowPicker
              label="World"
              options={worlds.map((w) => ({
                value: w.id,
                label: w.label,
                hint: w.summary,
              }))}
              value={worldId}
              onChange={chooseWorld}
            />
            <ArrowPicker
              label="Scenario"
              options={scenarios.map((s) => ({
                value: s.id,
                label: s.label,
                hint: s.summary,
              }))}
              value={scenarioId}
              onChange={setScenarioId}
            />
            <ArrowPicker
              label="Your character"
              options={catalog.characters.map((c) => ({
                value: c.id,
                label: c.label,
                hint: c.summary,
              }))}
              value={characterId}
              onChange={setCharacterId}
            />
            <ArrowPicker
              label="Narration"
              options={PERSPECTIVES}
              value={effectivePerspective}
              onChange={setPerspective}
            />
            <ArrowPicker
              label="Detail"
              options={DETAILS}
              value={effectiveDetail}
              onChange={setDetail}
            />
          </div>
          <aside className="preview" aria-label="Story preview">
            <h2>{scenario?.title}</h2>
            <p>{scenario?.description}</p>
            <dl>
              <dt>Setting</dt>
              <dd>{world?.world.setting}</dd>
              <dt>You play</dt>
              <dd>
                {character?.character.name}
                {character?.character.role ? `, ${character.character.role}` : ''}
              </dd>
              <dt>First chapter</dt>
              <dd>{scenario?.firstChapterTitle}</dd>
              <dt>Tone</dt>
              <dd>{world?.narration.tone}</dd>
              {(storyType || (world?.narration.genres?.length ?? 0) > 0) && (
                <>
                  <dt>Genre</dt>
                  <dd>{withStoryType(world?.narration.genres, storyType).join(', ')}</dd>
                </>
              )}
            </dl>
            <button
              type="button"
              className="primary"
              disabled={busy || !worldId || !scenarioId || !characterId}
              onClick={() => void start()}
            >
              {busy ? 'Creating…' : 'Start story'}
            </button>
          </aside>
        </div>
      )}
    </section>
  );
}

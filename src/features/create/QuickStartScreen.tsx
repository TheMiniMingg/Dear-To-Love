import { useEffect, useRef, useState } from 'react';
import { pickPresetFile, pickPresetTarget } from '../../api/presets';
import { Dialog } from '../../components/Dialog';
import { Download, PenLine, Play, Shuffle, Trash2, Upload } from 'lucide-react';
import { commands, errorMessage } from '../../api/commands';
import { useUiStore } from '../../app/store';
import { ArrowPicker } from '../../components/ArrowPicker';
import type { Detail, NextMove, Perspective, TemplateCatalog, UserPreset } from '../../types';
import { STORY_TYPES, withStoryType, worldFits } from './ContentFields';
import { charactersFor, fittingScenarios, suits } from './WizardSteps';
import { formatAgo, t, tOptions } from '../../i18n';
import {
  DETAILS,
  NEXT_MOVES,
  PERSPECTIVES,
  appStoryLanguage,
  storyLanguageLabel,
} from './StyleFields';
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
  const [nextMove, setNextMove] = useState<NextMove>(lastNextMove);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [presets, setPresets] = useState<UserPreset[] | null>(null);
  const [presetNote, setPresetNote] = useState<string | null>(null);
  const [confirmPreset, setConfirmPreset] = useState<UserPreset | null>(null);

  useEffect(() => {
    let live = true;
    commands
      .listUserPresets()
      .then((list) => live && setPresets(list))
      .catch(() => live && setPresets([]));
    return () => {
      live = false;
    };
  }, []);

  /** Runs a preset action, showing what it did or what went wrong. */
  const presetAct = async (f: () => Promise<string | null>) => {
    setError(null);
    setPresetNote(null);
    setBusy(true);
    try {
      const note = await f();
      if (note) setPresetNote(note);
      setPresets(await commands.listUserPresets());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  /** A new story from the preset, as the wizard would make it. */
  const beginPreset = (p: UserPreset) =>
    void presetAct(async () => {
      const created = await commands.createStory(p.draft);
      navigate({ name: 'reader', routeId: created.mainRouteId });
      return null;
    });

  /** The preset in the Custom Story wizard, open on Review, to change first. */
  const editPreset = (p: UserPreset) =>
    void presetAct(async () => {
      await commands.saveWizardDraft({
        mode: 'custom',
        step: 'review',
        draft: p.draft,
        savedAt: '',
      });
      navigate({ name: 'create' });
      return null;
    });

  const exportPreset = (p: UserPreset) =>
    void presetAct(async () => {
      const path = await pickPresetTarget(p.name);
      if (!path) return null;
      const written = await commands.exportUserPreset(p.id, path);
      return t('Saved {name} to {path}.', { name: p.name, path: written });
    });

  const importPreset = () =>
    void presetAct(async () => {
      const path = await pickPresetFile();
      if (!path) return null;
      const p = await commands.importUserPreset(path);
      return t('Imported the preset {name}.', { name: p.name });
    });

  const deletePreset = (p: UserPreset) =>
    void presetAct(async () => {
      await commands.deleteUserPreset(p.id);
      return t('Deleted the preset {name}.', { name: p.name });
    });
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
        nextMove,
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
            <ArrowPicker
              label={t('Help with your next move')}
              options={tOptions(NEXT_MOVES)}
              value={nextMove}
              onChange={(move) => {
                setNextMove(move);
                rememberNextMove(move);
              }}
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
      <section className="your-presets" aria-labelledby="qs-presets-title">
        <div className="section-head">
          <h2 id="qs-presets-title">{t('Your presets')}</h2>
          <button type="button" disabled={busy} onClick={importPreset}>
            <Upload className="btn-icon" aria-hidden={true} />
            {t('Import a preset file…')}
          </button>
        </div>
        <p className="muted small">
          {t(
            'Worlds, casts and rules saved from your own stories, without their turns. Save one from More on a story card. A preset file (.dtlpreset) holds no keys, pictures or settings, so it is safe to share.',
          )}
        </p>
        {presetNote && (
          <p className="muted small" role="status">
            {presetNote}
          </p>
        )}
        {presets && presets.length === 0 && <p className="muted">{t('None yet.')}</p>}
        {presets && presets.length > 0 && (
          <ul className="preset-list" aria-label={t('Your presets')}>
            {presets.map((p) => (
              <li key={p.id} className="preset-card">
                <div className="preset-card-text">
                  <strong>{p.name}</strong>
                  <span className="muted small">
                    {[
                      p.fromStoryTitle
                        ? t('from {title}', { title: p.fromStoryTitle })
                        : t('imported'),
                      t('{n} characters', { n: 1 + p.draft.npcs.length }),
                      p.draft.world.setting,
                      formatAgo(p.createdAt),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                <div className="button-row">
                  <button
                    type="button"
                    className="primary"
                    disabled={busy}
                    onClick={() => beginPreset(p)}
                    aria-label={t('Begin {title}', { title: p.name })}
                  >
                    <Play className="btn-icon" aria-hidden={true} />
                    {t('Begin')}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => editPreset(p)}
                    title={t('Open it in Custom Story to change things first')}
                  >
                    <PenLine className="btn-icon" aria-hidden={true} />
                    {t('Change first')}
                  </button>
                  <button type="button" disabled={busy} onClick={() => exportPreset(p)}>
                    <Download className="btn-icon" aria-hidden={true} />
                    {t('Save as file…')}
                  </button>
                  <button
                    type="button"
                    className="danger-link"
                    disabled={busy}
                    onClick={() => setConfirmPreset(p)}
                  >
                    <Trash2 className="btn-icon" aria-hidden={true} />
                    {t('Delete')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {confirmPreset && (
        <Dialog title={t('Delete preset?')} onClose={() => setConfirmPreset(null)}>
          <p>
            {t('{name} will be gone for good. Stories made from it are not affected.', {
              name: confirmPreset.name,
            })}
          </p>
          <div className="button-row dialog-actions">
            <button type="button" onClick={() => setConfirmPreset(null)}>
              {t('Keep preset')}
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => {
                const p = confirmPreset;
                setConfirmPreset(null);
                deletePreset(p);
              }}
            >
              {t('Delete preset')}
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}

/** Quick Start keeps the last next-move pick for the next story. */
const NEXT_MOVE_KEY = 'dtl.quickStart.nextMove';

function lastNextMove(): NextMove {
  try {
    const v = localStorage.getItem(NEXT_MOVE_KEY);
    return v === 'choices' || v === 'off' ? v : 'ideas';
  } catch {
    return 'ideas';
  }
}

function rememberNextMove(move: NextMove) {
  try {
    if (move === 'ideas') localStorage.removeItem(NEXT_MOVE_KEY);
    else localStorage.setItem(NEXT_MOVE_KEY, move);
  } catch {
    // Not kept; the next story starts with ideas.
  }
}

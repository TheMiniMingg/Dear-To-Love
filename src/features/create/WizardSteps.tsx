import { ArrowPicker, type PickerOption } from '../../components/ArrowPicker';
import type {
  Character,
  ChapterOutlineInput,
  ContentRating,
  CreateStoryDraft,
  DraftProblem,
  DraftStep,
  Narration,
  TemplateCatalog,
  World,
} from '../../types';
import {
  ContentFields,
  RATING_LABELS,
  STORY_TYPES,
  withStoryType,
  worldFits,
} from './ContentFields';
import {
  LinesField,
  MultiPicker,
  PresetPicker,
  StatsField,
  TextArea,
  TextField,
  uniq,
} from './fields';
import { ERAS, PERSONALITIES, RACES, ROLES, RULES, SETTINGS } from './presets';
import {
  DETAILS,
  DICE_STORY_TYPES,
  FeatureFields,
  PERSPECTIVES,
  STYLES,
  StyleFields,
  appStoryLanguage,
  featureList,
  labelOf,
  storyLanguageLabel,
  tellingOf,
} from './StyleFields';
import { BACKGROUND_SLOT, COVER_SLOT, livePictures } from './PicturesStep';
import { joinList, msg, t, tKnown, tn } from '../../i18n';

export type StepProps = {
  draft: CreateStoryDraft;
  update: (patch: Partial<CreateStoryDraft>) => void;
  catalog: TemplateCatalog;
  guided: boolean;
};

export const PLAYER = '@player';

const PRONOUNS = ['she/her', 'he/him', 'they/them'];

const copy = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/**
 * Fill the world section (and its narration defaults) from a template.
 * How the story is told (style, thoughts, cards, language) stays as chosen.
 */
export function applyWorld(
  catalog: TemplateCatalog,
  id: string,
  current?: Narration,
): Partial<CreateStoryDraft> {
  const tpl = catalog.worlds.find((w) => w.id === id);
  return tpl
    ? {
        worldTemplateId: tpl.id,
        world: copy(tpl.world),
        narration: {
          ...copy(tpl.narration),
          ...(current
            ? tellingOf(current)
            : { messageCards: true, sceneHeadings: true, language: appStoryLanguage() }),
        },
      }
    : { worldTemplateId: null };
}

/** Fill the story section (scene, others, chapters) from a template. */
export function applyScenario(catalog: TemplateCatalog, id: string): Partial<CreateStoryDraft> {
  const s = catalog.scenarios.find((x) => x.id === id);
  if (!s) return { scenarioTemplateId: null };
  return {
    scenarioTemplateId: s.id,
    title: s.title,
    description: s.description,
    scene: copy(s.scene),
    npcs: copy(s.npcs),
    relationships: copy(s.relationships),
    openThreads: [...s.openThreads],
    firstChapterTitle: s.firstChapterTitle,
    chapterOutlines: copy(s.chapterOutlines),
  };
}

export function applyCharacter(catalog: TemplateCatalog, id: string): Partial<CreateStoryDraft> {
  const c = catalog.characters.find((x) => x.id === id);
  return c
    ? { characterTemplateId: c.id, player: { ...copy(c.character), control: 'player' } }
    : { characterTemplateId: null };
}

/**
 * The same draft with every field emptied, for Custom mode: no world,
 * character or scenario preset, default narration, and a first chapter
 * simply called "Chapter 1".
 */
export function blankDraft(d: CreateStoryDraft): CreateStoryDraft {
  return {
    ...d,
    worldTemplateId: null,
    scenarioTemplateId: null,
    characterTemplateId: null,
    title: '',
    description: '',
    world: { era: '', setting: '', description: '', rules: [] },
    narration: {
      perspective: 'second',
      detail: 'balanced',
      tone: '',
      pacing: 'normal',
      messageCards: true,
      sceneHeadings: true,
      language: appStoryLanguage(),
    },
    player: { id: '', name: '', control: 'player', personality: [], goals: [], abilities: [] },
    npcs: [],
    relationships: [],
    scene: { location: '', summary: '' },
    openThreads: [],
    firstChapterTitle: t('Chapter {n}', { n: 1 }),
    chapterOutlines: [],
    pictures: [],
  };
}

export function fittingScenarios(catalog: TemplateCatalog, worldId: string | null) {
  return catalog.scenarios.filter(
    (s) => !worldId || s.worlds.length === 0 || s.worlds.includes(worldId),
  );
}

function templateOptions<T extends { id: string; label: string; summary: string }>(
  list: T[],
  current: string | null,
  ownLabel: string,
): PickerOption<string>[] {
  const options = list.map((x) => ({ value: x.id, label: x.label, hint: x.summary }));
  if (!current || !options.some((o) => o.value === current)) {
    options.unshift({ value: current ?? '', label: ownLabel, hint: '' });
  }
  return options;
}

export function WorldStep({ draft, update, catalog, guided }: StepProps) {
  const w = draft.world;
  const set = (patch: Partial<World>) => update({ world: { ...w, ...patch } });
  const storyType = draft.storyType ?? '';
  const fitting = catalog.worlds.filter((x) => worldFits(x.narration.genres, storyType));
  const worlds = fitting.length > 0 ? fitting : catalog.worlds;
  return (
    <>
      <PresetPicker
        label={t('Type of story')}
        presets={STORY_TYPES}
        translate
        value={storyType}
        noneLabel={t('Any')}
        onChange={(type) => {
          const patch: Partial<CreateStoryDraft> = { storyType: type || undefined };
          // Move to a world of that type when the current one isn't.
          const next = catalog.worlds.filter((x) => worldFits(x.narration.genres, type));
          const current = catalog.worlds.find((x) => x.id === draft.worldTemplateId);
          if (guided && current && next.length > 0 && !next.includes(current)) {
            Object.assign(patch, applyWorld(catalog, next[0]!.id, draft.narration));
          }
          // Adventures, fantasy and school stories roll dice; you can turn it off.
          patch.narration = {
            ...(patch.narration ?? draft.narration),
            dice: DICE_STORY_TYPES.includes(type) || undefined,
          };
          update(patch);
        }}
      />
      {guided && storyType && fitting.length === 0 && (
        <p className="muted small">
          {t(
            'No preset world is tagged {type} yet, so every world is listed. The story is still a {type} story.',
            { type: t(storyType) },
          )}
        </p>
      )}
      {guided ? (
        <>
          <ArrowPicker
            label={t('Start from a world')}
            options={templateOptions(worlds, draft.worldTemplateId, t('Your own world'))}
            value={draft.worldTemplateId ?? ''}
            onChange={(id) => update(applyWorld(catalog, id, draft.narration))}
          />
          <PresetPicker
            label={t('Era')}
            presets={uniq([...catalog.worlds.map((x) => x.world.era), ...ERAS])}
            value={w.era}
            onChange={(era) => set({ era })}
          />
          <PresetPicker
            label={t('Setting')}
            presets={uniq([...catalog.worlds.map((x) => x.world.setting), ...SETTINGS])}
            value={w.setting}
            onChange={(setting) => set({ setting })}
          />
          {w.description && <p className="muted">{w.description}</p>}
          <MultiPicker
            label={t('Rules the storyteller follows')}
            presets={uniq([...catalog.worlds.flatMap((x) => x.world.rules), ...RULES])}
            value={w.rules}
            onChange={(rules) => set({ rules })}
          />
        </>
      ) : (
        <>
          <TextField label={t('Era')} value={w.era} onChange={(era) => set({ era })} />
          <TextField
            label={t('Setting')}
            required
            value={w.setting}
            onChange={(setting) => set({ setting })}
            hint={t('Where the story takes place.')}
          />
          <TextArea
            label={t('Description')}
            value={w.description}
            rows={4}
            onChange={(description) => set({ description })}
          />
          <LinesField
            label={t('Rules the storyteller follows')}
            value={w.rules}
            onChange={(rules) => set({ rules })}
          />
        </>
      )}
    </>
  );
}

const allCharacters = (catalog: TemplateCatalog) => [
  ...catalog.characters.map((c) => c.character),
  ...catalog.scenarios.flatMap((s) => s.npcs),
];
const raceOptions = (catalog: TemplateCatalog) =>
  uniq([...RACES, ...allCharacters(catalog).map((c) => c.species)]);
const roleOptions = (catalog: TemplateCatalog) =>
  uniq([...allCharacters(catalog).map((c) => c.role), ...ROLES]);
const personalityOptions = (catalog: TemplateCatalog) =>
  uniq([...allCharacters(catalog).flatMap((c) => c.personality), ...PERSONALITIES]);

export function CharacterStep({ draft, update, catalog, guided }: StepProps) {
  const p = draft.player;
  const set = (patch: Partial<Character>) => update({ player: { ...p, ...patch } });
  const chars = catalog.characters.map((c) => c.character);
  return (
    <>
      {guided ? (
        <>
          <ArrowPicker
            label={t('Start from a character')}
            options={templateOptions(
              catalog.characters,
              draft.characterTemplateId,
              t('Your own character'),
            )}
            value={draft.characterTemplateId ?? ''}
            onChange={(id) => update(applyCharacter(catalog, id))}
          />
          <PresetPicker
            label={t('Name')}
            presets={uniq(chars.map((c) => c.name))}
            value={p.name}
            onChange={(name) => set({ name })}
          />
          <PresetPicker
            label={t('Pronouns')}
            presets={uniq([...PRONOUNS, ...chars.map((c) => c.pronouns)])}
            value={p.pronouns ?? ''}
            noneLabel={t('Not specified')}
            onChange={(pronouns) => set({ pronouns })}
          />
          <PresetPicker
            label={t('Race or species')}
            presets={raceOptions(catalog)}
            value={p.species ?? ''}
            noneLabel={t('Not specified')}
            onChange={(species) => set({ species: species || undefined })}
          />
          <PresetPicker
            label={t('Role')}
            presets={roleOptions(catalog)}
            value={p.role ?? ''}
            noneLabel={t('No particular role')}
            onChange={(role) => set({ role })}
          />
          {p.description && <p className="muted">{p.description}</p>}
          <MultiPicker
            label={t('Personality')}
            presets={personalityOptions(catalog)}
            value={p.personality}
            onChange={(personality) => set({ personality })}
          />
          {draft.narration.dice && (
            <StatsField value={p.stats ?? []} onChange={(stats) => set({ stats })} />
          )}
        </>
      ) : (
        <>
          <TextField label={t('Name')} required value={p.name} onChange={(name) => set({ name })} />
          <div className="field-row">
            <TextField
              label={t('Pronouns')}
              value={p.pronouns ?? ''}
              onChange={(pronouns) => set({ pronouns })}
            />
            <TextField label={t('Age')} value={p.age ?? ''} onChange={(age) => set({ age })} />
            <TextField label={t('Role')} value={p.role ?? ''} onChange={(role) => set({ role })} />
            <TextField
              label={t('Race or species')}
              value={p.species ?? ''}
              placeholder={t('Human, Orc, Lizardfolk…')}
              onChange={(species) => set({ species })}
            />
          </div>
          <TextArea
            label={t('Description')}
            value={p.description ?? ''}
            onChange={(description) => set({ description })}
          />
          <TextArea
            label={t('Appearance')}
            value={p.appearance ?? ''}
            rows={2}
            onChange={(appearance) => set({ appearance })}
          />
          <LinesField
            label={t('Personality')}
            value={p.personality}
            onChange={(personality) => set({ personality })}
          />
          <LinesField label={t('Goals')} value={p.goals} onChange={(goals) => set({ goals })} />
          <LinesField
            label={t('Abilities')}
            value={p.abilities}
            onChange={(abilities) => set({ abilities })}
          />
          <StatsField value={p.stats ?? []} onChange={(stats) => set({ stats })} />
        </>
      )}
    </>
  );
}

function nextNpcId(npcs: Character[]): string {
  for (let n = 1; ; n++) {
    const id = `custom:npc-${n}`;
    if (!npcs.some((c) => c.id === id)) return id;
  }
}

function OthersEditor({ draft, update, catalog, guided }: StepProps) {
  const remove = (id: string) =>
    update({
      npcs: draft.npcs.filter((c) => c.id !== id),
      relationships: draft.relationships.filter((r) => r.fromId !== id && r.toId !== id),
    });
  const setNpc = (i: number, patch: Partial<Character>) =>
    update({ npcs: draft.npcs.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const extras = catalog.characters.filter((c) => c.id !== draft.player.id);
  return (
    <>
      <fieldset className="field">
        <legend>{t('Others in the story')}</legend>
        {draft.npcs.length === 0 && <p className="muted small">{t('Nobody else yet.')}</p>}
        <ul className="npc-list">
          {draft.npcs.map((c, i) => (
            <li key={c.id} className="npc-card">
              {guided ? (
                <span>
                  <strong>{c.name || t('Unnamed')}</strong>
                  {(c.species || c.role) && (
                    <span className="muted">, {[c.species, c.role].filter(Boolean).join(' ')}</span>
                  )}
                </span>
              ) : (
                <div className="field-row">
                  <TextField
                    label={t('Name')}
                    required
                    value={c.name}
                    onChange={(name) => setNpc(i, { name })}
                  />
                  <TextField
                    label={t('Pronouns')}
                    value={c.pronouns ?? ''}
                    onChange={(pronouns) => setNpc(i, { pronouns })}
                  />
                  <TextField
                    label={t('Age')}
                    value={c.age ?? ''}
                    onChange={(age) => setNpc(i, { age })}
                  />
                  <TextField
                    label={t('Role')}
                    value={c.role ?? ''}
                    onChange={(role) => setNpc(i, { role })}
                  />
                  <TextField
                    label={t('Race or species')}
                    value={c.species ?? ''}
                    onChange={(species) => setNpc(i, { species })}
                  />
                </div>
              )}
              {!guided && (
                <TextArea
                  label={t('Description')}
                  rows={2}
                  value={c.description ?? ''}
                  onChange={(description) => setNpc(i, { description })}
                />
              )}
              <button
                type="button"
                className="danger-link"
                aria-label={
                  c.name ? t('Remove {name}', { name: c.name }) : t('Remove this character')
                }
                onClick={() => remove(c.id)}
              >
                {t('Remove')}
              </button>
            </li>
          ))}
        </ul>
        {!guided && (
          <button
            type="button"
            className="add-button"
            onClick={() =>
              update({
                npcs: [
                  ...draft.npcs,
                  {
                    id: nextNpcId(draft.npcs),
                    name: '',
                    control: 'npc',
                    personality: [],
                    goals: [],
                    abilities: [],
                  },
                ],
              })
            }
          >
            {t('Add a character')}
          </button>
        )}
      </fieldset>
      {guided && extras.length > 0 && (
        <fieldset className="field toggle-list">
          <legend>{t('Bring in a preset character')}</legend>
          {extras.map((x) => {
            const on = draft.npcs.some((c) => c.id === x.character.id);
            return (
              <label key={x.id} className="check">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) =>
                    e.target.checked
                      ? update({
                          npcs: [...draft.npcs, { ...copy(x.character), control: 'npc' }],
                        })
                      : remove(x.character.id)
                  }
                />
                <span>
                  {x.character.name}
                  {(x.character.species || x.character.role) && (
                    <span className="muted">
                      , {[x.character.species, x.character.role].filter(Boolean).join(' ')}
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </fieldset>
      )}
    </>
  );
}

function OutlinesEditor({
  value,
  onChange,
}: {
  value: ChapterOutlineInput[];
  onChange: (v: ChapterOutlineInput[]) => void;
}) {
  const set = (i: number, patch: Partial<ChapterOutlineInput>) =>
    onChange(value.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <fieldset className="field">
      <legend>{t('Chapter plan (optional)')}</legend>
      <p className="muted small">
        {t('Used when you start the next chapter. Chapters without a plan get a plain title.')}
      </p>
      <ol className="outline-list">
        {value.map((c, i) => (
          <li key={i} className="field-row">
            <TextField
              label={t('Chapter {n} title', { n: i + 1 })}
              value={c.title}
              onChange={(title) => set(i, { title })}
            />
            <TextField
              label={t('What happens')}
              value={c.outline}
              onChange={(outline) => set(i, { outline })}
            />
            <button
              type="button"
              className="danger-link"
              aria-label={t('Remove chapter {n}', { n: i + 1 })}
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            >
              {t('Remove')}
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="add-button"
        onClick={() => onChange([...value, { title: '', outline: '' }])}
      >
        {t('Add a chapter')}
      </button>
    </fieldset>
  );
}

export function StoryStep(props: StepProps) {
  const { draft, update, catalog, guided } = props;
  const options = fittingScenarios(catalog, draft.worldTemplateId);
  const current = draft.scenarioTemplateId;
  const offWorld = current !== null && !options.some((s) => s.id === current);
  const pickerOptions = templateOptions(options, current, t('Your own story'));
  if (offWorld) {
    const s = catalog.scenarios.find((x) => x.id === current);
    pickerOptions[0] = {
      value: current,
      label: t('{name} (written for another world)', { name: s?.label ?? t('Current story') }),
      hint: '',
    };
  }
  return (
    <>
      {guided ? (
        <>
          <ArrowPicker
            label={t('Start from a scenario')}
            options={pickerOptions}
            value={current ?? ''}
            onChange={(id) => update(applyScenario(catalog, id))}
          />
          <dl className="facts">
            <dt>{t('Title')}</dt>
            <dd>{draft.title || t('(not set)')}</dd>
            <dt>{t('Opens at')}</dt>
            <dd>{draft.scene.location || t('(not set)')}</dd>
            {draft.scene.summary && (
              <>
                <dt>{t('Scene')}</dt>
                <dd>{draft.scene.summary}</dd>
              </>
            )}
            <dt>{t('First chapter')}</dt>
            <dd>{draft.firstChapterTitle || t('(not set)')}</dd>
          </dl>
        </>
      ) : (
        <>
          <TextField
            label={t('Title')}
            required
            value={draft.title}
            onChange={(title) => update({ title })}
          />
          <TextArea
            label={t('Description')}
            value={draft.description}
            rows={2}
            onChange={(description) => update({ description })}
          />
          <TextField
            label={t('Starting location')}
            required
            value={draft.scene.location}
            onChange={(location) => update({ scene: { ...draft.scene, location } })}
            hint={t('Where you are when the story begins.')}
          />
          <TextArea
            label={t('Opening scene')}
            value={draft.scene.summary}
            onChange={(summary) => update({ scene: { ...draft.scene, summary } })}
            hint={t('What is happening as the story begins. The storyteller picks up from here.')}
          />
          <TextField
            label={t('First chapter title')}
            required
            value={draft.firstChapterTitle}
            onChange={(firstChapterTitle) => update({ firstChapterTitle })}
          />
          <LinesField
            label={t('Open questions')}
            value={draft.openThreads}
            rows={2}
            onChange={(openThreads) => update({ openThreads })}
          />
          <OutlinesEditor
            value={draft.chapterOutlines}
            onChange={(chapterOutlines) => update({ chapterOutlines })}
          />
        </>
      )}
      <OthersEditor {...props} />
    </>
  );
}

export function NarrationStep({ draft, update, catalog, guided }: StepProps) {
  const n = draft.narration;
  const set = (patch: Partial<typeof n>) => update({ narration: { ...n, ...patch } });
  return (
    <>
      <StyleFields narration={n} onChange={set} typeLanguage={!guided} />
      {guided ? (
        <PresetPicker
          label={t('Tone')}
          presets={uniq(catalog.worlds.map((w) => w.narration.tone))}
          value={n.tone}
          onChange={(tone) => set({ tone })}
        />
      ) : (
        <TextField
          label={t('Tone')}
          value={n.tone}
          onChange={(tone) => set({ tone })}
          placeholder={t('Warm, gently mysterious')}
        />
      )}
      <h2>{t('Features')}</h2>
      <FeatureFields narration={n} onChange={set} />
      <h2>{t('What kind of story')}</h2>
      <ContentFields
        narration={n}
        onChange={set}
        pickGenres={guided}
        genrePresets={catalog.worlds.flatMap((w) => w.narration.genres ?? [])}
      />
    </>
  );
}

/** "Romance, Comedy · Mature", or '' when nothing is set. */
export function storyKind(genres: string[] | undefined, rating: ContentRating | undefined): string {
  const g = joinList(uniq(genres ?? []).map((x) => t(x)));
  const r = rating ? t(RATING_LABELS[rating]) : '';
  return [g, r].filter(Boolean).join(' · ');
}

const STEP_NAMES: Record<DraftStep, string> = {
  world: msg('World'),
  character: msg('You'),
  story: msg('Story'),
  narration: msg('Narration'),
  pictures: msg('Pictures'),
  review: msg('Review'),
};

/** "Cover, background and 2 portraits", or '' when none are picked. */
export function picturesText(draft: CreateStoryDraft): string {
  const slots = livePictures(draft).map((p) => p.slot);
  const portraits = slots.filter((s) => s.startsWith('portrait:')).length;
  const parts = [
    slots.includes(COVER_SLOT) && t('cover'),
    slots.includes(BACKGROUND_SLOT) && t('background'),
    portraits > 0 && tn(portraits, '{n} portrait', '{n} portraits'),
  ].filter((x): x is string => !!x);
  if (!parts.length) return '';
  const last = parts[parts.length - 1] ?? '';
  const text =
    parts.length === 1
      ? last
      : t('{list} and {last}', { list: joinList(parts.slice(0, -1)), last });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function ReviewStep({
  draft,
  problems,
  onGoTo,
  storytellerLabel,
}: {
  draft: CreateStoryDraft;
  problems: DraftProblem[] | null;
  onGoTo: (step: DraftStep) => void;
  /** Who will write the replies, in words. */
  storytellerLabel?: string;
}) {
  const others = joinList(draft.npcs.map((c) => c.name || t('Unnamed')));
  return (
    <>
      {problems && problems.length > 0 && (
        <div className="problems" role="alert">
          <p>{t('Fix these before creating the story:')}</p>
          <ul>
            {problems.map((p, i) => (
              <li key={i}>
                {p.message}{' '}
                {p.step !== 'review' && (
                  <button type="button" className="link-button" onClick={() => onGoTo(p.step)}>
                    {t('Go to {step}', { step: t(STEP_NAMES[p.step]) })}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <dl className="facts" aria-label={t('Story summary')}>
        <dt>{t('Title')}</dt>
        <dd>{draft.title || t('(not set)')}</dd>
        <dt>{t('World')}</dt>
        <dd>
          {draft.world.setting || t('(not set)')}
          {draft.world.era && <span className="muted"> · {draft.world.era}</span>}
        </dd>
        <dt>{t('You play')}</dt>
        <dd>
          {draft.player.name || t('(not set)')}
          {(draft.player.species || draft.player.role) &&
            `, ${[draft.player.species, draft.player.role].filter(Boolean).join(' ')}`}
          {draft.player.pronouns && <span className="muted"> ({draft.player.pronouns})</span>}
          {(draft.player.stats ?? []).some((st) => st.name.trim()) && (
            <span className="muted">
              {' · '}
              {(draft.player.stats ?? [])
                .filter((st) => st.name.trim())
                .map((st) => `${st.name.trim()} ${st.value}`)
                .join(t(', '))}
            </span>
          )}
        </dd>
        <dt>{t('Also here')}</dt>
        <dd>{others || t('Nobody else yet')}</dd>
        <dt>{t('Opens at')}</dt>
        <dd>{draft.scene.location || t('(not set)')}</dd>
        <dt>{t('First chapter')}</dt>
        <dd>{draft.firstChapterTitle || t('(not set)')}</dd>
        <dt>{t('Narration')}</dt>
        <dd>
          {labelOf(STYLES, draft.narration.style ?? 'narrated')} ·{' '}
          {labelOf(PERSPECTIVES, draft.narration.perspective)} ·{' '}
          {labelOf(DETAILS, draft.narration.detail)}
          {draft.narration.tone && ` · ${draft.narration.tone}`}
          {draft.narration.language &&
            ` · ${t('in {language}', { language: storyLanguageLabel(draft.narration.language) })}`}
        </dd>
        <dt>{t('Features')}</dt>
        <dd>{joinList(featureList(draft.narration)) || t('(none)')}</dd>
        <dt>{t('Kind of story')}</dt>
        <dd>
          {storyKind(
            withStoryType(draft.narration.genres, draft.storyType ?? ''),
            draft.narration.rating,
          ) || t('Not set')}
        </dd>
        {(draft.narration.themes ?? []).some((x) => x.trim()) && (
          <>
            <dt>{t('Themes')}</dt>
            <dd>{joinList(uniq(draft.narration.themes ?? []))}</dd>
          </>
        )}
        {(draft.narration.limits ?? []).some((x) => x.trim()) && (
          <>
            <dt>{t('Hard limits')}</dt>
            <dd>{joinList(uniq(draft.narration.limits ?? []))}</dd>
          </>
        )}
        <dt>{t('Pictures')}</dt>
        <dd>{picturesText(draft) || t('None yet')}</dd>
        {storytellerLabel && (
          <>
            <dt>{t('Storyteller')}</dt>
            <dd>{tKnown(storytellerLabel)}</dd>
          </>
        )}
      </dl>
      <p className="muted small">
        {t(
          "Once you create it, this becomes the story's starting point. Your choices here are kept until then, even if you close the app.",
        )}
      </p>
    </>
  );
}

export { STEP_NAMES };

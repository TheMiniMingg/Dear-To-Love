import { ArrowPicker, type PickerOption } from '../../components/ArrowPicker';
import type {
  Character,
  ChapterOutlineInput,
  ContentRating,
  CreateStoryDraft,
  Detail,
  DraftProblem,
  DraftStep,
  Pacing,
  Perspective,
  TemplateCatalog,
  World,
} from '../../types';
import { ContentFields, RATING_LABELS } from './ContentFields';
import { LinesField, PresetPicker, TextArea, TextField, ToggleList, uniq } from './fields';

export type StepProps = {
  draft: CreateStoryDraft;
  update: (patch: Partial<CreateStoryDraft>) => void;
  catalog: TemplateCatalog;
  guided: boolean;
};

export const PLAYER = '@player';

export const PERSPECTIVES: PickerOption<Perspective>[] = [
  { value: 'second', label: 'Second person (you)' },
  { value: 'first', label: 'First person (I)' },
  { value: 'third', label: 'Third person (they)' },
];
export const DETAILS: PickerOption<Detail>[] = [
  { value: 'brief', label: 'Brief' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'detailed', label: 'Detailed' },
  { value: 'cinematic', label: 'Cinematic' },
];
const PACINGS: PickerOption<Pacing>[] = [
  { value: 'fast', label: 'Fast' },
  { value: 'normal', label: 'Normal' },
  { value: 'slow', label: 'Slow' },
];
const PRONOUNS = ['she/her', 'he/him', 'they/them'];

const copy = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Fill the world section (and its narration defaults) from a template. */
export function applyWorld(catalog: TemplateCatalog, id: string): Partial<CreateStoryDraft> {
  const t = catalog.worlds.find((w) => w.id === id);
  return t
    ? { worldTemplateId: t.id, world: copy(t.world), narration: copy(t.narration) }
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
    narration: { perspective: 'second', detail: 'balanced', tone: '', pacing: 'normal' },
    player: { id: '', name: '', control: 'player', personality: [], goals: [], abilities: [] },
    npcs: [],
    relationships: [],
    scene: { location: '', summary: '' },
    openThreads: [],
    firstChapterTitle: 'Chapter 1',
    chapterOutlines: [],
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
  const options = list.map((t) => ({ value: t.id, label: t.label, hint: t.summary }));
  if (!current || !options.some((o) => o.value === current)) {
    options.unshift({ value: current ?? '', label: ownLabel, hint: '' });
  }
  return options;
}

export function WorldStep({ draft, update, catalog, guided }: StepProps) {
  const w = draft.world;
  const set = (patch: Partial<World>) => update({ world: { ...w, ...patch } });
  return (
    <>
      {guided ? (
        <>
          <ArrowPicker
            label="Start from a world"
            options={templateOptions(catalog.worlds, draft.worldTemplateId, 'Your own world')}
            value={draft.worldTemplateId ?? ''}
            onChange={(id) => update(applyWorld(catalog, id))}
          />
          <PresetPicker
            label="Era"
            presets={uniq(catalog.worlds.map((x) => x.world.era))}
            value={w.era}
            onChange={(era) => set({ era })}
          />
          <PresetPicker
            label="Setting"
            presets={uniq(catalog.worlds.map((x) => x.world.setting))}
            value={w.setting}
            onChange={(setting) => set({ setting })}
          />
          {w.description && <p className="muted">{w.description}</p>}
          <ToggleList
            legend="Rules the storyteller follows"
            presets={uniq(catalog.worlds.flatMap((x) => x.world.rules))}
            value={w.rules}
            onChange={(rules) => set({ rules })}
          />
        </>
      ) : (
        <>
          <TextField label="Era" value={w.era} onChange={(era) => set({ era })} />
          <TextField
            label="Setting"
            required
            value={w.setting}
            onChange={(setting) => set({ setting })}
            hint="Where the story takes place."
          />
          <TextArea
            label="Description"
            value={w.description}
            rows={4}
            onChange={(description) => set({ description })}
          />
          <LinesField
            label="Rules the storyteller follows"
            value={w.rules}
            onChange={(rules) => set({ rules })}
          />
        </>
      )}
    </>
  );
}

export function CharacterStep({ draft, update, catalog, guided }: StepProps) {
  const p = draft.player;
  const set = (patch: Partial<Character>) => update({ player: { ...p, ...patch } });
  const chars = catalog.characters.map((c) => c.character);
  return (
    <>
      {guided ? (
        <>
          <ArrowPicker
            label="Start from a character"
            options={templateOptions(
              catalog.characters,
              draft.characterTemplateId,
              'Your own character',
            )}
            value={draft.characterTemplateId ?? ''}
            onChange={(id) => update(applyCharacter(catalog, id))}
          />
          <PresetPicker
            label="Name"
            presets={uniq(chars.map((c) => c.name))}
            value={p.name}
            onChange={(name) => set({ name })}
          />
          <PresetPicker
            label="Pronouns"
            presets={uniq([...PRONOUNS, ...chars.map((c) => c.pronouns)])}
            value={p.pronouns ?? ''}
            noneLabel="Not specified"
            onChange={(pronouns) => set({ pronouns })}
          />
          <PresetPicker
            label="Role"
            presets={uniq(chars.map((c) => c.role))}
            value={p.role ?? ''}
            noneLabel="No particular role"
            onChange={(role) => set({ role })}
          />
          {p.description && <p className="muted">{p.description}</p>}
          <ToggleList
            legend="Personality"
            presets={uniq(chars.flatMap((c) => c.personality))}
            value={p.personality}
            onChange={(personality) => set({ personality })}
          />
        </>
      ) : (
        <>
          <TextField label="Name" required value={p.name} onChange={(name) => set({ name })} />
          <div className="field-row">
            <TextField
              label="Pronouns"
              value={p.pronouns ?? ''}
              onChange={(pronouns) => set({ pronouns })}
            />
            <TextField label="Age" value={p.age ?? ''} onChange={(age) => set({ age })} />
            <TextField label="Role" value={p.role ?? ''} onChange={(role) => set({ role })} />
          </div>
          <TextArea
            label="Description"
            value={p.description ?? ''}
            onChange={(description) => set({ description })}
          />
          <TextArea
            label="Appearance"
            value={p.appearance ?? ''}
            rows={2}
            onChange={(appearance) => set({ appearance })}
          />
          <LinesField
            label="Personality"
            value={p.personality}
            onChange={(personality) => set({ personality })}
          />
          <LinesField label="Goals" value={p.goals} onChange={(goals) => set({ goals })} />
          <LinesField
            label="Abilities"
            value={p.abilities}
            onChange={(abilities) => set({ abilities })}
          />
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
        <legend>Others in the story</legend>
        {draft.npcs.length === 0 && <p className="muted small">Nobody else yet.</p>}
        <ul className="npc-list">
          {draft.npcs.map((c, i) => (
            <li key={c.id} className="npc-card">
              {guided ? (
                <span>
                  <strong>{c.name || 'Unnamed'}</strong>
                  {c.role && <span className="muted">, {c.role}</span>}
                </span>
              ) : (
                <div className="field-row">
                  <TextField
                    label="Name"
                    required
                    value={c.name}
                    onChange={(name) => setNpc(i, { name })}
                  />
                  <TextField
                    label="Pronouns"
                    value={c.pronouns ?? ''}
                    onChange={(pronouns) => setNpc(i, { pronouns })}
                  />
                  <TextField
                    label="Age"
                    value={c.age ?? ''}
                    onChange={(age) => setNpc(i, { age })}
                  />
                  <TextField
                    label="Role"
                    value={c.role ?? ''}
                    onChange={(role) => setNpc(i, { role })}
                  />
                </div>
              )}
              {!guided && (
                <TextArea
                  label="Description"
                  rows={2}
                  value={c.description ?? ''}
                  onChange={(description) => setNpc(i, { description })}
                />
              )}
              <button
                type="button"
                className="danger-link"
                aria-label={`Remove ${c.name || 'this character'}`}
                onClick={() => remove(c.id)}
              >
                Remove
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
            Add a character
          </button>
        )}
      </fieldset>
      {guided && extras.length > 0 && (
        <fieldset className="field toggle-list">
          <legend>Bring in a preset character</legend>
          {extras.map((t) => {
            const on = draft.npcs.some((c) => c.id === t.character.id);
            return (
              <label key={t.id} className="check">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) =>
                    e.target.checked
                      ? update({
                          npcs: [...draft.npcs, { ...copy(t.character), control: 'npc' }],
                        })
                      : remove(t.character.id)
                  }
                />
                <span>
                  {t.character.name}
                  {t.character.role && <span className="muted">, {t.character.role}</span>}
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
      <legend>Chapter plan (optional)</legend>
      <p className="muted small">
        Used when you start the next chapter. Chapters without a plan get a plain title.
      </p>
      <ol className="outline-list">
        {value.map((c, i) => (
          <li key={i} className="field-row">
            <TextField
              label={`Chapter ${i + 1} title`}
              value={c.title}
              onChange={(title) => set(i, { title })}
            />
            <TextField
              label="What happens"
              value={c.outline}
              onChange={(outline) => set(i, { outline })}
            />
            <button
              type="button"
              className="danger-link"
              aria-label={`Remove chapter ${i + 1}`}
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="add-button"
        onClick={() => onChange([...value, { title: '', outline: '' }])}
      >
        Add a chapter
      </button>
    </fieldset>
  );
}

export function StoryStep(props: StepProps) {
  const { draft, update, catalog, guided } = props;
  const options = fittingScenarios(catalog, draft.worldTemplateId);
  const current = draft.scenarioTemplateId;
  const offWorld = current !== null && !options.some((s) => s.id === current);
  const pickerOptions = templateOptions(options, current, 'Your own story');
  if (offWorld) {
    const s = catalog.scenarios.find((x) => x.id === current);
    pickerOptions[0] = {
      value: current,
      label: `${s?.label ?? 'Current story'} (written for another world)`,
      hint: '',
    };
  }
  return (
    <>
      {guided ? (
        <>
          <ArrowPicker
            label="Start from a scenario"
            options={pickerOptions}
            value={current ?? ''}
            onChange={(id) => update(applyScenario(catalog, id))}
          />
          <dl className="facts">
            <dt>Title</dt>
            <dd>{draft.title || '(not set)'}</dd>
            <dt>Opens at</dt>
            <dd>{draft.scene.location || '(not set)'}</dd>
            {draft.scene.summary && (
              <>
                <dt>Scene</dt>
                <dd>{draft.scene.summary}</dd>
              </>
            )}
            <dt>First chapter</dt>
            <dd>{draft.firstChapterTitle || '(not set)'}</dd>
          </dl>
        </>
      ) : (
        <>
          <TextField
            label="Title"
            required
            value={draft.title}
            onChange={(title) => update({ title })}
          />
          <TextArea
            label="Description"
            value={draft.description}
            rows={2}
            onChange={(description) => update({ description })}
          />
          <TextField
            label="Starting location"
            required
            value={draft.scene.location}
            onChange={(location) => update({ scene: { ...draft.scene, location } })}
            hint="Where you are when the story begins."
          />
          <TextArea
            label="Opening scene"
            value={draft.scene.summary}
            onChange={(summary) => update({ scene: { ...draft.scene, summary } })}
            hint="What is happening as the story begins. The storyteller picks up from here."
          />
          <TextField
            label="First chapter title"
            required
            value={draft.firstChapterTitle}
            onChange={(firstChapterTitle) => update({ firstChapterTitle })}
          />
          <LinesField
            label="Open questions"
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
      <ArrowPicker
        label="Narration"
        options={PERSPECTIVES}
        value={n.perspective}
        onChange={(perspective) => set({ perspective })}
      />
      <ArrowPicker
        label="Detail"
        options={DETAILS}
        value={n.detail}
        onChange={(detail) => set({ detail })}
      />
      <ArrowPicker
        label="Pacing"
        options={PACINGS}
        value={n.pacing}
        onChange={(pacing) => set({ pacing })}
      />
      {guided ? (
        <PresetPicker
          label="Tone"
          presets={uniq(catalog.worlds.map((w) => w.narration.tone))}
          value={n.tone}
          onChange={(tone) => set({ tone })}
        />
      ) : (
        <TextField
          label="Tone"
          value={n.tone}
          onChange={(tone) => set({ tone })}
          placeholder="Warm, gently mysterious"
        />
      )}
      <h2>What kind of story</h2>
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
  const g = uniq(genres ?? []).join(', ');
  const r = rating ? RATING_LABELS[rating] : '';
  return [g, r].filter(Boolean).join(' · ');
}

const STEP_NAMES: Record<DraftStep, string> = {
  world: 'World',
  character: 'You',
  story: 'Story',
  narration: 'Narration',
  review: 'Review',
};

export function ReviewStep({
  draft,
  problems,
  onGoTo,
}: {
  draft: CreateStoryDraft;
  problems: DraftProblem[] | null;
  onGoTo: (step: DraftStep) => void;
}) {
  const others = draft.npcs.map((c) => c.name || 'Unnamed').join(', ');
  return (
    <>
      {problems && problems.length > 0 && (
        <div className="problems" role="alert">
          <p>Fix these before creating the story:</p>
          <ul>
            {problems.map((p, i) => (
              <li key={i}>
                {p.message}{' '}
                {p.step !== 'review' && (
                  <button type="button" className="link-button" onClick={() => onGoTo(p.step)}>
                    Go to {STEP_NAMES[p.step]}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <dl className="facts" aria-label="Story summary">
        <dt>Title</dt>
        <dd>{draft.title || '(not set)'}</dd>
        <dt>World</dt>
        <dd>
          {draft.world.setting || '(not set)'}
          {draft.world.era && <span className="muted"> · {draft.world.era}</span>}
        </dd>
        <dt>You play</dt>
        <dd>
          {draft.player.name || '(not set)'}
          {draft.player.role && `, ${draft.player.role}`}
          {draft.player.pronouns && <span className="muted"> ({draft.player.pronouns})</span>}
        </dd>
        <dt>Also here</dt>
        <dd>{others || 'Nobody else yet'}</dd>
        <dt>Opens at</dt>
        <dd>{draft.scene.location || '(not set)'}</dd>
        <dt>First chapter</dt>
        <dd>{draft.firstChapterTitle || '(not set)'}</dd>
        <dt>Narration</dt>
        <dd>
          {PERSPECTIVES.find((p) => p.value === draft.narration.perspective)?.label} ·{' '}
          {DETAILS.find((d) => d.value === draft.narration.detail)?.label}
          {draft.narration.tone && ` · ${draft.narration.tone}`}
        </dd>
        <dt>Kind of story</dt>
        <dd>{storyKind(draft.narration.genres, draft.narration.rating) || 'Not set'}</dd>
        {(draft.narration.themes ?? []).some((t) => t.trim()) && (
          <>
            <dt>Themes</dt>
            <dd>{uniq(draft.narration.themes ?? []).join(', ')}</dd>
          </>
        )}
        {(draft.narration.limits ?? []).some((t) => t.trim()) && (
          <>
            <dt>Hard limits</dt>
            <dd>{uniq(draft.narration.limits ?? []).join(', ')}</dd>
          </>
        )}
      </dl>
      <p className="muted small">
        Once you create it, this becomes the story&apos;s starting point. Your choices here are kept
        until then, even if you close the app.
      </p>
    </>
  );
}

export { STEP_NAMES };

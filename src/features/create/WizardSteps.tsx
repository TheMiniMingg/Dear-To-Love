import { useId } from 'react';
import { Swords } from 'lucide-react';
import { ArrowPicker, type PickerOption } from '../../components/ArrowPicker';
import type {
  Character,
  CharacterTemplate,
  ChapterOutlineInput,
  ContentRating,
  CreateStoryDraft,
  DraftProblem,
  DraftStep,
  Narration,
  Relationship,
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
  ComboField,
  LinesField,
  MoreOptions,
  MultiPicker,
  StatsField,
  TextArea,
  TextField,
  countFilled,
  uniq,
} from './fields';
import { ERAS, PERSONALITIES, RACES, ROLES, RULES, SETTINGS } from './presets';
import { RulesField } from './RulesField';
import {
  DETAILS,
  DICE_STORY_TYPES,
  DiceSettings,
  FeatureFields,
  PERSPECTIVES,
  STYLES,
  StylePicker,
  TellingFields,
  appStoryLanguage,
  featureList,
  labelOf,
  storyLanguageLabel,
  tellingOf,
} from './StyleFields';
import { BACKGROUND_SLOT, COVER_SLOT, livePictures, portraitOf } from './PicturesStep';
import { BringCharacter, personFields, type Brought, type FilledFromCard } from './BringCharacter';
import { TrackingFields, defaultTracking, trackingSummary } from './TrackingFields';
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

/** A card's scenario and first message, for the story fields still empty. */
function storyFromCard(draft: CreateStoryDraft, b: Brought): Partial<CreateStoryDraft> {
  const patch: Partial<CreateStoryDraft> = {};
  if (b.scenario && !draft.description.trim()) patch.description = b.scenario;
  if (b.greeting && !draft.scene.summary.trim())
    patch.scene = { ...draft.scene, summary: b.greeting };
  return patch;
}

const filledFrom = (patch: Partial<CreateStoryDraft>): FilledFromCard => ({
  about: patch.description !== undefined,
  opening: patch.scene !== undefined,
});

/** A brought card's picture as the portrait in `slot`. */
function withPortrait(
  draft: CreateStoryDraft,
  slot: string,
  b: Brought,
): Partial<CreateStoryDraft> {
  if (!b.portrait) return {};
  const { assetId, storyOnly } = b.portrait;
  return {
    pictures: [...(draft.pictures ?? []).filter((p) => p.slot !== slot), { slot, assetId }],
    ...(storyOnly ? { storyImages: [...new Set([...(draft.storyImages ?? []), assetId])] } : {}),
  };
}

/** Someone brought in, as a fresh character with `id` and `control`. */
const broughtPerson = (b: Brought, id: string, control: Character['control']): Character => ({
  ...personFields(b.character),
  id,
  control,
});

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
    : // None: the world it filled in goes; how the story is told stays.
      { worldTemplateId: null, world: { era: '', setting: '', description: '', rules: [] } };
}

/**
 * Fill the story section (scene, others, chapters) from a template. A
 * scenario written as an adventure also brings its bars and items; moving
 * off it drops them again unless you had changed them.
 */
export function applyScenario(
  catalog: TemplateCatalog,
  id: string,
  current?: Pick<CreateStoryDraft, 'scenarioTemplateId' | 'tracking'>,
): Partial<CreateStoryDraft> {
  const s = catalog.scenarios.find((x) => x.id === id);
  const before = catalog.scenarios.find((x) => x.id === current?.scenarioTemplateId);
  const untouched =
    before?.tracking !== undefined &&
    JSON.stringify(before.tracking) === JSON.stringify(current?.tracking);
  const tracking = s?.tracking
    ? { tracking: copy(s.tracking) }
    : untouched
      ? { tracking: undefined }
      : {};
  if (!s) {
    // None: what the scenario filled in goes.
    return {
      scenarioTemplateId: null,
      ...tracking,
      title: '',
      description: '',
      scene: { location: '', summary: '' },
      npcs: [],
      relationships: [],
      openThreads: [],
      firstChapterTitle: '',
      chapterOutlines: [],
    };
  }
  return {
    ...tracking,
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
    : { characterTemplateId: null, player: blankPlayer() };
}

const blankPlayer = (): Character => ({
  id: '',
  name: '',
  control: 'player',
  personality: [],
  goals: [],
  abilities: [],
});

/**
 * The same draft with every field emptied, for Custom mode: no world,
 * character or scenario preset, nothing written in, and the usual way of
 * telling it (mixed styles, cards and headings) until changed.
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
      style: 'mixed',
      // Mixed uses thoughts and messages where they fit, so both start on.
      innerThoughts: true,
      messageCards: true,
      sceneHeadings: true,
      language: appStoryLanguage(),
    },
    player: blankPlayer(),
    npcs: [],
    relationships: [],
    scene: { location: '', summary: '' },
    openThreads: [],
    firstChapterTitle: '',
    chapterOutlines: [],
    pictures: [],
    storyType: undefined,
    tracking: undefined,
  };
}

export function fittingScenarios(catalog: TemplateCatalog, worldId: string | null) {
  return catalog.scenarios.filter(
    (s) => !worldId || s.worlds.length === 0 || s.worlds.includes(worldId),
  );
}

/**
 * The preset characters for a world: the ones made for it first, then the
 * ones who fit anywhere, then the rest. Any character can still go anywhere.
 */
export function charactersFor(catalog: TemplateCatalog, worldId: string | null) {
  if (!worldId) return catalog.characters;
  const rank = (c: CharacterTemplate) =>
    c.suits.includes(worldId) ? 0 : c.suits.length === 0 ? 1 : 2;
  return [...catalog.characters].sort((a, b) => rank(a) - rank(b));
}

/** Whether a preset character suits a world (or every world). */
export function suits(c: CharacterTemplate, worldId: string) {
  return c.suits.length === 0 || c.suits.includes(worldId);
}

/** The presets, with "None" first so a preset can always be taken back. */
function templateOptions<T extends { id: string; label: string; summary: string }>(
  list: T[],
  current: string | null,
  noneHint: string,
): PickerOption<string>[] {
  const options = list.map((x) => ({ value: x.id, label: x.label, hint: x.summary }));
  if (current && !options.some((o) => o.value === current)) {
    options.unshift({ value: current, label: t('Your own'), hint: '' });
  }
  options.unshift({ value: '', label: t('None (start blank)'), hint: noneHint });
  return options;
}

/** The story's kind, typed or picked; in Guided it also moves to a fitting world. */
function StoryTypeField({ draft, update, catalog, guided }: StepProps) {
  const storyType = draft.storyType ?? '';
  return (
    <ComboField
      label={t('Type of story')}
      options={STORY_TYPES}
      translate
      value={storyType}
      placeholder={t('Any: type your own or pick one')}
      hint={t('Romance, horror, a cozy mystery… anything works.')}
      onChange={(type) => {
        const patch: Partial<CreateStoryDraft> = { storyType: type || undefined };
        if (guided) {
          // Move to a world of that type when the current one isn't.
          const next = catalog.worlds.filter((x) => worldFits(x.narration.genres, type));
          const current = catalog.worlds.find((x) => x.id === draft.worldTemplateId);
          if (current && next.length > 0 && !next.includes(current)) {
            Object.assign(patch, applyWorld(catalog, next[0]!.id, draft.narration));
          }
          // Adventures, fantasy and school stories start in RPG mode; you can turn it off.
          const dice = DICE_STORY_TYPES.includes(type);
          patch.narration = { ...(patch.narration ?? draft.narration), dice: dice || undefined };
          if (dice && !draft.tracking) {
            patch.tracking = defaultTracking(withStoryType(draft.narration.genres, type));
          }
        }
        update(patch);
      }}
    />
  );
}

/**
 * RPG mode: stats, dice, health, mana and items. Off, the story has no
 * numbers. Its stats and bars are set up under You.
 */
function RpgModeField({ draft, update, guided }: StepProps) {
  const id = useId();
  const n = draft.narration;
  const on = !!n.dice;
  const toggle = (next: boolean) => {
    const genres = withStoryType(n.genres, draft.storyType ?? '');
    update({
      narration: { ...n, dice: next || undefined },
      // Something to fill in under You; Guided starts with the usual bars.
      // Off, the story has no numbers: its bars and items go too.
      tracking: next
        ? (draft.tracking ??
          (guided ? defaultTracking(genres) : { meters: [], inventory: true, items: [] }))
        : undefined,
    });
  };
  return (
    <div className="field rpg-mode">
      <label className="check switch">
        <input
          type="checkbox"
          role="switch"
          checked={on}
          aria-describedby={`${id}-hint`}
          onChange={(e) => toggle(e.target.checked)}
        />
        <Swords aria-hidden={true} size={17} />
        {t('RPG mode')}
      </label>
      <p id={`${id}-hint`} className="muted small check-hint">
        {on
          ? t(
              'On: you set your stats, health, mana and items under You, and the app rolls dice for risky moments.',
            )
          : t(
              'Stats, dice rolls, health, mana and items, like a tabletop game. Leave it off for a story without numbers.',
            )}
      </p>
      {on && (
        <DiceSettings
          rules={n.diceRules}
          onChange={(diceRules) => update({ narration: { ...n, diceRules } })}
        />
      )}
    </div>
  );
}

export function WorldStep(props: StepProps) {
  const { draft, update, catalog, guided } = props;
  const w = draft.world;
  const set = (patch: Partial<World>) => update({ world: { ...w, ...patch } });
  const storyType = draft.storyType ?? '';
  const fitting = catalog.worlds.filter((x) => worldFits(x.narration.genres, storyType));
  const worlds = fitting.length > 0 ? fitting : catalog.worlds;
  return (
    <>
      <StoryTypeField {...props} />
      {guided && storyType && fitting.length === 0 && (
        <p className="muted small">
          {t(
            'No preset world is tagged {type} yet, so every world is listed. The story is still a {type} story.',
            { type: t(storyType) },
          )}
        </p>
      )}
      {guided && (
        <ArrowPicker
          label={t('Start from a world')}
          options={templateOptions(
            worlds,
            draft.worldTemplateId,
            t('Write your own world below, or leave it open.'),
          )}
          value={draft.worldTemplateId ?? ''}
          onChange={(id) => update(applyWorld(catalog, id, draft.narration))}
        />
      )}
      <ComboField
        label={t('Setting')}
        options={uniq([...catalog.worlds.map((x) => x.world.setting), ...SETTINGS])}
        value={w.setting}
        placeholder={t('Where it takes place: type your own or pick one')}
        hint={t('Leave it empty and the story finds its own place.')}
        onChange={(setting) => set({ setting })}
      />
      <ComboField
        label={t('Era')}
        options={uniq([...ERAS, ...catalog.worlds.map((x) => x.world.era)])}
        value={w.era}
        placeholder={t('When it takes place: type your own or pick one')}
        onChange={(era) => set({ era })}
      />
      <RpgModeField {...props} />
      <MoreOptions filled={countFilled(w.description, w.rules)}>
        <TextArea
          label={t('About this world')}
          value={w.description}
          rows={4}
          hint={t(
            'History, magic, technology, the mood of the place: anything the storyteller should know.',
          )}
          onChange={(description) => set({ description })}
        />
        <RulesField
          label={t('Rules the storyteller follows')}
          presets={uniq([...RULES, ...catalog.worlds.flatMap((x) => x.world.rules)])}
          value={w.rules}
          hint={t('Things that are always true here. Pick from the list or write your own.')}
          onChange={(rules) => set({ rules })}
        />
      </MoreOptions>
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

/**
 * Age, role, species, about, looks, personality, goals and abilities: the
 * same fields for you and for everyone else.
 */
function PersonDetails({
  c,
  set,
  catalog,
  you,
}: {
  c: Character;
  set: (patch: Partial<Character>) => void;
  catalog: TemplateCatalog;
  /** The player's own character (asks "about you"). */
  you: boolean;
}) {
  return (
    <>
      <div className="field-row">
        <TextField label={t('Age')} value={c.age ?? ''} onChange={(age) => set({ age })} />
        <ComboField
          label={t('Race or species')}
          options={raceOptions(catalog)}
          value={c.species ?? ''}
          placeholder={t('Leave empty if it does not matter')}
          onChange={(species) => set({ species: species || undefined })}
        />
      </div>
      <TextArea
        label={you ? t('About you') : t('About them')}
        value={c.description ?? ''}
        rows={3}
        hint={
          you
            ? t('Your story so far, what you want, what you hide.')
            : t('Their story so far, what they want, what they hide.')
        }
        onChange={(description) => set({ description })}
      />
      <MultiPicker
        label={t('Personality')}
        presets={personalityOptions(catalog)}
        value={c.personality}
        onChange={(personality) => set({ personality })}
      />
      <LinesField
        label={t('Goals')}
        value={c.goals}
        rows={3}
        onChange={(goals) => set({ goals })}
      />
      <LinesField
        label={t('Abilities')}
        value={c.abilities}
        rows={3}
        onChange={(abilities) => set({ abilities })}
      />
    </>
  );
}

const personFilled = (c: Character) =>
  countFilled(c.age, c.species, c.description, c.personality, c.goals, c.abilities);

export function CharacterStep({ draft, update, catalog, guided }: StepProps) {
  const p = draft.player;
  const set = (patch: Partial<Character>) => update({ player: { ...p, ...patch } });
  const rpg = !!draft.narration.dice;
  return (
    <>
      {guided && (
        <ArrowPicker
          label={t('Start from a character')}
          options={templateOptions(
            charactersFor(catalog, draft.worldTemplateId),
            draft.characterTemplateId,
            t('Make your own character below.'),
          )}
          value={draft.characterTemplateId ?? ''}
          onChange={(id) => update(applyCharacter(catalog, id))}
        />
      )}
      <BringCharacter
        forYou
        playerName=""
        onBring={(b) => {
          const story = storyFromCard(draft, b);
          update({
            ...story,
            ...withPortrait(draft, portraitOf(PLAYER), b),
            characterTemplateId: null,
            player: broughtPerson(b, p.id, p.control),
          });
          return filledFrom(story);
        }}
      />
      <div className="field-row">
        <ComboField
          label={t('Name')}
          required
          options={guided ? uniq(catalog.characters.map((c) => c.character.name)) : []}
          value={p.name}
          placeholder={t('Your name')}
          onChange={(name) => set({ name })}
        />
        <ComboField
          label={t('Pronouns')}
          options={uniq([...PRONOUNS, ...catalog.characters.map((c) => c.character.pronouns)])}
          value={p.pronouns ?? ''}
          placeholder={t('Not specified')}
          onChange={(pronouns) => set({ pronouns: pronouns || undefined })}
        />
        <ComboField
          label={t('Role')}
          options={roleOptions(catalog)}
          value={p.role ?? ''}
          placeholder={t('No particular role')}
          onChange={(role) => set({ role: role || undefined })}
        />
      </div>
      <TextArea
        label={t('Appearance')}
        value={p.appearance ?? ''}
        rows={3}
        hint={t('How you look, if it matters. Leave it empty and it stays open.')}
        onChange={(appearance) => set({ appearance })}
      />
      {rpg && (
        <section className="rpg-section" aria-labelledby="rpg-you">
          <h3 id="rpg-you" className="small-heading">
            <Swords aria-hidden={true} size={16} /> {t('RPG mode')}
          </h3>
          <StatsField value={p.stats ?? []} onChange={(stats) => set({ stats })} />
          <h4 className="small-heading">{t('Health, mana and items')}</h4>
          <TrackingFields
            alwaysOn
            tracking={draft.tracking}
            onChange={(tracking) => update({ tracking })}
            genres={withStoryType(draft.narration.genres, draft.storyType ?? '')}
          />
        </section>
      )}
      <MoreOptions filled={personFilled(p)}>
        <PersonDetails c={p} set={set} catalog={catalog} you />
      </MoreOptions>
    </>
  );
}

function nextNpcId(npcs: Character[]): string {
  for (let n = 1; ; n++) {
    const id = `custom:npc-${n}`;
    if (!npcs.some((c) => c.id === id)) return id;
  }
}

/** How someone knows the player: their relationship's label, '' for none. */
function toYou(relationships: Relationship[], id: string): string {
  return (
    relationships.find(
      (r) => (r.fromId === id && r.toId === PLAYER) || (r.fromId === PLAYER && r.toId === id),
    )?.label ?? ''
  );
}

function withToYou(relationships: Relationship[], id: string, label: string): Relationship[] {
  const i = relationships.findIndex(
    (r) => (r.fromId === id && r.toId === PLAYER) || (r.fromId === PLAYER && r.toId === id),
  );
  if (!label.trim()) return i < 0 ? relationships : relationships.filter((_, j) => j !== i);
  if (i < 0) return [...relationships, { fromId: id, toId: PLAYER, label, status: '' }];
  return relationships.map((r, j) => (j === i ? { ...r, label } : r));
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
        <p className="muted small">
          {t('Optional. The storyteller brings in new people as the story needs them.')}
        </p>
        <ul className="npc-list">
          {draft.npcs.map((c, i) => (
            <li key={c.id} className="npc-card">
              <div className="field-row">
                <TextField
                  label={t('Name')}
                  required
                  value={c.name}
                  onChange={(name) => setNpc(i, { name })}
                />
                <ComboField
                  label={t('Role')}
                  options={roleOptions(catalog)}
                  value={c.role ?? ''}
                  placeholder={t('No particular role')}
                  onChange={(role) => setNpc(i, { role: role || undefined })}
                />
                <TextField
                  label={t('How they know you')}
                  value={toYou(draft.relationships, c.id)}
                  placeholder={t('Best friend, rival, new neighbor…')}
                  onChange={(label) =>
                    update({ relationships: withToYou(draft.relationships, c.id, label) })
                  }
                />
              </div>
              <MoreOptions filled={personFilled(c) + countFilled(c.pronouns, c.appearance)}>
                <div className="field-row">
                  <ComboField
                    label={t('Pronouns')}
                    options={PRONOUNS}
                    value={c.pronouns ?? ''}
                    placeholder={t('Not specified')}
                    onChange={(pronouns) => setNpc(i, { pronouns: pronouns || undefined })}
                  />
                </div>
                <TextArea
                  label={t('Appearance')}
                  value={c.appearance ?? ''}
                  rows={2}
                  onChange={(appearance) => setNpc(i, { appearance })}
                />
                <PersonDetails
                  c={c}
                  set={(patch) => setNpc(i, patch)}
                  catalog={catalog}
                  you={false}
                />
              </MoreOptions>
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
        <BringCharacter
          forYou={false}
          playerName={draft.player.name}
          onBring={(b) => {
            const id = nextNpcId(draft.npcs);
            const story = storyFromCard(draft, b);
            update({
              ...story,
              ...withPortrait(draft, portraitOf(id), b),
              npcs: [...draft.npcs, broughtPerson(b, id, 'npc')],
            });
            return filledFrom(story);
          }}
        />
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
        {t(
          'A rough guide for where the story could go. If the story heads somewhere else, the storyteller follows the story instead, and you can rename each next chapter when one ends.',
        )}
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
  const pickerOptions = templateOptions(
    options,
    current,
    t('Write your own opening below, or leave it to the storyteller.'),
  );
  if (offWorld) {
    const s = catalog.scenarios.find((x) => x.id === current);
    const i = pickerOptions.findIndex((o) => o.value === current);
    pickerOptions[i] = {
      value: current,
      label: t('{name} (written for another world)', { name: s?.label ?? t('Current story') }),
      hint: '',
    };
  }
  return (
    <>
      {guided && (
        <ArrowPicker
          label={t('Start from a scenario')}
          options={pickerOptions}
          value={current ?? ''}
          onChange={(id) => update(applyScenario(catalog, id, draft))}
        />
      )}
      <TextField
        label={t('Title')}
        value={draft.title}
        placeholder={t('Untitled story')}
        onChange={(title) => update({ title })}
      />
      <TextField
        label={t('Starting location')}
        value={draft.scene.location}
        onChange={(location) => update({ scene: { ...draft.scene, location } })}
        hint={t('Where you are when the story begins. Leave it empty and the storyteller picks.')}
      />
      <TextArea
        label={t('Opening scene')}
        value={draft.scene.summary}
        rows={4}
        onChange={(summary) => update({ scene: { ...draft.scene, summary } })}
        hint={t('What is happening as the story begins. The storyteller picks up from here.')}
      />
      <OthersEditor {...props} />
      <MoreOptions
        filled={
          countFilled(draft.description, draft.openThreads) +
          (draft.firstChapterTitle.trim() ? 1 : 0) +
          (draft.chapterOutlines.length ? 1 : 0)
        }
      >
        <TextArea
          label={t('What the story is about')}
          value={draft.description}
          rows={3}
          hint={t('A line or two for the library and the storyteller.')}
          onChange={(description) => update({ description })}
        />
        <TextField
          label={t('First chapter title')}
          value={draft.firstChapterTitle}
          placeholder={t('Chapter {n}', { n: 1 })}
          onChange={(firstChapterTitle) => update({ firstChapterTitle })}
        />
        <LinesField
          label={t('Threads to follow')}
          value={draft.openThreads}
          rows={3}
          hint={t('Mysteries, promises and goals to follow up. One per line.')}
          onChange={(openThreads) => update({ openThreads })}
        />
        <OutlinesEditor
          value={draft.chapterOutlines}
          onChange={(chapterOutlines) => update({ chapterOutlines })}
        />
      </MoreOptions>
    </>
  );
}

export function NarrationStep({ draft, update, catalog, guided }: StepProps) {
  const n = draft.narration;
  const set = (patch: Partial<typeof n>) => update({ narration: { ...n, ...patch } });
  const rpg = !!n.dice;
  return (
    <>
      <StylePicker narration={n} onChange={set} />
      <MoreOptions
        label={t('More ways to shape it')}
        filled={countFilled(n.tone, n.themes, n.limits) + (n.rating ? 1 : 0)}
      >
        <ComboField
          label={t('Tone')}
          options={uniq(catalog.worlds.map((w) => w.narration.tone))}
          value={n.tone}
          placeholder={t('Warm, gently mysterious')}
          onChange={(tone) => set({ tone })}
        />
        <TellingFields narration={n} onChange={set} typeLanguage={!guided} />
        <h3 className="small-heading">{t('Features')}</h3>
        <FeatureFields narration={n} onChange={set} dice={false} />
        {!rpg && (
          <TrackingFields
            tracking={draft.tracking}
            onChange={(tracking) => update({ tracking })}
            genres={withStoryType(n.genres, draft.storyType ?? '')}
          />
        )}
        <h3 className="small-heading">{t('What kind of story')}</h3>
        <ContentFields
          narration={n}
          onChange={set}
          pickGenres={false}
          genrePresets={catalog.worlds.flatMap((w) => w.narration.genres ?? [])}
        />
      </MoreOptions>
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

/**
 * Why a draft can't become a story yet. The app's core sends these in
 * English; the ones with a name in them are matched here.
 */
const PROBLEMS: (string | [RegExp, string])[] = [
  msg('Give your character a name.'),
  msg('Every other character needs a name.'),
  msg('Your character must be 18 or older in an adults-only story.'),
  [
    /^this draft was made by a different version of the app; start over$/,
    msg('This draft was made by a different version of the app. Start over.'),
  ],
  [
    /^(?<name>.+) is in the story twice\. Remove one\.$/,
    msg('{name} is in the story twice. Remove one.'),
  ],
  [
    /^(?<name>.+) is also your character\. Remove them from the story or choose a different character to play\.$/,
    msg(
      '{name} is also your character. Remove them from the story or choose a different character to play.',
    ),
  ],
  [
    /^(?<name>.+) must be 18 or older in an adults-only story\. Change their age or remove them\.$/,
    msg('{name} must be 18 or older in an adults-only story. Change their age or remove them.'),
  ],
  [
    /^The relationship "(?<label>.*)" refers to a character who is no longer in the story\.$/,
    msg('The relationship "{label}" refers to a character who is no longer in the story.'),
  ],
  [
    /^Your character's id "(?<id>.*)" must look like namespace:name\.$/,
    msg('Your character\'s id "{id}" must look like namespace:name.'),
  ],
  [
    /^(?<name>.*)'s id "(?<id>.*)" must look like namespace:name\.$/,
    msg('{name}\'s id "{id}" must look like namespace:name.'),
  ],
];

/** A draft problem in the chosen language. */
export function problemText(message: string): string {
  for (const p of PROBLEMS) {
    if (typeof p === 'string') {
      if (p === message) return t(p);
      continue;
    }
    const m = p[0].exec(message);
    if (m) return t(p[1], m.groups);
  }
  return tKnown(message);
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
                {problemText(p.message)}{' '}
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
        <dd>{draft.title.trim() || t('Untitled story')}</dd>
        <dt>{t('World')}</dt>
        <dd>
          {draft.world.setting || t('Left open')}
          {draft.world.era && <span className="muted"> · {draft.world.era}</span>}
        </dd>
        <dt>{t('You play')}</dt>
        <dd>
          {draft.player.name || t('(not set)')}
          {(draft.player.species || draft.player.role) &&
            `, ${[draft.player.species, draft.player.role].filter(Boolean).join(' ')}`}
          {draft.player.pronouns && <span className="muted"> ({draft.player.pronouns})</span>}
          {draft.narration.dice && (draft.player.stats ?? []).some((st) => st.name.trim()) && (
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
        <dd>{draft.scene.location || t('Left open')}</dd>
        <dt>{t('First chapter')}</dt>
        <dd>{draft.firstChapterTitle.trim() || t('Chapter {n}', { n: 1 })}</dd>
        <dt>{t('Narration')}</dt>
        <dd>
          {labelOf(STYLES, draft.narration.style ?? 'narrated')} ·{' '}
          {labelOf(PERSPECTIVES, draft.narration.perspective)} ·{' '}
          {labelOf(DETAILS, draft.narration.detail)}
          {draft.narration.tone && ` · ${draft.narration.tone}`}
          {draft.narration.language &&
            ` · ${t('in {language}', { language: storyLanguageLabel(draft.narration.language) })}`}
          {draft.narration.styleNotes?.trim() && (
            <span className="muted"> · “{draft.narration.styleNotes.trim()}”</span>
          )}
        </dd>
        <dt>{t('Features')}</dt>
        <dd>{joinList(featureList(draft.narration)) || t('(none)')}</dd>
        {draft.tracking && (
          <>
            <dt>{t('Tracking')}</dt>
            <dd>{trackingSummary(draft.tracking) || t('(none)')}</dd>
          </>
        )}
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
          "Once you create it, this becomes the story's starting point. Anything left open is for the story to decide. Your choices here are kept until then, even if you close the app.",
        )}
      </p>
    </>
  );
}

export { STEP_NAMES };

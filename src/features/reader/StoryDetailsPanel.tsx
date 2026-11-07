import { useId, useState } from 'react';
import { BookOpenText, Globe, ListChecks, MapPin, Users, type LucideIcon } from 'lucide-react';
import { commands, errorMessage } from '../../api/commands';
import { ArrowPicker } from '../../components/ArrowPicker';
import type { Character, EventDto, RouteView, StoryStateV1 } from '../../types';
import { ContentFields } from '../create/ContentFields';
import { LinesField, StatsField, TextArea, TextField } from '../create/fields';
import { FeatureFields, StyleFields } from '../create/StyleFields';
import { TrackingFields } from '../create/TrackingFields';
import { diffState, editProblems, summarize, type ChangeLine } from './stateDiff';
import { msg, t, tr } from '../../i18n';
import { chapterHasTitle, routeName } from '../../i18n/names';
import { plainText } from './messages';
import { castColors, NAME_COLORS, nameStyle } from './nameColors';
import { Thumb } from '../images/ImageGrid';
import { picture, portraitSlot } from './pictures';
import { FeelingFields, towardsPlayer, withFeeling } from './feelings';

export type DetailsTab = 'characters' | 'world' | 'narration' | 'scene' | 'facts';
type Tab = DetailsTab;
const TABS: [Tab, string, LucideIcon][] = [
  ['characters', msg('Characters'), Users],
  ['world', msg('World'), Globe],
  ['narration', msg('Narration'), BookOpenText],
  ['scene', msg('Scene'), MapPin],
  ['facts', msg('Facts'), ListChecks],
];
const copy = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function excerpt(text: string, n = 80): string {
  const s = text.replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Plain words for the event the change takes effect after. */
export function effectivePoint(e: EventDto | undefined, playerName: string): string {
  if (!e) return t('the start of the story');
  switch (e.kind) {
    case 'chapter_start':
      return chapterHasTitle(e.payload.ordinal, e.payload.title)
        ? t('the start of Chapter {n}: {title}', { n: e.payload.ordinal, title: e.payload.title })
        : t('the start of Chapter {n}', { n: e.payload.ordinal });
    case 'assistant':
      return t('the latest reply ("{text}")', { text: excerpt(plainText(e.payload.text)) });
    case 'player':
      return t('{name}\'s action ("{text}")', {
        name: playerName,
        text: excerpt(plainText(e.payload.text)),
      });
    case 'edit':
      return t('your last change to the story details');
    case 'fact_confirm':
      return t('the last confirmed fact');
    case 'checkpoint':
      return t('checkpoint {label}', { label: e.payload.label });
  }
}

function unusedId(prefix: string, taken: (id: string) => boolean): string {
  for (let n = 1; ; n++) {
    const id = `${prefix}${n}`;
    if (!taken(id)) return id;
  }
}

const COLOR_NAMES = [
  msg('Rose'),
  msg('Violet'),
  msg('Indigo'),
  msg('Sky'),
  msg('Teal'),
  msg('Green'),
  msg('Amber'),
  msg('Orange'),
  msg('Cocoa'),
  msg('Plum'),
];

/**
 * The colour of a character's name in the story: picked from the name
 * unless you choose one.
 */
function NameColorField({
  value,
  auto,
  onChange,
}: {
  value: string | undefined;
  /** The colour picked for them, or null for the theme's accent. */
  auto: string | null;
  onChange: (color: string | undefined) => void;
}) {
  const id = useId();
  const own = value?.toLowerCase();
  const custom = own && !NAME_COLORS.some((x) => x === own) ? own : undefined;
  return (
    <fieldset className="field name-colors" aria-describedby={`${id}-hint`}>
      <legend>{t('Name color')}</legend>
      <div className="swatches">
        <label className="swatch swatch-auto" title={t('Automatic')}>
          <input
            type="radio"
            name={id}
            checked={!own}
            onChange={() => onChange(undefined)}
            aria-label={t('Automatic')}
          />
          <span className="swatch-dot" style={nameStyle(auto)} aria-hidden="true">
            A
          </span>
        </label>
        {NAME_COLORS.map((color, i) => (
          <label key={color} className="swatch" title={t(COLOR_NAMES[i] ?? '')}>
            <input
              type="radio"
              name={id}
              checked={own === color}
              onChange={() => onChange(color)}
              aria-label={t(COLOR_NAMES[i] ?? '')}
            />
            <span className="swatch-dot" style={nameStyle(color)} aria-hidden="true" />
          </label>
        ))}
        <label className="swatch swatch-custom" title={t('Your own color')}>
          <input
            type="color"
            value={custom ?? auto ?? NAME_COLORS[0]}
            onChange={(e) => onChange(e.target.value.toLowerCase())}
            aria-label={t('Your own color')}
          />
          <span
            className="swatch-dot"
            style={nameStyle(custom ?? null)}
            data-custom={custom ? '' : undefined}
            aria-hidden="true"
          />
        </label>
      </div>
      <p id={`${id}-hint`} className="muted small">
        {t('Their name shows in this color in the story. Automatic picks one from the name.')}
      </p>
    </fieldset>
  );
}

function CharacterFields({
  c,
  autoColor,
  onChange,
}: {
  c: Character;
  autoColor: string | null;
  onChange: (patch: Partial<Character>) => void;
}) {
  return (
    <>
      {/* Name and role are the long ones: two to a row, so neither is cut off. */}
      <div className="field-row">
        <TextField
          label={t('Name')}
          required
          value={c.name}
          onChange={(name) => onChange({ name })}
        />
        <TextField label={t('Role')} value={c.role ?? ''} onChange={(role) => onChange({ role })} />
      </div>
      <div className="field-row">
        <TextField
          label={t('Pronouns')}
          value={c.pronouns ?? ''}
          onChange={(pronouns) => onChange({ pronouns })}
        />
        <TextField label={t('Age')} value={c.age ?? ''} onChange={(age) => onChange({ age })} />
        <TextField
          label={t('Race or species')}
          value={c.species ?? ''}
          onChange={(species) => onChange({ species })}
        />
      </div>
      <TextArea
        label={t('Description')}
        value={c.description ?? ''}
        onChange={(description) => onChange({ description })}
      />
      <TextArea
        label={t('Appearance')}
        rows={2}
        value={c.appearance ?? ''}
        onChange={(appearance) => onChange({ appearance })}
      />
      <LinesField
        label={t('Personality')}
        rows={2}
        value={c.personality}
        onChange={(personality) => onChange({ personality })}
      />
      <LinesField
        label={t('Goals')}
        rows={2}
        value={c.goals}
        onChange={(goals) => onChange({ goals })}
      />
      <LinesField
        label={t('Abilities')}
        rows={2}
        value={c.abilities}
        onChange={(abilities) => onChange({ abilities })}
      />
      <StatsField value={c.stats ?? []} onChange={(stats) => onChange({ stats })} />
      <NameColorField value={c.color} auto={autoColor} onChange={(color) => onChange({ color })} />
    </>
  );
}

/** The character being edited, as a card: portrait, name in their colour, a line about them. */
function ProfileCard({
  c,
  you,
  color,
  portrait,
}: {
  c: Character;
  you: boolean;
  color: string | null;
  portrait: string | null;
}) {
  const name = c.name.trim() || t('Unnamed');
  const about = [c.role, c.pronouns, c.age, c.species]
    .map((x) => x?.trim())
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="profile-card" style={nameStyle(color)}>
      {portrait ? (
        <Thumb assetId={portrait} alt="" className="profile-portrait" />
      ) : (
        <span className="profile-portrait profile-initial" aria-hidden="true">
          {[...name][0]?.toUpperCase()}
        </span>
      )}
      <div className="profile-text">
        <p className="profile-name">
          {name}
          {you && <span className="profile-you">{t('You')}</span>}
        </p>
        {about && <p className="muted small">{about}</p>}
      </div>
    </div>
  );
}

/**
 * Change characters, world, narration, scene and facts from this point of
 * this route on. Shows exactly what changes, where, and for which route
 * before anything is written.
 */
export function StoryDetailsPanel({
  view,
  initialTab = 'characters',
  playerName,
  onApplied,
  onCancel,
}: {
  view: RouteView;
  /** The tab to open on. */
  initialTab?: DetailsTab;
  playerName: string;
  onApplied: (v: RouteView) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const original = view.state.state;
  const [edited, setEdited] = useState<StoryStateV1>(() => copy(original));
  const [tab, setTab] = useState<Tab>(initialTab);
  const [who, setWho] = useState(original.playerCharacterId);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<StoryStateV1>) => setEdited((s) => ({ ...s, ...patch }));
  const chars = Object.values(edited.characters);
  const current = edited.characters[who] ?? edited.characters[edited.playerCharacterId];
  const setChar = (cid: string, patch: Partial<Character>) =>
    setEdited((s) => {
      const c = s.characters[cid];
      return c ? { ...s, characters: { ...s.characters, [cid]: { ...c, ...patch } } } : s;
    });

  const addCharacter = () => {
    const cid = unusedId('custom:npc-', (x) => x in edited.characters || x in original.characters);
    set({
      characters: {
        ...edited.characters,
        [cid]: { id: cid, name: '', control: 'npc', personality: [], goals: [], abilities: [] },
      },
    });
    setWho(cid);
  };

  const removeCharacter = (cid: string) => {
    setEdited((s) => {
      const characters = { ...s.characters };
      delete characters[cid];
      return {
        ...s,
        characters,
        relationships: s.relationships.filter((r) => r.fromId !== cid && r.toId !== cid),
        knownFacts: s.knownFacts.map((f) => ({
          ...f,
          knownBy: f.knownBy.filter((k) => k !== cid),
        })),
        scene: { ...s.scene, participantIds: s.scene.participantIds.filter((p) => p !== cid) },
      };
    });
    setWho(edited.playerCharacterId);
  };

  const { changes, lines } = diffState(original, edited);
  const problems = editProblems(edited);
  const head = view.history[view.history.length - 1];

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      const v = await commands.editStoryDetails({
        storyId: view.story.id,
        routeId: view.route.id,
        expectedHeadId: view.route.headEventId ?? '',
        changes,
        note: summarize(lines),
      });
      onApplied(v);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  if (review) {
    return (
      <div className="panel">
        <dl className="facts" aria-label={t('Where this applies')}>
          <dt>{t('Route')}</dt>
          <dd>{tr('{route} only', { route: <strong>{routeName(view.route.label)}</strong> })}</dd>
          <dt>{t('Takes effect')}</dt>
          <dd>{t('After {point}', { point: effectivePoint(head, playerName) })}</dd>
        </dl>
        <p className="muted small">
          {t(
            'Earlier turns keep the details they were written with, and other routes are not changed. The storyteller uses the new details from the next reply on.',
          )}
        </p>
        <ul className="change-list" aria-label={t('Changes')}>
          {lines.map((l, i) => (
            <li key={i}>
              <strong>{l.what}</strong>
              {l.before !== undefined && (
                <>
                  {' '}
                  <span className="muted">{l.before}</span>
                </>
              )}
              {l.after !== undefined && (
                <>
                  {' '}
                  → <span>{l.after}</span>
                </>
              )}
            </li>
          ))}
        </ul>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="button-row">
          <button type="button" onClick={() => setReview(false)}>
            {t('Back to editing')}
          </button>
          <button type="button" className="primary" disabled={busy} onClick={() => void apply()}>
            {t('Apply from now')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel story-details">
      <div role="tablist" aria-label={t('Story details')} className="tabs">
        {TABS.map(([k, label, Icon]) => (
          <button
            key={k}
            type="button"
            role="tab"
            id={`${id}-tab-${k}`}
            aria-selected={tab === k}
            aria-controls={`${id}-panel`}
            onClick={() => setTab(k)}
          >
            <Icon className="btn-icon" aria-hidden={true} />
            {t(label)}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-tab-${tab}`}
        className="tab-panel"
      >
        {tab === 'characters' && current && (
          <>
            <ArrowPicker
              label={t('Character')}
              options={chars.map((c) => ({
                value: c.id,
                label:
                  c.id === edited.playerCharacterId
                    ? t('{name} (you)', { name: c.name || t('Unnamed') })
                    : c.name || t('Unnamed'),
              }))}
              value={current.id}
              onChange={setWho}
            />
            <ProfileCard
              c={current}
              you={current.id === edited.playerCharacterId}
              color={
                current.color ?? castColors(chars, edited.playerCharacterId).get(current.id) ?? null
              }
              portrait={picture(view, portraitSlot(current.id)).assetId}
            />
            {current.id !== edited.playerCharacterId && (
              <FeelingFields
                name={current.name.trim()}
                relationship={towardsPlayer(edited, current.id)}
                onChange={(patch) => setEdited((st) => withFeeling(st, current.id, patch))}
              />
            )}
            <CharacterFields
              c={current}
              autoColor={
                castColors(
                  chars.map((x) => (x.id === current.id ? { ...x, color: undefined } : x)),
                  edited.playerCharacterId,
                ).get(current.id) ?? null
              }
              onChange={(p) => setChar(current.id, p)}
            />
            <div className="button-row">
              <button type="button" onClick={addCharacter}>
                {t('Add a character')}
              </button>
              {current.id !== edited.playerCharacterId && (
                <button
                  type="button"
                  className="danger-link"
                  onClick={() => removeCharacter(current.id)}
                >
                  {current.name
                    ? t('Remove {name} from the story', { name: current.name })
                    : t('Remove this character from the story')}
                </button>
              )}
            </div>
          </>
        )}
        {tab === 'world' && (
          <>
            <TextField
              label={t('Era')}
              value={edited.world.era}
              onChange={(era) => set({ world: { ...edited.world, era } })}
            />
            <TextField
              label={t('Setting')}
              value={edited.world.setting}
              onChange={(setting) => set({ world: { ...edited.world, setting } })}
            />
            <TextArea
              label={t('Description')}
              rows={4}
              value={edited.world.description}
              onChange={(description) => set({ world: { ...edited.world, description } })}
            />
            <LinesField
              label={t('Rules the storyteller follows')}
              value={edited.world.rules}
              onChange={(rules) => set({ world: { ...edited.world, rules } })}
            />
          </>
        )}
        {tab === 'narration' && (
          <>
            <StyleFields
              narration={edited.narration}
              onChange={(patch) =>
                setEdited((s) => ({ ...s, narration: { ...s.narration, ...patch } }))
              }
            />
            <TextField
              label={t('Tone')}
              value={edited.narration.tone}
              onChange={(tone) => set({ narration: { ...edited.narration, tone } })}
            />
            <h3>{t('Features')}</h3>
            <FeatureFields
              narration={edited.narration}
              onChange={(patch) =>
                setEdited((s) => ({ ...s, narration: { ...s.narration, ...patch } }))
              }
            />
            <TrackingFields
              tracking={edited.tracking}
              onChange={(tracking) => setEdited((s) => ({ ...s, tracking }))}
              genres={edited.narration.genres ?? []}
            />
            <h3>{t('What kind of story')}</h3>
            <ContentFields
              narration={edited.narration}
              pickGenres={false}
              onChange={(patch) =>
                setEdited((s) => ({ ...s, narration: { ...s.narration, ...patch } }))
              }
            />
          </>
        )}
        {tab === 'scene' && (
          <>
            <div className="field-row where-when">
              <TextField
                label={t('Where')}
                value={edited.scene.location}
                onChange={(location) => set({ scene: { ...edited.scene, location } })}
              />
              <TextField
                label={t('When')}
                value={edited.scene.time ?? ''}
                placeholder={t('Monday, 7:40 AM')}
                onChange={(time) => set({ scene: { ...edited.scene, time: time || undefined } })}
              />
            </div>
            <p className="muted small">
              {t(
                'Both follow the place and time the storyteller marks as the story moves; change them here to set them yourself.',
              )}
            </p>
            <TextArea
              label={t('What is happening')}
              value={edited.scene.summary}
              onChange={(summary) => set({ scene: { ...edited.scene, summary } })}
            />
            <LinesField
              label={t('Threads to follow')}
              value={edited.openThreads}
              hint={t('One per line. Story memory lists them too, where you can tick them off.')}
              onChange={(openThreads) => set({ openThreads })}
            />
          </>
        )}
        {tab === 'facts' && (
          <>
            <p className="muted small">
              {t(
                'Facts the storyteller must keep to, and who knows them. They are part of every prompt from now on.',
              )}
            </p>
            {edited.knownFacts.length === 0 && <p className="muted">{t('No facts yet.')}</p>}
            <ol className="fact-list">
              {edited.knownFacts.map((f, i) => (
                <li key={f.id}>
                  <TextArea
                    label={t('Fact {n}', { n: i + 1 })}
                    rows={2}
                    value={f.text}
                    onChange={(text) =>
                      set({
                        knownFacts: edited.knownFacts.map((x) =>
                          x.id === f.id ? { ...x, text } : x,
                        ),
                      })
                    }
                  />
                  <fieldset className="field toggle-list">
                    <legend>{t('Who knows it')}</legend>
                    {chars.map((c) => (
                      <label key={c.id} className="check">
                        <input
                          type="checkbox"
                          checked={f.knownBy.includes(c.id)}
                          onChange={(e) =>
                            set({
                              knownFacts: edited.knownFacts.map((x) =>
                                x.id === f.id
                                  ? {
                                      ...x,
                                      knownBy: e.target.checked
                                        ? [...x.knownBy, c.id]
                                        : x.knownBy.filter((k) => k !== c.id),
                                    }
                                  : x,
                              ),
                            })
                          }
                        />
                        {c.name || t('Unnamed')}
                      </label>
                    ))}
                  </fieldset>
                  <button
                    type="button"
                    className="danger-link"
                    onClick={() =>
                      set({ knownFacts: edited.knownFacts.filter((x) => x.id !== f.id) })
                    }
                  >
                    {t('Remove fact {n}', { n: i + 1 })}
                  </button>
                </li>
              ))}
            </ol>
            <button
              type="button"
              className="add-button"
              onClick={() =>
                set({
                  knownFacts: [
                    ...edited.knownFacts,
                    {
                      id: unusedId('fact:', (x) =>
                        [...edited.knownFacts, ...original.knownFacts].some((f) => f.id === x),
                      ),
                      text: '',
                      knownBy: [edited.playerCharacterId],
                      confirmed: true,
                    },
                  ],
                })
              }
            >
              {t('Add a fact')}
            </button>
          </>
        )}
      </div>
      {problems.length > 0 && (
        <ul className="error small">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <div className="button-row">
        <button type="button" onClick={onCancel}>
          {t('Cancel')}
        </button>
        <button
          type="button"
          className="primary"
          disabled={changes.length === 0 || problems.length > 0}
          onClick={() => setReview(true)}
        >
          {changes.length > 0
            ? t('Review changes ({n})', { n: lines.length })
            : t('Review changes')}
        </button>
      </div>
    </div>
  );
}

export type { ChangeLine };

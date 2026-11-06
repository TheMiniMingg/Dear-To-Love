import { useId, useState } from 'react';
import { commands, errorMessage } from '../../api/commands';
import { ArrowPicker } from '../../components/ArrowPicker';
import type { Character, EventDto, Pacing, RouteView, StoryStateV1 } from '../../types';
import { LinesField, TextArea, TextField } from '../create/fields';
import { DETAILS, PERSPECTIVES } from '../create/WizardSteps';
import { diffState, editProblems, summarize, type ChangeLine } from './stateDiff';

type Tab = 'characters' | 'world' | 'narration' | 'scene' | 'facts';
const TABS: [Tab, string][] = [
  ['characters', 'Characters'],
  ['world', 'World'],
  ['narration', 'Narration'],
  ['scene', 'Scene'],
  ['facts', 'Facts'],
];
const PACINGS: { value: Pacing; label: string }[] = [
  { value: 'fast', label: 'Fast' },
  { value: 'normal', label: 'Normal' },
  { value: 'slow', label: 'Slow' },
];

const copy = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function excerpt(text: string, n = 80): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

/** Plain words for the event the change takes effect after. */
export function effectivePoint(e: EventDto | undefined, playerName: string): string {
  if (!e) return 'the start of the story';
  switch (e.kind) {
    case 'chapter_start':
      return `the start of Chapter ${e.payload.ordinal}: ${e.payload.title}`;
    case 'assistant':
      return `the latest reply ("${excerpt(e.payload.text)}")`;
    case 'player':
      return `${playerName}'s action ("${excerpt(e.payload.text)}")`;
    case 'edit':
      return 'your last change to the story details';
    case 'fact_confirm':
      return 'the last confirmed fact';
    case 'checkpoint':
      return `checkpoint ${e.payload.label}`;
  }
}

function unusedId(prefix: string, taken: (id: string) => boolean): string {
  for (let n = 1; ; n++) {
    const id = `${prefix}${n}`;
    if (!taken(id)) return id;
  }
}

function CharacterFields({
  c,
  onChange,
}: {
  c: Character;
  onChange: (patch: Partial<Character>) => void;
}) {
  return (
    <>
      <TextField label="Name" required value={c.name} onChange={(name) => onChange({ name })} />
      <div className="field-row">
        <TextField
          label="Pronouns"
          value={c.pronouns ?? ''}
          onChange={(pronouns) => onChange({ pronouns })}
        />
        <TextField label="Age" value={c.age ?? ''} onChange={(age) => onChange({ age })} />
        <TextField label="Role" value={c.role ?? ''} onChange={(role) => onChange({ role })} />
      </div>
      <TextArea
        label="Description"
        value={c.description ?? ''}
        onChange={(description) => onChange({ description })}
      />
      <TextArea
        label="Appearance"
        rows={2}
        value={c.appearance ?? ''}
        onChange={(appearance) => onChange({ appearance })}
      />
      <LinesField
        label="Personality"
        rows={2}
        value={c.personality}
        onChange={(personality) => onChange({ personality })}
      />
      <LinesField
        label="Goals"
        rows={2}
        value={c.goals}
        onChange={(goals) => onChange({ goals })}
      />
      <LinesField
        label="Abilities"
        rows={2}
        value={c.abilities}
        onChange={(abilities) => onChange({ abilities })}
      />
    </>
  );
}

/**
 * Change characters, world, narration, scene and facts from this point of
 * this route on. Shows exactly what changes, where, and for which route
 * before anything is written.
 */
export function StoryDetailsPanel({
  view,
  playerName,
  onApplied,
  onCancel,
}: {
  view: RouteView;
  playerName: string;
  onApplied: (v: RouteView) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const original = view.state.state;
  const [edited, setEdited] = useState<StoryStateV1>(() => copy(original));
  const [tab, setTab] = useState<Tab>('characters');
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
        <dl className="facts" aria-label="Where this applies">
          <dt>Route</dt>
          <dd>
            <strong>{view.route.label}</strong> only
          </dd>
          <dt>Takes effect</dt>
          <dd>After {effectivePoint(head, playerName)}</dd>
        </dl>
        <p className="muted small">
          Earlier turns keep the details they were written with, and other routes are not changed.
          The storyteller uses the new details from the next reply on.
        </p>
        <ul className="change-list" aria-label="Changes">
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
            Back to editing
          </button>
          <button type="button" className="primary" disabled={busy} onClick={() => void apply()}>
            Apply from now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel story-details">
      <div role="tablist" aria-label="Story details" className="tabs">
        {TABS.map(([t, label]) => (
          <button
            key={t}
            type="button"
            role="tab"
            id={`${id}-tab-${t}`}
            aria-selected={tab === t}
            aria-controls={`${id}-panel`}
            onClick={() => setTab(t)}
          >
            {label}
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
              label="Character"
              options={chars.map((c) => ({
                value: c.id,
                label: `${c.name || 'Unnamed'}${c.id === edited.playerCharacterId ? ' (you)' : ''}`,
              }))}
              value={current.id}
              onChange={setWho}
            />
            <CharacterFields c={current} onChange={(p) => setChar(current.id, p)} />
            <div className="button-row">
              <button type="button" onClick={addCharacter}>
                Add a character
              </button>
              {current.id !== edited.playerCharacterId && (
                <button
                  type="button"
                  className="danger-link"
                  onClick={() => removeCharacter(current.id)}
                >
                  Remove {current.name || 'this character'} from the story
                </button>
              )}
            </div>
          </>
        )}
        {tab === 'world' && (
          <>
            <TextField
              label="Era"
              value={edited.world.era}
              onChange={(era) => set({ world: { ...edited.world, era } })}
            />
            <TextField
              label="Setting"
              value={edited.world.setting}
              onChange={(setting) => set({ world: { ...edited.world, setting } })}
            />
            <TextArea
              label="Description"
              rows={4}
              value={edited.world.description}
              onChange={(description) => set({ world: { ...edited.world, description } })}
            />
            <LinesField
              label="Rules the storyteller follows"
              value={edited.world.rules}
              onChange={(rules) => set({ world: { ...edited.world, rules } })}
            />
          </>
        )}
        {tab === 'narration' && (
          <>
            <ArrowPicker
              label="Narration"
              options={PERSPECTIVES}
              value={edited.narration.perspective}
              onChange={(perspective) => set({ narration: { ...edited.narration, perspective } })}
            />
            <ArrowPicker
              label="Detail"
              options={DETAILS}
              value={edited.narration.detail}
              onChange={(detail) => set({ narration: { ...edited.narration, detail } })}
            />
            <ArrowPicker
              label="Pacing"
              options={PACINGS}
              value={edited.narration.pacing}
              onChange={(pacing) => set({ narration: { ...edited.narration, pacing } })}
            />
            <TextField
              label="Tone"
              value={edited.narration.tone}
              onChange={(tone) => set({ narration: { ...edited.narration, tone } })}
            />
          </>
        )}
        {tab === 'scene' && (
          <>
            <TextField
              label="Where"
              value={edited.scene.location}
              onChange={(location) => set({ scene: { ...edited.scene, location } })}
            />
            <TextArea
              label="What is happening"
              value={edited.scene.summary}
              onChange={(summary) => set({ scene: { ...edited.scene, summary } })}
            />
            <LinesField
              label="Open questions"
              value={edited.openThreads}
              onChange={(openThreads) => set({ openThreads })}
            />
          </>
        )}
        {tab === 'facts' && (
          <>
            <p className="muted small">
              Facts the storyteller must keep to, and who knows them. They are part of every prompt
              from now on.
            </p>
            {edited.knownFacts.length === 0 && <p className="muted">No facts yet.</p>}
            <ol className="fact-list">
              {edited.knownFacts.map((f, i) => (
                <li key={f.id}>
                  <TextArea
                    label={`Fact ${i + 1}`}
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
                    <legend>Who knows it</legend>
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
                        {c.name || 'Unnamed'}
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
                    Remove fact {i + 1}
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
              Add a fact
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
          Cancel
        </button>
        <button
          type="button"
          className="primary"
          disabled={changes.length === 0 || problems.length > 0}
          onClick={() => setReview(true)}
        >
          Review changes{changes.length > 0 ? ` (${lines.length})` : ''}
        </button>
      </div>
    </div>
  );
}

export type { ChangeLine };

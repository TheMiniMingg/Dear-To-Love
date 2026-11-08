/**
 * Someone new under a reply: when the storyteller brings in a named
 * character who is not in the cast, it adds a card for them, and the player
 * can add them as they are, change the details first, or say not now (kept
 * on this computer, so the card stays away). With a picture connection,
 * adding them can make their portrait too.
 */
import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { create } from 'zustand';
import { errorMessage } from '../../api/commands';
import type { Character, ProviderProfile, StateEdit, StoryStateV1 } from '../../types';
import { joinList, t } from '../../i18n';
import { namesAMinor } from '../create/ContentFields';
import { TextArea, TextField } from '../create/fields';
import { newCharacters, samePerson, type NewCharacter } from './messages';

const STORAGE_KEY = 'dtl.skippedCharacters';
const PORTRAIT_KEY = 'dtl.newcomerPortraits';
/** Names kept per story, and stories kept, so the list stays small. */
const MAX_NAMES = 60;
const MAX_STORIES = 40;

type Skipped = Record<string, string[]>;

function loadSkipped(): Skipped {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: Skipped = {};
    for (const [story, names] of Object.entries(raw as Record<string, unknown>)) {
      if (Array.isArray(names))
        out[story] = names.filter((n): n is string => typeof n === 'string');
    }
    return out;
  } catch {
    return {};
  }
}

/** Characters the player said "Not now" to, by story. Kept on this computer. */
export const useSkippedCharacters = create<{
  skipped: Skipped;
  skip: (storyId: string, name: string) => void;
}>((set, get) => ({
  skipped: loadSkipped(),
  skip: (storyId, name) => {
    const names = [...(get().skipped[storyId] ?? []), name.trim().toLowerCase()].slice(-MAX_NAMES);
    const rest = Object.entries(get().skipped).filter(([id]) => id !== storyId);
    const skipped = Object.fromEntries([...rest.slice(-(MAX_STORIES - 1)), [storyId, names]]);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(skipped));
    } catch {
      // A convenience only: the card comes back next time.
    }
    set({ skipped });
  },
}));

function loadPortraitsOn(): boolean {
  try {
    return localStorage.getItem(PORTRAIT_KEY) !== 'off';
  } catch {
    return true;
  }
}

/**
 * Whether a new character's card offers their portrait ticked (Settings ->
 * Pictures). Kept on this computer.
 */
export const useNewcomerPortraits = create<{ on: boolean; setOn: (on: boolean) => void }>(
  (set) => ({
    on: loadPortraitsOn(),
    setOn: (on) => {
      try {
        localStorage.setItem(PORTRAIT_KEY, on ? 'on' : 'off');
      } catch {
        // A convenience only: the switch is back on next time.
      }
      set({ on });
    },
  }),
);

/** The people a reply brings in who are not in the cast and were not put off. */
export function newcomersIn(text: string, cast: string[], skipped: string[]): NewCharacter[] {
  return newCharacters(text).filter(
    (c) =>
      !cast.some((name) => samePerson(name, c.name)) &&
      !skipped.includes(c.name.trim().toLowerCase()),
  );
}

/**
 * The changes that add someone to the cast as a side character, in the
 * scene now, under an id no one in the story has.
 */
export function joinCast(s: StoryStateV1, c: NewCharacter, id = newcomerId(s)): StateEdit[] {
  const text = (v: string) => v.trim() || undefined;
  const character: Character = {
    id,
    name: c.name.trim(),
    control: 'npc',
    role: text(c.role),
    pronouns: text(c.pronouns),
    age: text(c.age),
    appearance: text(c.appearance),
    personality: [],
    goals: [],
    abilities: [],
  };
  return [
    { op: 'upsertCharacter', character },
    { op: 'setScene', scene: { ...s.scene, participantIds: [...s.scene.participantIds, id] } },
  ];
}

/**
 * The id for someone who joins the cast during the story. Other routes may
 * add other people, so the id is random rather than the next number: a
 * story-wide portrait chosen for this person never lands on someone else.
 */
export function newcomerId(
  s: StoryStateV1,
  taken: (id: string) => boolean = (id) => id in s.characters,
): string {
  for (;;) {
    const part = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    const id = `custom:npc-${part}`;
    if (!taken(id)) return id;
  }
}

export function NewCharacterCards({
  text,
  storyId,
  cast,
  adultsOnly,
  painter,
  onAdd,
}: {
  text: string;
  storyId: string;
  /** Everyone in the story now, the player too. */
  cast: string[];
  /** The story is adults-only: someone under 18 can't be added. */
  adultsOnly: boolean;
  /** The picture connection, when one is chosen: adding can make a portrait. */
  painter?: ProviderProfile | null;
  /** Saves them to the cast, and asks for their portrait; throws when that fails. */
  onAdd?: (c: NewCharacter, portrait: boolean) => Promise<void>;
}) {
  const skippedNames = useSkippedCharacters((s) => s.skipped[storyId]);
  const skip = useSkippedCharacters((s) => s.skip);
  const people = newcomersIn(text, cast, skippedNames ?? []);
  if (!people.length || !onAdd) return null;
  return (
    <>
      {people.map((c) => (
        <NewCharacterCard
          key={c.name}
          suggested={c}
          adultsOnly={adultsOnly}
          painter={painter ?? null}
          onAdd={onAdd}
          onSkip={() => skip(storyId, c.name)}
        />
      ))}
    </>
  );
}

function NewCharacterCard({
  suggested,
  adultsOnly,
  painter,
  onAdd,
  onSkip,
}: {
  suggested: NewCharacter;
  adultsOnly: boolean;
  painter: ProviderProfile | null;
  onAdd: (c: NewCharacter, portrait: boolean) => Promise<void>;
  onSkip: () => void;
}) {
  const portraitsOn = useNewcomerPortraits((s) => s.on);
  const [portrait, setPortrait] = useState(portraitsOn);
  const [form, setForm] = useState<NewCharacter | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = form ?? suggested;
  const name = c.name.trim();
  const tooYoung = adultsOnly && namesAMinor(c.age);
  const set = (patch: Partial<NewCharacter>) => setForm({ ...c, ...patch });

  const add = async () => {
    if (!name || tooYoung) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd({ ...c, name }, !!painter && portrait);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const facts = [c.role, c.pronouns, c.age].map((x) => x.trim()).filter(Boolean);
  return (
    <section className="newcomer" aria-label={t('Someone new: {name}', { name: suggested.name })}>
      <UserPlus aria-hidden={true} size={18} className="newcomer-icon" />
      <div className="newcomer-body">
        <p className="newcomer-label">{t('Someone new joined the story')}</p>
        {form ? (
          <div className="newcomer-form">
            <TextField
              label={t('Name')}
              required
              value={c.name}
              onChange={(v) => set({ name: v })}
            />
            <div className="field-row">
              <TextField label={t('Role')} value={c.role} onChange={(v) => set({ role: v })} />
              <TextField
                label={t('Pronouns')}
                value={c.pronouns}
                onChange={(v) => set({ pronouns: v })}
              />
              <TextField label={t('Age')} value={c.age} onChange={(v) => set({ age: v })} />
            </div>
            <TextArea
              label={t('Appearance')}
              rows={2}
              value={c.appearance}
              onChange={(v) => set({ appearance: v })}
            />
          </div>
        ) : (
          <>
            <p className="newcomer-name">
              <strong>{name}</strong>
              {facts.length > 0 && <span className="muted"> · {joinList(facts)}</span>}
            </p>
            {c.appearance.trim() && <p className="newcomer-looks">{c.appearance.trim()}</p>}
          </>
        )}
        {tooYoung && (
          <p className="error small">
            {t(
              '{name} is under 18. Everyone in an adults-only story must be an adult: change their age or the content rating.',
              { name: name || suggested.name },
            )}
          </p>
        )}
        {error && (
          <p role="alert" className="error small">
            {error}
          </p>
        )}
        {painter && (
          <label className="newcomer-portrait small">
            <input
              type="checkbox"
              checked={portrait}
              disabled={busy}
              onChange={(e) => setPortrait(e.target.checked)}
            />{' '}
            {t('Make their portrait too')}
            <span className="muted">
              {' '}
              {painter.billing === 'local'
                ? t('(with {name}, on this computer)', { name: painter.label })
                : t('(with {name}, one paid picture)', { name: painter.label })}
            </span>
          </label>
        )}
        <div className="newcomer-actions">
          <button
            type="button"
            className="primary"
            disabled={busy || !name || tooYoung}
            onClick={() => void add()}
          >
            {t('Add to the cast')}
          </button>
          {form ? (
            <button type="button" disabled={busy} onClick={() => setForm(null)}>
              {t('Cancel')}
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={() => setForm(suggested)}>
              {t('Change first')}
            </button>
          )}
          <button type="button" className="link-button" disabled={busy} onClick={onSkip}>
            {t('Not now')}
          </button>
        </div>
      </div>
    </section>
  );
}

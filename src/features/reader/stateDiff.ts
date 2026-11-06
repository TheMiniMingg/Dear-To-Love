import type { Character, KnownFact, Narration, StateEdit, StoryStateV1 } from '../../types';
import { cleanOptionalList, minorsIn, RATING_LABELS } from '../create/ContentFields';
import { STYLES } from '../create/StyleFields';

/** One line of the "what changes" preview. */
export type ChangeLine = { what: string; before?: string; after?: string };

const cleanList = (l: string[]) => l.map((t) => t.trim()).filter(Boolean);
const cleanOpt = (s: string | undefined) => {
  const t = s?.trim();
  return t ? t : undefined;
};

export function cleanCharacter(c: Character): Character {
  return {
    id: c.id,
    name: c.name.trim(),
    control: c.control,
    gender: cleanOpt(c.gender),
    pronouns: cleanOpt(c.pronouns),
    age: cleanOpt(c.age),
    role: cleanOpt(c.role),
    species: cleanOpt(c.species),
    description: cleanOpt(c.description),
    appearance: cleanOpt(c.appearance),
    personality: cleanList(c.personality),
    goals: cleanList(c.goals),
    abilities: cleanList(c.abilities),
    ...cleanStats(c.stats),
  };
}

/** Stats with a name, trimmed; left out when there are none. */
function cleanStats(stats: Character['stats']): Pick<Character, 'stats'> {
  const out = (stats ?? [])
    .map((s) => ({ name: s.name.trim(), value: Math.trunc(Number(s.value) || 0) }))
    .filter((s) => s.name);
  return out.length ? { stats: out } : {};
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Narration in a fixed key order, with empty lists and an unset rating left out. */
function cleanNarration(n: Narration): Narration {
  const out: Narration = {
    perspective: n.perspective,
    detail: n.detail,
    tone: n.tone.trim(),
    pacing: n.pacing,
  };
  const genres = cleanOptionalList(n.genres);
  if (genres) out.genres = genres;
  if (n.rating) out.rating = n.rating;
  const themes = cleanOptionalList(n.themes);
  if (themes) out.themes = themes;
  const limits = cleanOptionalList(n.limits);
  if (limits) out.limits = limits;
  if (n.style && n.style !== 'narrated') out.style = n.style;
  if (n.innerThoughts) out.innerThoughts = true;
  if (n.messageCards) out.messageCards = true;
  const language = n.language?.trim();
  if (language) out.language = language;
  if (n.dice) out.dice = true;
  return out;
}
const show = (v: unknown) =>
  Array.isArray(v)
    ? v.length
      ? v.map((x: unknown) => (isStat(x) ? `${x.name} ${x.value}` : String(x))).join(', ')
      : '(none)'
    : v
      ? String(v)
      : '(empty)';

function isStat(x: unknown): x is { name: string; value: number } {
  return typeof x === 'object' && x !== null && 'name' in x && 'value' in x;
}

const CHARACTER_FIELDS: [keyof Character, string][] = [
  ['name', 'Name'],
  ['pronouns', 'Pronouns'],
  ['age', 'Age'],
  ['role', 'Role'],
  ['species', 'Race or species'],
  ['description', 'Description'],
  ['appearance', 'Appearance'],
  ['personality', 'Personality'],
  ['goals', 'Goals'],
  ['abilities', 'Abilities'],
  ['stats', 'Stats'],
];

function fieldLines<T>(
  prefix: string,
  before: T,
  after: T,
  fields: [keyof T, string][],
): ChangeLine[] {
  return fields
    .filter(([k]) => !same(before[k], after[k]))
    .map(([k, label]) => ({
      what: `${prefix}${label}`,
      before: show(before[k]),
      after: show(after[k]),
    }));
}

/**
 * The edit operations that turn `before` into `after`, plus readable lines
 * for the preview. Lists are trimmed and blank entries dropped first.
 */
export function diffState(
  before: StoryStateV1,
  after: StoryStateV1,
): { changes: StateEdit[]; lines: ChangeLine[] } {
  const changes: StateEdit[] = [];
  const lines: ChangeLine[] = [];

  const world = { ...after.world, rules: cleanList(after.world.rules) };
  world.era = world.era.trim();
  world.setting = world.setting.trim();
  world.description = world.description.trim();
  if (!same(world, before.world)) {
    changes.push({ op: 'setWorld', world });
    lines.push(
      ...fieldLines('World · ', before.world, world, [
        ['era', 'Era'],
        ['setting', 'Setting'],
        ['description', 'Description'],
        ['rules', 'Rules'],
      ]),
    );
  }

  const narration = cleanNarration(after.narration);
  if (!same(narration, cleanNarration(before.narration))) {
    changes.push({ op: 'setNarration', narration });
    const shown = (n: Narration) => ({
      ...n,
      rating: n.rating ? RATING_LABELS[n.rating] : 'Not set',
      genres: n.genres ?? [],
      themes: n.themes ?? [],
      limits: n.limits ?? [],
      style: STYLES.find((s) => s.value === (n.style ?? 'narrated'))?.label ?? n.style,
      innerThoughts: n.innerThoughts ? 'On' : 'Off',
      messageCards: n.messageCards ? 'On' : 'Off',
      language: n.language ?? 'Not set',
      dice: n.dice ? 'On' : 'Off',
    });
    lines.push(
      ...fieldLines('Narration · ', shown(before.narration), shown(narration), [
        ['perspective', 'Point of view'],
        ['detail', 'Detail'],
        ['pacing', 'Pacing'],
        ['tone', 'Tone'],
        ['genres', 'Genre'],
        ['rating', 'Content rating'],
        ['themes', 'Themes'],
        ['limits', 'Hard limits'],
        ['style', 'Style'],
        ['innerThoughts', 'Inner thoughts'],
        ['messageCards', 'Texts and calls as cards'],
        ['language', 'Story language'],
        ['dice', 'Dice'],
      ]),
    );
  }

  for (const c of Object.values(after.characters)) {
    const next = cleanCharacter(c);
    const prev = before.characters[c.id];
    if (!prev) {
      changes.push({ op: 'upsertCharacter', character: next });
      lines.push({ what: `New character: ${next.name || 'Unnamed'}` });
    } else if (!same(cleanCharacter(prev), next)) {
      changes.push({ op: 'upsertCharacter', character: next });
      lines.push(...fieldLines(`${prev.name} · `, cleanCharacter(prev), next, CHARACTER_FIELDS));
    }
  }
  for (const c of Object.values(before.characters)) {
    if (!after.characters[c.id]) {
      changes.push({ op: 'removeCharacter', characterId: c.id });
      lines.push({ what: `Removed from the story: ${c.name}` });
    }
  }

  const scene = {
    ...after.scene,
    location: after.scene.location.trim(),
    summary: after.scene.summary.trim(),
  };
  if (!same(scene, before.scene)) {
    changes.push({ op: 'setScene', scene });
    lines.push(
      ...fieldLines('Scene · ', before.scene, scene, [
        ['location', 'Where'],
        ['summary', 'What is happening'],
      ]),
    );
  }
  const threads = cleanList(after.openThreads);
  if (!same(threads, before.openThreads)) {
    changes.push({ op: 'setOpenThreads', openThreads: threads });
    lines.push({
      what: 'Open questions',
      before: show(before.openThreads),
      after: show(threads),
    });
  }

  const priorFacts = new Map(before.knownFacts.map((f) => [f.id, f]));
  for (const f of after.knownFacts) {
    const fact: KnownFact = { ...f, text: f.text.trim(), confirmed: true };
    const prev = priorFacts.get(f.id);
    if (!prev) {
      changes.push({ op: 'upsertFact', fact });
      lines.push({ what: 'New fact', after: fact.text });
    } else if (!same({ ...prev, confirmed: true }, fact)) {
      changes.push({ op: 'upsertFact', fact });
      lines.push({ what: 'Fact', before: prev.text, after: fact.text });
    }
  }
  const kept = new Set(after.knownFacts.map((f) => f.id));
  for (const f of before.knownFacts) {
    if (!kept.has(f.id)) {
      changes.push({ op: 'removeFact', factId: f.id });
      lines.push({ what: 'Removed fact', before: f.text });
    }
  }
  return { changes, lines };
}

/** Short note stored with the edit and shown in the story. */
export function summarize(lines: ChangeLine[]): string {
  const parts = lines.map((l) => l.what);
  const text = parts.slice(0, 4).join('; ');
  return parts.length > 4 ? `${text}; and ${parts.length - 4} more` : text;
}

/** Problems that would make the edit fail, said plainly. */
export function editProblems(after: StoryStateV1): string[] {
  const out: string[] = [];
  for (const c of Object.values(after.characters)) {
    if (!c.name.trim()) out.push('Every character needs a name.');
  }
  for (const f of after.knownFacts) {
    if (!f.text.trim()) out.push('A fact is empty. Write it or remove it.');
  }
  if (after.narration.rating === 'explicit') {
    for (const name of minorsIn(Object.values(after.characters))) {
      out.push(
        `${name} is under 18. Everyone in an adults-only story must be an adult: change their age or the content rating.`,
      );
    }
  }
  return [...new Set(out)];
}

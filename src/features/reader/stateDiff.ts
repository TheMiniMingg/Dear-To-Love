import type { Character, KnownFact, StateEdit, StoryStateV1 } from '../../types';

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
    description: cleanOpt(c.description),
    appearance: cleanOpt(c.appearance),
    personality: cleanList(c.personality),
    goals: cleanList(c.goals),
    abilities: cleanList(c.abilities),
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const show = (v: unknown) =>
  Array.isArray(v) ? (v.length ? v.join(', ') : '(none)') : v ? String(v) : '(empty)';

const CHARACTER_FIELDS: [keyof Character, string][] = [
  ['name', 'Name'],
  ['pronouns', 'Pronouns'],
  ['age', 'Age'],
  ['role', 'Role'],
  ['description', 'Description'],
  ['appearance', 'Appearance'],
  ['personality', 'Personality'],
  ['goals', 'Goals'],
  ['abilities', 'Abilities'],
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

  const narration = { ...after.narration, tone: after.narration.tone.trim() };
  if (!same(narration, before.narration)) {
    changes.push({ op: 'setNarration', narration });
    lines.push(
      ...fieldLines('Narration · ', before.narration, narration, [
        ['perspective', 'Point of view'],
        ['detail', 'Detail'],
        ['pacing', 'Pacing'],
        ['tone', 'Tone'],
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
  return [...new Set(out)];
}

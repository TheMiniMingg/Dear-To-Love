import type { Character, KnownFact, Narration, StateEdit, StoryStateV1 } from '../../types';
import { cleanOptionalList, minorsIn, RATING_LABELS } from '../create/ContentFields';
import { STYLES } from '../create/StyleFields';
import { joinList, msg, t } from '../../i18n';

/** One line of the "what changes" preview. */
export type ChangeLine = { what: string; before?: string; after?: string };

const cleanList = (l: string[]) => l.map((x) => x.trim()).filter(Boolean);
const cleanOpt = (s: string | undefined) => {
  const x = s?.trim();
  return x ? x : undefined;
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
      ? joinList(v.map((x: unknown) => (isStat(x) ? `${x.name} ${x.value}` : String(x))))
      : t('(none)')
    : v
      ? String(v)
      : t('(empty)');

function isStat(x: unknown): x is { name: string; value: number } {
  return typeof x === 'object' && x !== null && 'name' in x && 'value' in x;
}

const CHARACTER_FIELDS: [keyof Character, string][] = [
  ['name', msg('Name')],
  ['pronouns', msg('Pronouns')],
  ['age', msg('Age')],
  ['role', msg('Role')],
  ['species', msg('Race or species')],
  ['description', msg('Description')],
  ['appearance', msg('Appearance')],
  ['personality', msg('Personality')],
  ['goals', msg('Goals')],
  ['abilities', msg('Abilities')],
  ['stats', msg('Stats')],
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
      what: `${prefix}${t(label)}`,
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
      ...fieldLines(`${t('World')} · `, before.world, world, [
        ['era', msg('Era')],
        ['setting', msg('Setting')],
        ['description', msg('Description')],
        ['rules', msg('Rules')],
      ]),
    );
  }

  const narration = cleanNarration(after.narration);
  if (!same(narration, cleanNarration(before.narration))) {
    changes.push({ op: 'setNarration', narration });
    const shown = (n: Narration) => ({
      ...n,
      rating: n.rating ? t(RATING_LABELS[n.rating]) : t('Not set'),
      genres: n.genres ?? [],
      themes: n.themes ?? [],
      limits: n.limits ?? [],
      style: t(STYLES.find((s) => s.value === (n.style ?? 'narrated'))?.label ?? n.style ?? ''),
      innerThoughts: n.innerThoughts ? t('On') : t('Off'),
      messageCards: n.messageCards ? t('On') : t('Off'),
      language: n.language ?? t('Not set'),
      dice: n.dice ? t('On') : t('Off'),
    });
    lines.push(
      ...fieldLines(`${t('Narration')} · `, shown(before.narration), shown(narration), [
        ['perspective', msg('Point of view')],
        ['detail', msg('Detail')],
        ['pacing', msg('Pacing')],
        ['tone', msg('Tone')],
        ['genres', msg('Genre')],
        ['rating', msg('Content rating')],
        ['themes', msg('Themes')],
        ['limits', msg('Hard limits')],
        ['style', msg('Style')],
        ['innerThoughts', msg('Inner thoughts')],
        ['messageCards', msg('Texts and calls as cards')],
        ['language', msg('Story language')],
        ['dice', msg('Dice')],
      ]),
    );
  }

  for (const c of Object.values(after.characters)) {
    const next = cleanCharacter(c);
    const prev = before.characters[c.id];
    if (!prev) {
      changes.push({ op: 'upsertCharacter', character: next });
      lines.push({ what: t('New character: {name}', { name: next.name || t('Unnamed') }) });
    } else if (!same(cleanCharacter(prev), next)) {
      changes.push({ op: 'upsertCharacter', character: next });
      lines.push(...fieldLines(`${prev.name} · `, cleanCharacter(prev), next, CHARACTER_FIELDS));
    }
  }
  for (const c of Object.values(before.characters)) {
    if (!after.characters[c.id]) {
      changes.push({ op: 'removeCharacter', characterId: c.id });
      lines.push({ what: t('Removed from the story: {name}', { name: c.name }) });
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
      ...fieldLines(`${t('Scene')} · `, before.scene, scene, [
        ['location', msg('Where')],
        ['summary', msg('What is happening')],
      ]),
    );
  }
  const threads = cleanList(after.openThreads);
  if (!same(threads, before.openThreads)) {
    changes.push({ op: 'setOpenThreads', openThreads: threads });
    lines.push({
      what: t('Open questions'),
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
      lines.push({ what: t('New fact'), after: fact.text });
    } else if (!same({ ...prev, confirmed: true }, fact)) {
      changes.push({ op: 'upsertFact', fact });
      lines.push({ what: t('Fact'), before: prev.text, after: fact.text });
    }
  }
  const kept = new Set(after.knownFacts.map((f) => f.id));
  for (const f of before.knownFacts) {
    if (!kept.has(f.id)) {
      changes.push({ op: 'removeFact', factId: f.id });
      lines.push({ what: t('Removed fact'), before: f.text });
    }
  }
  return { changes, lines };
}

/** Short note stored with the edit and shown in the story. */
export function summarize(lines: ChangeLine[]): string {
  const parts = lines.map((l) => l.what);
  const text = parts.slice(0, 4).join(t('; '));
  return parts.length > 4 ? t('{list}; and {n} more', { list: text, n: parts.length - 4 }) : text;
}

/** Problems that would make the edit fail, said plainly. */
export function editProblems(after: StoryStateV1): string[] {
  const out: string[] = [];
  for (const c of Object.values(after.characters)) {
    if (!c.name.trim()) out.push(t('Every character needs a name.'));
  }
  for (const f of after.knownFacts) {
    if (!f.text.trim()) out.push(t('A fact is empty. Write it or remove it.'));
  }
  if (after.narration.rating === 'explicit') {
    for (const name of minorsIn(Object.values(after.characters))) {
      out.push(
        t(
          '{name} is under 18. Everyone in an adults-only story must be an adult: change their age or the content rating.',
          { name },
        ),
      );
    }
  }
  return [...new Set(out)];
}

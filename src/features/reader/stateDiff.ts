import type {
  Character,
  Item,
  KnownFact,
  Meter,
  Narration,
  StateEdit,
  StoryStateV1,
  Tracking,
} from '../../types';
import { trackingSummary } from '../create/TrackingFields';
import { cleanOptionalList, minorsIn, RATING_LABELS } from '../create/ContentFields';
import {
  DETAILS,
  PACINGS,
  PERSPECTIVES,
  STYLES,
  SURPRISES,
  TENSES,
  cleanDiceRules,
  diceSummary,
  labelOf,
} from '../create/StyleFields';
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
    ...(c.color ? { color: c.color.toLowerCase() } : {}),
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

/** Tracking as Rust keeps it: blank rows dropped, names trimmed, in key order. */
function cleanTracking(tr: Tracking | undefined): Tracking | undefined {
  if (!tr) return undefined;
  const out: Tracking = {
    meters: tr.meters
      .filter((m) => m.name.trim())
      .map((m) => {
        const meter: Meter = { name: m.name.trim(), value: m.value };
        if (m.max !== undefined) meter.max = m.max;
        const who = m.who?.trim();
        if (who) meter.who = who;
        return meter;
      }),
  };
  if (tr.inventory) {
    out.inventory = true;
    const items = (tr.items ?? [])
      .filter((i) => i.name.trim())
      .map((i) => {
        const item: Item = { name: i.name.trim(), qty: i.qty };
        const description = i.description?.trim();
        if (description) item.description = description;
        return item;
      });
    if (items.length) out.items = items;
  }
  return out;
}

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
  if (n.sceneHeadings) out.sceneHeadings = true;
  if (n.tense) out.tense = n.tense;
  if (n.surprises && n.surprises !== 'sometimes') out.surprises = n.surprises;
  if (n.autopilot) out.autopilot = true;
  if (n.quietPhones) out.quietPhones = true;
  if (n.manualMemory) out.manualMemory = true;
  const diceRules = cleanDiceRules(n.diceRules);
  if (diceRules) out.diceRules = diceRules;
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
  ['color', msg('Name color')],
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
    const onOff = (on: boolean | undefined) => (on ? t('On') : t('Off'));
    const shown = (n: Narration) => ({
      ...n,
      perspective: labelOf(PERSPECTIVES, n.perspective),
      detail: labelOf(DETAILS, n.detail),
      pacing: labelOf(PACINGS, n.pacing),
      rating: n.rating ? t(RATING_LABELS[n.rating]) : t('Not set'),
      genres: n.genres ?? [],
      themes: n.themes ?? [],
      limits: n.limits ?? [],
      style: labelOf(STYLES, n.style ?? 'narrated'),
      innerThoughts: onOff(n.innerThoughts),
      messageCards: onOff(n.messageCards),
      language: n.language ?? t('Not set'),
      dice: onOff(n.dice),
      sceneHeadings: onOff(n.sceneHeadings),
      tense: n.tense ? labelOf(TENSES, n.tense) : t('Not set'),
      surprises: labelOf(SURPRISES, n.surprises ?? 'sometimes'),
      autopilot: onOff(n.autopilot),
      quietPhones: onOff(!n.quietPhones),
      manualMemory: onOff(!n.manualMemory),
      diceRules: diceSummary(n.diceRules) || t('Usual'),
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
        ['diceRules', msg('Dice settings')],
        ['tense', msg('Tense')],
        ['sceneHeadings', msg('Place and time headings')],
        ['autopilot', msg('Your small reactions')],
        ['quietPhones', msg('Characters can text or call you first')],
        ['manualMemory', msg('Let the storyteller keep memory notes')],
        ['surprises', msg('Twists and surprises')],
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

  const tracking = cleanTracking(after.tracking);
  if (!same(tracking, cleanTracking(before.tracking))) {
    changes.push(tracking ? { op: 'setTracking', tracking } : { op: 'setTracking' });
    lines.push({
      what: t('Tracking'),
      before: trackingSummary(before.tracking) || t('Off'),
      after: trackingSummary(tracking) || t('Off'),
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

import { useId, useState } from 'react';
import { ArrowPicker, type PickerOption } from '../../components/ArrowPicker';
import type {
  Detail,
  DiceRules,
  Narration,
  NarrationStyle,
  NextMove,
  Pacing,
  Perspective,
  RollFrequency,
  RollOdds,
  Surprises,
  Tense,
} from '../../types';
import { isDice } from '../reader/messages';
import { RichText } from '../reader/RichText';
import { joinList, locale, msg, t, tOptions, type Locale } from '../../i18n';

export const STYLES: PickerOption<NarrationStyle>[] = [
  {
    value: 'mixed',
    label: msg('Mixed: whatever fits the moment'),
    hint: msg('Narration, dialogue, thoughts and messages, each where it suits the scene.'),
  },
  {
    value: 'narrated',
    label: msg('Narrated'),
    hint: msg('A narrator describes what happens, with dialogue.'),
  },
  {
    value: 'script',
    label: msg('Script'),
    hint: msg('Like a play: names, lines and short stage directions.'),
  },
  {
    value: 'roleplay',
    label: msg('Roleplay chat'),
    hint: msg('Actions in italics and short replies, like roleplaying in a chat.'),
  },
  {
    value: 'thoughts',
    label: msg('Thoughts and dialogue, no narrator'),
    hint: msg('Only what the characters say and what goes through their heads.'),
  },
  {
    value: 'messages',
    label: msg('Messages'),
    hint: msg('Told mostly through texts, calls, letters and posts.'),
  },
  {
    value: 'adventure',
    label: msg('Text adventure'),
    hint: msg('Where you are, what you can see and where you can go, like a classic text game.'),
  },
];

/** A few lines in each style, so the choice is easy to picture. */
const EXAMPLES: Record<NarrationStyle, string> = {
  mixed: msg(
    'Rain streaks the café window. Mina looks up from the counter, flour on her cheek.\n\nMina: "You\'re late."',
  ),
  narrated: msg(
    'Rain streaks the café window. Behind the counter, Mina looks up, flour on her cheek.\n\n"You\'re late," she says, but she\'s already smiling.',
  ),
  script: msg(
    '*The bell over the door jingles. Mina looks up from the counter.*\n\nMina: "You\'re late."\n\nTheo: "She means good morning."\n\n*Mina flicks a towel at him.*',
  ),
  roleplay: msg(
    '*Mina glances up from the counter and grins, flour on her cheek.* "You\'re late! I almost ate your croissant."\n\n*She slides the plate across, one bite missing.* "Okay. Most of your croissant."',
  ),
  thoughts: msg(
    'Mina: "You\'re late."\n\n<thought who="Mina">They came back. They actually came back.</thought>\n\n*She pushes a cup across the counter.*\n\nMina: "Sit, before the rain follows you in."',
  ),
  messages: msg(
    '<text from="Mina" time="7:02 AM">you up?</text>\n<text from="Mina" time="7:02 AM">the café flooded a little lol</text>\n<text from="Mina" time="7:03 AM">can you come help 🥺</text>\n\nA minute later, the phone rings.\n\n<call with="Mina" status="ringing"/>',
  ),
  adventure: msg(
    '**Café Lumen**\n\nA warm, narrow café. Rain streaks the window. Mina is behind the counter, drying cups. A door behind her leads to the back room, and a chalkboard menu hangs by the till.\n\nMina says, "You\'re late."',
  ),
};

export const PERSPECTIVES: PickerOption<Perspective>[] = [
  { value: 'second', label: msg('Second person (you)'), hint: msg('"You open the door."') },
  { value: 'first', label: msg('First person (I)'), hint: msg('"I open the door."') },
  { value: 'third', label: msg('Third person (they)'), hint: msg('"Sam opens the door."') },
];
export const DETAILS: PickerOption<Detail>[] = [
  { value: 'brief', label: msg('Brief'), hint: msg('One or two short paragraphs a reply.') },
  { value: 'balanced', label: msg('Balanced'), hint: msg('Two to four paragraphs a reply.') },
  {
    value: 'detailed',
    label: msg('Detailed'),
    hint: msg('Three to five rich paragraphs a reply.'),
  },
  {
    value: 'cinematic',
    label: msg('Cinematic'),
    hint: msg('Vivid scenes full of sights and sounds.'),
  },
];
export const PACINGS: PickerOption<Pacing>[] = [
  { value: 'fast', label: msg('Fast'), hint: msg('Events keep moving.') },
  { value: 'normal', label: msg('Normal'), hint: msg('A steady pace.') },
  { value: 'slow', label: msg('Slow'), hint: msg('Scenes take their time.') },
];
export const TENSES: PickerOption<Tense | ''>[] = [
  { value: '', label: msg('Not set') },
  { value: 'present', label: msg('Present'), hint: msg('"Mina smiles."') },
  { value: 'past', label: msg('Past'), hint: msg('"Mina smiled."') },
];
export const SURPRISES: PickerOption<Surprises>[] = [
  { value: 'sometimes', label: msg('Sometimes'), hint: msg('When the story calls for one.') },
  { value: 'often', label: msg('Often'), hint: msg('Complications and twists keep coming.') },
  { value: 'off', label: msg('None'), hint: msg('Things follow from what you and the others do.') },
];
/** What the storyteller offers for the player's next move after each reply. */
export const NEXT_MOVES: PickerOption<NextMove>[] = [
  {
    value: 'ideas',
    label: msg('Ideas to pick'),
    hint: msg('Two or three ideas above the box after each reply. Pick one to put it in the box.'),
  },
  {
    value: 'choices',
    label: msg('Choices A–D'),
    hint: msg(
      'Four choices after each reply that take the story different ways. Click one to send it, or write your own. Each reply gets a few words longer.',
    ),
  },
  { value: 'off', label: msg('Off'), hint: msg('You write every move yourself.') },
];
export function nextMoveOf(n: Narration): NextMove {
  return n.noSuggestions ? 'off' : n.choices ? 'choices' : 'ideas';
}
/** The narration fields for a next-move choice; unset when usual. */
export function nextMovePatch(move: NextMove): Pick<Narration, 'noSuggestions' | 'choices'> {
  return {
    noSuggestions: move === 'off' ? true : undefined,
    choices: move === 'choices' ? true : undefined,
  };
}
const ASKERS: PickerOption<'both' | 'player'>[] = [
  { value: 'both', label: msg('The storyteller, and you any time') },
  { value: 'player', label: msg('Only you, when you choose to') },
];
const FREQUENCIES: PickerOption<RollFrequency>[] = [
  { value: 'rare', label: msg('Only at big moments') },
  { value: 'normal', label: msg('When it matters') },
  { value: 'often', label: msg('Whenever the outcome is uncertain') },
];
const ODDS: PickerOption<RollOdds>[] = [
  { value: 'generous', label: msg('Generous'), hint: msg('You succeed more often than not.') },
  { value: 'fair', label: msg('Fair'), hint: msg('Set from the story.') },
  { value: 'tough', label: msg('Tough'), hint: msg('Failure is common and costly.') },
];
const DICE_PRESETS = ['1d20', '2d6', '3d6', '1d100', '1d10', '1d6', '0-100'];

/** Languages offered for the story text; the value is what the storyteller reads. */
export const LANGUAGES: PickerOption<string>[] = [
  { value: '', label: msg('Not set (usually follows what you write)') },
  { value: 'English', label: msg('English') },
  { value: 'Simplified Chinese', label: '简体中文 (Simplified Chinese)' },
  { value: 'Traditional Chinese', label: '繁體中文 (Traditional Chinese)' },
  { value: 'Japanese', label: '日本語 (Japanese)' },
  { value: 'Korean', label: '한국어 (Korean)' },
  { value: 'Spanish', label: 'Español (Spanish)' },
  { value: 'French', label: 'Français (French)' },
  { value: 'German', label: 'Deutsch (German)' },
  { value: 'Portuguese', label: 'Português (Portuguese)' },
  { value: 'Italian', label: 'Italiano (Italian)' },
  { value: 'Russian', label: 'Русский (Russian)' },
  { value: 'Vietnamese', label: 'Tiếng Việt (Vietnamese)' },
  { value: 'Thai', label: 'ไทย (Thai)' },
  { value: 'Indonesian', label: 'Bahasa Indonesia (Indonesian)' },
];

const APP_STORY_LANGUAGE: Partial<Record<Locale, string>> = {
  'zh-Hans': 'Simplified Chinese',
  'zh-Hant': 'Traditional Chinese',
  ja: 'Japanese',
  ko: 'Korean',
};

/**
 * The story language a new story starts with: the app's own language, so
 * someone using the app in Japanese gets a story in Japanese. English
 * leaves it unset. It can be changed in Style like any other choice.
 */
export function appStoryLanguage(): string | undefined {
  return APP_STORY_LANGUAGE[locale()];
}

/** The label for a story language value ("日本語 (Japanese)"). */
export function storyLanguageLabel(value: string): string {
  return t(LANGUAGES.find((l) => l.value === value)?.label ?? value);
}

/** The translated label of `value` in `options`, or `value` itself. */
export function labelOf<T extends string>(options: PickerOption<T>[], value: T | undefined) {
  const found = options.find((o) => o.value === value);
  return found ? t(found.label) : (value ?? '');
}

/** The fields that say how a story is told, kept when the world changes. */
export function tellingOf(n: Narration): Partial<Narration> {
  return {
    style: n.style,
    tense: n.tense,
    innerThoughts: n.innerThoughts,
    messageCards: n.messageCards,
    quietPhones: n.quietPhones,
    sceneHeadings: n.sceneHeadings,
    autopilot: n.autopilot,
    manualMemory: n.manualMemory,
    noSuggestions: n.noSuggestions,
    choices: n.choices,
    styleNotes: n.styleNotes,
    surprises: n.surprises,
    language: n.language,
    dice: n.dice,
    diceRules: n.diceRules,
  };
}

/** Dice rules with the usual choices left out; undefined when all are usual. */
export function cleanDiceRules(r: DiceRules | undefined): DiceRules | undefined {
  if (!r) return undefined;
  const out: DiceRules = {};
  const dice = r.dice?.trim();
  if (dice) out.dice = dice;
  if (r.frequency && r.frequency !== 'normal') out.frequency = r.frequency;
  if (r.odds && r.odds !== 'fair') out.odds = r.odds;
  if (r.noStats) out.noStats = true;
  if (r.crits) out.crits = true;
  if (r.hideTarget) out.hideTarget = true;
  if (r.playerOnly) out.playerOnly = true;
  return Object.keys(out).length ? out : undefined;
}

/** "1d20, generous odds, critical rolls", or '' for the usual dice. */
export function diceSummary(r: DiceRules | undefined): string {
  const rules = cleanDiceRules(r);
  if (!rules) return '';
  const parts: string[] = [];
  if (rules.dice) parts.push(rules.dice);
  if (rules.playerOnly) parts.push(t('only when you roll'));
  if (rules.frequency === 'rare') parts.push(t('rolls at big moments'));
  if (rules.frequency === 'often') parts.push(t('frequent rolls'));
  if (rules.odds === 'generous') parts.push(t('generous odds'));
  if (rules.odds === 'tough') parts.push(t('tough odds'));
  if (rules.noStats) parts.push(t('no stats'));
  if (rules.crits) parts.push(t('critical rolls'));
  if (rules.hideTarget) parts.push(t('secret targets'));
  return joinList(parts);
}

/** The features a story has on, for summaries ("Inner thoughts, Dice rolls"). */
export function featureList(n: Narration): string[] {
  const style = n.style ?? 'narrated';
  const out: string[] = [];
  if (style === 'thoughts' || n.innerThoughts) out.push(t('Inner thoughts'));
  if (style === 'messages' || n.messageCards) {
    out.push(
      n.quietPhones
        ? t('Texts and calls as cards (only you start them)')
        : t('Texts and calls as cards'),
    );
  }
  if (n.sceneHeadings) out.push(t('Place and time headings'));
  if (n.autopilot) out.push(t('Your small reactions'));
  if (n.surprises === 'often') out.push(t('Frequent twists'));
  if (n.surprises === 'off') out.push(t('No twists'));
  if (n.dice) {
    const rules = diceSummary(n.diceRules);
    out.push(rules ? t('Dice rolls ({rules})', { rules }) : t('Dice rolls'));
  }
  return out;
}

/** Story types that roll dice unless the player turns it off (as in Rust). */
export const DICE_STORY_TYPES = [
  'Adventure',
  'Fantasy',
  'School life',
  'Action',
  'Superhero',
  'Western',
  'Post-apocalyptic',
];

function Check({
  label,
  hint,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <label className="check">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-describedby={`${id}-hint`}
          onChange={(e) => onChange(e.target.checked)}
        />
        {label}
      </label>
      <p id={`${id}-hint`} className="muted small check-hint">
        {hint}
      </p>
    </div>
  );
}

/**
 * A few lines in the chosen style, with a heading, a thought and a text
 * card when those are on, drawn the way the reader draws them.
 */
export function StyleExample({ narration }: { narration: Narration }) {
  const style = narration.style ?? 'narrated';
  const parts: string[] = [];
  if (narration.sceneHeadings) {
    parts.push(`<scene place="${t('Café Lumen')}" time="${t('Friday, 7:14 AM')}"/>`);
  }
  parts.push(t(EXAMPLES[style]));
  if (narration.innerThoughts && style !== 'thoughts') {
    parts.push(
      `<thought who="${t('Mina')}">${t('They came back. They actually came back.')}</thought>`,
    );
  }
  if (narration.messageCards && style !== 'messages') {
    parts.push(
      `<text from="${t('Theo')}" time="${t('7:15 AM')}">${t('did you make it?? 👀')}</text>`,
    );
  }
  return (
    <figure className="style-example" aria-label={t('Example of this style')}>
      <figcaption className="muted small">{t('Example')}</figcaption>
      <div className="style-example-text">
        <RichText text={parts.join('\n\n')} playerName="" rolls={false} />
      </div>
    </figure>
  );
}

/**
 * The style: a picker with an example, a word that it is a starting point
 * and not a rule, and a box for the player's own wishes.
 */
export function StylePicker({
  narration,
  onChange,
}: {
  narration: Narration;
  onChange: (patch: Partial<Narration>) => void;
}) {
  const id = useId();
  const style = narration.style ?? 'narrated';
  return (
    <>
      <ArrowPicker
        label={t('Style')}
        options={tOptions(STYLES)}
        value={style}
        onChange={(s) => onChange({ style: s === 'narrated' ? undefined : s })}
      />
      {style !== 'mixed' && (
        <p className="muted small">
          {t(
            'A starting point, not a rule: the storyteller can switch for a moment, such as a text exchange or a private thought, then come back.',
          )}
        </p>
      )}
      <StyleExample narration={narration} />
      <div className="field">
        <label htmlFor={`${id}-notes`}>{t('Your own style (optional)')}</label>
        <textarea
          id={`${id}-notes`}
          rows={2}
          maxLength={600}
          value={narration.styleNotes ?? ''}
          placeholder={t('For example: like a cozy anime, lots of banter, short replies')}
          aria-describedby={`${id}-notes-hint`}
          onChange={(e) => onChange({ styleNotes: e.target.value || undefined })}
        />
        <p id={`${id}-notes-hint`} className="muted small">
          {t('Describe how you would like it told, in your own words. The storyteller follows it.')}
        </p>
      </div>
    </>
  );
}

/** Language, point of view, tense, detail and pacing. */
export function TellingFields({
  narration,
  onChange,
  typeLanguage = false,
}: {
  narration: Narration;
  onChange: (patch: Partial<Narration>) => void;
  /** Type any language instead of picking one. */
  typeLanguage?: boolean;
}) {
  const id = useId();
  const language = narration.language ?? '';
  const languages = LANGUAGES.some((l) => l.value === language)
    ? LANGUAGES
    : [...LANGUAGES, { value: language, label: t('Your own: {value}', { value: language }) }];
  return (
    <>
      {typeLanguage ? (
        <div className="field">
          <label htmlFor={`${id}-language`}>{t('Story language')}</label>
          <input
            id={`${id}-language`}
            value={language}
            list={`${id}-languages`}
            maxLength={60}
            placeholder={t('Not set (usually follows what you write)')}
            onChange={(e) => onChange({ language: e.target.value || undefined })}
          />
          <datalist id={`${id}-languages`}>
            {LANGUAGES.filter((l) => l.value).map((l) => (
              <option key={l.value} value={l.value} />
            ))}
          </datalist>
        </div>
      ) : (
        <ArrowPicker
          label={t('Story language')}
          options={tOptions(languages)}
          value={language}
          onChange={(l) => onChange({ language: l || undefined })}
        />
      )}
      <ArrowPicker
        label={t('Point of view')}
        options={tOptions(PERSPECTIVES)}
        value={narration.perspective}
        onChange={(perspective) => onChange({ perspective })}
      />
      <ArrowPicker
        label={t('Tense')}
        options={tOptions(TENSES)}
        value={narration.tense ?? ''}
        onChange={(tense) => onChange({ tense: tense || undefined })}
      />
      <ArrowPicker
        label={t('Detail')}
        options={tOptions(DETAILS)}
        value={narration.detail}
        onChange={(detail) => onChange({ detail })}
      />
      <ArrowPicker
        label={t('Pacing')}
        options={tOptions(PACINGS)}
        value={narration.pacing}
        onChange={(pacing) => onChange({ pacing })}
      />
    </>
  );
}

/**
 * How the story reads: style (with an example), language, point of view,
 * tense, detail and pacing. Used by Story details.
 */
export function StyleFields({
  narration,
  onChange,
  typeLanguage = false,
}: {
  narration: Narration;
  onChange: (patch: Partial<Narration>) => void;
  /** Type any language instead of picking one. */
  typeLanguage?: boolean;
}) {
  return (
    <>
      <StylePicker narration={narration} onChange={onChange} />
      <TellingFields narration={narration} onChange={onChange} typeLanguage={typeLanguage} />
    </>
  );
}

/** Dice, folded away until opened: who asks, which dice, how often and the odds. */
export function DiceSettings({
  rules,
  onChange,
}: {
  rules: DiceRules | undefined;
  onChange: (rules: DiceRules | undefined) => void;
}) {
  const id = useId();
  const r = rules ?? {};
  const set = (patch: Partial<DiceRules>) => onChange(cleanDiceRules({ ...r, ...patch }));
  const [dice, setDice] = useState(r.dice ?? '');
  const badDice = dice.trim() !== '' && !isDice(dice);
  return (
    <details className="sub-options">
      <summary>
        {t('Dice settings')}
        {cleanDiceRules(rules) && <span className="muted small"> · {diceSummary(rules)}</span>}
      </summary>
      <div className="sub-options-body">
        <ArrowPicker
          label={t('Who asks for rolls')}
          options={tOptions(ASKERS)}
          value={r.playerOnly ? 'player' : 'both'}
          onChange={(v) => set({ playerOnly: v === 'player' })}
        />
        <div className="field">
          <label htmlFor={`${id}-dice`}>{t('Dice for every roll')}</label>
          <input
            id={`${id}-dice`}
            value={dice}
            list={`${id}-dice-list`}
            maxLength={24}
            placeholder={t('The storyteller chooses')}
            aria-invalid={badDice}
            aria-describedby={`${id}-dice-hint`}
            onChange={(e) => {
              const v = e.target.value;
              setDice(v);
              if (v.trim() === '') set({ dice: undefined });
              else if (isDice(v)) set({ dice: v.trim() });
            }}
          />
          <datalist id={`${id}-dice-list`}>
            {DICE_PRESETS.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
          <p id={`${id}-dice-hint`} className={badDice ? 'error small' : 'muted small'}>
            {badDice
              ? t('Dice such as 1d20 or 2d6+1, or a range such as 40-100')
              : t('Leave it empty to let the storyteller pick dice that suit the moment.')}
          </p>
        </div>
        {!r.playerOnly && (
          <>
            <ArrowPicker
              label={t('How often to ask')}
              options={tOptions(FREQUENCIES)}
              value={r.frequency ?? 'normal'}
              onChange={(frequency) => set({ frequency })}
            />
            <ArrowPicker
              label={t('Odds')}
              options={tOptions(ODDS)}
              value={r.odds ?? 'fair'}
              onChange={(odds) => set({ odds })}
            />
          </>
        )}
        <Check
          label={t('Add your stats to rolls')}
          hint={t('Such as Strength +2 when you climb.')}
          checked={!r.noStats}
          onChange={(on) => set({ noStats: !on })}
        />
        <Check
          label={t('Critical rolls')}
          hint={t('On a single die, the top number always succeeds and a 1 always fails.')}
          checked={!!r.crits}
          onChange={(crits) => set({ crits })}
        />
        <Check
          label={t('Show the number needed before you roll')}
          hint={t('Turn it off to keep it secret until the dice land.')}
          checked={!r.hideTarget}
          onChange={(on) => set({ hideTarget: !on })}
        />
      </div>
    </details>
  );
}

/**
 * What the storyteller can do, each with a box to turn it off: thoughts,
 * texts and calls, headings, small reactions, memory notes, twists and
 * dice (with its settings folded away).
 */
export function FeatureFields({
  narration,
  onChange,
  dice = true,
}: {
  narration: Narration;
  onChange: (patch: Partial<Narration>) => void;
  /** Offer dice here; the wizard has its own RPG mode switch for them. */
  dice?: boolean;
}) {
  const style = narration.style ?? 'narrated';
  const cards = style === 'messages' || !!narration.messageCards;
  return (
    <>
      <p className="muted small">{t('Uncheck anything you don’t want in this story.')}</p>
      <Check
        label={t("Show other characters' inner thoughts")}
        hint={t("Their real reaction, even when they don't say it out loud.")}
        checked={style === 'thoughts' || !!narration.innerThoughts}
        disabled={style === 'thoughts'}
        onChange={(on) => onChange({ innerThoughts: on || undefined })}
      />
      <Check
        label={t('Show texts, calls and letters as cards')}
        hint={t('Like a phone screen or a letter. Most AI models can do this.')}
        checked={cards}
        disabled={style === 'messages'}
        onChange={(on) => onChange({ messageCards: on || undefined })}
      />
      {cards && (
        <div className="sub-options">
          <Check
            label={t('Characters can text or call you first')}
            hint={t('Turn it off and only you start texts and calls.')}
            checked={!narration.quietPhones}
            onChange={(on) => onChange({ quietPhones: on ? undefined : true })}
          />
        </div>
      )}
      <Check
        label={t('Show a heading when the place or time changes')}
        hint={t('Such as "Countryside — 7:11 PM" where the story moves on.')}
        checked={!!narration.sceneHeadings}
        onChange={(on) => onChange({ sceneHeadings: on || undefined })}
      />
      <Check
        label={t('Let the storyteller add your small reactions')}
        hint={t('A nod or a laugh now and then. It never decides what you say or choose.')}
        checked={!!narration.autopilot}
        onChange={(on) => onChange({ autopilot: on || undefined })}
      />
      <Check
        label={t('Let the storyteller keep memory notes')}
        hint={t(
          'It notes people, places, gifts and promises as the story goes, keeps the threads still to follow, and offers to add new characters. You can change all of it in Story memory.',
        )}
        checked={!narration.manualMemory}
        onChange={(on) => onChange({ manualMemory: on ? undefined : true })}
      />
      <ArrowPicker
        label={t('Help with your next move')}
        options={tOptions(NEXT_MOVES)}
        value={nextMoveOf(narration)}
        onChange={(move) => onChange(nextMovePatch(move))}
      />
      <ArrowPicker
        label={t('Twists and surprises')}
        options={tOptions(SURPRISES)}
        value={narration.surprises ?? 'sometimes'}
        onChange={(s) => onChange({ surprises: s === 'sometimes' ? undefined : s })}
      />
      {dice && (
        <Check
          label={t('Roll dice for uncertain moments')}
          hint={t('The storyteller sets the odds from the story, and the app rolls fairly.')}
          checked={!!narration.dice}
          onChange={(on) => onChange({ dice: on || undefined })}
        />
      )}
      {dice && narration.dice && (
        <DiceSettings
          rules={narration.diceRules}
          onChange={(diceRules) => onChange({ diceRules })}
        />
      )}
    </>
  );
}

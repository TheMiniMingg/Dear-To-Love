import { useId } from 'react';
import { ArrowPicker, type PickerOption } from '../../components/ArrowPicker';
import type { Narration, NarrationStyle } from '../../types';

export const STYLES: PickerOption<NarrationStyle>[] = [
  {
    value: 'narrated',
    label: 'Narrated',
    hint: 'A narrator describes what happens, with dialogue.',
  },
  {
    value: 'thoughts',
    label: 'Thoughts and dialogue, no narrator',
    hint: 'Only what the characters say and what goes through their heads.',
  },
  {
    value: 'script',
    label: 'Script',
    hint: 'Like a play: names, lines and short stage directions.',
  },
  {
    value: 'messages',
    label: 'Messages',
    hint: 'Told mostly through texts, calls, letters and posts.',
  },
];

/** Languages offered for the story text; the value is what the storyteller reads. */
export const LANGUAGES: PickerOption<string>[] = [
  { value: '', label: 'Not set (usually follows what you write)' },
  { value: 'English', label: 'English' },
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

/** The fields that say how a story is told, kept when the world changes. */
export function tellingOf(n: Narration): Partial<Narration> {
  return {
    style: n.style,
    innerThoughts: n.innerThoughts,
    messageCards: n.messageCards,
    language: n.language,
    dice: n.dice,
  };
}

/** Story types that roll dice unless the player turns it off (as in Rust). */
export const DICE_STORY_TYPES = ['Adventure', 'Fantasy', 'School life'];

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
      <p id={`${id}-hint`} className="muted small">
        {hint}
      </p>
    </div>
  );
}

/**
 * Style, inner thoughts, message cards, dice and the story language. Used by the
 * wizard's Narration step and by Story details.
 */
export function StyleFields({
  narration,
  onChange,
  typeLanguage = false,
}: {
  narration: Narration;
  onChange: (patch: Partial<Narration>) => void;
  /** Custom mode: type any language instead of picking one. */
  typeLanguage?: boolean;
}) {
  const id = useId();
  const style = narration.style ?? 'narrated';
  const language = narration.language ?? '';
  const languages = LANGUAGES.some((l) => l.value === language)
    ? LANGUAGES
    : [...LANGUAGES, { value: language, label: `Your own: ${language}` }];
  return (
    <>
      <ArrowPicker
        label="Style"
        options={STYLES}
        value={style}
        onChange={(s) => onChange({ style: s === 'narrated' ? undefined : s })}
      />
      <Check
        label="Show other characters' inner thoughts"
        hint="Their real reaction to what you do, even when they don't say it out loud."
        checked={style === 'thoughts' || !!narration.innerThoughts}
        disabled={style === 'thoughts'}
        onChange={(on) => onChange({ innerThoughts: on || undefined })}
      />
      <Check
        label="Show texts, calls and letters as cards"
        hint="When characters text, call or write to each other, it looks like a phone screen or a letter. Most AI models can do this; the offline storyteller answers your texts and calls."
        checked={style === 'messages' || !!narration.messageCards}
        disabled={style === 'messages'}
        onChange={(on) => onChange({ messageCards: on || undefined })}
      />
      <Check
        label="Roll dice for uncertain moments"
        hint="When you try something risky, the storyteller asks for a roll and sets the odds from the story (studying for a test raises your lowest score, for example), and the app rolls fairly. You can also roll on your own with your character's stats."
        checked={!!narration.dice}
        onChange={(on) => onChange({ dice: on || undefined })}
      />
      {typeLanguage ? (
        <div className="field">
          <label htmlFor={`${id}-language`}>Story language</label>
          <input
            id={`${id}-language`}
            value={language}
            list={`${id}-languages`}
            maxLength={60}
            placeholder="Not set (usually follows what you write)"
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
          label="Story language"
          options={languages}
          value={language}
          onChange={(l) => onChange({ language: l || undefined })}
        />
      )}
    </>
  );
}

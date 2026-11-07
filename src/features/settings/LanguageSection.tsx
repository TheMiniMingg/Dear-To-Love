import { useId } from 'react';
import { Languages } from 'lucide-react';
import { LANGUAGES, systemLocale, t, useLanguage, type LanguageChoice } from '../../i18n';

const nameOf = (id: string) => LANGUAGES.find((l) => l.id === id)?.name ?? id;

/**
 * Settings: the app's own language. Stories are written in the language
 * each story sets (Create → Style), whatever the app shows.
 */
export function LanguageSection() {
  const id = useId();
  const choice = useLanguage((s) => s.choice);
  const setChoice = useLanguage((s) => s.setChoice);
  return (
    <section
      id="settings-language"
      className="settings-section"
      tabIndex={-1}
      aria-labelledby={`${id}-title`}
    >
      <h2 id={`${id}-title`} className="section-title">
        <Languages className="section-icon" aria-hidden={true} />
        {t('Language')}
      </h2>
      <p className="muted">
        {t(
          "The language of menus, buttons and messages. A story is written in the language set in its own style, so you can play in one language with the app in another. Story presets and templates are in English; the storyteller still writes in the story's language.",
        )}
      </p>
      <div className="field language-field">
        <label htmlFor={`${id}-select`}>{t('App language')}</label>
        <select
          id={`${id}-select`}
          lang="mul"
          value={choice}
          onChange={(e) => setChoice(e.target.value as LanguageChoice)}
        >
          <option value="auto">
            {t('Same as this computer ({language})', { language: nameOf(systemLocale()) })}
          </option>
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id} lang={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}

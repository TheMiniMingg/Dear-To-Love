import { useId } from 'react';
import { Palette } from 'lucide-react';
import { THEMES, useLook, type ThemeId } from '../../app/look';
import { ReadingControls, ReadingSample } from '../../components/ReadingControls';
import { ThemePicker } from '../../components/ThemePicker';
import { t } from '../../i18n';

/**
 * Settings: the app's colours, whether stories take a look of their own,
 * and how stories are set (text size, column width, line spacing), shown
 * on a sample of a story.
 */
export function LookSection() {
  const id = useId();
  const theme = useLook((s) => s.theme);
  const fitGenre = useLook((s) => s.fitGenre);
  const update = useLook((s) => s.update);
  return (
    <section
      id="settings-look"
      className="settings-section"
      tabIndex={-1}
      aria-labelledby={`${id}-title`}
    >
      <h2 id={`${id}-title`} className="section-title">
        <Palette className="section-icon" aria-hidden={true} />
        {t('Look')}
      </h2>
      <p className="muted">{t('How the app and your stories look on this computer.')}</p>
      <ThemePicker
        legend={t('Theme')}
        value={theme}
        options={THEMES.map((x) => ({ id: x.id, theme: x.id, label: t(x.label), hint: t(x.hint) }))}
        onChange={(next) => update({ theme: next as ThemeId })}
      />
      <div className="field">
        <label className="check">
          <input
            type="checkbox"
            checked={fitGenre}
            aria-describedby={`${id}-fit`}
            onChange={(e) => update({ fitGenre: e.target.checked })}
          />
          {t('Give each story a look that fits its genre')}
        </label>
        <p id={`${id}-fit`} className="muted small check-hint">
          {t(
            'Horror and mysteries read in Gothic, science fiction in Neon, thrillers in Midnight, fantasy and history on Parchment, action and war in Ember, text adventures in Terminal, nature in Forest, the sea in Ocean, whimsical stories in Lavender, cozy stories in Café and romance in Rose. Change any story with Look beside it while reading.',
          )}
        </p>
      </div>
      <h3 className="settings-subtitle">{t('Reading')}</h3>
      <div className="reading-settings">
        <ReadingControls />
        <ReadingSample theme={theme} />
      </div>
    </section>
  );
}

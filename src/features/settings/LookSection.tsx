import { useId } from 'react';
import { Palette } from 'lucide-react';
import { THEMES, useLook, type ThemeId } from '../../app/look';
import { ReadingControls, ReadingSample } from '../../components/ReadingControls';
import { ThemePicker } from '../../components/ThemePicker';
import { msg, t } from '../../i18n';

/** Which look a story gets from its genre, as `themeForGenres` decides. */
const GENRE_LOOKS: [string, ThemeId][] = [
  [msg('Horror and mysteries'), 'gothic'],
  [msg('Science fiction'), 'neon'],
  [msg('Thrillers'), 'midnight'],
  [msg('Fantasy and history'), 'parchment'],
  [msg('Action and war'), 'ember'],
  [msg('Text adventures'), 'terminal'],
  [msg('Nature'), 'forest'],
  [msg('The sea'), 'ocean'],
  [msg('Whimsical stories'), 'lavender'],
  [msg('Cozy stories'), 'cafe'],
  [msg('Romance'), 'rose'],
];

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
        <div id={`${id}-fit`} className="muted small check-hint">
          <dl className="genre-looks" aria-label={t('Which look each genre gets')}>
            {GENRE_LOOKS.map(([genres, theme]) => (
              <div key={theme}>
                <dt>{t(genres)}</dt>
                <dd>{t(THEMES.find((x) => x.id === theme)?.label ?? theme)}</dd>
              </div>
            ))}
          </dl>
          <p>{t('Change any story with Look beside it while reading.')}</p>
        </div>
      </div>
      <h3 className="settings-subtitle">{t('Reading')}</h3>
      <div className="reading-settings">
        <ReadingControls />
        <ReadingSample theme={theme} />
      </div>
    </section>
  );
}

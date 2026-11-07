import { useId } from 'react';
import { Volume2 } from 'lucide-react';
import { useLibraryPrefs } from '../../app/library';
import { playChime } from '../../app/replyWatch';
import { t } from '../../i18n';

/** Settings: the chime when a reply is ready in a story you left. */
export function SoundSection() {
  const id = useId();
  const chime = useLibraryPrefs((s) => s.chime);
  const setChime = useLibraryPrefs((s) => s.setChime);
  return (
    <section
      id="settings-sound"
      className="settings-section"
      tabIndex={-1}
      aria-labelledby={`${id}-title`}
    >
      <h2 id={`${id}-title`} className="section-title">
        <Volume2 className="section-icon" aria-hidden={true} />
        {t('Sound')}
      </h2>
      <p className="muted">{t('What the app plays on this computer.')}</p>
      <div className="field">
        <label className="check">
          <input
            type="checkbox"
            checked={chime}
            aria-describedby={`${id}-hint`}
            onChange={(e) => {
              setChime(e.target.checked);
              if (e.target.checked) playChime();
            }}
          />
          {t('Chime when a reply is ready in another story')}
        </label>
        <p id={`${id}-hint`} className="muted small check-hint">
          {t(
            'A reply keeps writing while you read another story or look at your library. A notice says when it is ready either way.',
          )}
        </p>
      </div>
    </section>
  );
}

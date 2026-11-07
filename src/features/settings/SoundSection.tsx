import { useId } from 'react';
import { READING_SPEEDS, canReadAloud, useReadAloud, useVoices } from '../../app/readAloud';
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
      <h2 id={`${id}-title`}>{t('Sound')}</h2>
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
      <ReadAloudSettings />
    </section>
  );
}

/** The voice and speed replies are read aloud in, with a sample to try. */
function ReadAloudSettings() {
  const id = useId();
  const voices = useVoices();
  const voice = useReadAloud((s) => s.voice);
  const speed = useReadAloud((s) => s.speed);
  const trying = useReadAloud((s) => s.reading === 'settings-sample');
  const { setVoice, setSpeed, read, stop } = useReadAloud.getState();
  if (!canReadAloud()) {
    return (
      <div className="field read-aloud-settings">
        <h3>{t('Read aloud')}</h3>
        <p className="muted small">
          {t('This computer has no voices the app can use, so replies cannot be read aloud.')}
        </p>
      </div>
    );
  }
  return (
    <div className="field read-aloud-settings" aria-labelledby={`${id}-title`} role="group">
      <h3 id={`${id}-title`}>{t('Read aloud')}</h3>
      <p className="muted small">
        {t(
          'The speaker under a reply reads it aloud with this computer’s own voices, so it works offline and costs nothing.',
        )}
      </p>
      <label htmlFor={`${id}-voice`}>{t('Voice')}</label>
      <select
        id={`${id}-voice`}
        value={voice ?? ''}
        onChange={(e) => setVoice(e.target.value || null)}
      >
        <option value="">{t('The computer’s usual voice')}</option>
        {voices.map((v) => (
          <option key={v.voiceURI} value={v.voiceURI}>
            {v.lang ? `${v.name} (${v.lang})` : v.name}
          </option>
        ))}
      </select>
      <div className="inline-choices" role="radiogroup" aria-labelledby={`${id}-speed`}>
        <span id={`${id}-speed`} className="choices-label">
          {t('Speed')}
        </span>
        {READING_SPEEDS.map((s) => (
          <label key={s.id} className="check">
            <input
              type="radio"
              name={`${id}-speed`}
              checked={speed === s.id}
              onChange={() => setSpeed(s.id)}
            />
            {t(s.label)}
          </label>
        ))}
      </div>
      <div className="button-row">
        <button
          type="button"
          aria-pressed={trying}
          onClick={() =>
            trying
              ? stop()
              : read(
                  'settings-sample',
                  t('The bell over the door rings, and for a moment the whole café goes quiet.'),
                )
          }
        >
          {trying ? t('Stop') : t('Try it')}
        </button>
      </div>
    </div>
  );
}

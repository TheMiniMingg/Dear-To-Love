import { t } from '../../i18n';

/**
 * For a picture the app made: the description the picture service was
 * sent, folded away.
 */
export function MadeFrom({ text }: { text: string | null | undefined }) {
  if (!text?.trim()) return null;
  return (
    <details className="made-from">
      <summary>{t('What was sent to make it')}</summary>
      <p className="made-from-text">{text}</p>
      <p className="muted small">
        {t(
          'The app wrote this from the story’s details. Names are left out: picture services draw what the words describe, not who someone is.',
        )}
      </p>
    </details>
  );
}

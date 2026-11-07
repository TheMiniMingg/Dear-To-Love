/**
 * What a portrait or item picture is made from, for the player to read and
 * change first. The safe-for-work sentence and what is left out are shown
 * but can't be changed: the app always adds them.
 */
import { useId } from 'react';
import type { PictureDraft } from '../../types';
import { t } from '../../i18n';

/** As `MAX_PROMPT_CHARS` in Rust: the description and the closing sentence. */
const MAX_PROMPT = 1500;

export function PictureDescription({
  draft,
  own,
  onOwn,
}: {
  draft: PictureDraft;
  /** The player's own description, or null for the drafted one. */
  own: string | null;
  onOwn: (text: string | null) => void;
}) {
  const id = useId();
  const max = MAX_PROMPT - draft.closing.length - 1;
  return (
    <div className="picture-description" aria-label={t('What is sent')} role="group">
      <div className="field">
        <label htmlFor={`${id}-text`}>{t('Description')}</label>
        <textarea
          id={`${id}-text`}
          rows={4}
          maxLength={max}
          value={own ?? draft.description}
          aria-describedby={`${id}-fixed`}
          onChange={(e) => onOwn(e.target.value === draft.description ? null : e.target.value)}
        />
      </div>
      <div id={`${id}-fixed`} className="muted small">
        <p>{t('Always added: {sentence}', { sentence: draft.closing })}</p>
        <p>{t('Always left out: {list}', { list: draft.avoid })}</p>
      </div>
      {own !== null && (
        <button type="button" className="link-button small" onClick={() => onOwn(null)}>
          {t('Use the drafted description')}
        </button>
      )}
    </div>
  );
}

/** The description to send: the player's own, or none for the drafted one. */
export function ownPrompt(own: string | null): { prompt?: string } {
  const text = own?.trim();
  return text ? { prompt: text } : {};
}

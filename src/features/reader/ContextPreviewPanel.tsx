import { useEffect, useState } from 'react';
import { commands, errorMessage, formatUsd } from '../../api/commands';
import type { ContextPreview, Role } from '../../types';
import { intlLocale, msg, t, tKnown } from '../../i18n';

const ROLE_LABELS: Record<Role, string> = {
  system: msg('Instructions and story facts'),
  user: msg('Player'),
  assistant: msg('Story'),
};

function generatorLabel(generator: string): string {
  if (generator.startsWith('offline:')) return t('the offline summarizer');
  if (generator.startsWith('model:')) return generator.slice('model:'.length).replace('/', ' · ');
  return generator;
}

const fmt = (n: number) => n.toLocaleString(intlLocale());

/**
 * Read-only view of the exact prompt the next reply on this route would
 * send. Assembled locally; nothing is sent from here.
 */
export function ContextPreviewPanel({ routeId }: { routeId: string }) {
  const [preview, setPreview] = useState<ContextPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    commands
      .previewContext(routeId)
      .then((p) => {
        if (!cancelled) setPreview(p);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [routeId]);

  if (error) {
    return (
      <p role="alert" className="error">
        {error}
      </p>
    );
  }
  if (!preview) return <p className="muted">{t('Assembling…')}</p>;

  const room = preview.maxContextTokens - preview.reservedOutputTokens;
  const s = preview.summary;
  return (
    <div className="panel context-preview">
      <p className="muted small">
        {t(
          'This stays on your computer. Nothing is sent until you play. Token counts are approximate and err on the high side.',
        )}
      </p>
      <dl className="facts">
        <dt>{t('Storyteller')}</dt>
        <dd>
          {tKnown(preview.storytellerLabel)}
          {preview.live ? ` · ${preview.modelId}` : ''}
          {!preview.live && (
            <span className="muted small">
              {' '}
              {t("(writes offline and doesn't read this prompt; a connected AI would receive it)")}
            </span>
          )}
        </dd>
        <dt>{t('Size')}</dt>
        <dd>
          {t('About {used} of {room} prompt tokens, with {reserved} kept for the reply', {
            used: fmt(preview.estimatedInputTokens),
            room: fmt(room),
            reserved: fmt(preview.reservedOutputTokens),
          })}
        </dd>
        <dt>{t('Cost')}</dt>
        <dd>
          {!preview.live
            ? t('$0 (offline)')
            : preview.maxCostMicroUsd === null
              ? t('Unknown: this model has no prices. Add them in Usage & budget.')
              : preview.maxCostMicroUsd === 0
                ? t('$0 (local model)')
                : t('Up to about {cost} for this reply', {
                    cost: formatUsd(preview.maxCostMicroUsd),
                  })}
          {preview.live && preview.maxCostMicroUsd !== null && preview.maxCostMicroUsd > 0 && (
            <span className="muted small"> {t('(if the reply uses its full length)')}</span>
          )}
        </dd>
        <dt>{t('Memory')}</dt>
        <dd>
          {s
            ? t('Summary of turns 1–{to}', { to: s.coveredTurns })
            : preview.summaryDropped
              ? t('A summary exists but did not fit; only recent turns are sent.')
              : t('No summary yet. Summaries begin after 16 turns.')}
          {s && (
            <span className="muted small">
              {' '}
              {t('(last updated from turns {from}–{to} by {by})', {
                from: s.chunkFromTurn,
                to: s.coveredTurns,
                by: generatorLabel(s.generator),
              })}
            </span>
          )}
        </dd>
        <dt>{t('Recent turns')}</dt>
        <dd>
          {preview.omittedMessages > 0
            ? t('{n} messages word for word, {older} older left out to fit', {
                n: preview.verbatimMessages,
                older: preview.omittedMessages,
              })
            : t('{n} messages word for word', { n: preview.verbatimMessages })}
        </dd>
      </dl>
      {!preview.forWaitingAction && (
        <p className="muted small">{t('Your next action takes the place of the last message.')}</p>
      )}
      <ol className="prompt-messages" aria-label={t('Prompt messages')}>
        {preview.messages.map((m, i) => (
          <li key={i}>
            <div className="prompt-message-head">
              <strong>{t(ROLE_LABELS[m.role])}</strong>
              <span className="muted small">{t('~{n} tokens', { n: fmt(m.estimatedTokens) })}</span>
            </div>
            <pre tabIndex={0}>{m.content}</pre>
          </li>
        ))}
      </ol>
    </div>
  );
}

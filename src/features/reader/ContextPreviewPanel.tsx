import { useEffect, useState } from 'react';
import { commands, errorMessage } from '../../api/commands';
import type { ContextPreview, Role } from '../../types';

const ROLE_LABELS: Record<Role, string> = {
  system: 'Instructions and story facts',
  user: 'Player',
  assistant: 'Story',
};

function generatorLabel(generator: string): string {
  if (generator.startsWith('offline:')) return 'the offline summarizer';
  if (generator.startsWith('model:')) return generator.slice('model:'.length).replace('/', ' · ');
  return generator;
}

const fmt = (n: number) => n.toLocaleString();

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
  if (!preview) return <p className="muted">Assembling…</p>;

  const room = preview.maxContextTokens - preview.reservedOutputTokens;
  const s = preview.summary;
  return (
    <div className="panel context-preview">
      <p className="muted small">
        This stays on your computer. Nothing is sent until you play. Token counts are approximate
        and err on the high side.
      </p>
      <dl className="facts">
        <dt>Storyteller</dt>
        <dd>
          {preview.storytellerLabel}
          {preview.live ? ` · ${preview.modelId}` : ''}
          {!preview.live && (
            <span className="muted small">
              {' '}
              (writes offline and doesn&apos;t read this prompt; a connected AI would receive it)
            </span>
          )}
        </dd>
        <dt>Size</dt>
        <dd>
          About {fmt(preview.estimatedInputTokens)} of {fmt(room)} prompt tokens, with{' '}
          {fmt(preview.reservedOutputTokens)} kept for the reply
        </dd>
        <dt>Memory</dt>
        <dd>
          {s
            ? `Summary of turns 1–${s.coveredTurns}`
            : preview.summaryDropped
              ? 'A summary exists but did not fit; only recent turns are sent.'
              : 'No summary yet. Summaries begin after 16 turns.'}
          {s && (
            <span className="muted small">
              {' '}
              (last updated from turns {s.chunkFromTurn}–{s.coveredTurns} by{' '}
              {generatorLabel(s.generator)})
            </span>
          )}
        </dd>
        <dt>Recent turns</dt>
        <dd>
          {preview.verbatimMessages} messages word for word
          {preview.omittedMessages > 0 && `, ${preview.omittedMessages} older left out to fit`}
        </dd>
      </dl>
      {!preview.forWaitingAction && (
        <p className="muted small">Your next action takes the place of the last message.</p>
      )}
      <ol className="prompt-messages" aria-label="Prompt messages">
        {preview.messages.map((m, i) => (
          <li key={i}>
            <div className="prompt-message-head">
              <strong>{ROLE_LABELS[m.role]}</strong>
              <span className="muted small">~{fmt(m.estimatedTokens)} tokens</span>
            </div>
            <pre tabIndex={0}>{m.content}</pre>
          </li>
        ))}
      </ol>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { formatWhen } from '../../api/backups';
import { commands, errorMessage } from '../../api/commands';
import type { RouteView, StoryMemory } from '../../types';
import { plural } from '../routes/routeLayout';

/**
 * Reader -> Story memory: what the storyteller reads besides the newest
 * turns, and a reminder that all of it is kept in the story, so a new
 * storyteller picks up where the last one left off.
 */
export function StoryMemoryPanel({
  view,
  playerName,
  detailsDisabled,
  onOpenDetails,
  onOpenStoryteller,
}: {
  view: RouteView;
  playerName: string;
  detailsDisabled: boolean;
  onOpenDetails: () => void;
  onOpenStoryteller: () => void;
}) {
  const [memory, setMemory] = useState<StoryMemory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const routeId = view.route.id;
  const headId = view.state.headEventId;

  useEffect(() => {
    let live = true;
    commands
      .getStoryMemory(routeId)
      .then((m) => {
        if (live) setMemory(m);
      })
      .catch((e: unknown) => {
        if (live) setError(errorMessage(e));
      });
    return () => {
      live = false;
    };
  }, [routeId, headId]);

  const s = view.state.state;
  const nameOf = (id: string) =>
    id === '@player' || id === s.playerCharacterId
      ? playerName
      : s.characters[id]?.name || 'someone';
  const facts = s.knownFacts.filter((f) => f.confirmed && f.text.trim());
  const threads = s.openThreads.filter((t) => t.trim());
  const relationships = s.relationships.filter((r) => r.label.trim() || r.status.trim());
  const teller = view.storyteller;

  return (
    <div className="panel story-memory">
      <p>
        Every turn is saved in this story on your computer, and so is everything below: what the
        storyteller reads besides the newest turns. None of it is kept by an AI service, so when you
        change storytellers the new one reads all of it and carries on where the story was.
      </p>
      <div className="button-row">
        <span className="muted small">
          Now writing: <strong>{teller.label}</strong>
          {teller.modelId ? ` (${teller.modelId})` : ''}
        </span>
        <button type="button" onClick={onOpenStoryteller}>
          Change storyteller
        </button>
      </div>

      <section aria-labelledby="memory-summary">
        <h3 id="memory-summary">The story so far</h3>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {!memory && !error && <p className="muted small">Loading…</p>}
        {memory && memory.summary && (
          <>
            <p className="memory-summary-text">{memory.summary.text}</p>
            <p className="muted small">
              Covers turns 1 to {memory.summary.coveredTurns} of {memory.turns}. The storyteller
              reads this instead of those turns, and reads the{' '}
              {plural(memory.turns - memory.summary.coveredTurns, 'newer turn')} word for word.
              Written by{' '}
              {memory.summary.writtenBy
                ? `${memory.summary.writtenBy.label}${memory.summary.writtenBy.modelId ? ` (${memory.summary.writtenBy.modelId})` : ''}`
                : 'the offline storyteller'}
              , {formatWhen(memory.summary.createdAt)}.
            </p>
          </>
        )}
        {memory && !memory.summary && (
          <p className="muted">
            {memory.turns < memory.firstSummaryAfter
              ? `Not needed yet: the storyteller still reads all ${plural(memory.turns, 'turn')} word for word. After ${memory.firstSummaryAfter} turns, the earlier ones are summarized here.`
              : 'No summary yet. One is written after a reply; until then the storyteller reads the newest turns word for word.'}
          </p>
        )}
      </section>

      <section aria-labelledby="memory-chapters">
        <h3 id="memory-chapters">Earlier chapters</h3>
        {memory && memory.recaps.length === 0 && (
          <p className="muted">When you end a chapter with End chapter, its recap is kept here.</p>
        )}
        {memory && memory.recaps.length > 0 && (
          <>
            <ol className="memory-recaps">
              {memory.recaps.map((r) => (
                <li key={r.ordinal}>
                  <strong>
                    Chapter {r.ordinal}: {r.title}
                  </strong>
                  <p>{r.text}</p>
                </li>
              ))}
            </ol>
            {memory.recaps.length > memory.recapsRead && (
              <p className="muted small">
                The storyteller reads the newest {memory.recapsRead}; the summary covers the rest.
              </p>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="memory-facts">
        <h3 id="memory-facts">Facts, relationships and open threads</h3>
        <p className="muted small">These go into every reply. Change them in Story details.</p>
        {facts.length === 0 && relationships.length === 0 && threads.length === 0 && (
          <p className="muted">None yet.</p>
        )}
        {facts.length > 0 && (
          <>
            <h4>Facts</h4>
            <ul aria-label="Facts" className="memory-list">
              {facts.map((f) => (
                <li key={f.id}>
                  {f.text}
                  {f.knownBy.length > 0 && (
                    <span className="muted small">
                      {' '}
                      (known to {f.knownBy.map(nameOf).join(', ')})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        {relationships.length > 0 && (
          <>
            <h4>Relationships</h4>
            <ul aria-label="Relationships" className="memory-list">
              {relationships.map((r, i) => (
                <li key={`${r.fromId}-${r.toId}-${i}`}>
                  {nameOf(r.fromId)} → {nameOf(r.toId)}: {r.label}
                  {r.status ? ` (${r.status})` : ''}
                </li>
              ))}
            </ul>
          </>
        )}
        {threads.length > 0 && (
          <>
            <h4>Open threads</h4>
            <ul aria-label="Open threads" className="memory-list">
              {threads.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </>
        )}
        <div className="button-row">
          <button type="button" onClick={onOpenDetails} disabled={detailsDisabled}>
            Edit in Story details
          </button>
        </div>
      </section>
    </div>
  );
}

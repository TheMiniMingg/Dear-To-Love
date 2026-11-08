import { useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { formatWhen } from '../../api/backups';
import { commands, errorMessage } from '../../api/commands';
import type { RouteView, StoryMemory, SummaryWriter } from '../../types';
import { joinList, joinSentences, t, tKnown, tn, tr } from '../../i18n';
import { chapterHeading } from '../../i18n/names';
import { Notebook } from './Notebook';
import { BondBar } from './feelings';
import { ThreadLog } from './ThreadLog';

/** Who wrote a summary: "Cloud model (story-model)", or the offline storyteller. */
function writerName(w: SummaryWriter | undefined): string {
  if (!w) return t('the offline storyteller');
  return w.modelId ? `${tKnown(w.label)} (${w.modelId})` : tKnown(w.label);
}

/**
 * Reader -> Story memory: what the storyteller reads besides the newest
 * turns (the notebook of memory notes, the summary, chapter recaps and
 * story details), and a reminder that all of it is kept in the story, so a
 * new storyteller picks up where the last one left off.
 */
export function StoryMemoryPanel({
  view,
  startNote,
  playerName,
  detailsDisabled,
  onChanged,
  onOpenDetails,
  onOpenStoryteller,
}: {
  view: RouteView;
  /** Words picked in the story ("Remember this"): open a note holding them. */
  startNote?: string | null;
  playerName: string;
  /** True while a reply is being written: details and notes wait. */
  detailsDisabled: boolean;
  onChanged: (v: RouteView) => void;
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
      : s.characters[id]?.name || t('someone');
  const facts = s.knownFacts.filter((f) => f.confirmed && f.text.trim());
  const relationships = s.relationships.filter((r) => r.label.trim() || r.status.trim() || r.bond);
  const teller = view.storyteller;

  return (
    <div className="panel story-memory">
      <p>
        {t(
          'Every turn is saved in this story on your computer, and so is everything below: what the storyteller reads besides the newest turns. None of it is kept by an AI service, so when you change storytellers the new one reads all of it and carries on where the story was.',
        )}
      </p>
      <div className="button-row">
        <span className="muted small">
          {tr('Now writing: {name}', { name: <strong>{tKnown(teller.label)}</strong> })}
          {teller.modelId ? ` (${teller.modelId})` : ''}
        </span>
        <button type="button" onClick={onOpenStoryteller}>
          {t('Change storyteller')}
        </button>
      </div>

      <Notebook
        view={view}
        disabled={detailsDisabled}
        onChanged={onChanged}
        startNote={startNote}
      />
      <ThreadLog view={view} disabled={detailsDisabled} onChanged={onChanged} />

      <section aria-labelledby="memory-summary">
        <h3 id="memory-summary" className="memory-heading">
          <ScrollText aria-hidden={true} size={18} /> {t('The story so far')}
        </h3>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {!memory && !error && <p className="muted small">{t('Loading…')}</p>}
        {memory && memory.summary && (
          <>
            <p className="memory-summary-text">{memory.summary.text}</p>
            <p className="muted small">
              {joinSentences([
                t('Covers turns 1 to {covered} of {total}.', {
                  covered: memory.summary.coveredTurns,
                  total: memory.turns,
                }),
                tn(
                  memory.turns - memory.summary.coveredTurns,
                  'The storyteller reads this instead of those turns, and reads the {n} newer turn word for word.',
                  'The storyteller reads this instead of those turns, and reads the {n} newer turns word for word.',
                ),
                t('Written by {by}, {when}.', {
                  by: writerName(memory.summary.writtenBy),
                  when: formatWhen(memory.summary.createdAt),
                }),
              ])}
            </p>
          </>
        )}
        {memory && !memory.summary && (
          <p className="muted">
            {memory.turns < memory.firstSummaryAfter
              ? tn(
                  memory.turns,
                  'Not needed yet: the story has {n} turn so far, and the storyteller reads it word for word. After {after} turns, the earlier ones are summarized here.',
                  'Not needed yet: the storyteller still reads all {n} turns word for word. After {after} turns, the earlier ones are summarized here.',
                  { after: memory.firstSummaryAfter },
                )
              : t(
                  'No summary yet. One is written after a reply; until then the storyteller reads the newest turns word for word.',
                )}
          </p>
        )}
      </section>

      <section aria-labelledby="memory-chapters">
        <h3 id="memory-chapters">{t('Earlier chapters')}</h3>
        {memory && memory.recaps.length === 0 && (
          <p className="muted">
            {t('When you end a chapter with End chapter, its recap is kept here.')}
          </p>
        )}
        {memory && memory.recaps.length > 0 && (
          <>
            <ol className="memory-recaps">
              {memory.recaps.map((r) => (
                <li key={r.ordinal}>
                  <strong>{chapterHeading(r.ordinal, r.title)}</strong>
                  <p>{r.text}</p>
                </li>
              ))}
            </ol>
            {memory.recaps.length > memory.recapsRead && (
              <p className="muted small">
                {memory.recaps.length > memory.recapsRead + memory.recapsBriefed
                  ? t(
                      'The storyteller reads the newest {n} in full and the {m} before them in brief; the summary and the notebook cover the rest.',
                      { n: memory.recapsRead, m: memory.recapsBriefed },
                    )
                  : t(
                      'The storyteller reads the newest {n} in full and the earlier ones in brief.',
                      {
                        n: memory.recapsRead,
                      },
                    )}
              </p>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="memory-facts">
        <h3 id="memory-facts">{t('Facts and relationships')}</h3>
        <p className="muted small">
          {t('These go into every reply. Change them in Story details.')}
        </p>
        {facts.length === 0 && relationships.length === 0 && (
          <p className="muted">{t('None yet.')}</p>
        )}
        {facts.length > 0 && (
          <>
            <h4>{t('Facts')}</h4>
            <ul aria-label={t('Facts')} className="memory-list">
              {facts.map((f) => (
                <li key={f.id}>
                  {f.text}
                  {f.knownBy.length > 0 && (
                    <span className="muted small">
                      {' '}
                      {t('(known to {names})', { names: joinList(f.knownBy.map(nameOf)) })}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        {relationships.length > 0 && (
          <>
            <h4>{t('Relationships')}</h4>
            <ul aria-label={t('Relationships')} className="memory-list">
              {relationships.map((r, i) => (
                <li key={`${r.fromId}-${r.toId}-${i}`} className="relationship-row">
                  <span>
                    {nameOf(r.fromId)} → {nameOf(r.toId)}
                    {r.label || r.status ? ': ' : ''}
                    {r.label}
                    {r.label && r.status ? ` (${r.status})` : r.status}
                  </span>
                  {r.bond && <BondBar bond={r.bond} name={nameOf(r.fromId)} />}
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="button-row">
          <button type="button" onClick={onOpenDetails} disabled={detailsDisabled}>
            {t('Edit in Story details')}
          </button>
        </div>
      </section>
    </div>
  );
}

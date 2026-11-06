import type { ChapterDto } from '../../types';

type Props = {
  chapters: ChapterDto[];
  activeEventId: string | null;
  onRestart: (chapterEventId: string) => void;
};

/** Chapters on the current route. Replaying one starts a new branch. */
export function ChaptersPanel({ chapters, activeEventId, onRestart }: Props) {
  return (
    <div className="panel">
      <p className="muted small">
        Replaying a chapter starts a new branch at its beginning. This route keeps its outcome.
      </p>
      <ul className="item-list" aria-label="Chapters">
        {chapters.map((c) => (
          <li key={c.eventId} className="item-row">
            <div>
              <strong>
                Chapter {c.ordinal}: {c.title}
              </strong>
              {c.eventId === activeEventId && <span className="badge">Current</span>}
            </div>
            <button type="button" onClick={() => onRestart(c.eventId)}>
              Replay as new branch
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

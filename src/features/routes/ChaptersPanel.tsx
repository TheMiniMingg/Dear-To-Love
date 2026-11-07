import type { ChapterDto } from '../../types';
import { t } from '../../i18n';
import { chapterHeading } from '../../i18n/names';

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
        {t(
          'Replaying a chapter starts a new branch at its beginning. This route keeps its outcome.',
        )}
      </p>
      <ul className="item-list" aria-label={t('Chapters')}>
        {chapters.map((c) => (
          <li key={c.eventId} className="item-row">
            <div>
              <strong>{chapterHeading(c.ordinal, c.title)}</strong>
              {c.eventId === activeEventId && <span className="badge">{t('Current')}</span>}
            </div>
            <button type="button" onClick={() => onRestart(c.eventId)}>
              {t('Replay as new branch')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

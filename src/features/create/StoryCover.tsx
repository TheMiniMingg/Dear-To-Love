import type { ReactNode } from 'react';
import { defaultStoryTheme, useLook } from '../../app/look';
import { Thumb } from '../images/ImageGrid';
import { NAME_COLORS, nameStyle } from '../reader/nameColors';
import { t } from '../../i18n';

/** Someone in the story, for the cover's cast row. */
export type CoverPerson = {
  id: string;
  name: string;
  role?: string;
  /** A library picture of them, if one was chosen. */
  portraitId?: string;
  /** Their own name colour, if they have one. */
  color?: string;
  you?: boolean;
};

/** The colour a cast member is shown in on the cover; the player keeps the accent. */
function personColor(p: CoverPerson, i: number): string | null {
  if (p.you) return null;
  return p.color ?? NAME_COLORS[(i * 3 + 1) % NAME_COLORS.length] ?? null;
}

const initial = (name: string) => [...name.trim()][0]?.toUpperCase() ?? '?';

/**
 * A story drawn as a book cover in the look it will have: its cover
 * picture (or a large letter), title, genres, premise and cast, then the
 * first page: the chapter's title and the opening lines in the story font.
 * Used by Preset Story and by Custom Story as a live preview.
 */
export function StoryCover({
  title,
  genres,
  premise,
  coverId,
  cast,
  chapterTitle,
  opening,
  label,
  children,
}: {
  title: string;
  genres: string[];
  premise?: string;
  coverId?: string;
  cast: CoverPerson[];
  chapterTitle?: string;
  opening?: string;
  /** Names the preview for screen readers. */
  label: string;
  /** Facts and buttons under the first page. */
  children?: ReactNode;
}) {
  const theme = useLook((s) => defaultStoryTheme(s, genres));
  const shownTitle = title.trim() || t('Untitled story');
  const people = cast.filter((p) => p.name.trim());
  return (
    <aside className="story-cover-card" data-theme-preview={theme} aria-label={label}>
      <div className="cover-art">
        {coverId ? (
          <Thumb assetId={coverId} alt="" size="full" className="story-cover" />
        ) : (
          <span className="story-letter" aria-hidden="true">
            {initial(shownTitle)}
          </span>
        )}
        <span className="story-fade" aria-hidden="true" />
        <div className="cover-heading">
          {genres.length > 0 && (
            <ul className="cover-genres" aria-label={t('Genre')}>
              {genres.slice(0, 3).map((g) => (
                <li key={g}>{t(g)}</li>
              ))}
            </ul>
          )}
          <h2 className="cover-title">{shownTitle}</h2>
        </div>
      </div>
      <div className="cover-body">
        {premise?.trim() && <p className="cover-premise">{premise.trim()}</p>}
        {people.length > 0 && (
          <ul className="cover-cast" aria-label={t('Cast')}>
            {people.slice(0, 5).map((p, i) => (
              <li key={p.id} style={nameStyle(personColor(p, i))} data-you={p.you || undefined}>
                {p.portraitId ? (
                  <Thumb assetId={p.portraitId} alt="" className="cover-face" />
                ) : (
                  <span className="cover-face cover-initial" aria-hidden="true">
                    {initial(p.name)}
                  </span>
                )}
                <span className="cover-name">{p.name.trim()}</span>
                <span className="cover-role">{p.you ? t('You') : (p.role?.trim() ?? '')}</span>
              </li>
            ))}
          </ul>
        )}
        {(chapterTitle?.trim() || opening?.trim()) && (
          <div className="first-page" aria-label={t('First page')}>
            <p className="chapter-number">{t('Chapter {n}', { n: 1 })}</p>
            {chapterTitle?.trim() && <h3 className="first-page-title">{chapterTitle.trim()}</h3>}
            {opening?.trim() && <p className="first-page-text">{opening.trim()}</p>}
          </div>
        )}
        {children}
      </div>
    </aside>
  );
}

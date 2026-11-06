import { useState } from 'react';
import { commands, errorMessage } from '../../api/commands';
import type { BookmarkDto, EventKind, SearchHit, SearchResults } from '../../types';

/** Who or what a place in the story is, for the result lines. */
export function placeLabel(
  p: Pick<SearchHit, 'kind' | 'chapterOrdinal' | 'chapterTitle'>,
  playerName: string,
): string {
  const what: Record<EventKind, string> = {
    chapter_start: 'Chapter start',
    player: playerName,
    assistant: 'Story',
    edit: 'Story details',
    checkpoint: 'Checkpoint',
    fact_confirm: 'Fact',
  };
  const chapter =
    p.chapterOrdinal !== null && p.kind !== 'chapter_start'
      ? `Chapter ${p.chapterOrdinal}${p.chapterTitle ? `: ${p.chapterTitle}` : ''} · `
      : '';
  return `${chapter}${what[p.kind]}`;
}

function summary(r: SearchResults, routeLabel: string): string {
  if (r.total === 0) return `Nothing on ${routeLabel} matches “${r.query}”.`;
  const places = r.total === 1 ? '1 place' : `${r.total} places`;
  const shown = r.hits.length < r.total ? ` Showing the first ${r.hits.length}.` : '';
  return `${places} on ${routeLabel} ${r.total === 1 ? 'matches' : 'match'} “${r.query}”.${shown}`;
}

type Props = {
  storyId: string;
  routeId: string;
  routeLabel: string;
  playerName: string;
  /** The last search on this route, kept while the reader is open. */
  last: SearchResults | null;
  onSearched: (r: SearchResults) => void;
  bookmarks: BookmarkDto[];
  onBookmarksChanged: () => void;
  /** Close the panel and show this event in the story. */
  onGo: (eventId: string) => void;
};

/** Pause menu -> Story search: search this route and its bookmarks. */
export function SearchPanel({
  storyId,
  routeId,
  routeLabel,
  playerName,
  last,
  onSearched,
  bookmarks,
  onBookmarksChanged,
  onGo,
}: Props) {
  const [query, setQuery] = useState(last?.query ?? '');
  const [results, setResults] = useState<SearchResults | null>(last);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; label: string } | null>(null);

  const search = async () => {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await commands.searchRoute(routeId, query);
      setResults(r);
      onSearched(r);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const change = async (work: () => Promise<unknown>) => {
    setError(null);
    try {
      await work();
      setRenaming(null);
      onBookmarksChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className="panel search-panel">
      <form
        role="search"
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <label htmlFor="search-input">Search {routeLabel}</label>
        <input
          id="search-input"
          type="search"
          value={query}
          maxLength={200}
          placeholder="Words from the story"
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className="primary" disabled={busy || !query.trim()}>
          Search
        </button>
      </form>
      <p className="muted small">
        Searches what happened on this route only. Other branches have their own history.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div aria-live="polite">
        {busy && <p className="muted">Searching…</p>}
        {results && !busy && <p role="status">{summary(results, routeLabel)}</p>}
      </div>
      {results && results.hits.length > 0 && (
        <ol className="search-results" aria-label="Search results">
          {results.hits.map((h) => (
            <li key={h.eventId}>
              <button type="button" className="search-hit" onClick={() => onGo(h.eventId)}>
                <span className="muted small">{placeLabel(h, playerName)}</span>
                <span className="search-snippet">
                  {h.snippet.map((part, i) =>
                    part.mark ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>,
                  )}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}

      <section aria-labelledby="bookmarks-title" className="bookmarks">
        <h3 id="bookmarks-title">Bookmarks on {routeLabel}</h3>
        {bookmarks.length === 0 ? (
          <p className="muted">
            No bookmarks yet. Choose Bookmark under any part of the story to mark it.
          </p>
        ) : (
          <ul className="item-list" aria-labelledby="bookmarks-title">
            {bookmarks.map((b) => (
              <li key={b.id} className="item-row">
                {renaming?.id === b.id ? (
                  <form
                    className="inline-form bookmark-rename"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void change(() => commands.renameBookmark(storyId, b.id, renaming.label));
                    }}
                  >
                    <label htmlFor={`bookmark-name-${b.id}`} className="visually-hidden">
                      Bookmark name
                    </label>
                    <input
                      id={`bookmark-name-${b.id}`}
                      value={renaming.label}
                      maxLength={120}
                      autoFocus
                      onChange={(e) => setRenaming({ id: b.id, label: e.target.value })}
                    />
                    <button type="submit" className="primary" disabled={!renaming.label.trim()}>
                      Save name
                    </button>
                    <button type="button" onClick={() => setRenaming(null)}>
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="bookmark-text">
                      <strong>{b.label}</strong>
                      <div className="muted small">{placeLabel(b, playerName)}</div>
                      {/* An automatic name is already the start of the text. */}
                      {!b.excerpt.startsWith(b.label.replace(/…$/, '')) && (
                        <div className="small bookmark-excerpt">{b.excerpt}</div>
                      )}
                    </div>
                    <div className="button-row">
                      <button
                        type="button"
                        aria-label={`Go to bookmark ${b.label}`}
                        onClick={() => onGo(b.eventId)}
                      >
                        Go to
                      </button>
                      <button
                        type="button"
                        aria-label={`Rename bookmark ${b.label}`}
                        onClick={() => setRenaming({ id: b.id, label: b.label })}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className="danger-link"
                        aria-label={`Remove bookmark ${b.label}`}
                        onClick={() => void change(() => commands.deleteBookmark(storyId, b.id))}
                      >
                        Remove
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

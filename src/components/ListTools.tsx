import { useDeferredValue, useMemo, useState } from 'react';
import { t } from '../i18n';

/** Text without accents or case, for matching what the player types. */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** True when every word of `query` is somewhere in `text`. */
export function matchesQuery(text: string, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = fold(text);
  return words.every((w) => hay.includes(w));
}

export type ListOption = { id: string; label: string };

type ViewOptions<T> = {
  /** What a search looks through. */
  text: (item: T) => string;
  /** The category id of an item, when the list has categories. */
  category?: (item: T) => string;
  /** Ways to order the list, by id; the first is the usual one. */
  sorts?: Record<string, ((a: T, b: T) => number) | null>;
};

/**
 * A long list, searched, narrowed to a category and sorted. The items
 * themselves are never changed: only which are shown, and in what order.
 */
export function useListView<T>(items: T[], opts: ViewOptions<T>) {
  const [query, setQuery] = useState('');
  // The box shows each key at once; a long list catches up a moment later.
  const searched = useDeferredValue(query);
  const [category, setCategory] = useState('');
  const sortIds = Object.keys(opts.sorts ?? {});
  const [sort, setSort] = useState(sortIds[0] ?? '');
  const { text, category: categoryOf, sorts } = opts;
  const counts = useMemo(() => {
    const out = new Map<string, number>();
    if (categoryOf)
      for (const item of items) out.set(categoryOf(item), (out.get(categoryOf(item)) ?? 0) + 1);
    return out;
  }, [items, categoryOf]);
  const shown = useMemo(() => {
    const list = items.filter(
      (item) =>
        matchesQuery(text(item), searched) &&
        (!category || !categoryOf || categoryOf(item) === category),
    );
    const compare = sorts?.[sort];
    return compare ? [...list].sort(compare) : list;
  }, [items, text, searched, category, categoryOf, sorts, sort]);
  return { query, setQuery, category, setCategory, sort, setSort, shown, counts };
}

type ToolsProps = {
  /** What the list holds, for the controls' names: "rules". */
  what: string;
  query: string;
  onQuery: (q: string) => void;
  categories?: ListOption[];
  counts?: Map<string, number>;
  category?: string;
  onCategory?: (c: string) => void;
  sorts?: ListOption[];
  sort?: string;
  onSort?: (s: string) => void;
  shown: number;
  total: number;
};

/** Search, a category and an order for a long list. */
export function ListTools({
  what,
  query,
  onQuery,
  categories,
  counts,
  category = '',
  onCategory,
  sorts,
  sort = '',
  onSort,
  shown,
  total,
}: ToolsProps) {
  const filtered = query.trim() !== '' || category !== '';
  return (
    <div className="list-tools" role="group" aria-label={t('Find in {what}', { what })}>
      <input
        type="search"
        value={query}
        aria-label={t('Search {what}', { what })}
        placeholder={t('Search…')}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && query) {
            e.preventDefault();
            e.stopPropagation();
            onQuery('');
          }
        }}
      />
      {categories && onCategory && (
        <select
          value={category}
          aria-label={t('Category of {what}', { what })}
          onChange={(e) => onCategory(e.target.value)}
        >
          <option value="">{t('All kinds')}</option>
          {categories
            .filter((c) => !counts || (counts.get(c.id) ?? 0) > 0)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {counts
                  ? t('{name} ({count})', { name: c.label, count: String(counts.get(c.id) ?? 0) })
                  : c.label}
              </option>
            ))}
        </select>
      )}
      {sorts && onSort && sorts.length > 1 && (
        <select
          value={sort}
          aria-label={t('Order of {what}', { what })}
          onChange={(e) => onSort(e.target.value)}
        >
          {sorts.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      )}
      {filtered && (
        <>
          <span className="muted small" role="status">
            {t('{shown} of {total}', { shown: String(shown), total: String(total) })}
          </span>
          <button
            type="button"
            className="link-button small"
            onClick={() => {
              onQuery('');
              onCategory?.('');
            }}
          >
            {t('Show all')}
          </button>
        </>
      )}
    </div>
  );
}

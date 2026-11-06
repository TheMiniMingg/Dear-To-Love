# ADR 0009: Route search and bookmarks

Status: accepted (PR 11)

## Context

T37 asks for search and bookmarks on a route: "search returns route-scoped
results; bookmarks resolve after reopen". The reference schema has a
`bookmarks` table with a route and an event, and the schema contract must
check that "referenced saves/bookmarks point to ancestors". The pause menu
lists Story Search, and M8's exit check searches an imported two-route
story.

## Decision

- **Scope is the route.** Search reads the route's history (the ancestors
  of its head), the same list the reader shows. Text that only exists on
  another branch never appears, and text the branches share appears on
  both. There is no whole-story search: a hit on another branch would need
  to switch routes to be shown, and the roadmap asks for route scope.
- **Matching.** The query is split into words (at most 8, 200 characters);
  an event matches when every word appears in it, in any order, ignoring
  case (per-character Unicode lowercase, so positions stay aligned). Parts
  of words match ("stair" finds "stairs"). The searched text is what the
  reader sees: chapter headings ("Chapter 2: The Keeper"), actions, replies,
  checkpoint labels, confirmed facts and edit notes.
- **No index.** A route's history is scanned in Rust on each search. Even a
  long story is a few megabytes of text, which scans in milliseconds, and an
  FTS table would need its own route scoping, triggers and upgrade path.
  Revisit if a measured story makes search slow.
- **Results** come in story order with the chapter each one is in and a
  snippet of about 200 characters around the first match, cut at spaces,
  with the matched words marked. The snippet is a list of `{ text, mark }`
  parts so the UI never renders HTML from story text. 200 hits are
  returned; `total` counts all of them.
- **Bookmarks** (`bookmarks`, migration 0005) name one event in one route's
  history: `UNIQUE (route_id, event_id)`, cascading with the route and the
  event. Adding checks ancestry (`INVALID_ANCESTOR` otherwise); bookmarking
  the same place again returns the same bookmark and renames it when a name
  is given. Without a name, a bookmark is named after the start of its text.
  Route heads only move forward, so a bookmarked event stays in its route;
  `db::contract` reports any bookmark that doesn't, and listing leaves such a
  row out rather than show it in the wrong place.
- **Branches keep shared bookmarks.** Every fork (Branch from here, Another
  reply, Change this action, Restart chapter, continuing an older save)
  copies the source route's bookmarks on the history the two routes share.
  After that each route's bookmarks are its own: renaming or removing one on
  a branch leaves the original alone.
- **Portability.** Storypacks carry bookmarks (`bookmarks` in `story.json`,
  optional so packs without it still import), checked like saves (route
  known, event on that route, a usable name, one per place) and remapped to
  new ids. Backups carry them as part of `story.db`, and a bookmark change
  counts as a change for the daily automatic backup.
- **Reader.** Story search opens from the pause menu, the action bar and
  Ctrl/Cmd+F, with the bookmarks of this route below the search. Choosing a
  result or a bookmark closes the panel, scrolls that place into view,
  focuses it for screen readers and highlights it briefly (an outline
  instead of the fade with reduced motion). The last search on the route is
  kept while the reader is open. Each chapter heading, action and reply
  offers Bookmark, a toggle that reads "★ Bookmarked" and stays visible once
  pressed.

## Consequences

- Search cost grows with route length; there is no ranking beyond story
  order. A route of tens of thousands of turns would want an index.
- Accents are not folded ("cafe" does not find "café").
- Bookmarks are per route, so a place shared by two branches can carry a
  different name on each.

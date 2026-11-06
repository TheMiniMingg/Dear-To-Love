# ADR 0019: Routes as a list, a map or a timeline

Status: accepted

## Context

MiniMe asked that routes can be viewed in more than one way: "as a map/diagram, or in other
forms", with a choice of view. The Routes panel was a flat list of names, so it couldn't show
how routes relate or how far each got.

## Decision

- **One read for all views.** `get_route_map(story_id)` (`services/route_map.rs`) returns every
  route (hidden ones too) with:
  - `turns`: player actions from the start of the story to the route's head;
  - `forkTurn`: player actions before it left its parent (absent for the original route);
  - `branch`: the first event after the fork on this route, as a kind (`action`, `reply`,
    `edit`, `chapter`) and a 140-character excerpt with message tags shown as words;
  - `latest`: the newest player or storyteller words (looking back at most 50 events);
  - `chapter`: the chapter the head is in.

  It loads the story's event tree once (id, parent and kind only) and memoizes turn counts and
  chapter starts, then reads the few payloads it shows. Nothing is stored, so there is no
  migration.

- **Three views of the same tree** (`src/features/routes`). `layoutRoutes` puts routes in tree
  order (each route followed by its branches, earliest branch point first) and attaches a
  route whose parent is hidden to the nearest shown ancestor.
  - **List**: indented by generation, with where it branched, what changed, turns, chapter,
    when it was last played and its latest words.
  - **Map**: a left-to-right diagram, one column per generation, joined at "after turn N".
  - **Timeline**: one row per route, a bar from where it branched to how far it got along the
    story's turns, with a dashed line up to its parent at the branch point.

  Map and Timeline select a route (buttons with `aria-pressed`) and show its details and
  actions below, so every view can switch, rename, hide and show routes.

- The chosen view is kept in `localStorage` (`dtl.routesView`); it is a per-device
  convenience, so it doesn't go in the database or backups.
- If the map can't be read, the panel still lists the routes from the route view.

## Consequences

- Text in the views is English for now; the UI translations part localizes it, which is why
  the backend returns kinds and numbers rather than sentences.
- Very wide trees scroll inside the map; the timeline always fits its width.

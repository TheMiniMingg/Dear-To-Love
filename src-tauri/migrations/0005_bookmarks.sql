-- 0005_bookmarks: route-event bookmarks (roadmap T37). A bookmark marks one
-- event in one route's history. Route heads only move forward, so the event
-- stays in that history; db::contract checks it at startup. Deleting the
-- story or the route removes its bookmarks.
CREATE TABLE bookmarks (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (route_id, event_id)
);
CREATE INDEX bookmarks_event_idx ON bookmarks(event_id);

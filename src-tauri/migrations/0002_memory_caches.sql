-- Derived, replaceable story memory (roadmap section 07). Never canonical:
-- a cache row may be deleted at any time and rebuilt from events.
-- Eligibility on a route is by ancestry of `source_end_event_id` and a
-- matching `source_hash`, so there is deliberately no route_id.
CREATE TABLE memory_caches (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('summary', 'scene_hint')),
  -- Previous summary's end (exclusive), or NULL when it starts at the story's beginning.
  source_start_event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
  source_end_event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  -- SHA-256 over the ancestor chain up to source_end (ids, kinds, payloads).
  source_hash TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  summary_text TEXT NOT NULL,
  scene_hint_json TEXT,
  covered_turns INTEGER NOT NULL CHECK (covered_turns >= 0),
  generator TEXT NOT NULL,
  api_request_id TEXT REFERENCES api_requests(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX one_cache_per_end
  ON memory_caches(source_end_event_id, kind, schema_version);
CREATE INDEX memory_caches_story_idx ON memory_caches(story_id);

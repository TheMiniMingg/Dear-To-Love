-- 0001_core: stories, immutable event graph, routes, saves, snapshots,
-- generation runs, provider profiles, usage ledger and preferences.
-- IDs are UUID TEXT generated in Rust. Timestamps are UTC RFC 3339 TEXT.
-- Ancestry and same-story membership are validated in Rust; SQLite FKs
-- cannot express them.

CREATE TABLE stories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  base_state_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE chapter_outlines (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  title TEXT NOT NULL,
  outline TEXT NOT NULL DEFAULT '',
  UNIQUE(story_id, ordinal)
);

CREATE TABLE routes (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  parent_route_id TEXT REFERENCES routes(id) ON DELETE CASCADE,
  fork_event_id TEXT REFERENCES events(id) DEFERRABLE INITIALLY DEFERRED,
  head_event_id TEXT REFERENCES events(id) DEFERRABLE INITIALLY DEFERRED,
  is_main INTEGER NOT NULL DEFAULT 0 CHECK (is_main IN (0, 1)),
  hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX one_main_route_per_story ON routes(story_id) WHERE is_main = 1;
CREATE INDEX routes_story_idx ON routes(story_id);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  origin_route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  parent_event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN
    ('chapter_start', 'player', 'assistant', 'edit', 'checkpoint', 'fact_confirm')),
  payload_json TEXT NOT NULL,
  payload_version INTEGER NOT NULL DEFAULT 1,
  generation_run_id TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX one_committed_event_per_generation
  ON events(generation_run_id) WHERE generation_run_id IS NOT NULL;
CREATE INDEX events_parent_idx ON events(parent_event_id);
CREATE INDEX events_story_idx ON events(story_id);

CREATE TABLE saves (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  save_type TEXT NOT NULL CHECK (save_type IN ('manual', 'quick', 'auto')),
  slot INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX saves_route_idx ON saves(route_id);
CREATE INDEX saves_event_idx ON saves(event_id);

CREATE TABLE snapshots (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  schema_version INTEGER NOT NULL,
  state_json TEXT NOT NULL,
  state_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (event_id, schema_version)
);

CREATE TABLE provider_profiles (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  adapter TEXT NOT NULL,
  model_id TEXT NOT NULL,
  base_url TEXT,
  secret_ref TEXT,
  billing TEXT NOT NULL DEFAULT 'paid' CHECK (billing IN ('paid', 'local')),
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE generation_runs (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  input_event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  provider_profile_id TEXT REFERENCES provider_profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN
    ('pending', 'streaming', 'completed', 'failed', 'cancelled', 'interrupted')),
  error_code TEXT,
  usage_json TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE UNIQUE INDEX one_active_generation_per_route
  ON generation_runs(route_id) WHERE status IN ('pending', 'streaming');
CREATE INDEX generation_runs_input_idx ON generation_runs(input_event_id);

CREATE TABLE api_rate_cards (
  id TEXT PRIMARY KEY,
  provider_profile_id TEXT NOT NULL REFERENCES provider_profiles(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  input_usd_per_million TEXT NOT NULL,
  output_usd_per_million TEXT NOT NULL,
  cached_input_usd_per_million TEXT,
  effective_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX api_rate_lookup ON api_rate_cards(provider_profile_id, model_id, effective_at);

-- One row per actual outbound model call, including summaries and retries.
-- History survives deletion of profiles and routes (labels + rate snapshot kept).
CREATE TABLE api_requests (
  id TEXT PRIMARY KEY,
  generation_run_id TEXT UNIQUE REFERENCES generation_runs(id) ON DELETE SET NULL,
  provider_profile_id TEXT REFERENCES provider_profiles(id) ON DELETE SET NULL,
  provider_label TEXT NOT NULL,
  model_id TEXT NOT NULL,
  billing TEXT NOT NULL DEFAULT 'paid' CHECK (billing IN ('paid', 'local')),
  session_id TEXT NOT NULL,
  route_id TEXT REFERENCES routes(id) ON DELETE SET NULL,
  purpose TEXT NOT NULL CHECK (purpose IN
    ('story_reply', 'memory_summary', 'character_suggestion', 'manual_test')),
  status TEXT NOT NULL CHECK (status IN
    ('reserved', 'sent', 'completed', 'failed', 'cancelled', 'unknown')),
  usage_source TEXT NOT NULL DEFAULT 'unknown' CHECK (usage_source IN
    ('provider', 'estimated', 'unknown')),
  input_tokens INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
  cached_input_tokens INTEGER CHECK (cached_input_tokens IS NULL OR cached_input_tokens >= 0),
  output_tokens INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
  cost_micro_usd INTEGER CHECK (cost_micro_usd IS NULL OR cost_micro_usd >= 0),
  reserved_micro_usd INTEGER NOT NULL DEFAULT 0 CHECK (reserved_micro_usd >= 0),
  rate_snapshot_json TEXT,
  error_code TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX api_requests_period_idx ON api_requests(started_at, provider_profile_id);
CREATE INDEX api_requests_session_idx ON api_requests(session_id);

CREATE TABLE app_preferences (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);

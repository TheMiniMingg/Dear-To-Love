-- 0011_user_presets: a player's own presets, saved from a story they made
-- (its world, cast, rules and style without the turns), listed under
-- Preset Story → Your presets. The draft is the creation wizard's draft as
-- JSON, so a preset starts a story exactly as the wizard would.
CREATE TABLE user_presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  from_story_title TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  draft_json TEXT NOT NULL
);
CREATE INDEX idx_user_presets_created ON user_presets (created_at DESC);

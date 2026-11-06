-- 0004_archive_operations: the storypack import journal (roadmap section 10).
-- One row per import. The database and the file system can't share a
-- transaction, so each import records its progress here and startup
-- recovery finishes or rolls back whatever an interruption left behind.
--   staged      files unpacked and checked in imports/<id>, nothing in the
--               story tables yet (recovery: roll back)
--   committed   story rows written in one transaction (recovery: finish)
--   complete    staging folder removed
--   rolled_back / failed  nothing of the import is visible
CREATE TABLE archive_operations (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('import')),
  stage_rel TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN
    ('staged', 'committed', 'complete', 'rolled_back', 'failed')),
  manifest_json TEXT NOT NULL,
  story_id TEXT REFERENCES stories(id) ON DELETE SET NULL,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX archive_operations_status_idx ON archive_operations(status);

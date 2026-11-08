-- no-transaction
-- 0010_gif_pictures: the image library takes GIF pictures too. The original
-- file is kept as it is, so a moving GIF keeps every frame; its thumbnail is
-- the first frame. SQLite cannot change a CHECK constraint in place, and
-- other tables point at assets, so this follows SQLite's steps for
-- rebuilding a table: foreign keys off, the rebuild in one transaction (no
-- row is dropped, so every reference still holds), foreign keys back on.
PRAGMA foreign_keys = OFF;
BEGIN;
CREATE TABLE assets_v10 (
  id TEXT PRIMARY KEY,
  sha256 TEXT NOT NULL UNIQUE,
  original_rel TEXT NOT NULL,
  thumb_rel TEXT,
  mime TEXT NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  label TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  shared INTEGER NOT NULL DEFAULT 1 CHECK (shared IN (0, 1)),
  made_from TEXT
);
INSERT INTO assets_v10 (id, sha256, original_rel, thumb_rel, mime, width, height, byte_size,
  label, tags_json, created_at, shared, made_from)
  SELECT id, sha256, original_rel, thumb_rel, mime, width, height, byte_size,
    label, tags_json, created_at, shared, made_from FROM assets;
DROP TABLE assets;
ALTER TABLE assets_v10 RENAME TO assets;
COMMIT;
PRAGMA foreign_keys = ON;

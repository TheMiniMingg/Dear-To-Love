-- 0003_assets: the reusable local image library (roadmap section 10).
-- One row per distinct image, keyed by the SHA-256 of its bytes. Files are
-- content-addressed under assets/originals and assets/thumbs; only paths
-- relative to the assets folder are stored, never absolute ones.
CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  sha256 TEXT NOT NULL UNIQUE,
  original_rel TEXT NOT NULL,
  thumb_rel TEXT,
  mime TEXT NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp')),
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  label TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

-- Story-default picture choices (a cover, a background, a character's
-- portrait). Changes on one route are `edit` events (setVisualRef) instead.
-- asset_id has no ON DELETE action, so a linked image cannot be deleted.
CREATE TABLE asset_links (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES assets(id),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('story', 'character')),
  owner_id TEXT NOT NULL,
  variant TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (story_id, owner_type, owner_id, variant)
);
CREATE INDEX asset_links_asset_idx ON asset_links(asset_id);

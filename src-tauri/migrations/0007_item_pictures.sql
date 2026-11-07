-- 0007_item_pictures: inventory items can have a story-default picture
-- (owner_type 'item', owner_id the item's name in lower case). SQLite cannot
-- change a CHECK constraint in place, so asset_links is rebuilt with the same
-- columns, keys and index.
CREATE TABLE asset_links_v7 (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES assets(id),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('story', 'character', 'item')),
  owner_id TEXT NOT NULL,
  variant TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (story_id, owner_type, owner_id, variant)
);
INSERT INTO asset_links_v7 (id, story_id, asset_id, owner_type, owner_id, variant, created_at)
  SELECT id, story_id, asset_id, owner_type, owner_id, variant, created_at FROM asset_links;
DROP TABLE asset_links;
ALTER TABLE asset_links_v7 RENAME TO asset_links;
CREATE INDEX asset_links_asset_idx ON asset_links(asset_id);

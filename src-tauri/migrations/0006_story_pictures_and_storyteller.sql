-- 0006_story_pictures_and_storyteller: pictures for one story, and the AI
-- connection a story uses.
--
-- An image is either shared (any story can use it) or belongs only to the
-- stories listed in asset_stories. A story-only image whose stories are all
-- deleted stays in the library under "Not in any story" until it is shared
-- or deleted; it is never removed on its own.
ALTER TABLE assets ADD COLUMN shared INTEGER NOT NULL DEFAULT 1 CHECK (shared IN (0, 1));

CREATE TABLE asset_stories (
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (asset_id, story_id)
);
CREATE INDEX asset_stories_story_idx ON asset_stories(story_id);

-- Who writes this story's replies. Both empty: the app's storyteller (the
-- one chosen in Settings). storyteller_offline = 1: the built-in offline
-- storyteller. Otherwise the connection in storyteller_profile_id; when that
-- connection is deleted, the story goes back to the app's storyteller.
ALTER TABLE stories ADD COLUMN storyteller_profile_id TEXT
  REFERENCES provider_profiles(id) ON DELETE SET NULL;
ALTER TABLE stories ADD COLUMN storyteller_offline INTEGER NOT NULL DEFAULT 0
  CHECK (storyteller_offline IN (0, 1));

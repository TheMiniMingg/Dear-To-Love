-- Fictional data at schema v7 (0007_item_pictures): a story whose inventory
-- item has a picture, next to its cover.
BEGIN;
INSERT INTO stories (id, title, description, base_state_json, schema_version, created_at,
  updated_at, storyteller_profile_id, storyteller_offline) VALUES (
  's7', 'The Salt Road', 'Fixture story v7',
  '{"schemaVersion":1,"playerCharacterId":"pc","world":{"era":"Medieval","setting":"Coast","description":"Salt","rules":[]},"narration":{"perspective":"second","detail":"balanced","tone":"bright","pacing":"normal"},"characters":{"pc":{"id":"pc","name":"Ines","control":"player","personality":[],"goals":[],"abilities":[]}},"relationships":[],"knownFacts":[],"scene":{"location":"Road","summary":"Dawn","participantIds":["pc"]},"openThreads":[],"visualRefs":{}}',
  1, '2026-11-07T00:00:00.000Z', '2026-11-07T00:00:00.000Z', NULL, 1);
INSERT INTO routes (id, story_id, label, is_main, version, created_at, updated_at)
  VALUES ('r7', 's7', 'Main', 1, 0, '2026-11-07T00:00:00.000Z', '2026-11-07T00:00:00.000Z');
INSERT INTO events VALUES ('h1', 's7', 'r7', NULL, 'chapter_start',
  '{"chapterInstanceId":"c1","title":"Chapter 1","ordinal":1}', 1, NULL, '2026-11-07T00:00:01.000Z');
UPDATE routes SET head_event_id = 'h1', version = 1 WHERE id = 'r7';
INSERT INTO assets (id, sha256, original_rel, thumb_rel, mime, width, height, byte_size, label,
  tags_json, created_at, shared) VALUES ('0190a1b2-0000-7000-8000-000000000007',
  'd7b2e1c6d4a3f9b85f2d3c8b7e6a5f4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f',
  'originals/d7b2e1c6d4a3f9b85f2d3c8b7e6a5f4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f.png',
  'thumbs/d7b2e1c6d4a3f9b85f2d3c8b7e6a5f4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f.png',
  'image/png', 64, 64, 2048, 'Lantern', '[]', '2026-11-07T00:00:00.500Z', 1);
INSERT INTO asset_links VALUES ('l7a', 's7', '0190a1b2-0000-7000-8000-000000000007',
  'story', 's7', 'cover', '2026-11-07T00:00:00.600Z');
INSERT INTO asset_links VALUES ('l7b', 's7', '0190a1b2-0000-7000-8000-000000000007',
  'item', 'brass lantern', 'picture', '2026-11-07T00:00:00.700Z');
COMMIT;

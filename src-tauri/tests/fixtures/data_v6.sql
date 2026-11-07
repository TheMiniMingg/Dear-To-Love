-- Fictional data at schema v6 (0006_story_pictures_and_storyteller): a story
-- that uses its own AI connection, and a picture kept for that story only.
BEGIN;
INSERT INTO provider_profiles (id, label, adapter, model_id, base_url, secret_ref, billing,
  settings_json, created_at, updated_at)
  VALUES ('p6', 'Home server', 'openai_compatible', 'story-model', 'http://127.0.0.1:8080/v1',
  NULL, 'local', '{}', '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z');
INSERT INTO stories (id, title, description, base_state_json, schema_version, created_at,
  updated_at, storyteller_profile_id, storyteller_offline) VALUES (
  's6', 'The Copper Kite', 'Fixture story v6',
  '{"schemaVersion":1,"playerCharacterId":"pc","world":{"era":"Modern","setting":"Hilltop","description":"Wind","rules":[]},"narration":{"perspective":"second","detail":"balanced","tone":"bright","pacing":"normal"},"characters":{"pc":{"id":"pc","name":"Tamsin","control":"player","personality":[],"goals":[],"abilities":[]}},"relationships":[],"knownFacts":[],"scene":{"location":"Ridge","summary":"Noon","participantIds":["pc"]},"openThreads":[],"visualRefs":{}}',
  1, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z', 'p6', 0);
INSERT INTO routes (id, story_id, label, is_main, version, created_at, updated_at)
  VALUES ('r6', 's6', 'Main', 1, 0, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z');
INSERT INTO events VALUES ('g1', 's6', 'r6', NULL, 'chapter_start',
  '{"chapterInstanceId":"c1","title":"Chapter 1","ordinal":1}', 1, NULL, '2026-06-01T00:00:01.000Z');
UPDATE routes SET head_event_id = 'g1', version = 1 WHERE id = 'r6';
INSERT INTO assets (id, sha256, original_rel, thumb_rel, mime, width, height, byte_size, label,
  tags_json, created_at, shared) VALUES ('0190a1b2-0000-7000-8000-000000000006',
  'c6a1d0b5c3f2e8a94e1c2b7a6d5f4e3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e',
  'originals/c6a1d0b5c3f2e8a94e1c2b7a6d5f4e3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e.png',
  'thumbs/c6a1d0b5c3f2e8a94e1c2b7a6d5f4e3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e.png',
  'image/png', 64, 48, 2048, 'Kite', '["Cover"]', '2026-06-01T00:00:00.500Z', 0);
INSERT INTO asset_stories VALUES ('0190a1b2-0000-7000-8000-000000000006', 's6',
  '2026-06-01T00:00:00.550Z');
INSERT INTO asset_links VALUES ('l6', 's6', '0190a1b2-0000-7000-8000-000000000006',
  'story', 's6', 'cover', '2026-06-01T00:00:00.600Z');
COMMIT;

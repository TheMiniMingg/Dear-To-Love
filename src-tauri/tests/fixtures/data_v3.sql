-- Fictional story at schema v3 (0003_assets): one library image used as the
-- story cover and, on the main route, as a background from turn two on.
BEGIN;
INSERT INTO stories VALUES (
  's3', 'The Lantern', 'Fixture story v3',
  '{"schemaVersion":1,"playerCharacterId":"pc","world":{"era":"Modern","setting":"Harbor","description":"Fog","rules":[]},"narration":{"perspective":"second","detail":"brief","tone":"quiet","pacing":"normal"},"characters":{"pc":{"id":"pc","name":"Wren","control":"player","personality":[],"goals":[],"abilities":[]}},"relationships":[],"knownFacts":[],"scene":{"location":"Quay","summary":"Night","participantIds":["pc"]},"openThreads":[],"visualRefs":{}}',
  1, '2026-03-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z');
INSERT INTO routes (id, story_id, label, is_main, version, created_at, updated_at)
  VALUES ('r3', 's3', 'Main', 1, 0, '2026-03-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z');
INSERT INTO events VALUES ('g1', 's3', 'r3', NULL, 'chapter_start',
  '{"chapterInstanceId":"c1","title":"Chapter 1","ordinal":1}', 1, NULL, '2026-03-01T00:00:01.000Z');
INSERT INTO events VALUES ('g2', 's3', 'r3', 'g1', 'edit',
  '{"changes":[{"op":"setVisualRef","slot":"background","assetId":"0190a1b2-0000-7000-8000-000000000001"}]}',
  1, NULL, '2026-03-01T00:00:02.000Z');
UPDATE routes SET head_event_id = 'g2', version = 2 WHERE id = 'r3';
INSERT INTO assets VALUES ('0190a1b2-0000-7000-8000-000000000001',
  'b3a1d0b5c3f2e8a94e1c2b7a6d5f4e3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e',
  'originals/b3a1d0b5c3f2e8a94e1c2b7a6d5f4e3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e.png',
  'thumbs/b3a1d0b5c3f2e8a94e1c2b7a6d5f4e3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e.png',
  'image/png', 64, 48, 2048, 'Lantern', '["Background"]', '2026-03-01T00:00:00.500Z');
INSERT INTO asset_links VALUES ('l1', 's3', '0190a1b2-0000-7000-8000-000000000001',
  'story', 's3', 'cover', '2026-03-01T00:00:00.600Z');
COMMIT;

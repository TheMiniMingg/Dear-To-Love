-- Fictional data at schema v4 (0004_archive_operations): a story that came
-- from a storypack, with its finished import journal entry.
BEGIN;
INSERT INTO stories VALUES (
  's4', 'The Tide Clock', 'Fixture story v4',
  '{"schemaVersion":1,"playerCharacterId":"pc","world":{"era":"Modern","setting":"Estuary","description":"Mud flats","rules":[]},"narration":{"perspective":"second","detail":"balanced","tone":"calm","pacing":"normal"},"characters":{"pc":{"id":"pc","name":"Ines","control":"player","personality":[],"goals":[],"abilities":[]}},"relationships":[],"knownFacts":[],"scene":{"location":"Sluice","summary":"Low tide","participantIds":["pc"]},"openThreads":[],"visualRefs":{}}',
  1, '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z');
INSERT INTO routes (id, story_id, label, is_main, version, created_at, updated_at)
  VALUES ('r4', 's4', 'Main', 1, 0, '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z');
INSERT INTO events VALUES ('h1', 's4', 'r4', NULL, 'chapter_start',
  '{"chapterInstanceId":"c1","title":"Chapter 1","ordinal":1}', 1, NULL, '2026-04-01T00:00:01.000Z');
UPDATE routes SET head_event_id = 'h1', version = 1 WHERE id = 'r4';
INSERT INTO archive_operations VALUES ('op1', 'import', 'imports/op1', 'complete',
  '{"title":"The Tide Clock","files":["story.json"]}', 's4', NULL,
  '2026-04-01T00:00:02.000Z', '2026-04-01T00:00:03.000Z');
COMMIT;

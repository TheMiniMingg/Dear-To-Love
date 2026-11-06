-- Fictional story at schema v2 (0002_memory_caches): v1 data plus one summary.
BEGIN;
INSERT INTO stories VALUES (
  's2', 'The Ferry', 'Fixture story v2',
  '{"schemaVersion":1,"playerCharacterId":"pc","world":{"era":"Modern","setting":"Harbor","description":"Wind","rules":[]},"narration":{"perspective":"second","detail":"brief","tone":"dry","pacing":"fast"},"characters":{"pc":{"id":"pc","name":"Rook","control":"player","personality":[],"goals":[],"abilities":[]}},"relationships":[],"knownFacts":[],"scene":{"location":"Pier","summary":"Dawn","participantIds":["pc"]},"openThreads":[],"visualRefs":{}}',
  1, '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z');
INSERT INTO routes (id, story_id, label, is_main, version, created_at, updated_at)
  VALUES ('r2', 's2', 'Main', 1, 0, '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z');
INSERT INTO events VALUES ('f1', 's2', 'r2', NULL, 'chapter_start',
  '{"chapterInstanceId":"c1","title":"Chapter 1","ordinal":1}', 1, NULL, '2026-02-01T00:00:01.000Z');
INSERT INTO events VALUES ('f2', 's2', 'r2', 'f1', 'player', '{"text":"I buy a ticket."}', 1, NULL, '2026-02-01T00:00:02.000Z');
INSERT INTO events VALUES ('f3', 's2', 'r2', 'f2', 'assistant', '{"text":"The clerk squints."}', 1, NULL, '2026-02-01T00:00:03.000Z');
UPDATE routes SET head_event_id = 'f3', version = 3 WHERE id = 'r2';
INSERT INTO memory_caches VALUES ('m1', 's2', 'summary', NULL, 'f3',
  'deadbeef', 1, 'Rook bought a ferry ticket.', NULL, 1, 'offline', NULL, '2026-02-01T00:00:04.000Z');
COMMIT;

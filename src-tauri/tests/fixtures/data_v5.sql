-- Fictional data at schema v5 (0005_bookmarks): a two-turn story with a
-- bookmark on the reply.
BEGIN;
INSERT INTO stories VALUES (
  's5', 'The Glass Orchard', 'Fixture story v5',
  '{"schemaVersion":1,"playerCharacterId":"pc","world":{"era":"Modern","setting":"Greenhouse","description":"Frost on the panes","rules":[]},"narration":{"perspective":"second","detail":"balanced","tone":"calm","pacing":"normal"},"characters":{"pc":{"id":"pc","name":"Oriel","control":"player","personality":[],"goals":[],"abilities":[]}},"relationships":[],"knownFacts":[],"scene":{"location":"Orchard","summary":"Dawn","participantIds":["pc"]},"openThreads":[],"visualRefs":{}}',
  1, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');
INSERT INTO routes (id, story_id, label, is_main, version, created_at, updated_at)
  VALUES ('r5', 's5', 'Main', 1, 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');
INSERT INTO events VALUES ('g1', 's5', 'r5', NULL, 'chapter_start',
  '{"chapterInstanceId":"c1","title":"Chapter 1","ordinal":1}', 1, NULL, '2026-05-01T00:00:01.000Z');
INSERT INTO events VALUES ('g2', 's5', 'r5', 'g1', 'player',
  '{"text":"I wipe the frost from a pane."}', 1, NULL, '2026-05-01T00:00:02.000Z');
INSERT INTO events VALUES ('g3', 's5', 'r5', 'g2', 'assistant',
  '{"text":"Behind the glass, a pear tree is blooming in December."}', 1, NULL, '2026-05-01T00:00:03.000Z');
UPDATE routes SET head_event_id = 'g3', version = 3 WHERE id = 'r5';
INSERT INTO bookmarks VALUES ('b1', 'r5', 'g3', 'The winter pear', '2026-05-01T00:00:04.000Z',
  '2026-05-01T00:00:04.000Z');
COMMIT;

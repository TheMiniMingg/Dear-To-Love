-- Fictional data at schema v8 (0008_reply_options): a story with a note to
-- the storyteller, a Keep going action (empty text), and a reply that was
-- asked to be short with a hint.
BEGIN;
INSERT INTO stories (id, title, description, base_state_json, schema_version, created_at,
  updated_at, storyteller_profile_id, storyteller_offline) VALUES (
  's8', 'The Tide Clock', 'Fixture story v8',
  '{"schemaVersion":1,"playerCharacterId":"pc","world":{"era":"Present day","setting":"Harbor","description":"Fog","rules":[]},"narration":{"perspective":"second","detail":"balanced","tone":"quiet","pacing":"normal","storytellerNote":"Let the fog linger"},"characters":{"pc":{"id":"pc","name":"Ada","control":"player","personality":[],"goals":[],"abilities":[]}},"relationships":[],"knownFacts":[],"scene":{"location":"Pier","summary":"Night","participantIds":["pc"]},"openThreads":[],"visualRefs":{}}',
  1, '2026-11-07T00:00:00.000Z', '2026-11-07T00:00:00.000Z', NULL, 1);
INSERT INTO routes (id, story_id, label, is_main, version, created_at, updated_at)
  VALUES ('r8', 's8', 'Main', 1, 0, '2026-11-07T00:00:00.000Z', '2026-11-07T00:00:00.000Z');
INSERT INTO events VALUES ('k1', 's8', 'r8', NULL, 'chapter_start',
  '{"chapterInstanceId":"c1","title":"Chapter 1","ordinal":1}', 1, NULL, '2026-11-07T00:00:01.000Z');
INSERT INTO events VALUES ('k2', 's8', 'r8', 'k1', 'player', '{"text":""}', 1, NULL,
  '2026-11-07T00:00:02.000Z');
UPDATE routes SET head_event_id = 'k2', version = 1 WHERE id = 'r8';
INSERT INTO generation_runs (id, route_id, input_event_id, provider_profile_id, status,
  error_code, usage_json, created_at, finished_at, options_json) VALUES ('run8', 'r8', 'k2', NULL,
  'cancelled', NULL, NULL, '2026-11-07T00:00:02.100Z', '2026-11-07T00:00:02.200Z',
  '{"length":"short","hint":"more fog"}');
COMMIT;

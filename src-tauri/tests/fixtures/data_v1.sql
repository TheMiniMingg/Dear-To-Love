-- Fictional two-route story at schema v1 (0001_core).
-- One transaction so deferred route-head references resolve at COMMIT.
BEGIN;
INSERT INTO stories VALUES (
  's1', 'The Lamp', 'Fixture story',
  '{"schemaVersion":1,"playerCharacterId":"pc","world":{"era":"Modern","setting":"Island","description":"Fog","rules":[]},"narration":{"perspective":"second","detail":"balanced","tone":"warm","pacing":"normal"},"characters":{"pc":{"id":"pc","name":"Wren","control":"player","personality":[],"goals":[],"abilities":[]}},"relationships":[],"knownFacts":[],"scene":{"location":"Stairs","summary":"Night","participantIds":["pc"]},"openThreads":[],"visualRefs":{}}',
  1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
INSERT INTO routes (id, story_id, label, is_main, version, created_at, updated_at)
  VALUES ('r-main', 's1', 'Main', 1, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
INSERT INTO events VALUES ('e1', 's1', 'r-main', NULL, 'chapter_start',
  '{"chapterInstanceId":"c1","title":"Chapter 1","ordinal":1}', 1, NULL, '2026-01-01T00:00:01.000Z');
INSERT INTO events VALUES ('e2', 's1', 'r-main', 'e1', 'player', '{"text":"I climb the stairs."}', 1, NULL, '2026-01-01T00:00:02.000Z');
INSERT INTO events VALUES ('e3', 's1', 'r-main', 'e2', 'assistant', '{"text":"The lamp flickers."}', 1, 'run1', '2026-01-01T00:00:03.000Z');
INSERT INTO routes (id, story_id, label, parent_route_id, fork_event_id, head_event_id, is_main, version, created_at, updated_at)
  VALUES ('r-alt', 's1', 'Alt 1', 'r-main', 'e2', 'e4', 0, 2, '2026-01-01T00:00:04.000Z', '2026-01-01T00:00:04.000Z');
INSERT INTO events VALUES ('e4', 's1', 'r-alt', 'e2', 'assistant', '{"text":"The lamp goes dark."}', 1, 'run2', '2026-01-01T00:00:05.000Z');
UPDATE routes SET head_event_id = 'e3', version = 3 WHERE id = 'r-main';
INSERT INTO saves VALUES ('sv1', 'r-main', 'e2', 'Before the lamp', 'manual', NULL, '2026-01-01T00:00:06.000Z', '2026-01-01T00:00:06.000Z');
INSERT INTO provider_profiles VALUES ('p1', 'Test cloud', 'openai_compatible', 'model-x', 'https://api.example.test/v1', 'provider/p1', 'paid', '{}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
INSERT INTO generation_runs VALUES ('run1', 'r-main', 'e2', 'p1', 'completed', NULL, NULL, '2026-01-01T00:00:02.500Z', '2026-01-01T00:00:03.000Z');
INSERT INTO generation_runs VALUES ('run2', 'r-alt', 'e2', 'p1', 'completed', NULL, NULL, '2026-01-01T00:00:04.500Z', '2026-01-01T00:00:05.000Z');
INSERT INTO api_rate_cards VALUES ('rc1', 'p1', 'model-x', 'USD', '1.00', '4.00', NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
INSERT INTO api_requests (id, generation_run_id, provider_profile_id, provider_label, model_id, session_id, route_id, purpose, status, usage_source, input_tokens, output_tokens, cost_micro_usd, rate_snapshot_json, started_at, finished_at)
  VALUES ('q1', 'run1', 'p1', 'Test cloud', 'model-x', 'sess1', 'r-main', 'story_reply', 'completed', 'provider', 1000, 200, 1800, '{"inputUsdPerMillion":"1.00","outputUsdPerMillion":"4.00"}', '2026-01-01T00:00:02.500Z', '2026-01-01T00:00:03.000Z');
INSERT INTO app_preferences VALUES ('budget_settings', '{"enabled":false}');
COMMIT;

-- Fictional data at schema v11 (0011_user_presets): one preset a player saved
-- from a story of theirs, holding the creation wizard's draft as JSON.
BEGIN;
INSERT INTO user_presets (id, name, from_story_title, created_at, draft_json) VALUES (
  '0190a1b2-0000-7000-8000-000000000020', 'Harbor Town', 'The Lamp at Harbor Town',
  '2026-11-08T12:00:00.000Z',
  '{"draftSchemaVersion":1,"worldTemplateId":null,"scenarioTemplateId":null,"characterTemplateId":null,"title":"Harbor Town","description":"A letter arrives at the harbor inn.","world":{"era":"1890s","setting":"A fishing town on a cold coast","description":"Fog most mornings.","rules":["No one dies off-screen"]},"narration":{"perspective":"second","detail":"balanced","tone":"","pacing":"normal","genres":["Mystery"]},"player":{"id":"custom:player","name":"Ada","control":"player","description":"The lighthouse keeper''s daughter.","personality":[],"goals":[],"abilities":[]},"npcs":[{"id":"n1","name":"Tomas","control":"npc","description":"The innkeeper.","personality":[],"goals":[],"abilities":[]}],"relationships":[],"scene":{"location":"The harbor inn","summary":"Evening; the letter is unopened."},"openThreads":["Who sent the letter?"],"firstChapterTitle":"The Letter","chapterOutlines":[]}'
);
COMMIT;

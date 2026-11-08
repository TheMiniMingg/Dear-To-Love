-- Fictional data at schema v9 (0009_picture_prompts): a portrait the app
-- made, with the description it was drawn from, beside an imported picture
-- that has none.
BEGIN;
INSERT INTO assets (id, sha256, original_rel, thumb_rel, mime, width, height, byte_size, label,
  tags_json, created_at, shared, made_from) VALUES ('0190a1b2-0000-7000-8000-000000000009',
  'e9c3f2d7e5b4a0c96a3e4d9c8f7b6a5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a',
  'originals/e9c3f2d7e5b4a0c96a3e4d9c8f7b6a5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a.png',
  'thumbs/e9c3f2d7e5b4a0c96a3e4d9c8f7b6a5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a.png',
  'image/png', 64, 64, 2048, 'Portrait of Ada', '["Portrait"]', '2026-11-07T00:00:00.500Z', 1,
  'Head-and-shoulders portrait of a woman, a detailed digital painting. Looks: grey eyes. One person, fully clothed, safe for work, no text. Avoid: nudity, sexual content, gore, text, watermark, extra people.');
INSERT INTO assets (id, sha256, original_rel, thumb_rel, mime, width, height, byte_size, label,
  tags_json, created_at, shared) VALUES ('0190a1b2-0000-7000-8000-000000000099',
  'f9c3f2d7e5b4a0c96a3e4d9c8f7b6a5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a',
  'originals/f9c3f2d7e5b4a0c96a3e4d9c8f7b6a5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a.png',
  'thumbs/f9c3f2d7e5b4a0c96a3e4d9c8f7b6a5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a.png',
  'image/png', 64, 64, 2048, 'Pier', '[]', '2026-11-07T00:00:00.600Z', 1);
COMMIT;

-- Fictional data at schema v10 (0010_gif_pictures): a moving GIF used as a
-- story's cover, beside a PNG.
BEGIN;
INSERT INTO assets (id, sha256, original_rel, thumb_rel, mime, width, height, byte_size, label,
  tags_json, created_at, shared) VALUES ('0190a1b2-0000-7000-8000-000000000010',
  'a0c3f2d7e5b4a0c96a3e4d9c8f7b6a5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a',
  'originals/a0c3f2d7e5b4a0c96a3e4d9c8f7b6a5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a.gif',
  'thumbs/a0c3f2d7e5b4a0c96a3e4d9c8f7b6a5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a.png',
  'image/gif', 320, 240, 40960, 'Fireflies', '["Background"]', '2026-11-08T00:00:00.100Z', 1);
INSERT INTO assets (id, sha256, original_rel, thumb_rel, mime, width, height, byte_size, label,
  tags_json, created_at, shared) VALUES ('0190a1b2-0000-7000-8000-000000000011',
  'b0c3f2d7e5b4a0c96a3e4d9c8f7b6a5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a',
  'originals/b0c3f2d7e5b4a0c96a3e4d9c8f7b6a5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a.png',
  'thumbs/b0c3f2d7e5b4a0c96a3e4d9c8f7b6a5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a.png',
  'image/png', 64, 64, 2048, 'Dock', '[]', '2026-11-08T00:00:00.200Z', 1);
COMMIT;

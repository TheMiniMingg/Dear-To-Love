-- 0009_picture_prompts: the description a made picture was drawn from, so
-- the player can see what the picture service was asked. Imported pictures
-- have none.
ALTER TABLE assets ADD COLUMN made_from TEXT;

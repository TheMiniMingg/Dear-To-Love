-- 0008_reply_options: what the player asked of one reply only (its length,
-- a hint for Another reply), kept with the run so Retry asks the same.
ALTER TABLE generation_runs ADD COLUMN options_json TEXT;

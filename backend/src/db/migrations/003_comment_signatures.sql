-- Store the SEP-53 signature per comment and reject replays (a captured
-- signature can only ever insert one row). Existing NULLs stay distinct.
ALTER TABLE comments ADD COLUMN IF NOT EXISTS signature TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_comments_signature ON comments(signature);

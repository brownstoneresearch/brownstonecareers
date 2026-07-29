-- Increment this value whenever access is regenerated or revoked so previously
-- issued candidate session cookies stop working immediately.
ALTER TABLE candidates ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1;

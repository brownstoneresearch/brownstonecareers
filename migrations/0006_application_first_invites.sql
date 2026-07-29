PRAGMA foreign_keys = ON;

-- Makes the application record the mandatory origin of every new invitation.
ALTER TABLE candidates ADD COLUMN application_source TEXT;
ALTER TABLE candidates ADD COLUMN application_submitted_at TEXT;
ALTER TABLE candidates ADD COLUMN invited_from_application_at TEXT;

-- Preserve legitimate application records created before this migration.
UPDATE candidates
SET application_source = COALESCE(application_source, 'legacy_application'),
    application_submitted_at = COALESCE(application_submitted_at, created_at)
WHERE application_submitted_at IS NULL
  AND (
    status = 'applicant'
    OR recruitment_stage = 'application_received'
    OR EXISTS (
      SELECT 1 FROM audit_events ae
      WHERE ae.candidate_id = candidates.id
        AND ae.event_type IN ('candidate.application_submitted', 'candidate.application_interest_submitted')
    )
  );

CREATE INDEX IF NOT EXISTS idx_candidates_application_queue
  ON candidates(application_submitted_at DESC, status, recruitment_stage);

-- Database-level guardrails: an invited candidate must have an application origin.
CREATE TRIGGER IF NOT EXISTS trg_candidates_invite_requires_application_insert
BEFORE INSERT ON candidates
WHEN NEW.status = 'invited' AND NEW.application_submitted_at IS NULL
BEGIN
  SELECT RAISE(ABORT, 'candidate invitation requires a submitted application');
END;

CREATE TRIGGER IF NOT EXISTS trg_candidates_invite_requires_application_update
BEFORE UPDATE OF status ON candidates
WHEN NEW.status = 'invited' AND NEW.application_submitted_at IS NULL
BEGIN
  SELECT RAISE(ABORT, 'candidate invitation requires a submitted application');
END;

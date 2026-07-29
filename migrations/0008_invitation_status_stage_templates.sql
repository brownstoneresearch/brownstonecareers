PRAGMA foreign_keys = ON;

-- v9.4: administrator-selected invitation status and starting stage,
-- exclusive stage/status email templates, and persistent invitation metadata.

ALTER TABLE candidates ADD COLUMN invitation_status_key TEXT NOT NULL DEFAULT 'invited';
ALTER TABLE candidates ADD COLUMN invitation_stage_key TEXT NOT NULL DEFAULT 'application_received';
ALTER TABLE candidates ADD COLUMN invitation_template_key TEXT;
ALTER TABLE candidates ADD COLUMN last_invitation_id TEXT;
ALTER TABLE candidates ADD COLUMN last_invited_at TEXT;

ALTER TABLE invitations ADD COLUMN template_key TEXT;
ALTER TABLE invitations ADD COLUMN initial_status TEXT;
ALTER TABLE invitations ADD COLUMN initial_stage TEXT;
ALTER TABLE invitations ADD COLUMN email_subject TEXT;

UPDATE candidates
SET invitation_status_key = CASE
      WHEN status IN ('invited','approved','onboarding','correction_required','completed','active') THEN status
      ELSE 'invited'
    END,
    invitation_stage_key = CASE
      WHEN recruitment_stage IN ('application_received','pre_screening','assessment','interview','offer','verification','onboarding','orientation','active_worker') THEN recruitment_stage
      ELSE 'application_received'
    END,
    invitation_template_key = COALESCE(
      invitation_template_key,
      CASE recruitment_stage
        WHEN 'pre_screening' THEN 'prescreen-access.'
        WHEN 'assessment' THEN 'assessment-access.'
        WHEN 'interview' THEN 'interview-access.'
        WHEN 'offer' THEN 'offer-access.'
        WHEN 'verification' THEN 'verification-access.'
        WHEN 'onboarding' THEN 'onboarding-access.'
        WHEN 'orientation' THEN 'orientation-access.'
        WHEN 'active_worker' THEN 'worker-access.'
        ELSE 'secure-application.'
      END || CASE
        WHEN status IN ('invited','approved','onboarding','correction_required','completed','active') THEN status
        ELSE 'invited'
      END
    );

UPDATE invitations
SET initial_status = COALESCE(initial_status, (
      SELECT c.invitation_status_key FROM candidates c WHERE c.id = invitations.candidate_id
    ), 'invited'),
    initial_stage = COALESCE(initial_stage, (
      SELECT c.invitation_stage_key FROM candidates c WHERE c.id = invitations.candidate_id
    ), 'application_received'),
    template_key = COALESCE(template_key, (
      SELECT c.invitation_template_key FROM candidates c WHERE c.id = invitations.candidate_id
    ), 'secure-application.invited');

UPDATE candidates
SET last_invitation_id = COALESCE(last_invitation_id, (
      SELECT i.id FROM invitations i
      WHERE i.candidate_id = candidates.id
      ORDER BY i.created_at DESC LIMIT 1
    )),
    last_invited_at = COALESCE(last_invited_at, (
      SELECT i.created_at FROM invitations i
      WHERE i.candidate_id = candidates.id
      ORDER BY i.created_at DESC LIMIT 1
    ));

DROP TRIGGER IF EXISTS trg_candidates_invite_requires_controlled_origin_insert;
DROP TRIGGER IF EXISTS trg_candidates_invite_requires_controlled_origin_update;

-- Any access-enabled first-time invitation status without a submitted application
-- must be an authenticated, documented administrator override.
CREATE TRIGGER IF NOT EXISTS trg_candidates_access_requires_controlled_origin_insert
BEFORE INSERT ON candidates
WHEN NEW.status IN ('invited','approved','onboarding','correction_required','completed','active')
 AND NEW.application_submitted_at IS NULL
 AND NOT (
   NEW.invitation_origin = 'admin_manual'
   AND NEW.manual_invite_approved_by IS NOT NULL
   AND EXISTS (SELECT 1 FROM admins a WHERE a.id = NEW.manual_invite_approved_by AND a.status = 'active')
   AND NEW.manual_invite_approved_at IS NOT NULL
   AND length(trim(COALESCE(NEW.manual_invite_reason, ''))) >= 10
 )
BEGIN
  SELECT RAISE(ABORT, 'candidate access requires a submitted application or an authenticated administrator override');
END;

CREATE TRIGGER IF NOT EXISTS trg_candidates_access_requires_controlled_origin_update
BEFORE UPDATE OF status, application_submitted_at, invitation_origin, manual_invite_reason, manual_invite_approved_by, manual_invite_approved_at ON candidates
WHEN NEW.status IN ('invited','approved','onboarding','correction_required','completed','active')
 AND NEW.application_submitted_at IS NULL
 AND NOT (
   NEW.invitation_origin = 'admin_manual'
   AND NEW.manual_invite_approved_by IS NOT NULL
   AND EXISTS (SELECT 1 FROM admins a WHERE a.id = NEW.manual_invite_approved_by AND a.status = 'active')
   AND NEW.manual_invite_approved_at IS NOT NULL
   AND length(trim(COALESCE(NEW.manual_invite_reason, ''))) >= 10
 )
BEGIN
  SELECT RAISE(ABORT, 'candidate access requires a submitted application or an authenticated administrator override');
END;

CREATE TRIGGER IF NOT EXISTS trg_candidates_invitation_selection_insert
BEFORE INSERT ON candidates
WHEN NEW.invitation_status_key NOT IN ('invited','approved','onboarding','correction_required','completed','active')
  OR NEW.invitation_stage_key NOT IN ('application_received','pre_screening','assessment','interview','offer','verification','onboarding','orientation','active_worker')
BEGIN
  SELECT RAISE(ABORT, 'unsupported invitation status or stage');
END;

CREATE TRIGGER IF NOT EXISTS trg_candidates_invitation_selection_update
BEFORE UPDATE OF invitation_status_key, invitation_stage_key ON candidates
WHEN NEW.invitation_status_key NOT IN ('invited','approved','onboarding','correction_required','completed','active')
  OR NEW.invitation_stage_key NOT IN ('application_received','pre_screening','assessment','interview','offer','verification','onboarding','orientation','active_worker')
BEGIN
  SELECT RAISE(ABORT, 'unsupported invitation status or stage');
END;

CREATE INDEX IF NOT EXISTS idx_candidates_invitation_selection
  ON candidates(invitation_status_key, invitation_stage_key, last_invited_at DESC);
CREATE INDEX IF NOT EXISTS idx_invitations_template
  ON invitations(template_key, initial_status, initial_stage, created_at DESC);

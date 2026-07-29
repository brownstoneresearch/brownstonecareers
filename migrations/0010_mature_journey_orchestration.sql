PRAGMA foreign_keys = ON;

-- v10.1: one orderly recruitment sequence, server-enforced stage gates,
-- task-to-stage ownership, mature candidate directives, and paginated queues.

ALTER TABLE onboarding_tasks ADD COLUMN stage_key TEXT NOT NULL DEFAULT 'onboarding';

UPDATE onboarding_tasks SET stage_key = CASE
  WHEN id = 'confidential-candidate-application' OR category = 'application' THEN 'application'
  WHEN category = 'orientation' OR id = 'orientation-confirmation' THEN 'orientation'
  ELSE 'onboarding'
END;

CREATE INDEX IF NOT EXISTS idx_onboarding_tasks_stage
  ON onboarding_tasks(stage_key, status, sort_order);

CREATE INDEX IF NOT EXISTS idx_candidates_pipeline_page
  ON candidates(recruitment_stage, status, pipeline_rank, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_page
  ON admin_notifications(status, created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_submissions_page
  ON submissions(status, submitted_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_prescreens_page
  ON candidate_prescreens(status, submitted_at DESC, created_at DESC, id);

-- Backfill verified prior stages for legacy candidates so every current stage
-- has an orderly, auditable sequence behind it. Existing explicit stage records
-- remain authoritative because INSERT OR IGNORE never overwrites them.
INSERT OR IGNORE INTO candidate_stage_progress
(id, candidate_id, stage_key, status, completion_percent, score, source, notes, started_at, completed_at, completed_by, updated_at)
SELECT lower(hex(randomblob(16))), id, 'application', 'completed', 100, 100,
       'v10_1_sequence_backfill', 'Backfilled as complete because the candidate had already advanced beyond application.',
       COALESCE(application_submitted_at, created_at), COALESCE(application_submitted_at, created_at), NULL, datetime('now')
FROM candidates
WHERE recruitment_stage IN ('pre_screening','assessment','interview','offer','verification','onboarding','orientation','active_worker');

INSERT OR IGNORE INTO candidate_stage_progress
(id, candidate_id, stage_key, status, completion_percent, score, source, notes, started_at, completed_at, completed_by, updated_at)
SELECT lower(hex(randomblob(16))), id, 'pre_screening', 'completed', 100,
       COALESCE(prescreening_score, 100), 'v10_1_sequence_backfill',
       'Backfilled as complete because the candidate had already advanced beyond pre-screening.',
       created_at, COALESCE(last_activity_at, updated_at, created_at), NULL, datetime('now')
FROM candidates
WHERE recruitment_stage IN ('assessment','interview','offer','verification','onboarding','orientation','active_worker');

INSERT OR IGNORE INTO candidate_stage_progress
(id, candidate_id, stage_key, status, completion_percent, score, source, notes, started_at, completed_at, completed_by, updated_at)
SELECT lower(hex(randomblob(16))), id, 'assessment', 'completed', 100, 100,
       'v10_1_sequence_backfill', 'Backfilled as complete because the candidate had already advanced beyond assessment.',
       created_at, COALESCE(last_activity_at, updated_at, created_at), NULL, datetime('now')
FROM candidates
WHERE recruitment_stage IN ('interview','offer','verification','onboarding','orientation','active_worker');

INSERT OR IGNORE INTO candidate_stage_progress
(id, candidate_id, stage_key, status, completion_percent, score, source, notes, started_at, completed_at, completed_by, updated_at)
SELECT lower(hex(randomblob(16))), id, 'interview', 'completed', 100, 100,
       'v10_1_sequence_backfill', 'Backfilled as complete because the candidate had already advanced beyond interview.',
       created_at, COALESCE(last_activity_at, updated_at, created_at), NULL, datetime('now')
FROM candidates
WHERE recruitment_stage IN ('offer','verification','onboarding','orientation','active_worker');

INSERT OR IGNORE INTO candidate_stage_progress
(id, candidate_id, stage_key, status, completion_percent, score, source, notes, started_at, completed_at, completed_by, updated_at)
SELECT lower(hex(randomblob(16))), id, 'offer', 'completed', 100, 100,
       'v10_1_sequence_backfill', 'Backfilled as complete because the candidate had already advanced beyond offer.',
       created_at, COALESCE(last_activity_at, updated_at, created_at), NULL, datetime('now')
FROM candidates
WHERE recruitment_stage IN ('verification','onboarding','orientation','active_worker');

INSERT OR IGNORE INTO candidate_stage_progress
(id, candidate_id, stage_key, status, completion_percent, score, source, notes, started_at, completed_at, completed_by, updated_at)
SELECT lower(hex(randomblob(16))), id, 'verification', 'completed', 100, 100,
       'v10_1_sequence_backfill', 'Backfilled as complete because the candidate had already advanced beyond verification.',
       created_at, COALESCE(last_activity_at, updated_at, created_at), NULL, datetime('now')
FROM candidates
WHERE recruitment_stage IN ('onboarding','orientation','active_worker');

INSERT OR IGNORE INTO candidate_stage_progress
(id, candidate_id, stage_key, status, completion_percent, score, source, notes, started_at, completed_at, completed_by, updated_at)
SELECT lower(hex(randomblob(16))), id, 'onboarding', 'completed', 100, 100,
       'v10_1_sequence_backfill', 'Backfilled as complete because the candidate had already advanced beyond onboarding.',
       created_at, COALESCE(last_activity_at, updated_at, created_at), NULL, datetime('now')
FROM candidates
WHERE recruitment_stage IN ('orientation','active_worker');

INSERT OR IGNORE INTO candidate_stage_progress
(id, candidate_id, stage_key, status, completion_percent, score, source, notes, started_at, completed_at, completed_by, updated_at)
SELECT lower(hex(randomblob(16))), id, 'orientation', 'completed', 100, 100,
       'v10_1_sequence_backfill', 'Backfilled as complete because the candidate had already advanced beyond orientation.',
       created_at, COALESCE(last_activity_at, updated_at, created_at), NULL, datetime('now')
FROM candidates
WHERE recruitment_stage = 'active_worker';

-- Ensure the recorded current stage exists and is in progress when it has not
-- already been completed by an explicit workflow event.
INSERT OR IGNORE INTO candidate_stage_progress
(id, candidate_id, stage_key, status, completion_percent, score, source, notes, started_at, updated_at)
SELECT lower(hex(randomblob(16))), id,
  CASE recruitment_stage
    WHEN 'application_received' THEN 'application'
    WHEN 'pre_screening' THEN 'pre_screening'
    WHEN 'assessment' THEN 'assessment'
    WHEN 'interview' THEN 'interview'
    WHEN 'offer' THEN 'offer'
    WHEN 'verification' THEN 'verification'
    WHEN 'onboarding' THEN 'onboarding'
    WHEN 'orientation' THEN 'orientation'
    WHEN 'active_worker' THEN 'active_worker'
    ELSE 'application'
  END,
  CASE WHEN recruitment_stage = 'active_worker' AND status = 'active' THEN 'completed' ELSE 'in_progress' END,
  CASE WHEN recruitment_stage = 'active_worker' AND status = 'active' THEN 100 ELSE 0 END,
  CASE WHEN recruitment_stage = 'active_worker' AND status = 'active' THEN 100 ELSE NULL END,
  'v10_1_sequence_backfill', 'Current stage initialized by the mature journey orchestration migration.',
  COALESCE(last_activity_at, created_at), datetime('now')
FROM candidates;

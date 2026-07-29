PRAGMA foreign_keys = ON;

-- v9.3: admin-controlled manual invitations, ranked recruitment stages,
-- stage-completion notifications, and human-reviewed AI-assisted pre-screening.

DROP TRIGGER IF EXISTS trg_candidates_invite_requires_application_insert;
DROP TRIGGER IF EXISTS trg_candidates_invite_requires_application_update;

ALTER TABLE candidates ADD COLUMN invitation_origin TEXT;
ALTER TABLE candidates ADD COLUMN manual_invite_reason TEXT;
ALTER TABLE candidates ADD COLUMN manual_invite_approved_by TEXT;
ALTER TABLE candidates ADD COLUMN manual_invite_approved_at TEXT;
ALTER TABLE candidates ADD COLUMN pipeline_score REAL NOT NULL DEFAULT 0;
ALTER TABLE candidates ADD COLUMN pipeline_rank INTEGER;
ALTER TABLE candidates ADD COLUMN prescreening_score REAL;

UPDATE candidates
SET invitation_origin = CASE
      WHEN application_submitted_at IS NOT NULL THEN 'application'
      WHEN status IN ('invited','onboarding','completed','active') THEN 'admin_manual'
      ELSE invitation_origin
    END,
    manual_invite_reason = CASE
      WHEN application_submitted_at IS NULL AND status IN ('invited','onboarding','completed','active')
        THEN COALESCE(manual_invite_reason, 'Legacy administrator invitation retained during the v9.3 controlled migration.')
      ELSE manual_invite_reason
    END,
    manual_invite_approved_by = CASE
      WHEN application_submitted_at IS NULL AND status IN ('invited','onboarding','completed','active')
        THEN COALESCE(manual_invite_approved_by, assigned_admin_id, 'migration-v9.3')
      ELSE manual_invite_approved_by
    END,
    manual_invite_approved_at = CASE
      WHEN application_submitted_at IS NULL AND status IN ('invited','onboarding','completed','active')
        THEN COALESCE(manual_invite_approved_at, invited_from_application_at, updated_at, created_at)
      ELSE manual_invite_approved_at
    END;

-- D1 still blocks arbitrary direct writes. A no-application invitation is valid only
-- when an authenticated administrator records an explicit override and reason.
CREATE TRIGGER IF NOT EXISTS trg_candidates_invite_requires_controlled_origin_insert
BEFORE INSERT ON candidates
WHEN NEW.status = 'invited'
 AND NEW.application_submitted_at IS NULL
 AND NOT (
   NEW.invitation_origin = 'admin_manual'
   AND NEW.manual_invite_approved_by IS NOT NULL
   AND EXISTS (SELECT 1 FROM admins a WHERE a.id = NEW.manual_invite_approved_by AND a.status = 'active')
   AND NEW.manual_invite_approved_at IS NOT NULL
   AND length(trim(COALESCE(NEW.manual_invite_reason, ''))) >= 10
 )
BEGIN
  SELECT RAISE(ABORT, 'manual candidate invitation requires an administrator override, timestamp, and reason');
END;

CREATE TRIGGER IF NOT EXISTS trg_candidates_invite_requires_controlled_origin_update
BEFORE UPDATE OF status, application_submitted_at, invitation_origin, manual_invite_reason, manual_invite_approved_by, manual_invite_approved_at ON candidates
WHEN NEW.status = 'invited'
 AND NEW.application_submitted_at IS NULL
 AND NOT (
   NEW.invitation_origin = 'admin_manual'
   AND NEW.manual_invite_approved_by IS NOT NULL
   AND EXISTS (SELECT 1 FROM admins a WHERE a.id = NEW.manual_invite_approved_by AND a.status = 'active')
   AND NEW.manual_invite_approved_at IS NOT NULL
   AND length(trim(COALESCE(NEW.manual_invite_reason, ''))) >= 10
 )
BEGIN
  SELECT RAISE(ABORT, 'manual candidate invitation requires an administrator override, timestamp, and reason');
END;

CREATE TABLE IF NOT EXISTS candidate_stage_progress (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  stage_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  completion_percent REAL NOT NULL DEFAULT 0,
  score REAL,
  source TEXT NOT NULL DEFAULT 'system',
  notes TEXT,
  started_at TEXT,
  completed_at TEXT,
  completed_by TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
  UNIQUE(candidate_id, stage_key)
);

CREATE INDEX IF NOT EXISTS idx_stage_progress_candidate
  ON candidate_stage_progress(candidate_id, stage_key, status);
CREATE INDEX IF NOT EXISTS idx_stage_progress_completion
  ON candidate_stage_progress(stage_key, status, completed_at DESC);

CREATE TABLE IF NOT EXISTS admin_notifications (
  id TEXT PRIMARY KEY,
  admin_id TEXT,
  candidate_id TEXT,
  notification_type TEXT NOT NULL DEFAULT 'general',
  stage_key TEXT,
  tone_key TEXT NOT NULL DEFAULT 'general',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  action_url TEXT,
  status TEXT NOT NULL DEFAULT 'unread',
  unique_key TEXT UNIQUE,
  created_at TEXT NOT NULL,
  read_at TEXT,
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE,
  FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_queue
  ON admin_notifications(admin_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_candidate
  ON admin_notifications(candidate_id, created_at DESC);

CREATE TABLE IF NOT EXISTS prescreen_question_sets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  role_scope TEXT NOT NULL DEFAULT '*',
  instructions TEXT,
  pass_score REAL NOT NULL DEFAULT 70,
  status TEXT NOT NULL DEFAULT 'draft',
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (created_by) REFERENCES admins(id)
);

CREATE TABLE IF NOT EXISTS prescreen_questions (
  id TEXT PRIMARY KEY,
  question_set_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'textarea',
  options_json TEXT NOT NULL DEFAULT '[]',
  required INTEGER NOT NULL DEFAULT 1,
  max_points REAL NOT NULL DEFAULT 10,
  rubric TEXT NOT NULL,
  ai_guidance TEXT,
  sort_order INTEGER NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (question_set_id) REFERENCES prescreen_question_sets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_prescreen_questions_set
  ON prescreen_questions(question_set_id, status, sort_order);

CREATE TABLE IF NOT EXISTS candidate_prescreens (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  question_set_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'assigned',
  assigned_by TEXT,
  due_at TEXT,
  started_at TEXT,
  submitted_at TEXT,
  ai_scored_at TEXT,
  ai_model TEXT,
  ai_score REAL,
  ai_summary TEXT,
  ai_risk_flags_json TEXT NOT NULL DEFAULT '[]',
  admin_score REAL,
  final_score REAL,
  result_status TEXT NOT NULL DEFAULT 'pending',
  admin_feedback TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  result_sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
  FOREIGN KEY (question_set_id) REFERENCES prescreen_question_sets(id),
  FOREIGN KEY (assigned_by) REFERENCES admins(id),
  FOREIGN KEY (reviewed_by) REFERENCES admins(id)
);

CREATE INDEX IF NOT EXISTS idx_candidate_prescreens_review
  ON candidate_prescreens(status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_candidate_prescreens_candidate
  ON candidate_prescreens(candidate_id, created_at DESC);

CREATE TABLE IF NOT EXISTS prescreen_answers (
  id TEXT PRIMARY KEY,
  candidate_prescreen_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  answer_text TEXT,
  answer_json TEXT NOT NULL DEFAULT '{}',
  ai_score REAL,
  ai_feedback TEXT,
  admin_score REAL,
  admin_feedback TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (candidate_prescreen_id) REFERENCES candidate_prescreens(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES prescreen_questions(id),
  UNIQUE(candidate_prescreen_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_prescreen_answers_assignment
  ON prescreen_answers(candidate_prescreen_id, question_id);

INSERT OR IGNORE INTO prescreen_question_sets
(id, title, description, role_scope, instructions, pass_score, status, version, created_at, updated_at)
VALUES
('brownstone-standard-prescreen-v1',
 'Brownstone Careers Standard Pre-Screening',
 'Administrator-managed job-related pre-screening for remote Brownstone Careers pathways.',
 '*',
 'Answer each question clearly and truthfully. Do not include SSNs, government ID numbers, banking details, passwords, medical information, age, race, religion, disability, family status, or other protected personal information.',
 70,
 'published',
 1,
 datetime('now'),
 datetime('now'));

INSERT OR IGNORE INTO prescreen_questions
(id, question_set_id, prompt, question_type, options_json, required, max_points, rubric, ai_guidance, sort_order, status, created_at, updated_at)
VALUES
('psq-role-fit', 'brownstone-standard-prescreen-v1',
 'Briefly introduce yourself and explain why your selected Brownstone Careers role fits your experience and goals.',
 'textarea', '[]', 1, 10,
 'Award points for a clear introduction, direct connection to the selected role, relevant experience, and realistic goals.',
 'Focus only on job-related evidence and clarity. Do not infer protected characteristics.', 10, 'active', datetime('now'), datetime('now')),
('psq-relevant-experience', 'brownstone-standard-prescreen-v1',
 'Describe your most relevant work experience, responsibilities, and one measurable or concrete achievement.',
 'textarea', '[]', 1, 15,
 'Award points for relevant responsibilities, specific examples, credible outcomes, and ownership of work.',
 'Do not reward prestige of employer names; score the demonstrated competencies.', 20, 'active', datetime('now'), datetime('now')),
('psq-organization', 'brownstone-standard-prescreen-v1',
 'How do you organize multiple priorities and complete tasks accurately while working remotely with limited supervision?',
 'textarea', '[]', 1, 15,
 'Award points for a repeatable system, prioritization, deadlines, communication, quality checks, and accountability.',
 'Prefer concrete methods over vague claims.', 30, 'active', datetime('now'), datetime('now')),
('psq-technology', 'brownstone-standard-prescreen-v1',
 'Which workplace tools or technologies can you use confidently, and how have you used them to complete work?',
 'textarea', '[]', 1, 10,
 'Award points for relevant tools, practical use cases, adaptability, and willingness to learn.',
 'Do not require a specific brand unless the role requires it.', 40, 'active', datetime('now'), datetime('now')),
('psq-accuracy-confidentiality', 'brownstone-standard-prescreen-v1',
 'Describe how you would protect confidential information and prevent errors when handling records, customer details, or financial data.',
 'textarea', '[]', 1, 15,
 'Award points for least-access principles, verification, secure channels, clean-desk/device practices, escalation, and correction procedures.',
 'Flag only job-related security concerns. Do not request sensitive data.', 50, 'active', datetime('now'), datetime('now')),
('psq-scenario', 'brownstone-standard-prescreen-v1',
 'A time-sensitive task contains unclear instructions and the assigned manager is temporarily unavailable. What would you do?',
 'textarea', '[]', 1, 15,
 'Award points for clarifying available evidence, documenting assumptions, prioritizing low-risk work, communicating, and avoiding unauthorized decisions.',
 'Score judgment, communication, and risk awareness.', 60, 'active', datetime('now'), datetime('now')),
('psq-availability', 'brownstone-standard-prescreen-v1',
 'State your realistic weekly availability, time zone, and how you will communicate schedule changes or missed deadlines.',
 'textarea', '[]', 1, 10,
 'Award points for specific, realistic availability and proactive communication practices.',
 'Do not consider family status or personal circumstances; score only the stated work availability and communication plan.', 70, 'active', datetime('now'), datetime('now')),
('psq-growth', 'brownstone-standard-prescreen-v1',
 'What professional skill would you like to develop over the next year, and what steps are you already taking?',
 'textarea', '[]', 1, 10,
 'Award points for a relevant growth target, self-awareness, concrete steps, and a realistic learning plan.',
 'Score evidence of learning behavior rather than personality style.', 80, 'active', datetime('now'), datetime('now'));

-- Initialize the application stage only when the authenticated confidential
-- portal application was already submitted, or the candidate had already
-- advanced beyond pre-screening before the v9.3 migration. A public contact
-- form alone does not complete the confidential application stage.
INSERT OR IGNORE INTO candidate_stage_progress
(id, candidate_id, stage_key, status, completion_percent, score, source, notes, started_at, completed_at, updated_at)
SELECT lower(hex(randomblob(16))), c.id, 'application', 'completed', 100, 100,
       'legacy_confidential_application',
       'Confidential application completion reconciled during the v9.3 migration.',
       COALESCE((
         SELECT ct.submitted_at FROM candidate_tasks ct
         WHERE ct.candidate_id = c.id
           AND ct.task_id = 'confidential-candidate-application'
           AND ct.status IN ('submitted','approved','completed','waived')
         ORDER BY ct.submitted_at DESC LIMIT 1
       ), c.updated_at, c.created_at),
       COALESCE((
         SELECT ct.submitted_at FROM candidate_tasks ct
         WHERE ct.candidate_id = c.id
           AND ct.task_id = 'confidential-candidate-application'
           AND ct.status IN ('submitted','approved','completed','waived')
         ORDER BY ct.submitted_at DESC LIMIT 1
       ), c.updated_at, c.created_at),
       datetime('now')
FROM candidates c
WHERE EXISTS (
  SELECT 1 FROM candidate_tasks ct
  WHERE ct.candidate_id = c.id
    AND ct.task_id = 'confidential-candidate-application'
    AND ct.status IN ('submitted','approved','completed','waived')
)
OR c.recruitment_stage IN ('assessment','interview','offer','verification','onboarding','orientation','active_worker');

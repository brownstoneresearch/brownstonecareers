PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS onboarding_tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  role_scope TEXT NOT NULL DEFAULT '*',
  requires_submission INTEGER NOT NULL DEFAULT 1,
  requires_signature INTEGER NOT NULL DEFAULT 0,
  requires_admin_review INTEGER NOT NULL DEFAULT 1,
  form_schema_json TEXT NOT NULL DEFAULT '{}',
  instructions TEXT,
  sort_order INTEGER NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS candidate_tasks (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'assigned',
  assigned_at TEXT NOT NULL,
  due_at TEXT,
  started_at TEXT,
  submitted_at TEXT,
  completed_at TEXT,
  reviewed_at TEXT,
  reviewed_by TEXT,
  admin_feedback TEXT,
  signature_name TEXT,
  signature_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES onboarding_tasks(id),
  FOREIGN KEY (reviewed_by) REFERENCES admins(id),
  UNIQUE(candidate_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_candidate_tasks_candidate ON candidate_tasks(candidate_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_candidate_tasks_review ON candidate_tasks(status, submitted_at DESC);

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  candidate_task_id TEXT NOT NULL,
  submission_type TEXT NOT NULL DEFAULT 'form',
  response_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'submitted',
  submitted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewed_by TEXT,
  reviewer_feedback TEXT,
  FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
  FOREIGN KEY (candidate_task_id) REFERENCES candidate_tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES admins(id)
);

CREATE INDEX IF NOT EXISTS idx_submissions_candidate ON submissions(candidate_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_review ON submissions(status, submitted_at DESC);

CREATE TABLE IF NOT EXISTS support_conversations (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'normal',
  sentiment TEXT NOT NULL DEFAULT 'neutral',
  topic TEXT,
  assigned_admin_id TEXT,
  escalated_at TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_admin_id) REFERENCES admins(id)
);

CREATE INDEX IF NOT EXISTS idx_support_status ON support_conversations(status, priority, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_candidate ON support_conversations(candidate_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS support_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_type TEXT NOT NULL,
  sender_id TEXT,
  message TEXT NOT NULL,
  intent TEXT,
  sentiment TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES support_conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_support_messages_conversation ON support_messages(conversation_id, created_at ASC);

CREATE TABLE IF NOT EXISTS candidate_notifications (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  notification_type TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'unread',
  action_url TEXT,
  created_at TEXT NOT NULL,
  read_at TEXT,
  FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_candidate_notifications ON candidate_notifications(candidate_id, status, created_at DESC);

INSERT OR IGNORE INTO onboarding_tasks
(id, title, description, category, role_scope, requires_submission, requires_signature, requires_admin_review, form_schema_json, instructions, sort_order, status, created_at, updated_at)
VALUES
('professional-profile-confirmation','Professional profile confirmation','Review and confirm your role, contact information, working preferences, and professional goals.','profile','*',1,1,1,'{"fields":[{"name":"professional_goal","label":"What professional goal would you like Brownstone to help you work toward?","type":"textarea","required":true},{"name":"availability_confirmation","label":"Confirm your availability and preferred working hours.","type":"textarea","required":true}],"attestation":"I confirm that the information in my profile is accurate and complete."}','Complete your profile before submitting this confirmation.',10,'active',datetime('now'),datetime('now')),
('handbook-acknowledgement','Employee handbook acknowledgement','Confirm that you reviewed the Brownstone Careers Employee & Contractor Handbook and understand the standards that apply to your role.','document','*',1,1,1,'{"fields":[{"name":"questions","label":"List any handbook questions for your onboarding coordinator.","type":"textarea","required":false}],"attestation":"I have reviewed the handbook and understand that signed agreements and applicable law take precedence."}','Open the handbook from the Documents section before signing.',20,'active',datetime('now'),datetime('now')),
('nda-acknowledgement','Confidentiality and NDA acknowledgement','Confirm that you reviewed the confidentiality agreement and are ready to complete the official signing process.','document','*',1,1,1,'{"fields":[{"name":"nda_questions","label":"List any questions or sections requiring clarification.","type":"textarea","required":false}],"attestation":"I have reviewed the confidentiality agreement and will protect confidential information."}','This acknowledgement does not replace the official signed NDA.',30,'active',datetime('now'),datetime('now')),
('remote-readiness-submission','Remote-work readiness submission','Submit your device, internet, workspace, communication, and security readiness confirmation.','readiness','*',1,1,1,'{"fields":[{"name":"device_ready","label":"Reliable computer or approved device is available","type":"checkbox","required":true},{"name":"internet_ready","label":"Reliable internet connection is available","type":"checkbox","required":true},{"name":"workspace_ready","label":"A quiet and professional workspace is available","type":"checkbox","required":true},{"name":"security_ready","label":"Device security, updates, and password protections are enabled","type":"checkbox","required":true},{"name":"readiness_notes","label":"Explain any equipment or support needs.","type":"textarea","required":false}],"attestation":"I confirm that this readiness information is accurate."}','Request support through the Brownstone Guide if an item is not ready.',40,'active',datetime('now'),datetime('now')),
('academy-reflection','Brownstone Academy reflection','Submit a short reflection after completing the four foundational learning modules.','training','*',1,1,1,'{"fields":[{"name":"key_learning","label":"What is the most important principle you learned?","type":"textarea","required":true},{"name":"application_plan","label":"How will you apply it in your role?","type":"textarea","required":true}],"attestation":"I completed the assigned foundational learning modules myself."}','Complete all Brownstone Academy modules before submitting.',50,'active',datetime('now'),datetime('now')),
('orientation-confirmation','Orientation readiness confirmation','Confirm your readiness to attend the live Brownstone orientation session.','orientation','*',1,1,0,'{"fields":[{"name":"questions","label":"What would you like addressed during orientation?","type":"textarea","required":false},{"name":"attendance_ready","label":"I will join on time with a working camera, microphone, and stable connection when required.","type":"checkbox","required":true}],"attestation":"I confirm that I am prepared for orientation and will communicate promptly if circumstances change."}','Your coordinator will provide the final date and time.',60,'active',datetime('now'),datetime('now'));

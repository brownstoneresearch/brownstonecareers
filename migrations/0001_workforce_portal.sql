PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'reviewer',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS candidates (
  id TEXT PRIMARY KEY,
  reference TEXT UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  city TEXT,
  state_province TEXT,
  country TEXT,
  work_authorization TEXT,
  sponsorship_required TEXT,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'applicant',
  recruitment_stage TEXT NOT NULL DEFAULT 'application_received',
  onboarding_progress INTEGER NOT NULL DEFAULT 0,
  assigned_admin_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_activity_at TEXT,
  FOREIGN KEY (assigned_admin_id) REFERENCES admins(id)
);

CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  code_hint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  activated_at TEXT,
  last_used_at TEXT,
  revoked_at TEXT,
  created_by TEXT,
  FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES admins(id)
);

CREATE INDEX IF NOT EXISTS idx_invitations_candidate ON invitations(candidate_id);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations(status);

CREATE TABLE IF NOT EXISTS candidate_portal_state (
  candidate_id TEXT NOT NULL,
  state_key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (candidate_id, state_key),
  FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sensitive_identity (
  candidate_id TEXT PRIMARY KEY,
  legal_name TEXT NOT NULL,
  date_of_birth TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state_province TEXT,
  postal_code TEXT,
  country TEXT,
  ssn_ciphertext TEXT,
  ssn_iv TEXT,
  ssn_algorithm TEXT,
  ssn_last4 TEXT,
  work_authorization_status TEXT,
  verification_status TEXT NOT NULL DEFAULT 'submitted',
  submitted_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewed_by TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES admins(id)
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  category TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  submitted_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewed_by TEXT,
  retention_policy TEXT NOT NULL DEFAULT 'verification-only',
  delete_after TEXT,
  FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES admins(id)
);

CREATE INDEX IF NOT EXISTS idx_documents_candidate ON documents(candidate_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);

CREATE TABLE IF NOT EXISTS admin_notes (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  admin_id TEXT NOT NULL,
  note TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'internal',
  created_at TEXT NOT NULL,
  FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_id) REFERENCES admins(id)
);

CREATE TABLE IF NOT EXISTS email_messages (
  id TEXT PRIMARY KEY,
  candidate_id TEXT,
  message_type TEXT NOT NULL,
  recipient TEXT NOT NULL,
  provider_message_id TEXT,
  status TEXT NOT NULL,
  subject TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  candidate_id TEXT,
  event_type TEXT NOT NULL,
  description TEXT,
  metadata_json TEXT,
  ip_address TEXT,
  user_agent TEXT,
  country_code TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_candidate ON audit_events(candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_type ON audit_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_candidates_status ON candidates(status, recruitment_stage);
CREATE INDEX IF NOT EXISTS idx_candidates_activity ON candidates(last_activity_at DESC);

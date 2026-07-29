CREATE TABLE IF NOT EXISTS automation_rules (
  id TEXT PRIMARY KEY,
  rule_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL,
  stage_key TEXT,
  delay_minutes INTEGER NOT NULL DEFAULT 0,
  action_type TEXT NOT NULL,
  template_key TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 50,
  conditions_json TEXT NOT NULL DEFAULT '{}',
  action_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id TEXT PRIMARY KEY,
  rule_id TEXT,
  candidate_id TEXT,
  event_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  input_json TEXT NOT NULL DEFAULT '{}',
  output_json TEXT,
  error_message TEXT,
  scheduled_for TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(event_key),
  FOREIGN KEY (rule_id) REFERENCES automation_rules(id) ON DELETE SET NULL,
  FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS candidate_journey_events (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  stage_key TEXT,
  event_type TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'system',
  title TEXT NOT NULL,
  detail TEXT,
  visibility TEXT NOT NULL DEFAULT 'admin',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS operations_health_snapshots (
  id TEXT PRIMARY KEY,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_due ON automation_runs(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_automation_runs_candidate ON automation_runs(candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_journey_events_candidate ON candidate_journey_events(candidate_id, created_at DESC);

INSERT OR IGNORE INTO automation_rules
(id, rule_key, name, description, trigger_type, stage_key, delay_minutes, action_type, template_key, enabled, priority, conditions_json, action_json, created_at, updated_at)
VALUES
('auto-application-review','application-review','Application review alert','Notify recruitment immediately after a new application enters the pipeline.','stage_completed','application',0,'admin_notification','application_review',1,10,'{}','{}',datetime('now'),datetime('now')),
('auto-invite-reminder-24h','invite-reminder-24h','Invitation reminder','Remind invited candidates who have not entered the portal after 24 hours.','time_elapsed','application',1440,'candidate_notification','invitation_reminder',1,30,'{"statuses":["invited"]}','{}',datetime('now'),datetime('now')),
('auto-stale-candidate-72h','stale-candidate-72h','Stalled journey alert','Alert administrators when a candidate has no activity for 72 hours.','time_elapsed',NULL,4320,'admin_notification','stalled_candidate',1,40,'{"statuses":["invited","onboarding"]}','{}',datetime('now'),datetime('now')),
('auto-prescreen-ready','prescreen-ready','Pre-screening review alert','Notify reviewers when pre-screening answers are submitted.','prescreen_submitted','pre_screening',0,'admin_notification','prescreen_ready',1,15,'{}','{}',datetime('now'),datetime('now')),
('auto-stage-congratulations','stage-congratulations','Stage completion message','Send a dashboard confirmation after each verified stage completion.','stage_completed',NULL,0,'candidate_notification','stage_complete',1,20,'{}','{}',datetime('now'),datetime('now'));

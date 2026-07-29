import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const schema = await readFile("supabase/migrations/202607260001_brownstone_workforce.sql", "utf8");
const applicationFirst = await readFile("supabase/migrations/202607270001_application_first_invites.sql", "utf8");
const scaledPipeline = await readFile("supabase/migrations/202607270002_scaled_recruitment_pipeline.sql", "utf8");
const invitationTemplates = await readFile("supabase/migrations/202607270003_invitation_status_stage_templates.sql", "utf8");
const helper = await readFile("functions/_supabase.js", "utf8");
const readme = await readFile("supabase/README.md", "utf8");

for (const table of [
  "profiles", "admins", "candidates", "invitations", "onboarding_tasks", "candidate_tasks",
  "submissions", "documents", "sensitive_identity_records", "audit_events",
  "support_conversations", "support_messages", "candidate_notifications", "admin_notes", "email_messages", "email_events", "training_modules", "training_progress", "orientation_events", "orientation_attendance",
]) {
  assert.match(schema, new RegExp(`create table if not exists public\\.${table}\\b`, "i"), `Missing Supabase table ${table}`);
  assert.match(schema, new RegExp(`alter table public\\.${table} enable row level security`, "i"), `RLS not enabled for ${table}`);
}
assert.match(schema, /workforce-private-documents/i);
assert.match(schema, /storage\.objects/i);
assert.match(schema, /current_candidate_id\(\)/i);
assert.doesNotMatch(schema, /candidate updates limited own profile/i, "Candidate must not directly update the full candidate row");
assert.doesNotMatch(schema, /candidate updates own tasks/i, "Candidate must not directly approve or rewrite task status");
assert.match(helper, /SUPABASE_SECRET_KEY/);
assert.match(helper, /Authorization: `Bearer/);
assert.match(readme, /server-side/i);
assert.match(readme, /D1/i);
assert.match(applicationFirst, /application_submitted_at/i);
assert.match(applicationFirst, /enforce_application_first_invitation/i);
assert.match(scaledPipeline, /enforce_controlled_candidate_invitation/i);
assert.match(scaledPipeline, /admin_manual/i);
assert.match(scaledPipeline, /human administrator/i);
for (const table of ["candidate_stage_progress", "admin_notifications", "prescreen_question_sets", "prescreen_questions", "candidate_prescreens", "prescreen_answers"]) {
  assert.match(scaledPipeline, new RegExp(`create table if not exists public\\.${table}\\b`, "i"), `Missing scaled Supabase table ${table}`);
  assert.match(scaledPipeline, new RegExp(`alter table public\\.${table} enable row level security`, "i"), `RLS not enabled for scaled table ${table}`);
}
assert.match(invitationTemplates, /invitation_status_key/i);
assert.match(invitationTemplates, /invitation_stage_key/i);
assert.match(invitationTemplates, /template_key/i);
assert.match(invitationTemplates, /candidate access requires a submitted application or an authenticated administrator override/i);
assert.match(invitationTemplates, /enforce_controlled_candidate_invitation/i);
console.log("Supabase migration, RLS, private-storage, and server-secret audit passed.");

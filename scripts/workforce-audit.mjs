import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { encryptSensitiveValue } from "../functions/_pii.js";
import { generateInviteCode, hashInvitationCode } from "../functions/_workforce-db.js";
import { adminPermissions, hasAdminPermission } from "../functions/_admin-auth.js";

const read = (path) => readFile(resolve(path), "utf8");
const [applicationHtml, contactHtml, publicScript, portalHtml, portalScript, portalAutomation, adminHtml, adminScript, adminWorkflow, routes, sitemap, migration1, migration2, migration3, migration4, migration5, migration6, migration7, migration8, migration9, wranglerConfig, sharedRuntime, assistantApi, workflowApi, adminCandidatesApi, adminInvitationsApi, adminWorkflowApi, adminSupportApi, pipelineApi, adminPrescreenApi, portalPrescreenApi, adminNotificationsApi, adminRankingsApi, adminScale, adminAutopilot, autopilotApi, autopilotRuntime, configureAutopilot, emailTemplates] = await Promise.all([
  read("public/apply.html"),
  read("public/contact.html"),
  read("public/script.js"),
  read("public/onboarding_portal/index.html"),
  read("public/onboarding_portal/portal.js"),
  read("public/onboarding_portal/portal-automation.js"),
  read("public/workforce_admin/index.html"),
  read("public/workforce_admin/admin.js"),
  read("public/workforce_admin/admin-workflow.js"),
  read("public/_routes.json"),
  read("public/sitemap.xml"),
  read("migrations/0001_workforce_portal.sql"),
  read("migrations/0002_encrypt_identity_payload.sql"),
  read("migrations/0003_candidate_session_revocation.sql"),
  read("migrations/0004_workflow_ai_support.sql"),
  read("migrations/0005_confidential_application.sql"),
  read("migrations/0006_application_first_invites.sql"),
  read("migrations/0007_scaled_recruitment_pipeline.sql"),
  read("migrations/0008_invitation_status_stage_templates.sql"),
  read("migrations/0009_autonomous_operations.sql"),
  read("wrangler.jsonc"),
  read("functions/_shared.js"),
  read("functions/api/portal/assistant.js"),
  read("functions/api/portal/workflow.js"),
  read("functions/api/admin/candidates.js"),
  read("functions/api/admin/invitations.js"),
  read("functions/api/admin/workflow.js"),
  read("functions/api/admin/support.js"),
  read("functions/_pipeline.js"),
  read("functions/api/admin/prescreen.js"),
  read("functions/api/portal/prescreen.js"),
  read("functions/api/admin/notifications.js"),
  read("functions/api/admin/rankings.js"),
  read("public/workforce_admin/admin-scale.js"),
  read("public/workforce_admin/admin-autopilot.js"),
  read("functions/api/admin/autopilot.js"),
  read("functions/_autopilot.js"),
  read("scripts/configure-autopilot.sh"),
  read("emails/index.js"),
]);

for (const prohibited of ["ssnLast4", "motherMaidenName", 'name="idFront"', 'name="idBack"', 'name="ssn"']) {
  assert.ok(!applicationHtml.includes(prohibited), `Public application still contains ${prohibited}`);
  assert.ok(!publicScript.includes(prohibited), `Public application JavaScript still contains ${prohibited}`);
}
assert.match(applicationHtml, /Detailed applications[\s\S]*private onboarding portal/i);
assert.ok(!applicationHtml.includes('id="careerApplicationForm"'), "Detailed application form must not remain on the public site");
assert.match(applicationHtml, /contact#candidate-support/);
assert.match(contactHtml, /standard public candidate journey starts with an application-interest record/i);
assert.match(contactHtml, /documented manual invitation/i);
assert.match(publicScript, /application_received/);
assert.match(sharedRuntime, /candidate\.application_interest_submitted/);
assert.match(portalHtml, /data-view="secure-identity"/);
assert.match(portalHtml, /name="idFront"/);
assert.match(portalHtml, /name="ssn"/);
assert.match(portalScript, /\/api\/portal\/sensitive/);
assert.match(portalHtml, /data-view="submissions"/);
assert.match(portalHtml, /Brownstone Guide/);
assert.match(portalAutomation, /\/api\/portal\/workflow/);
assert.match(portalAutomation, /\/api\/portal\/assistant/);
assert.match(adminHtml, /Workforce Administration/);
assert.match(adminHtml, /data-view="submissions"/);
assert.match(adminHtml, /data-view="support"/);
assert.match(adminHtml, /data-application-select/);
assert.match(adminHtml, /Manual administrator invitation/i);
assert.match(adminHtml, /data-invite-status/);
assert.match(adminHtml, /data-invite-stage/);
assert.match(adminHtml, /data-invite-template-preview/);
assert.match(adminHtml, /data-view="rankings"/);
assert.match(adminHtml, /data-view="prescreen"/);
assert.match(adminHtml, /data-admin-notification-panel/);
assert.match(adminScript, /inviteEligible=1/);
assert.match(adminWorkflow, /\/api\/admin\/workflow/);
assert.match(adminWorkflow, /\/api\/admin\/support/);
assert.match(routes, /\/workforce_admin\/\*/);
assert.match(routes, /\/onboarding_portal\/\*/);
assert.ok(!sitemap.includes("workforce_admin"), "Admin dashboard must not appear in sitemap");
assert.ok(!sitemap.includes("onboarding_portal"), "Candidate portal must not appear in sitemap");
assert.match(migration1, /CREATE TABLE IF NOT EXISTS audit_events/);
assert.match(migration1, /CREATE TABLE IF NOT EXISTS invitations/);
assert.match(migration2, /identity_ciphertext/);
assert.match(migration3, /session_version/);
assert.match(migration4, /CREATE TABLE IF NOT EXISTS onboarding_tasks/);
assert.match(migration4, /CREATE TABLE IF NOT EXISTS submissions/);
assert.match(migration4, /CREATE TABLE IF NOT EXISTS support_conversations/);
assert.match(migration5, /confidential-candidate-application/);
assert.match(migration5, /application-resume/);
assert.match(migration6, /application_submitted_at/);
assert.match(migration6, /candidate invitation requires a submitted application/);
assert.match(migration7, /DROP TRIGGER IF EXISTS trg_candidates_invite_requires_application_insert/);
assert.match(migration7, /manual candidate invitation requires an administrator override/i);
assert.match(migration7, /CREATE TABLE IF NOT EXISTS candidate_stage_progress/);
assert.match(migration7, /CREATE TABLE IF NOT EXISTS admin_notifications/);
assert.match(migration7, /CREATE TABLE IF NOT EXISTS prescreen_question_sets/);
assert.match(migration7, /CREATE TABLE IF NOT EXISTS candidate_prescreens/);
assert.match(migration7, /A public contact[\s\S]*does not complete the confidential application stage/i);
assert.match(migration8, /invitation_status_key/);
assert.match(migration8, /invitation_stage_key/);
assert.match(migration8, /template_key/);
assert.match(migration8, /candidate access requires a submitted application or an authenticated administrator override/i);
assert.match(migration8, /trg_candidates_access_requires_controlled_origin_insert/);
assert.match(migration9, /CREATE TABLE IF NOT EXISTS automation_rules/);
assert.match(migration9, /CREATE TABLE IF NOT EXISTS automation_runs/);
assert.match(migration9, /CREATE TABLE IF NOT EXISTS candidate_journey_events/);
assert.match(migration9, /CREATE TABLE IF NOT EXISTS operations_health_snapshots/);
assert.match(sharedRuntime, /workflowMigrationRequired:\s*"0009_autonomous_operations\.sql"/);
assert.match(adminAutopilot, /\/api\/admin\/autopilot/);
assert.ok(!adminAutopilot.includes("e.currentTarget.disabled"), "Autopilot must not dereference event.currentTarget after an await");
assert.match(adminAutopilot, /const runButton = \$/);
assert.match(adminScale, /if \(!button \|\| !result\)/);
assert.match(adminScript, /if \(submit\) submit\.disabled/);
assert.match(adminHtml, /admin-autopilot\.js\?v=10\.0\.4/);
assert.match(autopilotApi, /runAutopilot/);
assert.match(autopilotRuntime, /automation_runs/);
assert.match(configureAutopilot, /--config\s+automation-worker\/wrangler\.toml/);
assert.match(wranglerConfig, /"binding": "PRIVATE_DOCUMENTS"/);
assert.match(wranglerConfig, /brownstone-private-documents/);
assert.match(sharedRuntime, /recruitment: \["RESEND_API_KEY"\]/);
assert.ok(!sharedRuntime.includes("RESEND_API_KEY_CANDIDATE_INVITES"), "Specialized Resend keys must not override the unified key");
assert.match(assistantApi, /api\.openai\.com\/v1\/responses/);
assert.match(assistantApi, /Never ask for or repeat SSNs/i);
assert.match(workflowApi, /signature/i);
assert.match(workflowApi, /uploadWorkflowFile/);
assert.match(workflowApi, /APPLICATION_TASK_ID/);
assert.match(workflowApi, /Begin with the confidential candidate application/);
assert.match(workflowApi, /confidential_portal_application/);
assert.match(workflowApi, /completeStage/);
assert.match(adminCandidatesApi, /application_submitted_at IS NOT NULL/);
assert.match(adminCandidatesApi, /candidate\.invited_from_application/);
assert.match(adminCandidatesApi, /candidate\.invited_by_admin_override/);
assert.match(adminCandidatesApi, /manualInviteReason/);
assert.match(adminCandidatesApi, /adminOverrideConfirmed/);
assert.match(adminCandidatesApi, /validateInvitationSelection/);
assert.match(adminCandidatesApi, /initialStatus/);
assert.match(adminCandidatesApi, /initialStage/);
assert.match(adminCandidatesApi, /invitation_template_key/);
assert.match(adminCandidatesApi, /candidateStageInvitationEmail/);
assert.match(adminInvitationsApi, /No previous invitation exists/);
assert.match(adminInvitationsApi, /invitation_status_key/);
assert.match(adminInvitationsApi, /candidateStageInvitationEmail/);
assert.match(portalAutomation, /workflow-file-field/);
assert.match(adminWorkflow, /secure-document-link/);
assert.match(adminWorkflowApi, /correction_required/);
assert.match(adminSupportApi, /resolve/);
assert.match(pipelineApi, /PIPELINE_STAGES/);
assert.match(pipelineApi, /toneKey: stage\.tone/);
assert.match(pipelineApi, /pipeline_rank/);
assert.match(adminPrescreenApi, /api\.openai\.com\/v1\/responses/);
assert.match(adminPrescreenApi, /humanReviewConfirmed/);
assert.match(adminPrescreenApi, /advisory/i);
assert.match(adminPrescreenApi, /protected characteristic/i);
assert.match(adminPrescreenApi, /applicationRequired/);
assert.match(adminPrescreenApi, /confidential portal application before pre-screening/i);
assert.match(portalPrescreenApi, /prescreen\.submitted/);
assert.match(adminNotificationsApi, /admin_notifications/);
assert.match(adminRankingsApi, /recalculateAllRanks/);
assert.match(adminScale, /tonePatterns/);
assert.match(adminScale, /openPrescreenReview/);
assert.match(emailTemplates, /INVITATION_STAGE_OPTIONS/);
assert.match(emailTemplates, /candidateStageInvitationEmail/);
assert.match(emailTemplates, /Personal access code/);
assert.match(portalHtml, /data-view="pre-screening"/);

const code1 = generateInviteCode();
const code2 = generateInviteCode();
assert.match(code1, /^BC-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
assert.notEqual(code1, code2, "Candidate invite codes should be independently generated");
const hash1 = await hashInvitationCode(code1, { INVITATION_PEPPER: "pepper-a" });
const hash2 = await hashInvitationCode(code1, { INVITATION_PEPPER: "pepper-b" });
assert.notEqual(hash1, hash2, "Invitation code hashing must be pepper-dependent");
assert.ok(!hash1.includes(code1), "Invitation hash must not contain plaintext code");

const key = Buffer.alloc(32, 7).toString("base64");
const protectedValue = "123-45-6789";
const encrypted = await encryptSensitiveValue(protectedValue, key);
assert.equal(encrypted.algorithm, "AES-256-GCM");
assert.ok(!encrypted.ciphertext.includes(protectedValue));
assert.ok(encrypted.iv);

assert.ok(hasAdminPermission({ role: "super_admin" }, "document.view"));
assert.ok(hasAdminPermission({ role: "reviewer" }, "document.view"));
assert.ok(!hasAdminPermission({ role: "recruiter" }, "document.view"));
assert.ok(hasAdminPermission({ role: "support" }, "invitation.manage"));
assert.deepEqual(adminPermissions({ role: "auditor" }).includes("candidate.read"), true);
assert.ok(hasAdminPermission({ role: "recruiter" }, "prescreen.assign"));
assert.ok(hasAdminPermission({ role: "reviewer" }, "prescreen.review"));
assert.ok(hasAdminPermission({ role: "recruiter" }, "candidate.stage"));

console.log("Workforce security and migration audit passed.");

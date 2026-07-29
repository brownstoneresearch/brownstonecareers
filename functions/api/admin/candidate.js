import { requireAdmin } from "../../_admin-auth.js";
import { hasWorkforceDb, json } from "../../_workforce-db.js";

export async function onRequestGet(context) {
  const auth = await requireAdmin(context, "candidate.read");
  if (auth.response) return auth.response;
  if (!hasWorkforceDb(context.env)) return json({ message: "WORKFORCE_DB is not configured." }, 503);
  const id = String(new URL(context.request.url).searchParams.get("id") || "").slice(0, 80);
  if (!id) return json({ message: "Candidate ID is required." }, 400);

  const db = context.env.WORKFORCE_DB;
  const [candidate, identity, documents, states, activity, notes, emails, invitations, stageProgress, prescreens] = await Promise.all([
    db.prepare("SELECT * FROM candidates WHERE id = ? LIMIT 1").bind(id).first(),
    db.prepare("SELECT legal_name, ssn_last4, work_authorization_status, verification_status, submitted_at, reviewed_at FROM sensitive_identity WHERE candidate_id = ? LIMIT 1").bind(id).first(),
    db.prepare("SELECT id, category, filename, mime_type, size_bytes, status, submitted_at, reviewed_at FROM documents WHERE candidate_id = ? ORDER BY submitted_at DESC").bind(id).all(),
    db.prepare("SELECT state_key, value_json, updated_at FROM candidate_portal_state WHERE candidate_id = ? ORDER BY updated_at DESC").bind(id).all(),
    db.prepare("SELECT id, actor_type, actor_id, event_type, description, metadata_json, created_at FROM audit_events WHERE candidate_id = ? ORDER BY created_at DESC LIMIT 100").bind(id).all(),
    db.prepare("SELECT n.id, n.note, n.visibility, n.created_at, a.name AS admin_name FROM admin_notes n LEFT JOIN admins a ON a.id = n.admin_id WHERE n.candidate_id = ? ORDER BY n.created_at DESC").bind(id).all(),
    db.prepare("SELECT id, message_type, recipient, provider_message_id, status, subject, created_at FROM email_messages WHERE candidate_id = ? ORDER BY created_at DESC LIMIT 50").bind(id).all(),
    db.prepare("SELECT id, code_hint, status, expires_at, created_at, sent_at, activated_at, last_used_at, revoked_at, template_key, initial_status, initial_stage, email_subject FROM invitations WHERE candidate_id = ? ORDER BY created_at DESC").bind(id).all(),
    db.prepare("SELECT stage_key, status, completion_percent, score, source, notes, started_at, completed_at, completed_by, updated_at FROM candidate_stage_progress WHERE candidate_id = ? ORDER BY completed_at, started_at, stage_key").bind(id).all(),
    db.prepare(`SELECT cp.id, cp.status, cp.due_at, cp.started_at, cp.submitted_at, cp.ai_score, cp.final_score, cp.result_status, cp.admin_feedback, cp.reviewed_at, qs.title AS question_set_title FROM candidate_prescreens cp JOIN prescreen_question_sets qs ON qs.id = cp.question_set_id WHERE cp.candidate_id = ? ORDER BY cp.created_at DESC`).bind(id).all(),
  ]);
  if (!candidate) return json({ message: "Candidate not found." }, 404);

  const portalState = {};
  for (const row of states.results || []) {
    try { portalState[row.state_key] = JSON.parse(row.value_json); } catch { portalState[row.state_key] = null; }
  }

  return json({
    candidate,
    identity: identity ? { ...identity, maskedSsn: identity.ssn_last4 ? `***-**-${identity.ssn_last4}` : null } : null,
    documents: documents.results || [],
    portalState,
    activity: (activity.results || []).map((row) => ({ ...row, metadata: (() => { try { return JSON.parse(row.metadata_json || "{}"); } catch { return {}; } })() })),
    notes: notes.results || [],
    emails: emails.results || [],
    invitations: invitations.results || [],
    stageProgress: stageProgress.results || [],
    prescreens: prescreens.results || [],
  });
}

export function onRequest() {
  return json({ message: "Method not allowed." }, 405);
}

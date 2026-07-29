import { requireAdmin } from "../../_admin-auth.js";
import { hasWorkforceDb, json } from "../../_workforce-db.js";

export async function onRequestGet(context) {
  const auth = await requireAdmin(context, "dashboard.read");
  if (auth.response) return auth.response;
  if (!hasWorkforceDb(context.env)) return json({ message: "WORKFORCE_DB is not configured." }, 503);

  const db = context.env.WORKFORCE_DB;
  const [counts, pendingDocuments, expiring, recentCandidates, recentActivity] = await Promise.all([
    db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'applicant' THEN 1 ELSE 0 END) AS applicants,
        SUM(CASE WHEN status = 'invited' THEN 1 ELSE 0 END) AS invited,
        SUM(CASE WHEN status = 'onboarding' THEN 1 ELSE 0 END) AS onboarding,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN onboarding_progress >= 100 AND status != 'active' THEN 1 ELSE 0 END) AS awaiting_approval,
        SUM(CASE WHEN last_activity_at IS NOT NULL AND datetime(last_activity_at) < datetime('now','-7 days') AND status IN ('invited','onboarding') THEN 1 ELSE 0 END) AS overdue
      FROM candidates
    `).first(),
    db.prepare("SELECT COUNT(*) AS count FROM documents WHERE status = 'submitted'").first(),
    db.prepare("SELECT COUNT(*) AS count FROM invitations WHERE status = 'pending' AND datetime(expires_at) <= datetime('now','+24 hours')").first(),
    db.prepare(`
      SELECT id, first_name, last_name, email, role, status, recruitment_stage, onboarding_progress, last_activity_at, created_at
      FROM candidates ORDER BY COALESCE(last_activity_at, created_at) DESC LIMIT 8
    `).all(),
    db.prepare(`
      SELECT id, actor_type, actor_id, candidate_id, event_type, description, created_at
      FROM audit_events ORDER BY created_at DESC LIMIT 12
    `).all(),
  ]);

  return json({
    counts: {
      total: Number(counts?.total || 0),
      applicants: Number(counts?.applicants || 0),
      invited: Number(counts?.invited || 0),
      onboarding: Number(counts?.onboarding || 0),
      active: Number(counts?.active || 0),
      awaitingApproval: Number(counts?.awaiting_approval || 0),
      overdue: Number(counts?.overdue || 0),
      pendingDocuments: Number(pendingDocuments?.count || 0),
      invitationsExpiringSoon: Number(expiring?.count || 0),
    },
    recentCandidates: recentCandidates.results || [],
    recentActivity: recentActivity.results || [],
  });
}

export function onRequest() {
  return json({ message: "Method not allowed." }, 405);
}

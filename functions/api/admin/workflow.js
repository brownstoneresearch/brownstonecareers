import { hasAdminPermission, requireAdmin } from "../../_admin-auth.js";
import { auditEvent, clean, hasWorkforceDb, json, nowIso, updateCandidateActivity } from "../../_workforce-db.js";
import { completeStage, markStageInProgress, recalculateAllRanks, recalculateCandidatePipeline } from "../../_pipeline.js";

function parseJson(value, fallback = {}) {
  try { return JSON.parse(value || "{}"); } catch { return fallback; }
}

async function candidateProgress(env, candidateId) {
  const counts = await env.WORKFORCE_DB.prepare(`
    SELECT COUNT(*) AS total, SUM(CASE WHEN status IN ('approved','completed','waived') THEN 1 ELSE 0 END) AS done
    FROM candidate_tasks WHERE candidate_id = ?
  `).bind(candidateId).first();
  const total = Number(counts?.total || 0);
  const done = Number(counts?.done || 0);
  const progress = total ? Math.round((done / total) * 100) : 0;
  await updateCandidateActivity(env, candidateId, progress);
  return progress;
}

export async function onRequestGet(context) {
  const auth = await requireAdmin(context, "dashboard.read");
  if (auth.response) return auth.response;
  if (!hasWorkforceDb(context.env)) return json({ message: "WORKFORCE_DB is not configured." }, 503);
  const url = new URL(context.request.url);
  const mode = clean(url.searchParams.get("mode") || "summary", 40);
  const db = context.env.WORKFORCE_DB;

  try {
    if (mode === "summary") {
      const [pending, corrections, openSupport, overdue] = await Promise.all([
        db.prepare("SELECT COUNT(*) AS count FROM submissions WHERE status = 'submitted'").first(),
        db.prepare("SELECT COUNT(*) AS count FROM candidate_tasks WHERE status = 'correction_required'").first(),
        db.prepare("SELECT COUNT(*) AS count FROM support_conversations WHERE status IN ('open','escalated')").first(),
        db.prepare("SELECT COUNT(*) AS count FROM candidate_tasks WHERE status NOT IN ('approved','completed','waived') AND due_at IS NOT NULL AND datetime(due_at) < datetime('now')").first(),
      ]);
      return json({
        pendingSubmissions: Number(pending?.count || 0),
        correctionsRequired: Number(corrections?.count || 0),
        openSupport: Number(openSupport?.count || 0),
        overdueTasks: Number(overdue?.count || 0),
      });
    }

    if (mode === "submissions") {
      const status = clean(url.searchParams.get("status") || "all", 40);
      const where = status === "all" ? "" : "WHERE s.status = ?";
      const statement = db.prepare(`
        SELECT s.id, s.status, s.submitted_at, s.updated_at, s.reviewed_at, s.reviewer_feedback,
               s.response_json, ct.id AS candidate_task_id, ct.signature_name, ct.signature_at, ct.due_at,
               t.title AS task_title, t.category, c.id AS candidate_id, c.first_name, c.last_name, c.email, c.role
        FROM submissions s
        JOIN candidate_tasks ct ON ct.id = s.candidate_task_id
        JOIN onboarding_tasks t ON t.id = ct.task_id
        JOIN candidates c ON c.id = s.candidate_id
        ${where}
        ORDER BY CASE s.status WHEN 'submitted' THEN 0 WHEN 'correction_required' THEN 1 ELSE 2 END, s.submitted_at DESC
        LIMIT 250
      `);
      const rows = status === "all" ? await statement.all() : await statement.bind(status).all();
      return json({ submissions: (rows.results || []).map((row) => ({ ...row, response: parseJson(row.response_json, {}) })) });
    }

    if (mode === "catalog") {
      const rows = await db.prepare("SELECT * FROM onboarding_tasks ORDER BY sort_order, title").all();
      return json({ tasks: (rows.results || []).map((row) => ({ ...row, formSchema: parseJson(row.form_schema_json, {}) })) });
    }

    if (mode === "candidate") {
      const candidateId = clean(url.searchParams.get("candidateId"), 100);
      if (!candidateId) return json({ message: "Candidate ID is required." }, 400);
      const rows = await db.prepare(`
        SELECT ct.*, t.title, t.description, t.category, t.requires_signature, t.requires_admin_review,
               s.id AS submission_id, s.status AS submission_status, s.response_json, s.submitted_at AS submission_date,
               s.reviewer_feedback
        FROM candidate_tasks ct JOIN onboarding_tasks t ON t.id = ct.task_id
        LEFT JOIN submissions s ON s.id = (
          SELECT s2.id FROM submissions s2 WHERE s2.candidate_task_id = ct.id ORDER BY s2.submitted_at DESC LIMIT 1
        )
        WHERE ct.candidate_id = ? ORDER BY t.sort_order, t.title
      `).bind(candidateId).all();
      return json({ tasks: (rows.results || []).map((row) => ({ ...row, response: parseJson(row.response_json, {}) })) });
    }

    return json({ message: "Unsupported workflow query." }, 400);
  } catch (error) {
    console.error("Admin workflow query failed", error?.message || error);
    return json({ message: "Workflow tables are unavailable. Apply migration 0004_workflow_ai_support.sql." }, 503);
  }
}

export async function onRequestPost(context) {
  const auth = await requireAdmin(context, "candidate.read");
  if (auth.response) return auth.response;
  if (!hasWorkforceDb(context.env)) return json({ message: "WORKFORCE_DB is not configured." }, 503);
  let payload;
  try { payload = await context.request.json(); } catch { return json({ message: "Invalid workflow request." }, 400); }
  const action = clean(payload.action, 40);
  const db = context.env.WORKFORCE_DB;
  const timestamp = nowIso();

  if (action === "assign") {
    if (!hasAdminPermission(auth.admin, "task.assign")) return json({ message: "Your role cannot assign onboarding tasks." }, 403);
    const candidateId = clean(payload.candidateId, 100);
    const taskId = clean(payload.taskId, 100);
    const dueAt = clean(payload.dueAt, 60) || new Date(Date.now() + 14 * 86400000).toISOString();
    if (!candidateId || !taskId) return json({ message: "Candidate and task are required." }, 400);
    const existing = await db.prepare("SELECT id FROM candidate_tasks WHERE candidate_id = ? AND task_id = ? LIMIT 1").bind(candidateId, taskId).first();
    if (existing) {
      await db.prepare("UPDATE candidate_tasks SET due_at = ?, status = CASE WHEN status IN ('approved','completed','waived') THEN status ELSE 'assigned' END, updated_at = ? WHERE id = ?")
        .bind(dueAt, timestamp, existing.id).run();
    } else {
      await db.prepare("INSERT INTO candidate_tasks (id, candidate_id, task_id, status, assigned_at, due_at, updated_at) VALUES (?, ?, ?, 'assigned', ?, ?, ?)")
        .bind(crypto.randomUUID(), candidateId, taskId, timestamp, dueAt, timestamp).run();
    }
    await db.prepare("INSERT INTO candidate_notifications (id, candidate_id, title, message, notification_type, status, action_url, created_at) VALUES (?, ?, 'New onboarding task assigned', 'A Brownstone administrator assigned a new onboarding requirement.', 'task', 'unread', '/onboarding_portal/#submissions', ?)")
      .bind(crypto.randomUUID(), candidateId, timestamp).run();
    await auditEvent(context.env, { actorType: "admin", actorId: auth.admin.id, candidateId, eventType: "task.assigned", description: "Administrator assigned an onboarding task.", metadata: { taskId, dueAt }, request: context.request });
    return json({ success: true });
  }

  if (action === "review") {
    if (!hasAdminPermission(auth.admin, "submission.review")) return json({ message: "Your role cannot review submissions." }, 403);
    const submissionId = clean(payload.submissionId, 100);
    const decision = clean(payload.decision, 40);
    const feedback = clean(payload.feedback, 3000);
    if (!submissionId || !["approved", "correction_required", "rejected"].includes(decision)) return json({ message: "A valid review decision is required." }, 400);
    const submission = await db.prepare("SELECT * FROM submissions WHERE id = ? LIMIT 1").bind(submissionId).first();
    if (!submission) return json({ message: "Submission not found." }, 404);
    const taskMeta = await db.prepare(`
      SELECT t.title, t.category FROM candidate_tasks ct
      JOIN onboarding_tasks t ON t.id = ct.task_id WHERE ct.id = ? LIMIT 1
    `).bind(submission.candidate_task_id).first();
    if (decision === "correction_required" && !feedback) return json({ message: "Explain what the candidate should correct." }, 400);
    await db.batch([
      db.prepare("UPDATE submissions SET status = ?, reviewer_feedback = ?, reviewed_at = ?, reviewed_by = ?, updated_at = ? WHERE id = ?")
        .bind(decision, feedback || null, timestamp, auth.admin.id, timestamp, submissionId),
      db.prepare("UPDATE candidate_tasks SET status = ?, admin_feedback = ?, reviewed_at = ?, reviewed_by = ?, completed_at = ?, updated_at = ? WHERE id = ?")
        .bind(decision, feedback || null, timestamp, auth.admin.id, decision === "approved" ? timestamp : null, timestamp, submission.candidate_task_id),
      db.prepare("INSERT INTO candidate_notifications (id, candidate_id, title, message, notification_type, status, action_url, created_at) VALUES (?, ?, ?, ?, 'review', 'unread', '/onboarding_portal/#submissions', ?)")
        .bind(
          crypto.randomUUID(),
          submission.candidate_id,
          decision === "approved" ? "Submission approved" : decision === "correction_required" ? "Correction requested" : "Submission review update",
          decision === "approved" ? "A Brownstone administrator approved your onboarding submission." : feedback || "Review the administrator update in Task Submissions.",
          timestamp,
        ),
    ]);
    const progress = await candidateProgress(context.env, submission.candidate_id);
    const candidate = await db.prepare("SELECT first_name, last_name, recruitment_stage FROM candidates WHERE id = ? LIMIT 1").bind(submission.candidate_id).first();
    const candidateName = `${candidate?.first_name || "Candidate"} ${candidate?.last_name || ""}`.trim();
    if (decision === "approved" && taskMeta?.category === "orientation") {
      await completeStage(context.env, { candidateId: submission.candidate_id, stageKey: "orientation", source: "approved_orientation_submission", score: 100, completedBy: auth.admin.id, candidateName });
    }
    if (decision === "approved" && progress >= 100) {
      await completeStage(context.env, { candidateId: submission.candidate_id, stageKey: "onboarding", source: "all_onboarding_tasks_approved", score: 100, completedBy: auth.admin.id, candidateName });
      await db.prepare("UPDATE candidates SET recruitment_stage = CASE WHEN recruitment_stage = 'onboarding' THEN 'orientation' ELSE recruitment_stage END, updated_at = ? WHERE id = ?")
        .bind(timestamp, submission.candidate_id).run();
      await markStageInProgress(context.env, {
        candidateId: submission.candidate_id,
        stageKey: "orientation",
        source: "onboarding_completed",
        completionPercent: 0,
      });
    }
    const pipeline = await recalculateCandidatePipeline(context.env, submission.candidate_id);
    await recalculateAllRanks(context.env);
    await auditEvent(context.env, { actorType: "admin", actorId: auth.admin.id, candidateId: submission.candidate_id, eventType: "submission.reviewed", description: `Administrator marked an onboarding submission ${decision}.`, metadata: { submissionId, decision, progress, pipelineScore: pipeline.score }, request: context.request });
    return json({ success: true, progress, pipeline });
  }

  if (action === "create-task") {
    if (!hasAdminPermission(auth.admin, "task.manage")) return json({ message: "Your role cannot create workflow tasks." }, 403);
    const title = clean(payload.title, 180);
    const description = clean(payload.description, 1000);
    if (!title || !description) return json({ message: "Task title and description are required." }, 400);
    const id = clean(payload.id, 100) || `custom-${crypto.randomUUID()}`;
    const schema = payload.formSchema && typeof payload.formSchema === "object" ? payload.formSchema : { fields: [], attestation: "I confirm that this submission is accurate." };
    await db.prepare(`
      INSERT INTO onboarding_tasks
        (id, title, description, category, role_scope, requires_submission, requires_signature, requires_admin_review, form_schema_json, instructions, sort_order, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).bind(
      id, title, description, clean(payload.category || "general", 80), clean(payload.roleScope || "*", 500),
      payload.requiresSignature ? 1 : 0, payload.requiresAdminReview === false ? 0 : 1,
      JSON.stringify(schema), clean(payload.instructions, 2000), Number(payload.sortOrder || 100), timestamp, timestamp,
    ).run();
    await auditEvent(context.env, { actorType: "admin", actorId: auth.admin.id, eventType: "workflow.task_created", description: `Administrator created onboarding task: ${title}.`, metadata: { taskId: id }, request: context.request });
    return json({ success: true, taskId: id }, 201);
  }

  return json({ message: "Unsupported workflow action." }, 400);
}

export function onRequest() { return json({ message: "Method not allowed." }, 405); }

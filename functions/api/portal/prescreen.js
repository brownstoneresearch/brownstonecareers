import { readSession } from "../../_portal-auth.js";
import { createAdminNotification, markStageInProgress, recalculateCandidatePipeline } from "../../_pipeline.js";
import { auditEvent, clean, hasWorkforceDb, json, nowIso } from "../../_workforce-db.js";

function parseJson(value, fallback) {
  try { return JSON.parse(value || ""); } catch { return fallback; }
}

async function loadAssignment(db, candidateId) {
  const assignment = await db.prepare(`
    SELECT cp.*, qs.title, qs.description, qs.instructions, qs.pass_score
    FROM candidate_prescreens cp
    JOIN prescreen_question_sets qs ON qs.id = cp.question_set_id
    WHERE cp.candidate_id = ?
    ORDER BY cp.created_at DESC LIMIT 1
  `).bind(candidateId).first();
  if (!assignment) return null;
  const rows = await db.prepare(`
    SELECT q.id, q.prompt, q.question_type, q.options_json, q.required, q.max_points, q.sort_order,
           a.answer_text, a.answer_json
    FROM prescreen_questions q
    LEFT JOIN prescreen_answers a ON a.question_id = q.id AND a.candidate_prescreen_id = ?
    WHERE q.question_set_id = ? AND q.status = 'active'
    ORDER BY q.sort_order, q.created_at
  `).bind(assignment.id, assignment.question_set_id).all();
  return {
    assignment,
    questions: (rows.results || []).map((row) => ({
      ...row,
      required: Boolean(row.required),
      options: parseJson(row.options_json, []),
      answer: row.answer_text || parseJson(row.answer_json, null),
    })),
  };
}

export async function onRequestGet(context) {
  const session = await readSession(context.request, context.env);
  if (!session) return json({ message: "Candidate authentication required." }, 401);
  if (!hasWorkforceDb(context.env)) return json({ message: "The workforce database is not configured." }, 503);
  const detail = await loadAssignment(context.env.WORKFORCE_DB, session.id);
  if (!detail) return json({ assigned: false, message: "No pre-screening questions have been assigned yet." });
  const reviewed = detail.assignment.status === "reviewed";
  return json({
    assigned: true,
    assignment: {
      id: detail.assignment.id,
      title: detail.assignment.title,
      description: detail.assignment.description,
      instructions: detail.assignment.instructions,
      status: detail.assignment.status,
      dueAt: detail.assignment.due_at,
      startedAt: detail.assignment.started_at,
      submittedAt: detail.assignment.submitted_at,
      reviewedAt: detail.assignment.reviewed_at,
      result: reviewed ? {
        score: detail.assignment.final_score,
        status: detail.assignment.result_status,
        feedback: detail.assignment.admin_feedback,
      } : null,
    },
    questions: reviewed ? [] : detail.questions,
  });
}

export async function onRequestPost(context) {
  const session = await readSession(context.request, context.env);
  if (!session) return json({ message: "Candidate authentication required." }, 401);
  if (!hasWorkforceDb(context.env)) return json({ message: "The workforce database is not configured." }, 503);
  let payload;
  try { payload = await context.request.json(); } catch { return json({ message: "Invalid pre-screening request." }, 400); }
  const action = clean(payload.action, 40);
  const db = context.env.WORKFORCE_DB;
  const detail = await loadAssignment(db, session.id);
  if (!detail) return json({ message: "No pre-screening assignment is available." }, 404);
  if (["reviewed", "submitted", "ai_scored"].includes(detail.assignment.status) && action !== "read") {
    return json({ message: "This pre-screening has already been submitted and can no longer be edited." }, 409);
  }
  const timestamp = nowIso();

  if (action === "start") {
    await db.prepare("UPDATE candidate_prescreens SET status = 'in_progress', started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ?")
      .bind(timestamp, timestamp, detail.assignment.id).run();
    await markStageInProgress(context.env, { candidateId: session.id, stageKey: "pre_screening", source: "candidate_started", completionPercent: 20 });
    await auditEvent(context.env, { actorType: "candidate", actorId: session.id, candidateId: session.id, eventType: "prescreen.started", description: "Candidate started the assigned pre-screening questions.", metadata: { assignmentId: detail.assignment.id }, request: context.request });
    return json({ success: true, status: "in_progress" });
  }

  if (!["save", "submit"].includes(action)) return json({ message: "Unsupported pre-screening action." }, 400);
  const answers = payload.answers && typeof payload.answers === "object" ? payload.answers : {};
  const activeIds = new Set(detail.questions.map((question) => question.id));
  const statements = [];
  for (const question of detail.questions) {
    const raw = answers[question.id];
    const answerText = typeof raw === "string" ? clean(raw, 8000) : clean(raw?.value, 8000);
    if (action === "submit" && question.required && !answerText) return json({ message: `Complete the required question: ${question.prompt}` }, 400);
    if (!activeIds.has(question.id) || (!answerText && action === "save")) continue;
    statements.push(db.prepare(`
      INSERT INTO prescreen_answers
        (id, candidate_prescreen_id, question_id, answer_text, answer_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, '{}', ?, ?)
      ON CONFLICT(candidate_prescreen_id, question_id) DO UPDATE SET
        answer_text = excluded.answer_text, updated_at = excluded.updated_at
    `).bind(crypto.randomUUID(), detail.assignment.id, question.id, answerText, timestamp, timestamp));
  }
  const nextStatus = action === "submit" ? "submitted" : "in_progress";
  statements.push(db.prepare(`UPDATE candidate_prescreens SET status = ?, started_at = COALESCE(started_at, ?), submitted_at = ?, updated_at = ? WHERE id = ?`)
    .bind(nextStatus, timestamp, action === "submit" ? timestamp : null, timestamp, detail.assignment.id));
  if (statements.length) await db.batch(statements);

  if (action === "submit") {
    const candidate = await db.prepare("SELECT first_name, last_name, role FROM candidates WHERE id = ? LIMIT 1").bind(session.id).first();
    await markStageInProgress(context.env, { candidateId: session.id, stageKey: "pre_screening", source: "candidate_submitted", completionPercent: 80 });
    await recalculateCandidatePipeline(context.env, session.id);
    await createAdminNotification(context.env, {
      candidateId: session.id,
      notificationType: "prescreen_submitted",
      stageKey: "pre_screening",
      toneKey: "pre_screening",
      title: "Pre-screening ready for review",
      message: `${candidate?.first_name || "A candidate"} ${candidate?.last_name || ""}`.trim() + " submitted the administrator-managed pre-screening questions.",
      actionUrl: `/workforce_admin/#prescreen=${encodeURIComponent(detail.assignment.id)}`,
      uniqueKey: `prescreen-submitted:${detail.assignment.id}`,
    });
    await auditEvent(context.env, { actorType: "candidate", actorId: session.id, candidateId: session.id, eventType: "prescreen.submitted", description: "Candidate submitted the assigned pre-screening questions for administrator evaluation.", metadata: { assignmentId: detail.assignment.id, questionCount: detail.questions.length }, request: context.request });
    return json({ success: true, status: "submitted", message: "Your pre-screening answers were submitted for administrator review." }, 201);
  }

  await auditEvent(context.env, { actorType: "candidate", actorId: session.id, candidateId: session.id, eventType: "prescreen.saved", description: "Candidate saved pre-screening progress.", metadata: { assignmentId: detail.assignment.id }, request: context.request });
  return json({ success: true, status: "in_progress", message: "Pre-screening progress saved." });
}

export function onRequest() { return json({ message: "Method not allowed." }, 405); }

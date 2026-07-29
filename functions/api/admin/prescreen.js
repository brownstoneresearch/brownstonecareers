import { preScreeningEmail, preScreeningResultEmail } from "../../../emails/index.js";
import { hasAdminPermission, requireAdmin } from "../../_admin-auth.js";
import { onboardingPortalUrl } from "../../_domains.js";
import { completeStage, markStageInProgress, recalculateAllRanks, recalculateCandidatePipeline } from "../../_pipeline.js";
import { hasResendChannel, sendResendEmail } from "../../_shared.js";
import { auditEvent, clean, hasWorkforceDb, json, nowIso } from "../../_workforce-db.js";

function parseJson(value, fallback) {
  try { return JSON.parse(value || ""); } catch { return fallback; }
}

function extractOutputText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  const pieces = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) if (typeof content?.text === "string") pieces.push(content.text);
  }
  return pieces.join("\n").trim();
}

async function aiGrade(env, assignment, questions) {
  if (!env?.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured for AI-assisted grading.");
  const model = clean(env.OPENAI_GRADING_MODEL || env.OPENAI_MODEL || "gpt-5.6", 80);
  const gradingItems = questions.map((item) => ({
    questionId: item.id,
    prompt: item.prompt,
    rubric: item.rubric,
    maxPoints: Number(item.max_points || 0),
    answer: clean(item.answer_text, 8000),
  }));
  const instructions = `You are an advisory pre-screening scoring assistant for Brownstone Careers. Your output is a draft for a qualified human administrator, never a final employment decision. Score only the job-related evidence in the supplied answers against the supplied rubrics. Do not infer or use age, race, color, national origin, citizenship beyond explicit work-authorization requirements, religion, sex, gender, pregnancy, disability, medical status, genetic information, marital or family status, veteran status, or any other protected characteristic. Do not reward polished writing unless communication quality is part of the rubric. Flag missing evidence or sensitive personal information without repeating it. Be consistent, evidence-based, and concise.`;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      instructions,
      input: JSON.stringify({ role: assignment.role, questions: gradingItems }),
      max_output_tokens: 2200,
      text: {
        format: {
          type: "json_schema",
          name: "brownstone_prescreen_grade",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["summary", "strengths", "developmentAreas", "riskFlags", "questions"],
            properties: {
              summary: { type: "string" },
              strengths: { type: "array", items: { type: "string" } },
              developmentAreas: { type: "array", items: { type: "string" } },
              riskFlags: { type: "array", items: { type: "string" } },
              questions: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["questionId", "score", "feedback", "evidence"],
                  properties: {
                    questionId: { type: "string" },
                    score: { type: "number" },
                    feedback: { type: "string" },
                    evidence: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    console.error("Pre-screen AI grading failed", response.status, body);
    throw new Error(`AI grading request failed with status ${response.status}.`);
  }
  const raw = extractOutputText(await response.json());
  const result = parseJson(raw, null);
  if (!result || !Array.isArray(result.questions)) throw new Error("The AI grading response could not be validated.");
  const questionMap = new Map(questions.map((item) => [item.id, item]));
  const available = questions.reduce((sum, question) => sum + Math.max(0, Number(question.max_points || 0)), 0);
  let earned = 0;
  const normalized = [];
  const seen = new Set();
  for (const item of result.questions) {
    const questionId = clean(item.questionId, 120);
    const question = questionMap.get(questionId);
    if (!question || seen.has(questionId)) continue;
    seen.add(questionId);
    const max = Math.max(0, Number(question.max_points || 0));
    const score = Math.max(0, Math.min(max, Number(item.score || 0)));
    earned += score;
    normalized.push({
      questionId: question.id,
      score,
      feedback: clean(item.feedback, 1600),
      evidence: clean(item.evidence, 1600),
    });
  }
  for (const question of questions) {
    if (!seen.has(question.id)) normalized.push({ questionId: question.id, score: 0, feedback: "No advisory score was returned for this item; administrator review is required.", evidence: "" });
  }
  const overallScore = available ? Math.round((earned / available) * 1000) / 10 : 0;
  return {
    model,
    overallScore,
    summary: clean(result.summary, 3000),
    strengths: (result.strengths || []).map((value) => clean(value, 500)).filter(Boolean).slice(0, 8),
    developmentAreas: (result.developmentAreas || []).map((value) => clean(value, 500)).filter(Boolean).slice(0, 8),
    riskFlags: (result.riskFlags || []).map((value) => clean(value, 500)).filter(Boolean).slice(0, 8),
    questions: normalized,
  };
}

async function getAssignmentDetail(db, id) {
  const assignment = await db.prepare(`
    SELECT cp.*, c.first_name, c.last_name, c.email, c.role, c.recruitment_stage,
           qs.title AS question_set_title, qs.description AS question_set_description,
           qs.instructions, qs.pass_score
    FROM candidate_prescreens cp
    JOIN candidates c ON c.id = cp.candidate_id
    JOIN prescreen_question_sets qs ON qs.id = cp.question_set_id
    WHERE cp.id = ? LIMIT 1
  `).bind(id).first();
  if (!assignment) return null;
  const rows = await db.prepare(`
    SELECT q.*, a.id AS answer_id, a.answer_text, a.answer_json, a.ai_score, a.ai_feedback,
           a.admin_score, a.admin_feedback
    FROM prescreen_questions q
    LEFT JOIN prescreen_answers a ON a.question_id = q.id AND a.candidate_prescreen_id = ?
    WHERE q.question_set_id = ? AND q.status = 'active'
    ORDER BY q.sort_order, q.created_at
  `).bind(id, assignment.question_set_id).all();
  return {
    assignment: { ...assignment, aiRiskFlags: parseJson(assignment.ai_risk_flags_json, []) },
    questions: (rows.results || []).map((row) => ({ ...row, options: parseJson(row.options_json, []), answer: parseJson(row.answer_json, {}) })),
  };
}

export async function onRequestGet(context) {
  const auth = await requireAdmin(context, "prescreen.read");
  if (auth.response) return auth.response;
  if (!hasWorkforceDb(context.env)) return json({ message: "WORKFORCE_DB is not configured." }, 503);
  const url = new URL(context.request.url);
  const mode = clean(url.searchParams.get("mode") || "queue", 40);
  const db = context.env.WORKFORCE_DB;

  if (mode === "sets") {
    const rows = await db.prepare(`
      SELECT qs.*, COUNT(q.id) AS question_count,
        COALESCE(SUM(CASE WHEN q.status = 'active' THEN q.max_points ELSE 0 END), 0) AS total_points
      FROM prescreen_question_sets qs
      LEFT JOIN prescreen_questions q ON q.question_set_id = qs.id
      GROUP BY qs.id ORDER BY qs.updated_at DESC
    `).all();
    return json({ sets: rows.results || [] });
  }
  if (mode === "questions") {
    const setId = clean(url.searchParams.get("setId"), 120);
    const set = await db.prepare("SELECT * FROM prescreen_question_sets WHERE id = ? LIMIT 1").bind(setId).first();
    if (!set) return json({ message: "Question set not found." }, 404);
    const rows = await db.prepare("SELECT * FROM prescreen_questions WHERE question_set_id = ? ORDER BY sort_order, created_at").bind(setId).all();
    return json({ set, questions: (rows.results || []).map((row) => ({ ...row, options: parseJson(row.options_json, []) })) });
  }
  if (mode === "detail") {
    const detail = await getAssignmentDetail(db, clean(url.searchParams.get("id"), 120));
    return detail ? json(detail) : json({ message: "Pre-screening assignment not found." }, 404);
  }
  const status = clean(url.searchParams.get("status") || "all", 40);
  const where = status === "all" ? "" : "WHERE cp.status = ?";
  const statement = db.prepare(`
    SELECT cp.*, c.first_name, c.last_name, c.email, c.role, c.pipeline_score, c.pipeline_rank,
           qs.title AS question_set_title, qs.pass_score
    FROM candidate_prescreens cp
    JOIN candidates c ON c.id = cp.candidate_id
    JOIN prescreen_question_sets qs ON qs.id = cp.question_set_id
    ${where}
    ORDER BY CASE cp.status WHEN 'submitted' THEN 0 WHEN 'ai_scored' THEN 1 WHEN 'assigned' THEN 2 ELSE 3 END,
             COALESCE(cp.submitted_at, cp.created_at) DESC
    LIMIT 300
  `);
  const rows = status === "all" ? await statement.all() : await statement.bind(status).all();
  return json({ assignments: rows.results || [], aiConfigured: Boolean(context.env.OPENAI_API_KEY) });
}

export async function onRequestPost(context) {
  const auth = await requireAdmin(context, "prescreen.read");
  if (auth.response) return auth.response;
  if (!hasWorkforceDb(context.env)) return json({ message: "WORKFORCE_DB is not configured." }, 503);
  let payload;
  try { payload = await context.request.json(); } catch { return json({ message: "Invalid pre-screening request." }, 400); }
  const action = clean(payload.action, 40);
  const db = context.env.WORKFORCE_DB;
  const timestamp = nowIso();

  if (action === "create-set") {
    if (!hasAdminPermission(auth.admin, "prescreen.manage")) return json({ message: "Your role cannot create pre-screening sets." }, 403);
    const title = clean(payload.title, 180);
    if (!title) return json({ message: "Question-set title is required." }, 400);
    const id = `prescreen-${crypto.randomUUID()}`;
    await db.prepare(`INSERT INTO prescreen_question_sets
      (id, title, description, role_scope, instructions, pass_score, status, version, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'draft', 1, ?, ?, ?)`)
      .bind(id, title, clean(payload.description, 1000), clean(payload.roleScope || "*", 500), clean(payload.instructions, 2000), Math.max(0, Math.min(100, Number(payload.passScore || 70))), auth.admin.id, timestamp, timestamp).run();
    await auditEvent(context.env, { actorType: "admin", actorId: auth.admin.id, eventType: "prescreen.set_created", description: `Administrator created pre-screening set: ${title}.`, metadata: { setId: id }, request: context.request });
    return json({ success: true, setId: id }, 201);
  }

  if (action === "update-set") {
    if (!hasAdminPermission(auth.admin, "prescreen.manage")) return json({ message: "Your role cannot edit pre-screening sets." }, 403);
    const setId = clean(payload.setId, 120);
    const status = ["draft", "published", "archived"].includes(payload.status) ? payload.status : "draft";
    await db.prepare(`UPDATE prescreen_question_sets SET title = ?, description = ?, role_scope = ?, instructions = ?, pass_score = ?, status = ?, version = version + 1, updated_at = ? WHERE id = ?`)
      .bind(clean(payload.title, 180), clean(payload.description, 1000), clean(payload.roleScope || "*", 500), clean(payload.instructions, 2000), Math.max(0, Math.min(100, Number(payload.passScore || 70))), status, timestamp, setId).run();
    return json({ success: true });
  }

  if (action === "add-question") {
    if (!hasAdminPermission(auth.admin, "prescreen.manage")) return json({ message: "Your role cannot edit pre-screening questions." }, 403);
    const setId = clean(payload.setId, 120);
    const prompt = clean(payload.prompt, 3000);
    const rubric = clean(payload.rubric, 3000);
    if (!setId || !prompt || !rubric) return json({ message: "Question set, prompt, and rubric are required." }, 400);
    const id = `psq-${crypto.randomUUID()}`;
    await db.prepare(`INSERT INTO prescreen_questions
      (id, question_set_id, prompt, question_type, options_json, required, max_points, rubric, ai_guidance, sort_order, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`)
      .bind(id, setId, prompt, clean(payload.questionType || "textarea", 40), JSON.stringify(Array.isArray(payload.options) ? payload.options : []), payload.required === false ? 0 : 1, Math.max(1, Math.min(100, Number(payload.maxPoints || 10))), rubric, clean(payload.aiGuidance, 2000), Number(payload.sortOrder || 100), timestamp, timestamp).run();
    return json({ success: true, questionId: id }, 201);
  }

  if (action === "update-question") {
    if (!hasAdminPermission(auth.admin, "prescreen.manage")) return json({ message: "Your role cannot edit pre-screening questions." }, 403);
    const questionId = clean(payload.questionId, 120);
    await db.prepare(`UPDATE prescreen_questions SET prompt = ?, question_type = ?, options_json = ?, required = ?, max_points = ?, rubric = ?, ai_guidance = ?, sort_order = ?, status = ?, updated_at = ? WHERE id = ?`)
      .bind(clean(payload.prompt, 3000), clean(payload.questionType || "textarea", 40), JSON.stringify(Array.isArray(payload.options) ? payload.options : []), payload.required === false ? 0 : 1, Math.max(1, Math.min(100, Number(payload.maxPoints || 10))), clean(payload.rubric, 3000), clean(payload.aiGuidance, 2000), Number(payload.sortOrder || 100), payload.status === "inactive" ? "inactive" : "active", timestamp, questionId).run();
    return json({ success: true });
  }

  if (action === "assign") {
    if (!hasAdminPermission(auth.admin, "prescreen.assign")) return json({ message: "Your role cannot assign pre-screening." }, 403);
    const candidateId = clean(payload.candidateId, 120);
    const setId = clean(payload.setId, 120);
    if (!candidateId || !setId) return json({ message: "Candidate and question set are required." }, 400);
    const [candidate, set] = await Promise.all([
      db.prepare("SELECT * FROM candidates WHERE id = ? LIMIT 1").bind(candidateId).first(),
      db.prepare("SELECT * FROM prescreen_question_sets WHERE id = ? AND status = 'published' LIMIT 1").bind(setId).first(),
    ]);
    if (!candidate || !set) return json({ message: "Candidate or published question set was not found." }, 404);
    const applicationTask = await db.prepare(`
      SELECT ct.status
      FROM candidate_tasks ct
      WHERE ct.candidate_id = ? AND ct.task_id = 'confidential-candidate-application'
      LIMIT 1
    `).bind(candidateId).first();
    if (!applicationTask || !["submitted", "approved", "completed", "waived"].includes(applicationTask.status)) {
      return json({
        message: "The candidate must submit the confidential portal application before pre-screening can be assigned.",
        applicationRequired: true,
      }, 409);
    }
    const active = await db.prepare("SELECT id FROM candidate_prescreens WHERE candidate_id = ? AND status IN ('assigned','in_progress','submitted','ai_scored') LIMIT 1").bind(candidateId).first();
    if (active) return json({ message: "This candidate already has an active pre-screening assignment." }, 409);
    const id = crypto.randomUUID();
    const dueAt = clean(payload.dueAt, 60) || new Date(Date.now() + 3 * 86400000).toISOString();
    await db.batch([
      db.prepare(`INSERT INTO candidate_prescreens (id, candidate_id, question_set_id, status, assigned_by, due_at, created_at, updated_at) VALUES (?, ?, ?, 'assigned', ?, ?, ?, ?)`)
        .bind(id, candidateId, setId, auth.admin.id, dueAt, timestamp, timestamp),
      db.prepare("UPDATE candidates SET recruitment_stage = 'pre_screening', updated_at = ?, last_activity_at = ? WHERE id = ?")
        .bind(timestamp, timestamp, candidateId),
      db.prepare("INSERT INTO candidate_notifications (id, candidate_id, title, message, notification_type, status, action_url, created_at) VALUES (?, ?, 'Pre-screening assigned', 'Complete your administrator-managed pre-screening questions in the candidate portal.', 'pre_screening', 'unread', '/onboarding_portal/#pre-screening', ?)")
        .bind(crypto.randomUUID(), candidateId, timestamp),
    ]);
    await markStageInProgress(context.env, { candidateId, stageKey: "pre_screening", source: "admin_assignment", completionPercent: 10 });
    let emailSent = false;
    if (hasResendChannel(context.env, "workforce") && context.env.EMAIL_FROM) {
      const actionUrl = `${onboardingPortalUrl(context.env).replace(/\/$/, "")}/#pre-screening`;
      const result = await sendResendEmail(context.env, {
        from: context.env.EMAIL_FROM,
        to: [candidate.email],
        reply_to: clean(context.env.EMAIL_REPLY_TO || context.env.RECRUITMENT_EMAIL, 320),
        subject: `Brownstone pre-screening assigned — ${candidate.id}`,
        html: preScreeningEmail({ firstName: candidate.first_name, role: candidate.role, actionUrl, deadline: new Date(dueAt).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }) + " UTC" }),
      }, `${candidate.id}-prescreen-${id}`, "workforce");
      emailSent = result.ok;
    }
    await auditEvent(context.env, { actorType: "admin", actorId: auth.admin.id, candidateId, eventType: "prescreen.assigned", description: "Administrator assigned a pre-screening question set.", metadata: { assignmentId: id, setId, dueAt, emailSent }, request: context.request });
    return json({ success: true, assignmentId: id, emailSent }, 201);
  }

  if (action === "ai-grade") {
    if (!hasAdminPermission(auth.admin, "prescreen.ai")) return json({ message: "Your role cannot request AI-assisted grading." }, 403);
    const id = clean(payload.assignmentId, 120);
    const detail = await getAssignmentDetail(db, id);
    if (!detail) return json({ message: "Pre-screening assignment not found." }, 404);
    if (!["submitted", "ai_scored"].includes(detail.assignment.status)) return json({ message: "The candidate must submit the pre-screening before AI-assisted grading." }, 409);
    let result;
    try { result = await aiGrade(context.env, detail.assignment, detail.questions); }
    catch (error) { return json({ message: error.message }, 503); }
    const answerMap = new Map(result.questions.map((item) => [item.questionId, item]));
    const statements = detail.questions.map((question) => {
      const scored = answerMap.get(question.id);
      return db.prepare("UPDATE prescreen_answers SET ai_score = ?, ai_feedback = ?, updated_at = ? WHERE candidate_prescreen_id = ? AND question_id = ?")
        .bind(scored?.score ?? null, scored ? `${scored.feedback}${scored.evidence ? ` Evidence: ${scored.evidence}` : ""}` : null, timestamp, id, question.id);
    });
    statements.push(db.prepare(`UPDATE candidate_prescreens SET status = 'ai_scored', ai_scored_at = ?, ai_model = ?, ai_score = ?, ai_summary = ?, ai_risk_flags_json = ?, updated_at = ? WHERE id = ?`)
      .bind(timestamp, result.model, result.overallScore, result.summary, JSON.stringify(result.riskFlags), timestamp, id));
    await db.batch(statements);
    await auditEvent(context.env, { actorType: "admin", actorId: auth.admin.id, candidateId: detail.assignment.candidate_id, eventType: "prescreen.ai_draft_generated", description: "Administrator requested an advisory AI grading draft for human review.", metadata: { assignmentId: id, model: result.model, aiScore: result.overallScore }, request: context.request });
    return json({ success: true, advisory: true, humanReviewRequired: true, result });
  }

  if (action === "finalize") {
    if (!hasAdminPermission(auth.admin, "prescreen.review")) return json({ message: "Your role cannot finalize pre-screening results." }, 403);
    const id = clean(payload.assignmentId, 120);
    const detail = await getAssignmentDetail(db, id);
    if (!detail) return json({ message: "Pre-screening assignment not found." }, 404);
    const confirmed = payload.humanReviewConfirmed === true || payload.humanReviewConfirmed === "yes" || payload.humanReviewConfirmed === "on";
    const resultStatus = ["passed", "conditional", "not_selected"].includes(payload.resultStatus) ? payload.resultStatus : "conditional";
    const submittedScore = Number(payload.finalScore);
    const feedback = clean(payload.adminFeedback, 5000);
    if (!Number.isFinite(submittedScore)) return json({ message: "Enter an independent administrator final score before releasing the result." }, 400);
    const finalScore = Math.max(0, Math.min(100, submittedScore));
    if (!confirmed || !feedback) return json({ message: "A human administrator must independently review the answers, confirm the decision, and provide candidate-facing feedback." }, 400);
    const candidate = detail.assignment;
    await db.batch([
      db.prepare(`UPDATE candidate_prescreens SET status = 'reviewed', admin_score = ?, final_score = ?, result_status = ?, admin_feedback = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?`)
        .bind(finalScore, finalScore, resultStatus, feedback, auth.admin.id, timestamp, timestamp, id),
      db.prepare("UPDATE candidates SET prescreening_score = ?, recruitment_stage = ?, status = ?, updated_at = ?, last_activity_at = ? WHERE id = ?")
        .bind(finalScore, resultStatus === "passed" ? "assessment" : "pre_screening", resultStatus === "not_selected" ? "rejected" : "approved", timestamp, timestamp, candidate.candidate_id),
      db.prepare("INSERT INTO candidate_notifications (id, candidate_id, title, message, notification_type, status, action_url, created_at) VALUES (?, ?, 'Pre-screening result available', ?, 'pre_screening_result', 'unread', '/onboarding_portal/#pre-screening', ?)")
        .bind(crypto.randomUUID(), candidate.candidate_id, feedback, timestamp),
    ]);
    await completeStage(context.env, {
      candidateId: candidate.candidate_id,
      stageKey: "pre_screening",
      source: "admin_human_review",
      score: finalScore,
      notes: feedback,
      completedBy: auth.admin.id,
      candidateName: `${candidate.first_name} ${candidate.last_name}`,
    });
    if (resultStatus === "passed") {
      await markStageInProgress(context.env, { candidateId: candidate.candidate_id, stageKey: "assessment", source: "prescreen_passed", completionPercent: 0 });
    }
    const pipeline = await recalculateCandidatePipeline(context.env, candidate.candidate_id);
    await recalculateAllRanks(context.env);
    let emailSent = false;
    if (hasResendChannel(context.env, "workforce") && context.env.EMAIL_FROM) {
      const actionUrl = `${onboardingPortalUrl(context.env).replace(/\/$/, "")}/#pre-screening`;
      const result = await sendResendEmail(context.env, {
        from: context.env.EMAIL_FROM,
        to: [candidate.email],
        reply_to: clean(context.env.EMAIL_REPLY_TO || context.env.RECRUITMENT_EMAIL, 320),
        subject: `Brownstone pre-screening result — ${candidate.candidate_id}`,
        html: preScreeningResultEmail({
          firstName: candidate.first_name,
          candidateId: candidate.candidate_id,
          score: finalScore,
          grade: resultStatus === "passed" ? "Advance" : resultStatus === "conditional" ? "Conditional review" : "Not selected",
          status: resultStatus === "passed" ? "Passed" : resultStatus === "conditional" ? "Conditional" : "Not selected",
          summary: feedback,
          actionUrl,
          actionLabel: "View Result in Candidate Portal",
        }),
      }, `${candidate.candidate_id}-prescreen-result-${id}`, "workforce");
      emailSent = result.ok;
      if (emailSent) await db.prepare("UPDATE candidate_prescreens SET result_sent_at = ?, updated_at = ? WHERE id = ?").bind(nowIso(), nowIso(), id).run();
    }
    await auditEvent(context.env, { actorType: "admin", actorId: auth.admin.id, candidateId: candidate.candidate_id, eventType: "prescreen.result_finalized", description: "Administrator finalized and released the pre-screening result after human review.", metadata: { assignmentId: id, finalScore, resultStatus, emailSent, pipelineScore: pipeline.score, aiAdvisoryUsed: detail.assignment.ai_score != null }, request: context.request });
    return json({ success: true, emailSent, pipeline, resultStatus, finalScore });
  }

  return json({ message: "Unsupported pre-screening action." }, 400);
}

export function onRequest() { return json({ message: "Method not allowed." }, 405); }

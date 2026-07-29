import { readSession } from "../../_portal-auth.js";
import {
  auditEvent,
  clean,
  getCandidateById,
  hasWorkforceDb,
  json,
  nowIso,
  updateCandidateActivity,
} from "../../_workforce-db.js";
import { createAdminNotification, markStageInProgress, recalculateAllRanks, recalculateCandidatePipeline } from "../../_pipeline.js";
import { getCandidateJourney } from "../../_journey.js";

const FINAL_STATUSES = new Set(["approved", "completed", "waived"]);
const APPLICATION_TASK_ID = "confidential-candidate-application";
const APPLICATION_UNLOCK_STATUSES = new Set(["submitted", "approved", "completed", "waived"]);
const VALID_ACTIONS = new Set(["start", "submit", "acknowledge"]);
const MAX_WORKFLOW_FILE_BYTES = 5 * 1024 * 1024;
const WORKFLOW_FILE_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function isFile(value) {
  return value && typeof value === "object" && typeof value.arrayBuffer === "function" && Number(value.size) > 0;
}

function safeFilename(value) {
  return String(value || "document").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
}

function fileExtension(value) {
  return safeFilename(value).split(".").pop()?.toLowerCase() || "";
}

function validWorkflowFileSignature(bytes, mimeType, extension) {
  const starts = (...values) => values.every((value, index) => bytes[index] === value);
  if (mimeType === "application/pdf" || extension === "pdf") return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  if (mimeType === "application/msword" || extension === "doc") return starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || extension === "docx") {
    return starts(0x50, 0x4b, 0x03, 0x04) || starts(0x50, 0x4b, 0x05, 0x06);
  }
  return false;
}

async function uploadWorkflowFile(env, candidateId, candidateTaskId, field, file) {
  if (!env.PRIVATE_DOCUMENTS) throw new Error("Private document storage is not configured. Ask an administrator to activate PRIVATE_DOCUMENTS.");
  if (!isFile(file)) return null;
  if (file.size > MAX_WORKFLOW_FILE_BYTES) throw new Error(`${clean(field.label || "The file", 200)} must be 5 MB or smaller.`);
  const extension = fileExtension(file.name);
  const mimeType = clean(file.type, 160) || ({ pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }[extension] || "");
  if (!WORKFLOW_FILE_TYPES.has(mimeType) || !["pdf", "doc", "docx"].includes(extension)) throw new Error("Application files must be PDF, DOC, or DOCX.");
  const buffer = await file.arrayBuffer();
  if (!validWorkflowFileSignature(new Uint8Array(buffer.slice(0, 16)), mimeType, extension)) throw new Error("The uploaded document does not match its declared file type.");
  const id = crypto.randomUUID();
  const timestamp = nowIso();
  const category = clean(field.category || "application-resume", 80).replace(/[^a-zA-Z0-9_-]/g, "-") || "application-resume";
  const filename = safeFilename(file.name);
  const storageKey = `candidates/${candidateId}/workflow/${candidateTaskId}/${id}.${extension}`;
  await env.PRIVATE_DOCUMENTS.put(storageKey, buffer, {
    httpMetadata: { contentType: mimeType },
    customMetadata: { candidateId, candidateTaskId, category, originalName: filename },
  });
  await env.WORKFORCE_DB.prepare(`
    INSERT INTO documents
      (id, candidate_id, category, storage_key, filename, mime_type, size_bytes, status, submitted_at, retention_policy)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted', ?, 'candidate-application')
  `).bind(id, candidateId, category, storageKey, filename, mimeType, file.size, timestamp).run();
  return { documentId: id, filename, category, status: "submitted" };
}

function parseJson(value, fallback = {}) {
  try { return JSON.parse(value || "{}"); } catch { return fallback; }
}

function safeResponses(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output = {};
  for (const [key, raw] of Object.entries(value).slice(0, 60)) {
    const cleanKey = clean(key, 80).replace(/[^a-zA-Z0-9_-]/g, "");
    if (!cleanKey) continue;
    if (typeof raw === "boolean") output[cleanKey] = raw;
    else if (raw && typeof raw === "object" && !Array.isArray(raw) && raw.documentId) {
      output[cleanKey] = {
        documentId: clean(raw.documentId, 100),
        filename: clean(raw.filename, 180),
        category: clean(raw.category, 80),
        status: clean(raw.status, 40),
      };
    } else output[cleanKey] = clean(raw, 5000);
  }
  return output;
}

function taskMatchesRole(task, role) {
  const scope = clean(task.role_scope || "*", 500).toLowerCase();
  if (!scope || scope === "*") return true;
  const normalizedRole = clean(role, 160).toLowerCase();
  return scope.split(",").map((item) => item.trim()).includes(normalizedRole);
}

async function ensureCandidateTasks(env, candidate) {
  const catalog = await env.WORKFORCE_DB.prepare("SELECT * FROM onboarding_tasks WHERE status = 'active' ORDER BY sort_order, title").all();
  const existing = await env.WORKFORCE_DB.prepare("SELECT task_id FROM candidate_tasks WHERE candidate_id = ?").bind(candidate.id).all();
  const existingIds = new Set((existing.results || []).map((row) => row.task_id));
  const timestamp = nowIso();
  const inserts = [];
  for (const task of catalog.results || []) {
    if (existingIds.has(task.id) || !taskMatchesRole(task, candidate.role)) continue;
    const due = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    inserts.push(env.WORKFORCE_DB.prepare(`
      INSERT INTO candidate_tasks (id, candidate_id, task_id, status, assigned_at, due_at, updated_at)
      VALUES (?, ?, ?, 'assigned', ?, ?, ?)
    `).bind(crypto.randomUUID(), candidate.id, task.id, timestamp, due, timestamp));
  }
  if (inserts.length) await env.WORKFORCE_DB.batch(inserts);
}

async function calculateProgress(env, candidateId) {
  const result = await env.WORKFORCE_DB.prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN status IN ('approved','completed','waived') THEN 1 ELSE 0 END) AS done
    FROM candidate_tasks WHERE candidate_id = ?
  `).bind(candidateId).first();
  const total = Number(result?.total || 0);
  const done = Number(result?.done || 0);
  const progress = total ? Math.round((done / total) * 100) : 0;
  await updateCandidateActivity(env, candidateId, progress);
  return { total, done, progress };
}

async function loadTasks(env, candidateId) {
  const tasks = await env.WORKFORCE_DB.prepare(`
    SELECT ct.id AS candidate_task_id, ct.status, ct.assigned_at, ct.due_at, ct.started_at,
           ct.submitted_at, ct.completed_at, ct.reviewed_at, ct.admin_feedback,
           ct.signature_name, ct.signature_at,
           t.id AS task_id, t.title, t.description, t.category, t.requires_submission,
           t.requires_signature, t.requires_admin_review, t.form_schema_json, t.instructions,
           COALESCE(t.stage_key, 'onboarding') AS stage_key, t.sort_order
    FROM candidate_tasks ct
    JOIN onboarding_tasks t ON t.id = ct.task_id
    WHERE ct.candidate_id = ?
    ORDER BY t.sort_order, t.title
  `).bind(candidateId).all();
  const submissions = await env.WORKFORCE_DB.prepare(`
    SELECT id, candidate_task_id, submission_type, response_json, status, submitted_at,
           updated_at, reviewed_at, reviewer_feedback
    FROM submissions WHERE candidate_id = ? ORDER BY submitted_at DESC
  `).bind(candidateId).all();
  const byTask = new Map();
  for (const submission of submissions.results || []) {
    if (!byTask.has(submission.candidate_task_id)) {
      byTask.set(submission.candidate_task_id, {
        ...submission,
        response: parseJson(submission.response_json, {}),
      });
    }
  }
  const normalized = (tasks.results || []).map((task) => ({
    ...task,
    requires_submission: Boolean(task.requires_submission),
    requires_signature: Boolean(task.requires_signature),
    requires_admin_review: Boolean(task.requires_admin_review),
    formSchema: parseJson(task.form_schema_json, { fields: [] }),
    submission: byTask.get(task.candidate_task_id) || null,
  }));
  const journey = await getCandidateJourney(env, candidateId);
  const currentStageIndex = journey?.stages?.findIndex((stage) => stage.access === "current") ?? 0;
  const stageIndex = new Map((journey?.stages || []).map((stage, index) => [stage.key, index]));
  return normalized.map((task) => {
    const taskStageIndex = stageIndex.get(task.stage_key) ?? stageIndex.get("onboarding") ?? 0;
    const locked = taskStageIndex > currentStageIndex;
    const blockedBy = journey?.stages?.[currentStageIndex]?.label || "the current stage";
    return {
      ...task,
      locked,
      lock_reason: locked ? `Complete ${blockedBy} before this ${task.stage_key.replaceAll("_", " ")} task unlocks.` : null,
    };
  });
}

export async function onRequestGet(context) {
  const session = await readSession(context.request, context.env);
  if (!session) return json({ message: "Candidate authentication required." }, 401);
  if (!hasWorkforceDb(context.env)) {
    return json({ configured: false, tasks: [], summary: { total: 0, done: 0, progress: 0 } });
  }
  try {
    const candidate = await getCandidateById(context.env, session.id);
    if (!candidate) return json({ message: "Candidate record not found." }, 404);
    await ensureCandidateTasks(context.env, candidate);
    const [tasks, summary, journey] = await Promise.all([
      loadTasks(context.env, candidate.id),
      calculateProgress(context.env, candidate.id),
      getCandidateJourney(context.env, candidate.id),
    ]);
    const applicationTask = tasks.find((task) => task.task_id === APPLICATION_TASK_ID) || null;
    return json({
      configured: true,
      tasks,
      summary,
      journey,
      journeyStart: applicationTask ? {
        required: true,
        taskId: applicationTask.task_id,
        candidateTaskId: applicationTask.candidate_task_id,
        status: applicationTask.status,
        satisfied: APPLICATION_UNLOCK_STATUSES.has(applicationTask.status),
      } : { required: false, satisfied: true },
    });
  } catch (error) {
    console.error("Candidate workflow load failed", error?.message || error);
    return json({ message: "The onboarding workflow is not ready. Apply migration 0004_workflow_ai_support.sql and retry." }, 503);
  }
}

export async function onRequestPost(context) {
  const session = await readSession(context.request, context.env);
  if (!session) return json({ message: "Candidate authentication required." }, 401);
  if (!hasWorkforceDb(context.env)) return json({ message: "The workforce database is not configured." }, 503);

  let payload;
  let multipartForm = null;
  const contentType = context.request.headers.get("content-type") || "";
  try {
    if (contentType.includes("multipart/form-data")) {
      multipartForm = await context.request.formData();
      payload = {
        action: multipartForm.get("action"),
        candidateTaskId: multipartForm.get("candidateTaskId"),
        responses: parseJson(multipartForm.get("responses"), {}),
        signed: multipartForm.get("signed") === "yes",
        signatureName: multipartForm.get("signatureName"),
      };
    } else {
      payload = await context.request.json();
    }
  } catch {
    return json({ message: "Invalid workflow request." }, 400);
  }
  const action = clean(payload.action, 40);
  const candidateTaskId = clean(payload.candidateTaskId, 100);
  if (!VALID_ACTIONS.has(action) || !candidateTaskId) return json({ message: "Unsupported workflow action." }, 400);

  const task = await context.env.WORKFORCE_DB.prepare(`
    SELECT ct.*, t.title, t.requires_signature, t.requires_admin_review, t.form_schema_json,
           COALESCE(t.stage_key, 'onboarding') AS stage_key
    FROM candidate_tasks ct JOIN onboarding_tasks t ON t.id = ct.task_id
    WHERE ct.id = ? AND ct.candidate_id = ? LIMIT 1
  `).bind(candidateTaskId, session.id).first();
  if (!task) return json({ message: "Assigned task not found." }, 404);
  const journeyGate = await getCandidateJourney(context.env, session.id);
  const currentStageIndex = journeyGate?.stages?.findIndex((stage) => stage.access === "current") ?? 0;
  const taskStageIndex = journeyGate?.stages?.findIndex((stage) => stage.key === task.stage_key) ?? 0;
  if (taskStageIndex > currentStageIndex) {
    const currentLabel = journeyGate?.stages?.[currentStageIndex]?.label || "the current stage";
    return json({
      message: `This task is locked. Complete ${currentLabel} before moving to the next stage.`,
      stageLocked: true,
      currentStage: journeyGate?.currentStage?.key || null,
      directive: journeyGate?.directive || null,
    }, 409);
  }
  const timestamp = nowIso();

  if (action === "start") {
    if (FINAL_STATUSES.has(task.status)) return json({ success: true, status: task.status });
    await context.env.WORKFORCE_DB.prepare(`
      UPDATE candidate_tasks SET status = 'in_progress', started_at = COALESCE(started_at, ?), updated_at = ?
      WHERE id = ? AND candidate_id = ?
    `).bind(timestamp, timestamp, candidateTaskId, session.id).run();
    await auditEvent(context.env, {
      actorType: "candidate", actorId: session.id, candidateId: session.id,
      eventType: "task.started", description: `Candidate started onboarding task: ${task.title}.`,
      metadata: { candidateTaskId }, request: context.request,
    });
    return json({ success: true, status: "in_progress" });
  }

  const responses = safeResponses(payload.responses);
  const signatureName = clean(payload.signatureName, 180);
  const signed = Boolean(payload.signed);
  const schema = parseJson(task.form_schema_json, { fields: [] });

  for (const field of schema.fields || []) {
    if (field?.type !== "file") continue;
    const file = multipartForm?.get(field.name);
    if (isFile(file)) {
      try {
        responses[field.name] = await uploadWorkflowFile(context.env, session.id, candidateTaskId, field, file);
      } catch (error) {
        return json({ message: error.message || "Private document upload failed." }, 400);
      }
    }
  }

  for (const field of schema.fields || []) {
    if (!field?.required) continue;
    const value = responses[field.name];
    const missing = field.type === "checkbox" ? value !== true
      : field.type === "file" ? !value?.documentId
      : !clean(value, 5000);
    if (missing) return json({ message: `Complete the required field: ${clean(field.label || field.name, 200)}.` }, 400);
  }
  if (schema.attestation && !signed) return json({ message: "Accept the required attestation before submitting." }, 400);
  if (task.requires_signature && (!signed || !signatureName)) return json({ message: "Type your full legal name to sign this submission." }, 400);

  const submissionId = crypto.randomUUID();
  const nextStatus = task.requires_admin_review ? "submitted" : "completed";
  await context.env.WORKFORCE_DB.batch([
    context.env.WORKFORCE_DB.prepare(`
      UPDATE submissions SET status = 'resubmitted', updated_at = ?
      WHERE candidate_task_id = ? AND candidate_id = ? AND status = 'correction_required'
    `).bind(timestamp, candidateTaskId, session.id),
    context.env.WORKFORCE_DB.prepare(`
      INSERT INTO submissions
        (id, candidate_id, candidate_task_id, submission_type, response_json, status, submitted_at, updated_at)
      VALUES (?, ?, ?, 'form', ?, ?, ?, ?)
    `).bind(submissionId, session.id, candidateTaskId, JSON.stringify(responses), nextStatus, timestamp, timestamp),
    context.env.WORKFORCE_DB.prepare(`
      UPDATE candidate_tasks SET status = ?, submitted_at = ?, completed_at = ?,
        signature_name = ?, signature_at = ?, admin_feedback = NULL, updated_at = ?
      WHERE id = ? AND candidate_id = ?
    `).bind(
      nextStatus,
      timestamp,
      nextStatus === "completed" ? timestamp : null,
      signatureName || null,
      signed ? timestamp : null,
      timestamp,
      candidateTaskId,
      session.id,
    ),
  ]);

  let pipeline = null;
  if (task.task_id === APPLICATION_TASK_ID) {
    const candidate = await context.env.WORKFORCE_DB.prepare(`
      SELECT first_name, last_name, invitation_origin, recruitment_stage
      FROM candidates WHERE id = ? LIMIT 1
    `).bind(session.id).first();
    await context.env.WORKFORCE_DB.prepare(`
      UPDATE candidates
      SET phone = COALESCE(NULLIF(?, ''), phone),
          city = COALESCE(NULLIF(?, ''), city),
          state_province = COALESCE(NULLIF(?, ''), state_province),
          country = COALESCE(NULLIF(?, ''), country),
          work_authorization = COALESCE(NULLIF(?, ''), work_authorization),
          sponsorship_required = COALESCE(NULLIF(?, ''), sponsorship_required),
          role = COALESCE(NULLIF(?, ''), role),
          application_source = COALESCE(NULLIF(application_source, ''), 'confidential_portal_application'),
          application_submitted_at = COALESCE(application_submitted_at, ?),
          recruitment_stage = CASE WHEN recruitment_stage = 'application_received' THEN 'application' ELSE recruitment_stage END,
          updated_at = ?, last_activity_at = ?
      WHERE id = ?
    `).bind(
      clean(responses.phone, 40), clean(responses.city, 100), clean(responses.stateProvince, 100),
      clean(responses.country, 100), clean(responses.workAuthorization, 30),
      clean(responses.sponsorshipRequired, 30), clean(responses.role, 160),
      timestamp, timestamp, timestamp, session.id,
    ).run();
    await markStageInProgress(context.env, {
      candidateId: session.id,
      stageKey: "application",
      source: "confidential_portal_application_submitted",
      completionPercent: 90,
      notes: "Candidate submitted the authenticated confidential application and is waiting for administrator approval.",
    });
    const candidateName = `${candidate?.first_name || "Candidate"} ${candidate?.last_name || ""}`.trim();
    await createAdminNotification(context.env, {
      candidateId: session.id,
      notificationType: "application_submitted",
      stageKey: "application",
      toneKey: "application",
      title: "Confidential application ready for review",
      message: `${candidateName} submitted the confidential application. Approve it before pre-screening can unlock.`,
      actionUrl: `/workforce_admin/#candidate=${encodeURIComponent(session.id)}`,
      uniqueKey: `application-submitted:${session.id}:${submissionId}`,
    });
    pipeline = await recalculateCandidatePipeline(context.env, session.id);
    await recalculateAllRanks(context.env);
  }

  const summary = await calculateProgress(context.env, session.id);
  await auditEvent(context.env, {
    actorType: "candidate", actorId: session.id, candidateId: session.id,
    eventType: "submission.submitted", description: `Candidate submitted onboarding task: ${task.title}.`,
    metadata: { candidateTaskId, submissionId, status: nextStatus, signed: Boolean(signatureName) },
    request: context.request,
  });
  return json({ success: true, status: nextStatus, submissionId, summary, pipeline }, 201);
}

export function onRequest() {
  return json({ message: "Method not allowed." }, 405);
}

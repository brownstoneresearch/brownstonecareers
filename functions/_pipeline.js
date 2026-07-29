import { clean, nowIso } from "./_workforce-db.js";

export const PIPELINE_STAGES = Object.freeze([
  { key: "application", label: "Application", weight: 10, tone: "application", recruitmentStage: "application_received" },
  { key: "pre_screening", label: "Pre-screening", weight: 15, tone: "pre_screening", recruitmentStage: "pre_screening" },
  { key: "assessment", label: "Skills assessment", weight: 15, tone: "assessment", recruitmentStage: "assessment" },
  { key: "interview", label: "Interview", weight: 15, tone: "interview", recruitmentStage: "interview" },
  { key: "offer", label: "Offer", weight: 10, tone: "offer", recruitmentStage: "offer" },
  { key: "verification", label: "Verification", weight: 15, tone: "verification", recruitmentStage: "verification" },
  { key: "onboarding", label: "Onboarding", weight: 15, tone: "onboarding", recruitmentStage: "onboarding" },
  { key: "orientation", label: "Orientation", weight: 5, tone: "orientation", recruitmentStage: "orientation" },
  { key: "active_worker", label: "Active worker", weight: 0, tone: "active_worker", recruitmentStage: "active_worker" },
]);

const STAGE_MAP = new Map(PIPELINE_STAGES.map((stage) => [stage.key, stage]));
const STAGE_ALIAS = Object.freeze({ application_received: "application", applicant: "application", invited: "application" });

export function normalizeStageKey(value = "") {
  const key = clean(value, 60).toLowerCase();
  return STAGE_ALIAS[key] || (STAGE_MAP.has(key) ? key : "application");
}

export function stageDefinition(value) {
  return STAGE_MAP.get(normalizeStageKey(value)) || PIPELINE_STAGES[0];
}

export function nextRecruitmentStage(value) {
  const key = normalizeStageKey(value);
  const index = PIPELINE_STAGES.findIndex((stage) => stage.key === key);
  return PIPELINE_STAGES[Math.min(index + 1, PIPELINE_STAGES.length - 1)]?.recruitmentStage || "active_worker";
}

export async function createAdminNotification(env, {
  candidateId = null,
  adminId = null,
  notificationType = "general",
  stageKey = null,
  toneKey = "general",
  title,
  message,
  actionUrl = "/workforce_admin/#candidates",
  uniqueKey = null,
} = {}) {
  if (!env?.WORKFORCE_DB || !title || !message) return null;
  const id = crypto.randomUUID();
  await env.WORKFORCE_DB.prepare(`
    INSERT OR IGNORE INTO admin_notifications
      (id, admin_id, candidate_id, notification_type, stage_key, tone_key, title, message, action_url, status, unique_key, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'unread', ?, ?)
  `).bind(
    id,
    adminId || null,
    candidateId || null,
    clean(notificationType, 80) || "general",
    stageKey ? normalizeStageKey(stageKey) : null,
    clean(toneKey, 80) || "general",
    clean(title, 180),
    clean(message, 1000),
    clean(actionUrl, 500),
    uniqueKey ? clean(uniqueKey, 250) : null,
    nowIso(),
  ).run();
  return id;
}

function stageNotificationCopy(stage, candidateName, source = "system") {
  const name = clean(candidateName, 180) || "A candidate";
  if (stage.key === "application" && source === "admin_manual_override") {
    return ["Manual invitation journey authorized", `${name}'s application-origin stage was satisfied through an audited administrator override. Review the recorded reason and continue with pre-screening.`];
  }
  const copy = {
    application: ["New application milestone", `${name} completed the application stage and is ready for recruitment review.`],
    pre_screening: ["Pre-screening milestone completed", `${name}'s pre-screening result was finalized by an administrator.`],
    assessment: ["Skills assessment completed", `${name} completed the skills-assessment stage. Review the scored evidence and next action.`],
    interview: ["Interview stage completed", `${name}'s interview stage has been marked complete. Record the advancement decision.`],
    offer: ["Offer stage completed", `${name}'s offer stage has been completed and documented.`],
    verification: ["Verification stage completed", `${name}'s verification stage is complete. Confirm all restricted records remain properly controlled.`],
    onboarding: ["Onboarding milestone completed", `${name} completed the onboarding stage and is ready for orientation review.`],
    orientation: ["Orientation completed", `${name} completed orientation and is ready for final activation review.`],
    active_worker: ["Candidate activated", `${name} completed the recruitment journey and has been marked as an active worker.`],
  };
  return copy[stage.key] || [`${stage.label} completed`, `${name} completed ${stage.label}.`];
}

export async function markStageInProgress(env, {
  candidateId,
  stageKey,
  source = "system",
  score = null,
  completionPercent = 0,
  notes = null,
} = {}) {
  if (!env?.WORKFORCE_DB || !candidateId) return;
  const stage = stageDefinition(stageKey);
  const timestamp = nowIso();
  await env.WORKFORCE_DB.prepare(`
    INSERT INTO candidate_stage_progress
      (id, candidate_id, stage_key, status, completion_percent, score, source, notes, started_at, updated_at)
    VALUES (?, ?, ?, 'in_progress', ?, ?, ?, ?, ?, ?)
    ON CONFLICT(candidate_id, stage_key) DO UPDATE SET
      status = CASE WHEN candidate_stage_progress.status = 'completed' THEN 'completed' ELSE 'in_progress' END,
      completion_percent = CASE WHEN candidate_stage_progress.status = 'completed' THEN 100 ELSE excluded.completion_percent END,
      score = COALESCE(excluded.score, candidate_stage_progress.score),
      source = excluded.source,
      notes = COALESCE(excluded.notes, candidate_stage_progress.notes),
      started_at = COALESCE(candidate_stage_progress.started_at, excluded.started_at),
      updated_at = excluded.updated_at
  `).bind(
    crypto.randomUUID(), candidateId, stage.key,
    Math.max(0, Math.min(100, Number(completionPercent || 0))),
    score == null ? null : Math.max(0, Math.min(100, Number(score))),
    clean(source, 100) || "system",
    clean(notes, 2000) || null,
    timestamp,
    timestamp,
  ).run();
}

export async function completeStage(env, {
  candidateId,
  stageKey,
  source = "admin",
  score = 100,
  notes = null,
  completedBy = null,
  candidateName = "Candidate",
} = {}) {
  if (!env?.WORKFORCE_DB || !candidateId) return null;
  const stage = stageDefinition(stageKey);
  const timestamp = nowIso();
  await env.WORKFORCE_DB.prepare(`
    INSERT INTO candidate_stage_progress
      (id, candidate_id, stage_key, status, completion_percent, score, source, notes, started_at, completed_at, completed_by, updated_at)
    VALUES (?, ?, ?, 'completed', 100, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(candidate_id, stage_key) DO UPDATE SET
      status = 'completed', completion_percent = 100, score = excluded.score,
      source = excluded.source, notes = COALESCE(excluded.notes, candidate_stage_progress.notes),
      started_at = COALESCE(candidate_stage_progress.started_at, excluded.started_at),
      completed_at = COALESCE(candidate_stage_progress.completed_at, excluded.completed_at),
      completed_by = COALESCE(excluded.completed_by, candidate_stage_progress.completed_by),
      updated_at = excluded.updated_at
  `).bind(
    crypto.randomUUID(), candidateId, stage.key,
    Math.max(0, Math.min(100, Number(score == null ? 100 : score))),
    clean(source, 100) || "admin",
    clean(notes, 2000) || null,
    timestamp,
    timestamp,
    clean(completedBy, 120) || null,
    timestamp,
  ).run();

  const [title, message] = stageNotificationCopy(stage, candidateName, source);
  await createAdminNotification(env, {
    candidateId,
    notificationType: "stage_completed",
    stageKey: stage.key,
    toneKey: stage.tone,
    title,
    message,
    actionUrl: `/workforce_admin/#candidate=${encodeURIComponent(candidateId)}`,
    uniqueKey: `stage-completed:${candidateId}:${stage.key}`,
  });
  return stage;
}

export async function recalculateCandidatePipeline(env, candidateId) {
  if (!env?.WORKFORCE_DB || !candidateId) return { score: 0, stages: [] };
  const [candidate, stageRows, prescreen] = await Promise.all([
    env.WORKFORCE_DB.prepare("SELECT onboarding_progress, recruitment_stage, prescreening_score FROM candidates WHERE id = ? LIMIT 1").bind(candidateId).first(),
    env.WORKFORCE_DB.prepare("SELECT stage_key, status, completion_percent, score, completed_at, source FROM candidate_stage_progress WHERE candidate_id = ?").bind(candidateId).all(),
    env.WORKFORCE_DB.prepare("SELECT final_score, status FROM candidate_prescreens WHERE candidate_id = ? ORDER BY created_at DESC LIMIT 1").bind(candidateId).first().catch(() => null),
  ]);
  const rows = new Map((stageRows.results || []).map((row) => [row.stage_key, row]));
  let total = 0;
  const stages = PIPELINE_STAGES.map((stage) => {
    const row = rows.get(stage.key);
    let percent = row?.status === "completed" ? 100 : Number(row?.completion_percent || 0);
    let score = row?.score == null ? null : Number(row.score);
    if (stage.key === "pre_screening" && prescreen?.final_score != null) {
      score = Number(prescreen.final_score);
      if (prescreen.status === "reviewed") percent = 100;
    }
    if (stage.key === "onboarding") percent = Math.max(percent, Number(candidate?.onboarding_progress || 0));
    const contribution = stage.weight * (Math.max(0, Math.min(100, percent)) / 100);
    total += contribution;
    return { ...stage, status: row?.status || "pending", percent: Math.round(percent), score, contribution };
  });
  const rounded = Math.round(total * 10) / 10;
  await env.WORKFORCE_DB.prepare("UPDATE candidates SET pipeline_score = ?, updated_at = ? WHERE id = ?")
    .bind(rounded, nowIso(), candidateId).run();
  return { score: rounded, stages };
}

export async function recalculateAllRanks(env) {
  if (!env?.WORKFORCE_DB) return [];
  const [candidateRows, stageRows, prescreenRows] = await Promise.all([
    env.WORKFORCE_DB.prepare(`
      SELECT id, onboarding_progress, last_activity_at, created_at
      FROM candidates
      ORDER BY COALESCE(last_activity_at, created_at) DESC
      LIMIT 1000
    `).all(),
    env.WORKFORCE_DB.prepare(`
      SELECT candidate_id, stage_key, status, completion_percent
      FROM candidate_stage_progress
    `).all(),
    env.WORKFORCE_DB.prepare(`
      SELECT cp.candidate_id, cp.final_score, cp.status
      FROM candidate_prescreens cp
      WHERE cp.created_at = (
        SELECT MAX(cp2.created_at) FROM candidate_prescreens cp2 WHERE cp2.candidate_id = cp.candidate_id
      )
    `).all(),
  ]);
  const stagesByCandidate = new Map();
  for (const row of stageRows.results || []) {
    if (!stagesByCandidate.has(row.candidate_id)) stagesByCandidate.set(row.candidate_id, new Map());
    stagesByCandidate.get(row.candidate_id).set(row.stage_key, row);
  }
  const prescreenByCandidate = new Map((prescreenRows.results || []).map((row) => [row.candidate_id, row]));
  const ranked = (candidateRows.results || []).map((candidate) => {
    const rows = stagesByCandidate.get(candidate.id) || new Map();
    const prescreen = prescreenByCandidate.get(candidate.id);
    let total = 0;
    for (const stage of PIPELINE_STAGES) {
      const row = rows.get(stage.key);
      let percent = row?.status === "completed" ? 100 : Number(row?.completion_percent || 0);
      if (stage.key === "pre_screening" && prescreen?.status === "reviewed") percent = 100;
      if (stage.key === "onboarding") percent = Math.max(percent, Number(candidate.onboarding_progress || 0));
      total += stage.weight * (Math.max(0, Math.min(100, percent)) / 100);
    }
    return { ...candidate, pipeline_score: Math.round(total * 10) / 10 };
  }).sort((a, b) => {
    const scoreDelta = Number(b.pipeline_score || 0) - Number(a.pipeline_score || 0);
    if (scoreDelta) return scoreDelta;
    const activityDelta = Date.parse(b.last_activity_at || b.created_at || 0) - Date.parse(a.last_activity_at || a.created_at || 0);
    return activityDelta || String(a.id).localeCompare(String(b.id));
  });
  const timestamp = nowIso();
  const statements = ranked.map((candidate, index) => env.WORKFORCE_DB.prepare(
    "UPDATE candidates SET pipeline_score = ?, pipeline_rank = ?, updated_at = ? WHERE id = ?",
  ).bind(candidate.pipeline_score, index + 1, timestamp, candidate.id));
  for (let index = 0; index < statements.length; index += 50) {
    await env.WORKFORCE_DB.batch(statements.slice(index, index + 50));
  }
  return ranked.map((candidate, index) => ({ ...candidate, pipeline_rank: index + 1 }));
}

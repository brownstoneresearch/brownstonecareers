import { PIPELINE_STAGES, normalizeStageKey } from "./_pipeline.js";
import { clean } from "./_workforce-db.js";

const FINAL_TASK_STATUSES = new Set(["approved", "completed", "waived"]);
const SUBMITTED_TASK_STATUSES = new Set(["submitted", "approved", "completed", "waived"]);

export const STAGE_VIEW_MAP = Object.freeze({
  application: "submissions",
  pre_screening: "pre-screening",
  assessment: "assessment",
  interview: "journey",
  offer: "journey",
  verification: "secure-identity",
  onboarding: "submissions",
  orientation: "orientation",
  active_worker: "progress",
});

export const VIEW_STAGE_MAP = Object.freeze({
  submissions: "application",
  "pre-screening": "pre_screening",
  assessment: "assessment",
  "secure-identity": "verification",
  documents: "onboarding",
  profile: "onboarding",
  academy: "onboarding",
  community: "onboarding",
  orientation: "orientation",
});

function parseJson(value, fallback = null) {
  try { return JSON.parse(value || ""); } catch { return fallback; }
}

function stageIndex(value) {
  const key = normalizeStageKey(value);
  const index = PIPELINE_STAGES.findIndex((stage) => stage.key === key);
  return index < 0 ? 0 : index;
}

function stageCopy(stageKey) {
  const copy = {
    application: {
      actionTitle: "Complete your confidential application",
      actionMessage: "Submit the secure application and required resume before your recruitment journey can continue.",
      actionLabel: "Complete application",
      waitTitle: "Application submitted — review in progress",
      waitMessage: "Your application is safely recorded. Please wait while the recruitment team reviews it and prepares your pre-screening stage.",
    },
    pre_screening: {
      actionTitle: "Complete your pre-screening questions",
      actionMessage: "Answer every required question and submit your responses for administrator and AI-assisted rubric review.",
      actionLabel: "Open pre-screening",
      waitTitle: "Pre-screening is being evaluated",
      waitMessage: "Your answers are locked for review. You will receive the finalized result by email and in this dashboard.",
    },
    assessment: {
      actionTitle: "Complete the readiness assessment",
      actionMessage: "Finish the assessment with a passing score, then wait for your administrator to verify the result.",
      actionLabel: "Open assessment",
      waitTitle: "Assessment submitted — verification pending",
      waitMessage: "Your assessment result has been submitted. The next stage will unlock after administrator verification.",
    },
    interview: {
      actionTitle: "Prepare for your interview",
      actionMessage: "Review your role, experience, and availability. Your administrator will publish scheduling or result instructions here.",
      actionLabel: "View interview guidance",
      waitTitle: "Wait for interview scheduling or results",
      waitMessage: "No candidate action is required right now. Keep your contact details current and monitor your email and dashboard.",
    },
    offer: {
      actionTitle: "Review your offer-stage instructions",
      actionMessage: "Read every administrator instruction carefully and complete only the actions shown in your secure dashboard.",
      actionLabel: "View offer stage",
      waitTitle: "Offer decision is being prepared",
      waitMessage: "Please wait for the recruitment team to release the next official instruction. Do not send sensitive information outside the secure portal.",
    },
    verification: {
      actionTitle: "Complete secure verification",
      actionMessage: "Submit the requested identity and work-authorization information through the Secure Identity Center.",
      actionLabel: "Open secure identity",
      waitTitle: "Verification is under protected review",
      waitMessage: "Your confidential records were received. The next stage remains locked until an authorized administrator approves verification.",
    },
    onboarding: {
      actionTitle: "Complete your assigned onboarding requirements",
      actionMessage: "Finish each unlocked task in order. Tasks awaiting review do not require resubmission unless a correction is requested.",
      actionLabel: "Continue onboarding",
      waitTitle: "Onboarding work submitted — review pending",
      waitMessage: "Your assigned requirements are complete or under review. Wait for administrator approval before orientation unlocks.",
    },
    orientation: {
      actionTitle: "Prepare for orientation",
      actionMessage: "Complete the readiness checklist and follow the confirmed session instructions from your administrator.",
      actionLabel: "Open orientation",
      waitTitle: "Orientation confirmation pending",
      waitMessage: "Your readiness is recorded. Wait for attendance confirmation or the next official orientation instruction.",
    },
    active_worker: {
      actionTitle: "Your workforce journey is active",
      actionMessage: "Continue using Brownstone systems, training, and community resources according to your role instructions.",
      actionLabel: "View career progress",
      waitTitle: "Workforce activation complete",
      waitMessage: "Your recruitment and onboarding sequence is complete.",
    },
  };
  return copy[normalizeStageKey(stageKey)] || copy.application;
}

async function loadJourneyEvidence(env, candidateId) {
  const db = env.WORKFORCE_DB;
  const [candidate, stageRows, taskRows, prescreen, identity, stateRows] = await Promise.all([
    db.prepare(`SELECT id, first_name, last_name, email, role, status, recruitment_stage,
      onboarding_progress, pipeline_score, pipeline_rank, application_submitted_at,
      invitation_origin, last_activity_at, created_at
      FROM candidates WHERE id = ? LIMIT 1`).bind(candidateId).first(),
    db.prepare(`SELECT stage_key, status, completion_percent, score, source, notes,
      started_at, completed_at, completed_by, updated_at
      FROM candidate_stage_progress WHERE candidate_id = ?`).bind(candidateId).all(),
    db.prepare(`SELECT ct.id AS candidate_task_id, ct.status, ct.due_at, ct.submitted_at,
      ct.completed_at, ct.admin_feedback, t.id AS task_id, t.title, t.category,
      COALESCE(t.stage_key, 'onboarding') AS stage_key, t.sort_order
      FROM candidate_tasks ct JOIN onboarding_tasks t ON t.id = ct.task_id
      WHERE ct.candidate_id = ? ORDER BY t.sort_order, t.title`).bind(candidateId).all(),
    db.prepare(`SELECT id, status, due_at, started_at, submitted_at, reviewed_at,
      final_score, result_status, admin_feedback
      FROM candidate_prescreens WHERE candidate_id = ? ORDER BY created_at DESC LIMIT 1`).bind(candidateId).first().catch(() => null),
    db.prepare(`SELECT verification_status, submitted_at, reviewed_at
      FROM sensitive_identity WHERE candidate_id = ? LIMIT 1`).bind(candidateId).first().catch(() => null),
    db.prepare(`SELECT state_key, value_json, updated_at FROM candidate_portal_state
      WHERE candidate_id = ? AND state_key IN ('assessment','orientationChecks','tasks')`).bind(candidateId).all(),
  ]);
  if (!candidate) return null;
  const stageProgress = new Map((stageRows.results || []).map((row) => [normalizeStageKey(row.stage_key), row]));
  const portalState = {};
  for (const row of stateRows.results || []) portalState[row.state_key] = parseJson(row.value_json, null);
  return {
    candidate,
    stageProgress,
    tasks: taskRows.results || [],
    prescreen,
    identity,
    portalState,
  };
}

function stageEvidenceStatus(stageKey, evidence) {
  const key = normalizeStageKey(stageKey);
  const explicit = evidence.stageProgress.get(key);
  if (explicit?.status === "completed") return { ready: true, completed: true, percent: 100, reason: "Stage completed and verified." };

  const stageTasks = evidence.tasks.filter((task) => normalizeStageKey(task.stage_key) === key);
  const finalTasks = stageTasks.filter((task) => FINAL_TASK_STATUSES.has(task.status));
  const submittedTasks = stageTasks.filter((task) => SUBMITTED_TASK_STATUSES.has(task.status));

  if (key === "application") {
    const applicationTask = evidence.tasks.find((task) => task.task_id === "confidential-candidate-application");
    const submitted = Boolean(evidence.candidate.application_submitted_at) || SUBMITTED_TASK_STATUSES.has(applicationTask?.status);
    return { ready: submitted, completed: false, percent: submitted ? 100 : applicationTask?.status === "in_progress" ? 50 : 0, reason: submitted ? "Confidential application submitted." : "Confidential application has not been submitted." };
  }
  if (key === "pre_screening") {
    const reviewed = evidence.prescreen?.status === "reviewed";
    const passed = reviewed && evidence.prescreen?.result_status === "passed";
    const percent = reviewed ? 100 : ["submitted", "ai_scored"].includes(evidence.prescreen?.status) ? 80 : evidence.prescreen?.status === "in_progress" ? 35 : evidence.prescreen ? 10 : 0;
    return { ready: passed, completed: false, percent, reason: passed ? "Pre-screening passed after administrator review." : reviewed ? `Pre-screening result is ${clean(evidence.prescreen?.result_status, 40) || "pending"}.` : evidence.prescreen ? "Pre-screening has not been finalized." : "Pre-screening has not been assigned." };
  }
  if (key === "assessment") {
    const score = Number(evidence.portalState.assessment?.score || 0);
    const passed = score >= 4;
    return { ready: passed, completed: false, percent: passed ? 85 : score ? 45 : 0, reason: passed ? "Candidate achieved a passing readiness-assessment score." : score ? "Assessment score is below the required threshold." : "Readiness assessment has not been submitted." };
  }
  if (key === "verification") {
    const approved = evidence.identity?.verification_status === "approved";
    const submitted = Boolean(evidence.identity?.submitted_at);
    return { ready: approved, completed: false, percent: approved ? 100 : submitted ? 75 : 0, reason: approved ? "Verification approved." : submitted ? "Verification is awaiting administrator approval." : "Secure verification has not been submitted." };
  }
  if (key === "onboarding") {
    if (!stageTasks.length) return { ready: false, completed: false, percent: Number(evidence.candidate.onboarding_progress || 0), reason: "No onboarding tasks are assigned." };
    const percent = Math.round((finalTasks.length / stageTasks.length) * 100);
    return { ready: finalTasks.length === stageTasks.length, completed: false, percent, reason: finalTasks.length === stageTasks.length ? "All onboarding tasks are approved or completed." : `${stageTasks.length - finalTasks.length} onboarding task${stageTasks.length - finalTasks.length === 1 ? "" : "s"} remain.` };
  }
  if (key === "orientation") {
    const checks = evidence.portalState.orientationChecks || {};
    const checklistReady = Object.values(checks).filter(Boolean).length >= 5;
    const tasksReady = !stageTasks.length || finalTasks.length === stageTasks.length;
    return { ready: checklistReady && tasksReady, completed: false, percent: checklistReady && tasksReady ? 90 : checklistReady ? 65 : submittedTasks.length ? 45 : 0, reason: checklistReady && tasksReady ? "Orientation readiness requirements are complete." : "Orientation readiness or attendance confirmation remains incomplete." };
  }
  if (key === "active_worker") {
    const active = evidence.candidate.status === "active";
    return { ready: active, completed: active, percent: active ? 100 : 0, reason: active ? "Candidate is an active worker." : "Workforce activation is pending." };
  }
  return { ready: true, completed: false, percent: Number(explicit?.completion_percent || 0), reason: "Administrator confirmation is required for this stage." };
}

function directiveFor(stageKey, evidence, stageState) {
  const key = normalizeStageKey(stageKey);
  const copy = stageCopy(key);
  const actionView = STAGE_VIEW_MAP[key] || "journey";
  const directive = {
    type: "waiting",
    stageKey: key,
    title: copy.waitTitle,
    message: copy.waitMessage,
    actionView,
    actionUrl: `/onboarding_portal/#${actionView}`,
    actionLabel: "View journey",
    waitingFor: "Brownstone administrator",
  };

  if (["rejected", "suspended"].includes(evidence.candidate.status)) {
    return {
      ...directive,
      type: evidence.candidate.status === "rejected" ? "closed" : "paused",
      title: evidence.candidate.status === "rejected" ? "Your current recruitment journey is closed" : "Your recruitment journey is paused",
      message: evidence.candidate.status === "rejected" ? "Review the latest official result in your dashboard. Contact support only if an instruction asks you to do so." : "No stage can advance while the account is paused. Wait for an administrator update.",
      actionLabel: "View notifications",
      actionView: "dashboard",
    };
  }

  if (key === "application") {
    const task = evidence.tasks.find((item) => item.task_id === "confidential-candidate-application");
    if (!SUBMITTED_TASK_STATUSES.has(task?.status) && !evidence.candidate.application_submitted_at) {
      return { ...directive, type: task?.status === "correction_required" ? "correction" : "action", title: task?.status === "correction_required" ? "Correct and resubmit your application" : copy.actionTitle, message: task?.admin_feedback || copy.actionMessage, actionLabel: task?.status === "correction_required" ? "Open correction" : copy.actionLabel, waitingFor: null };
    }
  }
  if (key === "pre_screening") {
    const status = evidence.prescreen?.status;
    if (["assigned", "in_progress"].includes(status)) return { ...directive, type: "action", title: copy.actionTitle, message: copy.actionMessage, actionLabel: copy.actionLabel, waitingFor: null };
    if (!status) return { ...directive, title: "Pre-screening assignment pending", message: "Your application stage is complete. Wait for an administrator to assign the correct pre-screening question set.", actionLabel: "View journey" };
    if (status === "reviewed" && evidence.prescreen?.result_status === "conditional") return { ...directive, type: "waiting", title: "Conditional review in progress", message: evidence.prescreen.admin_feedback || "An administrator will provide the next instruction after reviewing your conditional result.", actionLabel: "View result" };
  }
  if (key === "assessment" && !stageState.ready) return { ...directive, type: "action", title: copy.actionTitle, message: stageState.reason || copy.actionMessage, actionLabel: copy.actionLabel, waitingFor: null };
  if (key === "verification") {
    if (!evidence.identity?.submitted_at || evidence.identity?.verification_status === "correction_required") return { ...directive, type: evidence.identity?.verification_status === "correction_required" ? "correction" : "action", title: evidence.identity?.verification_status === "correction_required" ? "Verification correction required" : copy.actionTitle, message: copy.actionMessage, actionLabel: copy.actionLabel, waitingFor: null };
  }
  if (key === "onboarding") {
    const incomplete = evidence.tasks.filter((task) => normalizeStageKey(task.stage_key) === "onboarding" && !FINAL_TASK_STATUSES.has(task.status));
    const actionable = incomplete.find((task) => ["assigned", "in_progress", "correction_required"].includes(task.status));
    if (actionable) return { ...directive, type: actionable.status === "correction_required" ? "correction" : "action", title: actionable.status === "correction_required" ? `Correction required: ${actionable.title}` : actionable.title, message: actionable.admin_feedback || "Complete this requirement before the next onboarding task or stage can unlock.", actionLabel: actionable.status === "correction_required" ? "Open correction" : "Open task", actionView: "submissions", actionUrl: "/onboarding_portal/#submissions", waitingFor: null, candidateTaskId: actionable.candidate_task_id };
  }
  if (key === "orientation" && !stageState.ready) return { ...directive, type: "action", title: copy.actionTitle, message: copy.actionMessage, actionLabel: copy.actionLabel, waitingFor: null };
  if (key === "active_worker") {
    const active = evidence.candidate.status === "active";
    return active
      ? { ...directive, type: "complete", title: copy.waitTitle, message: copy.waitMessage, actionLabel: copy.actionLabel, waitingFor: null }
      : { ...directive, type: "waiting", title: "Final workforce activation pending", message: "All recruitment and onboarding stages are complete. Please wait while an authorized administrator activates your workforce account.", actionLabel: "View progress", waitingFor: "Brownstone administrator" };
  }
  return directive;
}

export async function getCandidateJourney(env, candidateId) {
  if (!env?.WORKFORCE_DB || !candidateId) return null;
  const evidence = await loadJourneyEvidence(env, candidateId);
  if (!evidence) return null;

  const stageStates = PIPELINE_STAGES.map((stage) => {
    const explicit = evidence.stageProgress.get(stage.key);
    const evidenceState = stageEvidenceStatus(stage.key, evidence);
    return {
      ...stage,
      status: explicit?.status === "completed" ? "completed" : "pending",
      percent: explicit?.status === "completed" ? 100 : Math.max(Number(explicit?.completion_percent || 0), evidenceState.percent || 0),
      score: explicit?.score == null ? null : Number(explicit.score),
      startedAt: explicit?.started_at || null,
      completedAt: explicit?.completed_at || null,
      notes: explicit?.notes || null,
      evidenceReady: evidenceState.ready,
      evidenceReason: evidenceState.reason,
    };
  });

  let currentIndex = stageStates.findIndex((stage) => stage.status !== "completed");
  if (currentIndex < 0) currentIndex = stageStates.length - 1;
  stageStates.forEach((stage, index) => {
    if (stage.status === "completed") stage.access = "completed";
    else if (index === currentIndex) stage.access = "current";
    else if (index < currentIndex) stage.access = "blocked";
    else stage.access = "locked";
    stage.locked = stage.access === "locked";
    stage.blockedBy = stage.locked ? stageStates[currentIndex]?.key : null;
    stage.view = STAGE_VIEW_MAP[stage.key] || "journey";
  });

  const currentStage = stageStates[currentIndex];
  const directive = directiveFor(currentStage.key, evidence, currentStage);
  const completedCount = stageStates.filter((stage) => stage.status === "completed").length;
  const progress = Math.round((completedCount / Math.max(1, stageStates.length - 1)) * 100);

  return {
    candidate: evidence.candidate,
    stages: stageStates,
    currentStage,
    nextStage: stageStates[currentIndex + 1] || null,
    directive,
    completedCount,
    totalStages: stageStates.length,
    progress: Math.max(Number(evidence.candidate.pipeline_score || 0), progress),
    evidence: {
      prescreenStatus: evidence.prescreen?.status || null,
      prescreenResult: evidence.prescreen?.result_status || null,
      verificationStatus: evidence.identity?.verification_status || null,
    },
  };
}

export async function validateStageCompletion(env, candidateId, stageKey) {
  const journey = await getCandidateJourney(env, candidateId);
  if (!journey) return { ok: false, message: "Candidate journey not found.", missingStages: [] };
  const key = normalizeStageKey(stageKey);
  const index = stageIndex(key);
  const previous = journey.stages.slice(0, index).filter((stage) => stage.status !== "completed");
  if (previous.length) {
    return {
      ok: false,
      message: `Complete ${previous.map((stage) => stage.label).join(", ")} before advancing ${journey.candidate.first_name || "this candidate"}.`,
      missingStages: previous.map((stage) => stage.key),
      journey,
    };
  }
  const stage = journey.stages[index];
  const adminEvidenceStages = new Set(["interview", "offer", "active_worker"]);
  if (!stage.evidenceReady && !adminEvidenceStages.has(key)) {
    return { ok: false, message: stage.evidenceReason || `${stage.label} requirements are incomplete.`, missingStages: [key], journey };
  }
  return { ok: true, stage, journey };
}

export async function validateStageTransition(env, candidateId, targetStage) {
  const journey = await getCandidateJourney(env, candidateId);
  if (!journey) return { ok: false, message: "Candidate journey not found." };
  const targetIndex = stageIndex(targetStage);
  const incomplete = journey.stages.slice(0, targetIndex).filter((stage) => stage.status !== "completed");
  if (incomplete.length) {
    return {
      ok: false,
      message: `Stage advancement is locked. Complete ${incomplete.map((stage) => stage.label).join(", ")} first.`,
      missingStages: incomplete.map((stage) => stage.key),
      journey,
    };
  }
  return { ok: true, journey };
}

import { readSession } from "../../_portal-auth.js";
import {
  auditEvent,
  hasWorkforceDb,
  json,
  readPortalState,
  updateCandidateActivity,
  writePortalState,
} from "../../_workforce-db.js";
import { createAdminNotification, markStageInProgress, recalculateCandidatePipeline } from "../../_pipeline.js";
import { getCandidateJourney } from "../../_journey.js";

const ALLOWED_KEYS = new Set([
  "profile",
  "tasks",
  "assessment",
  "equipment",
  "orientationChecks",
  "module:communication",
  "module:security",
  "module:client",
  "module:remote",
]);

async function sessionOrResponse(context) {
  const session = await readSession(context.request, context.env);
  return session ? { session } : { response: json({ message: "Candidate authentication required." }, 401) };
}

export async function onRequestGet(context) {
  const auth = await sessionOrResponse(context);
  if (auth.response) return auth.response;
  if (!hasWorkforceDb(context.env)) {
    return json({ state: {}, persistence: "browser", databaseConfigured: false });
  }
  const state = await readPortalState(context.env, auth.session.id);
  return json({ state, persistence: "server", databaseConfigured: true });
}

export async function onRequestPost(context) {
  const auth = await sessionOrResponse(context);
  if (auth.response) return auth.response;
  if (!hasWorkforceDb(context.env)) {
    return json({ success: true, persistence: "browser", databaseConfigured: false }, 202);
  }

  let payload;
  try {
    payload = await context.request.json();
  } catch {
    return json({ message: "Invalid JSON payload." }, 400);
  }

  const key = String(payload?.key || "");
  if (!ALLOWED_KEYS.has(key)) return json({ message: "Unsupported portal state key." }, 400);
  const keyStage = key === "assessment" ? "assessment"
    : key === "orientationChecks" ? "orientation"
      : ["profile", "tasks", "equipment"].includes(key) || key.startsWith("module:") ? "onboarding" : null;
  if (keyStage) {
    const journey = await getCandidateJourney(context.env, auth.session.id);
    const stage = journey?.stages?.find((item) => item.key === keyStage);
    if (stage?.locked || stage?.access === "blocked") {
      return json({ message: `${stage.label} is locked. ${journey?.directive?.message || "Complete the current stage first."}`, currentStage: journey?.currentStage?.key, directive: journey?.directive }, 409);
    }
  }
  const serialized = JSON.stringify(payload?.value);
  if (serialized.length > 25_000) return json({ message: "Portal state payload is too large." }, 413);

  await writePortalState(context.env, auth.session.id, key, payload.value);
  const progress = key === "tasks" && payload.value && typeof payload.value === "object"
    ? Math.round((Object.values(payload.value).filter(Boolean).length / 9) * 100)
    : null;
  await updateCandidateActivity(context.env, auth.session.id, progress);

  if (key === "assessment" && payload.value && typeof payload.value === "object") {
    const score = Math.max(0, Math.min(5, Number(payload.value.score || 0)));
    const passed = score >= 4;
    await markStageInProgress(context.env, {
      candidateId: auth.session.id,
      stageKey: "assessment",
      source: "candidate_readiness_assessment",
      score: score * 20,
      completionPercent: passed ? 85 : score ? 40 : 0,
      notes: passed ? "Candidate submitted a passing readiness assessment for administrator verification." : "Candidate submitted a readiness assessment below the passing threshold.",
    });
    const candidate = await context.env.WORKFORCE_DB.prepare("SELECT first_name, last_name FROM candidates WHERE id = ? LIMIT 1").bind(auth.session.id).first();
    await createAdminNotification(context.env, {
      candidateId: auth.session.id,
      notificationType: "assessment_submitted",
      stageKey: "assessment",
      toneKey: "assessment",
      title: passed ? "Readiness assessment ready for review" : "Readiness assessment needs follow-up",
      message: `${candidate?.first_name || "A candidate"} ${candidate?.last_name || ""}`.trim() + ` submitted the readiness assessment with ${score}/5.`,
      actionUrl: `/workforce_admin/#candidate=${encodeURIComponent(auth.session.id)}`,
      uniqueKey: `assessment-submitted:${auth.session.id}:${score}`,
    });
    await recalculateCandidatePipeline(context.env, auth.session.id);
  }

  if (key === "orientationChecks" && payload.value && typeof payload.value === "object") {
    const completedChecks = Object.values(payload.value).filter(Boolean).length;
    await markStageInProgress(context.env, {
      candidateId: auth.session.id,
      stageKey: "orientation",
      source: "candidate_orientation_readiness",
      completionPercent: Math.min(80, completedChecks * 16),
      notes: `${completedChecks} of 5 orientation-readiness checks completed.`,
    });
    await recalculateCandidatePipeline(context.env, auth.session.id);
  }

  await auditEvent(context.env, {
    actorType: "candidate",
    actorId: auth.session.id,
    candidateId: auth.session.id,
    eventType: String(payload?.eventType || "candidate.portal_state_updated").slice(0, 120),
    description: `Candidate updated portal state: ${key}.`,
    metadata: { stateKey: key },
    request: context.request,
  });
  return json({ success: true, persistence: "server", databaseConfigured: true });
}

export function onRequest() {
  return json({ message: "Method not allowed." }, 405);
}

import { readSession } from "../../_portal-auth.js";
import {
  auditEvent,
  hasWorkforceDb,
  json,
  readPortalState,
  updateCandidateActivity,
  writePortalState,
} from "../../_workforce-db.js";

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
  const serialized = JSON.stringify(payload?.value);
  if (serialized.length > 25_000) return json({ message: "Portal state payload is too large." }, 413);

  await writePortalState(context.env, auth.session.id, key, payload.value);
  const progress = key === "tasks" && payload.value && typeof payload.value === "object"
    ? Math.round((Object.values(payload.value).filter(Boolean).length / 9) * 100)
    : null;
  await updateCandidateActivity(context.env, auth.session.id, progress);
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

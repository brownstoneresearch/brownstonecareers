import { readSession } from "../../_portal-auth.js";
import { auditEvent, json, updateCandidateActivity } from "../../_workforce-db.js";

export async function onRequestPost(context) {
  const session = await readSession(context.request, context.env);
  if (!session) return json({ message: "Candidate authentication required." }, 401);
  let payload = {};
  try { payload = await context.request.json(); } catch {}
  const eventType = String(payload.eventType || "candidate.portal_activity").slice(0, 120);
  const allowedPrefix = ["candidate.", "portal.", "document.", "identity.", "assessment.", "orientation.", "academy."];
  if (!allowedPrefix.some((prefix) => eventType.startsWith(prefix))) {
    return json({ message: "Unsupported activity type." }, 400);
  }
  await updateCandidateActivity(context.env, session.id);
  await auditEvent(context.env, {
    actorType: "candidate",
    actorId: session.id,
    candidateId: session.id,
    eventType,
    description: String(payload.description || "Candidate portal activity.").slice(0, 500),
    metadata: payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {},
    request: context.request,
  });
  return json({ success: true });
}

export function onRequest() {
  return json({ message: "Method not allowed." }, 405);
}

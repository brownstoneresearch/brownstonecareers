import { readSession } from "../../_portal-auth.js";
import { getCandidateJourney } from "../../_journey.js";
import { clean, hasWorkforceDb, json, nowIso } from "../../_workforce-db.js";

export async function onRequestGet(context) {
  const session = await readSession(context.request, context.env);
  if (!session) return json({ message: "Candidate authentication required." }, 401);
  if (!hasWorkforceDb(context.env)) return json({ message: "The workforce database is not configured." }, 503);

  const url = new URL(context.request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = Math.min(20, Math.max(3, Number(url.searchParams.get("pageSize") || 6)));
  const offset = (page - 1) * pageSize;
  const journey = await getCandidateJourney(context.env, session.id);
  if (!journey) return json({ message: "Candidate journey not found." }, 404);

  const [notificationRows, notificationCount] = await Promise.all([
    context.env.WORKFORCE_DB.prepare(`
      SELECT id, title, message, notification_type, status, action_url, created_at, read_at
      FROM candidate_notifications WHERE candidate_id = ?
      ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).bind(session.id, pageSize, offset).all(),
    context.env.WORKFORCE_DB.prepare("SELECT COUNT(*) AS count FROM candidate_notifications WHERE candidate_id = ?")
      .bind(session.id).first(),
  ]);

  return json({
    ...journey,
    notifications: notificationRows.results || [],
    notificationPagination: {
      page,
      pageSize,
      total: Number(notificationCount?.count || 0),
      totalPages: Math.max(1, Math.ceil(Number(notificationCount?.count || 0) / pageSize)),
    },
    serverTime: nowIso(),
  });
}

export async function onRequestPost(context) {
  const session = await readSession(context.request, context.env);
  if (!session) return json({ message: "Candidate authentication required." }, 401);
  if (!hasWorkforceDb(context.env)) return json({ message: "The workforce database is not configured." }, 503);
  let payload;
  try { payload = await context.request.json(); } catch { return json({ message: "Invalid journey request." }, 400); }
  const action = clean(payload.action, 40);
  const timestamp = nowIso();
  if (action === "mark-notification-read") {
    const id = clean(payload.id, 120);
    await context.env.WORKFORCE_DB.prepare(`
      UPDATE candidate_notifications SET status = 'read', read_at = ?
      WHERE id = ? AND candidate_id = ?
    `).bind(timestamp, id, session.id).run();
    return json({ success: true });
  }
  if (action === "mark-all-notifications-read") {
    await context.env.WORKFORCE_DB.prepare(`
      UPDATE candidate_notifications SET status = 'read', read_at = ?
      WHERE candidate_id = ? AND status = 'unread'
    `).bind(timestamp, session.id).run();
    return json({ success: true });
  }
  return json({ message: "Unsupported journey action." }, 400);
}

export function onRequest() { return json({ message: "Method not allowed." }, 405); }

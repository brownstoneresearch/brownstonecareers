import { requireAdmin } from "../../_admin-auth.js";
import { clean, hasWorkforceDb, json, nowIso } from "../../_workforce-db.js";

export async function onRequestGet(context) {
  const auth = await requireAdmin(context, "notification.read");
  if (auth.response) return auth.response;
  if (!hasWorkforceDb(context.env)) return json({ message: "WORKFORCE_DB is not configured." }, 503);
  const url = new URL(context.request.url);
  const status = clean(url.searchParams.get("status") || "unread", 40);
  const since = clean(url.searchParams.get("since"), 60);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get("pageSize") || 12)));
  const offset = (page - 1) * pageSize;
  const conditions = ["(n.admin_id IS NULL OR n.admin_id = ?)"];
  const values = [auth.admin.id];
  if (status !== "all") { conditions.push("n.status = ?"); values.push(status); }
  if (since) { conditions.push("datetime(n.created_at) > datetime(?)"); values.push(since); }
  const rows = await context.env.WORKFORCE_DB.prepare(`
    SELECT n.*, c.first_name, c.last_name, c.email, c.role, c.pipeline_score, c.pipeline_rank
    FROM admin_notifications n
    LEFT JOIN candidates c ON c.id = n.candidate_id
    WHERE ${conditions.join(" AND ")}
    ORDER BY n.created_at DESC LIMIT ? OFFSET ?
  `).bind(...values, pageSize, offset).all();
  const count = await context.env.WORKFORCE_DB.prepare(`
    SELECT COUNT(*) AS count FROM admin_notifications
    WHERE (admin_id IS NULL OR admin_id = ?) AND status = 'unread'
  `).bind(auth.admin.id).first();
  const totalQuery = await context.env.WORKFORCE_DB.prepare(`
    SELECT COUNT(*) AS count FROM admin_notifications n
    WHERE ${conditions.join(" AND ")}
  `).bind(...values).first();
  const total = Number(totalQuery?.count || 0);
  return json({
    notifications: rows.results || [],
    unreadCount: Number(count?.count || 0),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    serverTime: nowIso(),
  });
}

export async function onRequestPost(context) {
  const auth = await requireAdmin(context, "notification.read");
  if (auth.response) return auth.response;
  if (!hasWorkforceDb(context.env)) return json({ message: "WORKFORCE_DB is not configured." }, 503);
  let payload;
  try { payload = await context.request.json(); } catch { return json({ message: "Invalid notification request." }, 400); }
  const action = clean(payload.action, 40);
  const timestamp = nowIso();
  if (action === "mark-read") {
    const id = clean(payload.id, 120);
    await context.env.WORKFORCE_DB.prepare("UPDATE admin_notifications SET status = 'read', read_at = ? WHERE id = ? AND (admin_id IS NULL OR admin_id = ?)")
      .bind(timestamp, id, auth.admin.id).run();
    return json({ success: true });
  }
  if (action === "mark-all-read") {
    await context.env.WORKFORCE_DB.prepare("UPDATE admin_notifications SET status = 'read', read_at = ? WHERE status = 'unread' AND (admin_id IS NULL OR admin_id = ?)")
      .bind(timestamp, auth.admin.id).run();
    return json({ success: true });
  }
  return json({ message: "Unsupported notification action." }, 400);
}

export function onRequest() { return json({ message: "Method not allowed." }, 405); }

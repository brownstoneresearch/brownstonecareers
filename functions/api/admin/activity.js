import { requireAdmin } from "../../_admin-auth.js";
import { clean, hasWorkforceDb, json } from "../../_workforce-db.js";

export async function onRequestGet(context) {
  const auth = await requireAdmin(context, "dashboard.read");
  if (auth.response) return auth.response;
  if (!hasWorkforceDb(context.env)) return json({ message: "WORKFORCE_DB is not configured." }, 503);

  const url = new URL(context.request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get("pageSize") || 20)));
  const search = clean(url.searchParams.get("search"), 120);
  const offset = (page - 1) * pageSize;
  const where = search ? "WHERE event_type LIKE ? OR description LIKE ?" : "";
  const values = search ? [`%${search}%`, `%${search}%`] : [];

  try {
    const [rows, count] = await Promise.all([
      context.env.WORKFORCE_DB.prepare(`
        SELECT id, actor_type, actor_id, candidate_id, event_type, description, created_at
        FROM audit_events
        ${where}
        ORDER BY created_at DESC, id DESC
        LIMIT ? OFFSET ?
      `).bind(...values, pageSize, offset).all(),
      context.env.WORKFORCE_DB.prepare(`SELECT COUNT(*) AS count FROM audit_events ${where}`)
        .bind(...values).first(),
    ]);
    const total = Number(count?.count || 0);
    return json({
      activity: rows.results || [],
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    });
  } catch (error) {
    console.error("Administrator activity query failed", error?.message || error);
    return json({ message: "The audit activity service is unavailable." }, 503);
  }
}

export function onRequest() {
  return json({ message: "Method not allowed." }, 405);
}

import { hasAdminPermission, requireAdmin } from "../../_admin-auth.js";
import { recruitmentUpdateEmail } from "../../../emails/index.js";
import { sendResendEmail } from "../../_shared.js";
import { auditEvent, clean, hasWorkforceDb, json, nowIso } from "../../_workforce-db.js";

export async function onRequestGet(context) {
  const auth = await requireAdmin(context, "support.read");
  if (auth.response) return auth.response;
  if (!hasWorkforceDb(context.env)) return json({ message: "WORKFORCE_DB is not configured." }, 503);
  const url = new URL(context.request.url);
  const id = clean(url.searchParams.get("id"), 100);
  const db = context.env.WORKFORCE_DB;
  try {
    if (id) {
      const conversation = await db.prepare(`
        SELECT sc.*, c.first_name, c.last_name, c.email, c.role
        FROM support_conversations sc JOIN candidates c ON c.id = sc.candidate_id
        WHERE sc.id = ? LIMIT 1
      `).bind(id).first();
      if (!conversation) return json({ message: "Conversation not found." }, 404);
      const messages = await db.prepare("SELECT * FROM support_messages WHERE conversation_id = ? ORDER BY created_at ASC").bind(id).all();
      return json({ conversation, messages: messages.results || [] });
    }
    const rows = await db.prepare(`
      SELECT sc.*, c.first_name, c.last_name, c.email, c.role,
        (SELECT message FROM support_messages sm WHERE sm.conversation_id = sc.id ORDER BY sm.created_at DESC LIMIT 1) AS last_message,
        (SELECT created_at FROM support_messages sm WHERE sm.conversation_id = sc.id ORDER BY sm.created_at DESC LIMIT 1) AS last_message_at
      FROM support_conversations sc JOIN candidates c ON c.id = sc.candidate_id
      ORDER BY CASE sc.status WHEN 'escalated' THEN 0 WHEN 'open' THEN 1 ELSE 2 END,
               CASE sc.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
               sc.updated_at DESC LIMIT 250
    `).all();
    return json({ conversations: rows.results || [] });
  } catch (error) {
    console.error("Support dashboard query failed", error?.message || error);
    return json({ message: "Support tables are unavailable. Apply migration 0004_workflow_ai_support.sql." }, 503);
  }
}

export async function onRequestPost(context) {
  const auth = await requireAdmin(context, "support.manage");
  if (auth.response) return auth.response;
  if (!hasWorkforceDb(context.env)) return json({ message: "WORKFORCE_DB is not configured." }, 503);
  let payload;
  try { payload = await context.request.json(); } catch { return json({ message: "Invalid support request." }, 400); }
  const action = clean(payload.action, 40);
  const id = clean(payload.conversationId, 100);
  if (!id) return json({ message: "Conversation ID is required." }, 400);
  const db = context.env.WORKFORCE_DB;
  const conversation = await db.prepare(`
    SELECT sc.*, c.first_name, c.last_name, c.email, c.role
    FROM support_conversations sc JOIN candidates c ON c.id = sc.candidate_id
    WHERE sc.id = ? LIMIT 1
  `).bind(id).first();
  if (!conversation) return json({ message: "Conversation not found." }, 404);
  const timestamp = nowIso();

  if (action === "reply") {
    const message = clean(payload.message, 5000);
    if (!message) return json({ message: "Enter a reply." }, 400);
    await db.batch([
      db.prepare("INSERT INTO support_messages (id, conversation_id, sender_type, sender_id, message, intent, sentiment, metadata_json, created_at) VALUES (?, ?, 'admin', ?, ?, 'human_support', 'neutral', '{}', ?)")
        .bind(crypto.randomUUID(), id, auth.admin.id, message, timestamp),
      db.prepare("UPDATE support_conversations SET status = 'open', assigned_admin_id = ?, updated_at = ? WHERE id = ?")
        .bind(auth.admin.id, timestamp, id),
      db.prepare("INSERT INTO candidate_notifications (id, candidate_id, title, message, notification_type, status, action_url, created_at) VALUES (?, ?, 'Brownstone support replied', ?, 'support', 'unread', '/onboarding_portal/', ?)")
        .bind(crypto.randomUUID(), conversation.candidate_id, message.slice(0, 500), timestamp),
    ]);
    const portalBase = clean(context.env.ONBOARDING_PORTAL_URL || "https://onboarding.brownstonecareers.agency", 500).replace(/\/$/, "");
    const email = await sendResendEmail(context.env, {
      from: context.env.EMAIL_FROM,
      to: [conversation.email],
      reply_to: context.env.EMAIL_REPLY_TO || context.env.RECRUITMENT_EMAIL,
      subject: "Brownstone support replied to your onboarding question",
      html: recruitmentUpdateEmail({
        firstName: conversation.first_name,
        title: "A Brownstone Representative Replied",
        message,
        actionLabel: "Open Your Secure Portal",
        actionUrl: `${portalBase}/onboarding_portal/`,
      }),
    }, `support-reply-${id}-${timestamp}`, "onboarding");
    await auditEvent(context.env, { actorType: "admin", actorId: auth.admin.id, candidateId: conversation.candidate_id, eventType: "support.admin_replied", description: "Administrator replied to a candidate support conversation.", metadata: { conversationId: id, emailSent: email.ok }, request: context.request });
    return json({ success: true, emailSent: email.ok });
  }

  if (["resolve", "reopen", "escalate"].includes(action)) {
    const status = action === "resolve" ? "resolved" : action === "escalate" ? "escalated" : "open";
    await db.prepare("UPDATE support_conversations SET status = ?, priority = ?, assigned_admin_id = ?, resolved_at = ?, escalated_at = COALESCE(escalated_at, ?), updated_at = ? WHERE id = ?")
      .bind(status, action === "escalate" ? "high" : conversation.priority, auth.admin.id, action === "resolve" ? timestamp : null, action === "escalate" ? timestamp : null, timestamp, id).run();
    await auditEvent(context.env, { actorType: "admin", actorId: auth.admin.id, candidateId: conversation.candidate_id, eventType: `support.${status}`, description: `Administrator marked a support conversation ${status}.`, metadata: { conversationId: id }, request: context.request });
    return json({ success: true, status });
  }

  return json({ message: "Unsupported support action." }, 400);
}

export function onRequest() { return json({ message: "Method not allowed." }, 405); }

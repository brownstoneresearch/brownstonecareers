import { readSession } from "../../_portal-auth.js";
import { internalContactEmail } from "../../../emails/index.js";
import { sendResendEmail } from "../../_shared.js";
import {
  auditEvent,
  clean,
  getCandidateById,
  hasWorkforceDb,
  json,
  nowIso,
} from "../../_workforce-db.js";

const SENSITIVE_PATTERNS = [
  /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/g,
  /\b(?:\d[ -]*?){13,19}\b/g,
  /\b(?:password|passcode|pin)\s*[:=]\s*\S+/gi,
];

function redactSensitive(text) {
  let redacted = String(text || "");
  let found = false;
  for (const pattern of SENSITIVE_PATTERNS) {
    redacted = redacted.replace(pattern, () => {
      found = true;
      return "[REDACTED-SENSITIVE-DATA]";
    });
  }
  return { redacted, found };
}

function classify(text) {
  const lower = text.toLowerCase();
  const intents = [
    ["identity", ["ssn", "social security", "id", "identity", "passport", "license"]],
    ["task", ["task", "submit", "submission", "complete", "checklist", "sign"]],
    ["nda", ["nda", "confidential", "agreement"]],
    ["handbook", ["handbook", "policy", "standard"]],
    ["orientation", ["orientation", "meeting", "session", "teams"]],
    ["technical", ["error", "blank", "not loading", "upload failed", "login", "code"]],
    ["human_support", ["human", "representative", "agent", "recruiter", "call me", "speak to"]],
  ];
  const intent = intents.find(([, words]) => words.some((word) => lower.includes(word)))?.[0] || "general";
  const negative = ["frustrated", "angry", "upset", "confused", "worried", "urgent", "terrible", "failed", "problem", "help"].some((word) => lower.includes(word));
  const positive = ["thank", "great", "perfect", "helpful", "good"].some((word) => lower.includes(word));
  const sentiment = negative ? "concerned" : positive ? "positive" : "neutral";
  const escalate = intent === "human_support" || ["urgent", "unsafe", "fraud", "threat", "harassment", "discrimination"].some((word) => lower.includes(word));
  return { intent, sentiment, escalate };
}

async function taskContext(env, candidateId) {
  if (!hasWorkforceDb(env)) return { tasks: [], progress: 0 };
  try {
    const rows = await env.WORKFORCE_DB.prepare(`
      SELECT t.title, ct.status, ct.due_at, ct.admin_feedback
      FROM candidate_tasks ct JOIN onboarding_tasks t ON t.id = ct.task_id
      WHERE ct.candidate_id = ? ORDER BY t.sort_order, t.title
    `).bind(candidateId).all();
    const tasks = rows.results || [];
    const done = tasks.filter((task) => ["approved", "completed", "waived"].includes(task.status)).length;
    return { tasks, progress: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
  } catch {
    return { tasks: [], progress: 0 };
  }
}

function fallbackReply({ message, intent, sentiment, tasks, progress, firstName }) {
  const opener = sentiment === "concerned"
    ? `I’m sorry this part of the process has been frustrating, ${firstName}. Let’s take it one step at a time.`
    : `Absolutely, ${firstName}. I’m here to help you move forward clearly.`;
  const pending = tasks.filter((task) => !["approved", "completed", "waived"].includes(task.status));
  const next = pending[0];
  const nextLine = next ? ` Your next recorded task is “${next.title}”${next.due_at ? `, due ${new Date(next.due_at).toLocaleDateString("en-US")}` : ""}.` : " Your assigned onboarding tasks are currently up to date.";
  const answers = {
    identity: "Use only the Secure Identity Center for SSN or government-ID information, and only after an authorized Brownstone representative instructs you to proceed. Never place sensitive details in this chat, email, Teams, or the public application.",
    task: "Open Task Submissions, select the assigned item, complete every required field, tick the attestation, and type your full legal name when a signature is required. After submission, the status changes to Awaiting review and an administrator can approve it or request a correction.",
    nda: "Open Documents to review the NDA, then use Task Submissions for the NDA acknowledgement. The acknowledgement does not replace the official signed agreement, but it records your review and questions for the administrator.",
    handbook: "Open Documents, review the Employee & Contractor Handbook, then submit the Handbook Acknowledgement task. Your administrator will see the timestamp, signature, and review status.",
    orientation: "Your final orientation date and time will be communicated through official email and the Teams community. Complete the orientation readiness task and list any questions you want addressed.",
    technical: "Refresh once, confirm you are using the official onboarding domain, and retry the action. If the issue continues, use the Human Support button so the incident is recorded for an administrator without sending sensitive information.",
    human_support: "I’ve marked this conversation for human follow-up. A Brownstone administrator can review the issue from the workforce dashboard. Please keep this chat free of SSNs, passwords, banking details, or full ID numbers.",
    general: "I can help with your assigned tasks, handbook, NDA, Secure Identity Center, orientation, Teams access, or technical issues. Tell me what you are trying to complete and what is blocking you.",
  };
  return `${opener} ${answers[intent] || answers.general}${nextLine} Your current tracked workflow progress is ${progress}%.`;
}

function extractOutputText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  const pieces = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") pieces.push(content.text);
    }
  }
  return pieces.join("\n").trim();
}

async function aiReply(env, context) {
  if (!env?.OPENAI_API_KEY) return "";
  const model = clean(env.OPENAI_MODEL || "gpt-5.6", 80);
  const taskSummary = context.tasks.slice(0, 12).map((task) => `- ${task.title}: ${task.status}${task.admin_feedback ? ` (feedback: ${task.admin_feedback})` : ""}`).join("\n") || "No assigned tasks are currently available.";
  const instructions = `You are the Brownstone Guide, an AI onboarding customer-support assistant for Brownstone Careers. Be warm, perceptive, calm, concise, and solution-oriented. Clearly identify yourself as an AI when relevant; never pretend to be a human employee. Use customer-service skills: acknowledge emotion, clarify the goal, give precise next steps, confirm what happens next, and offer human escalation when needed. Never ask for or repeat SSNs, passwords, PINs, banking credentials, full ID numbers, medical details, or other sensitive identity data. Direct sensitive records only to the authenticated Secure Identity Center. Do not make employment promises, legal conclusions, or approval decisions. When information is uncertain, say so and route the candidate to an authorized recruiter. The candidate is ${context.firstName}, role ${context.role}, tracked progress ${context.progress}%. Assigned task context:\n${taskSummary}`;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions,
      input: context.message,
      max_output_tokens: 420,
    }),
  });
  if (!response.ok) {
    console.error("Brownstone Guide AI request failed", response.status, await response.text());
    return "";
  }
  return extractOutputText(await response.json());
}

async function ensureConversation(env, candidateId, conversationId, classification) {
  if (!hasWorkforceDb(env)) return conversationId || crypto.randomUUID();
  if (conversationId) {
    const existing = await env.WORKFORCE_DB.prepare("SELECT id FROM support_conversations WHERE id = ? AND candidate_id = ? LIMIT 1")
      .bind(conversationId, candidateId).first();
    if (existing) return existing.id;
  }
  const id = crypto.randomUUID();
  const timestamp = nowIso();
  await env.WORKFORCE_DB.prepare(`
    INSERT INTO support_conversations (id, candidate_id, status, priority, sentiment, topic, escalated_at, created_at, updated_at)
    VALUES (?, ?, 'open', ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    candidateId,
    classification.escalate ? "high" : "normal",
    classification.sentiment,
    classification.intent,
    classification.escalate ? timestamp : null,
    timestamp,
    timestamp,
  ).run();
  return id;
}

async function storeMessage(env, conversationId, senderType, senderId, message, classification, metadata = {}) {
  if (!hasWorkforceDb(env)) return;
  await env.WORKFORCE_DB.prepare(`
    INSERT INTO support_messages (id, conversation_id, sender_type, sender_id, message, intent, sentiment, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(), conversationId, senderType, senderId || null, clean(message, 5000),
    classification.intent || null, classification.sentiment || null, JSON.stringify(metadata), nowIso(),
  ).run();
  await env.WORKFORCE_DB.prepare(`
    UPDATE support_conversations SET status = ?, priority = ?, sentiment = ?, topic = ?, escalated_at = COALESCE(escalated_at, ?), updated_at = ? WHERE id = ?
  `).bind(
    classification.escalate ? "escalated" : "open",
    classification.escalate ? "high" : "normal",
    classification.sentiment,
    classification.intent,
    classification.escalate ? nowIso() : null,
    nowIso(),
    conversationId,
  ).run();
}

export async function onRequestPost(context) {
  const session = await readSession(context.request, context.env);
  if (!session) return json({ message: "Candidate authentication required." }, 401);
  let payload;
  try { payload = await context.request.json(); } catch { return json({ message: "Invalid assistant request." }, 400); }
  const message = clean(payload.message, 4000);
  if (!message) return json({ message: "Enter a question for the Brownstone Guide." }, 400);

  const redaction = redactSensitive(message);
  if (redaction.found) {
    await auditEvent(context.env, {
      actorType: "candidate", actorId: session.id, candidateId: session.id,
      eventType: "assistant.sensitive_input_blocked",
      description: "The Brownstone Guide blocked sensitive data from being submitted in chat.",
      metadata: {}, request: context.request,
    });
    return json({
      reply: "For your protection, I did not process or store that message because it appears to contain sensitive information. Please use the Secure Identity Center for authorized SSN or ID submission. For passwords, PINs, or banking credentials, do not submit them anywhere in this portal chat.",
      blockedSensitive: true,
      conversationId: payload.conversationId || null,
      escalated: false,
    });
  }

  const classification = classify(redaction.redacted);
  const candidate = await getCandidateById(context.env, session.id) || { first_name: session.name?.split(" ")[0] || "Candidate", role: session.role || "Candidate" };
  const workflow = await taskContext(context.env, session.id);
  const conversationId = await ensureConversation(context.env, session.id, clean(payload.conversationId, 100), classification);
  await storeMessage(context.env, conversationId, "candidate", session.id, redaction.redacted, classification, { view: clean(payload.view, 80) });

  let reply = "";
  try {
    reply = await aiReply(context.env, {
      message: redaction.redacted,
      firstName: candidate.first_name || "Candidate",
      role: candidate.role || session.role || "Candidate",
      progress: workflow.progress,
      tasks: workflow.tasks,
    });
  } catch (error) {
    console.error("Brownstone Guide AI generation failed", error?.message || error);
  }
  if (!reply) reply = fallbackReply({
    message: redaction.redacted,
    intent: classification.intent,
    sentiment: classification.sentiment,
    tasks: workflow.tasks,
    progress: workflow.progress,
    firstName: candidate.first_name || "Candidate",
  });
  await storeMessage(context.env, conversationId, "assistant", "brownstone-guide", reply, classification, { aiConfigured: Boolean(context.env.OPENAI_API_KEY) });

  let escalationEmailSent = false;
  if (classification.escalate && context.env.EMAIL_FROM && context.env.RECRUITMENT_EMAIL && candidate.email) {
    const escalation = await sendResendEmail(context.env, {
      from: context.env.EMAIL_FROM,
      to: String(context.env.RECRUITMENT_EMAIL).split(",").map((value) => value.trim()).filter(Boolean),
      reply_to: candidate.email,
      subject: `Onboarding support escalation — ${candidate.first_name || "Candidate"} ${candidate.last_name || ""}`.trim(),
      html: internalContactEmail({
        reference: conversationId,
        name: `${candidate.first_name || "Candidate"} ${candidate.last_name || ""}`.trim(),
        email: candidate.email,
        subject: `Portal support escalation — ${classification.intent}`,
        message: redaction.redacted,
      }),
    }, `support-escalation-${conversationId}`, "workforce");
    escalationEmailSent = escalation.ok;
  }

  await auditEvent(context.env, {
    actorType: "candidate", actorId: session.id, candidateId: session.id,
    eventType: classification.escalate ? "support.escalated" : "assistant.message_completed",
    description: classification.escalate ? "Candidate requested or triggered human support escalation." : "Brownstone Guide responded to an onboarding support question.",
    metadata: { conversationId, intent: classification.intent, sentiment: classification.sentiment, escalationEmailSent, aiConfigured: Boolean(context.env.OPENAI_API_KEY) },
    request: context.request,
  });

  return json({
    reply,
    conversationId,
    intent: classification.intent,
    sentiment: classification.sentiment,
    escalated: classification.escalate,
    aiConfigured: Boolean(context.env.OPENAI_API_KEY),
    escalationEmailSent,
  });
}

export function onRequest() {
  return json({ message: "Method not allowed." }, 405);
}

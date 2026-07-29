import { candidateStageInvitationEmail, validateInvitationSelection } from "../../../emails/index.js";
import { requireAdmin } from "../../_admin-auth.js";
import { hasResendChannel, sendResendEmail } from "../../_shared.js";
import { onboardingPortalUrl } from "../../_domains.js";
import {
  auditEvent,
  clean,
  generateInviteCode,
  hashInvitationCode,
  hasWorkforceDb,
  json,
  nowIso,
} from "../../_workforce-db.js";

export async function onRequestPost(context) {
  const auth = await requireAdmin(context, "invitation.manage");
  if (auth.response) return auth.response;
  if (!hasWorkforceDb(context.env)) return json({ message: "WORKFORCE_DB is not configured." }, 503);
  let payload;
  try { payload = await context.request.json(); } catch { return json({ message: "Invalid JSON payload." }, 400); }

  const candidateId = clean(payload.candidateId, 80);
  const action = clean(payload.action, 40);
  let candidate = await context.env.WORKFORCE_DB.prepare("SELECT * FROM candidates WHERE id = ? LIMIT 1")
    .bind(candidateId).first();
  if (!candidate) return json({ message: "Candidate not found." }, 404);

  const controlledManualOrigin = candidate.invitation_origin === "admin_manual"
    && candidate.manual_invite_approved_by
    && candidate.manual_invite_approved_at
    && String(candidate.manual_invite_reason || "").trim().length >= 10;
  if (!candidate.application_submitted_at && !controlledManualOrigin) {
    return json({ message: "Invitation blocked. This candidate needs either a submitted application or a documented administrator manual-invitation override." }, 409);
  }
  const timestamp = nowIso();

  if (action === "revoke") {
    await context.env.WORKFORCE_DB.prepare("UPDATE invitations SET status = 'revoked', revoked_at = ? WHERE candidate_id = ? AND status IN ('pending','activated')")
      .bind(timestamp, candidateId).run();
    await context.env.WORKFORCE_DB.prepare("UPDATE candidates SET status = 'suspended', session_version = session_version + 1, updated_at = ? WHERE id = ?")
      .bind(timestamp, candidateId).run();
    await auditEvent(context.env, {
      actorType: "admin", actorId: auth.admin.id, candidateId,
      eventType: "admin.access_revoked", description: "Administrator revoked candidate portal access.", request: context.request,
    });
    return json({ success: true });
  }

  if (!["regenerate", "resend"].includes(action)) return json({ message: "Unsupported invitation action." }, 400);
  const priorInvitation = await context.env.WORKFORCE_DB.prepare(`
    SELECT id, template_key, initial_status, initial_stage
    FROM invitations
    WHERE candidate_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(candidateId).first();
  if (!priorInvitation) {
    return json({ message: "No previous invitation exists. Create the first invitation from the application queue or the controlled Manual invitation form." }, 409);
  }

  const selection = validateInvitationSelection(
    candidate.invitation_status_key || priorInvitation.initial_status || "invited",
    candidate.invitation_stage_key || priorInvitation.initial_stage || candidate.recruitment_stage || "application_received",
  );
  if (!selection.ok) return json({ message: selection.message }, 409);

  await context.env.WORKFORCE_DB.prepare("UPDATE invitations SET status = 'revoked', revoked_at = ? WHERE candidate_id = ? AND status IN ('pending','activated')")
    .bind(timestamp, candidateId).run();

  const code = generateInviteCode();
  const codeHash = await hashInvitationCode(code, context.env);
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
  const invitationId = crypto.randomUUID();
  const subject = `${selection.stageConfig.title} — ${candidate.id}`;

  await context.env.WORKFORCE_DB.prepare(`
    INSERT INTO invitations
      (id, candidate_id, code_hash, code_hint, status, expires_at, created_at, created_by,
       template_key, initial_status, initial_stage, email_subject)
    VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    invitationId, candidateId, codeHash, code.slice(-4), expiresAt, timestamp, auth.admin.id,
    selection.templateKey, selection.status, selection.stage, subject,
  ).run();

  if (candidate.invitation_origin === "admin_manual") {
    const overrideReason = clean(candidate.manual_invite_reason, 1000) || "Administrator reauthorized this controlled manual invitation during access-code regeneration.";
    await context.env.WORKFORCE_DB.prepare(`
      UPDATE candidates SET status = ?, recruitment_stage = ?,
        invitation_status_key = ?, invitation_stage_key = ?, invitation_template_key = ?,
        last_invitation_id = ?, last_invited_at = ?,
        manual_invite_reason = ?, manual_invite_approved_by = ?, manual_invite_approved_at = ?,
        session_version = session_version + 1, updated_at = ?, last_activity_at = ?
      WHERE id = ?
    `).bind(
      selection.status, selection.stage,
      selection.status, selection.stage, selection.templateKey,
      invitationId, timestamp,
      overrideReason, auth.admin.id, timestamp,
      timestamp, timestamp, candidateId,
    ).run();
  } else {
    await context.env.WORKFORCE_DB.prepare(`
      UPDATE candidates SET status = ?, recruitment_stage = ?,
        invitation_status_key = ?, invitation_stage_key = ?, invitation_template_key = ?,
        last_invitation_id = ?, last_invited_at = ?,
        session_version = session_version + 1, updated_at = ?, last_activity_at = ?
      WHERE id = ?
    `).bind(
      selection.status, selection.stage,
      selection.status, selection.stage, selection.templateKey,
      invitationId, timestamp,
      timestamp, timestamp, candidateId,
    ).run();
  }

  candidate = await context.env.WORKFORCE_DB.prepare("SELECT * FROM candidates WHERE id = ? LIMIT 1")
    .bind(candidateId).first();

  let emailResult = {
    ok: false,
    error: "Email delivery is not configured.",
    subject,
    templateKey: selection.templateKey,
  };
  if (hasResendChannel(context.env, "access_codes") && context.env.EMAIL_FROM) {
    const portalUrl = `${onboardingPortalUrl(context.env).replace(/\/$/, "")}/`;
    emailResult = await sendResendEmail(context.env, {
      from: context.env.EMAIL_FROM,
      to: [candidate.email],
      reply_to: clean(context.env.EMAIL_REPLY_TO || context.env.RECRUITMENT_EMAIL, 320),
      subject,
      html: candidateStageInvitationEmail({
        firstName: candidate.first_name,
        role: candidate.role,
        candidateId: candidate.id,
        accessCode: code,
        expiresAt: new Date(expiresAt).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }) + " UTC",
        portalUrl,
        status: selection.status,
        stage: selection.stage,
        invitationOrigin: candidate.invitation_origin || "application",
      }),
    }, `${candidate.id}-regenerated-${selection.templateKey}-${Date.now()}`, "access_codes");
  }
  if (emailResult.ok) {
    await context.env.WORKFORCE_DB.prepare("UPDATE invitations SET sent_at = ? WHERE id = ?")
      .bind(nowIso(), invitationId).run();
  }

  try {
    await context.env.WORKFORCE_DB.prepare(`
      INSERT INTO email_messages
        (id, candidate_id, message_type, recipient, provider_message_id, status, subject, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      candidate.id,
      `candidate_invitation:${selection.templateKey}`,
      candidate.email,
      clean(emailResult?.data?.id, 200),
      emailResult.ok ? "sent" : "failed",
      subject,
      timestamp,
      timestamp,
    ).run();
  } catch (error) {
    console.error("Regenerated invitation email record failed", error?.message);
  }

  await auditEvent(context.env, {
    actorType: "admin", actorId: auth.admin.id, candidateId,
    eventType: "admin.invitation_regenerated",
    description: "Administrator regenerated a controlled candidate portal invitation without changing the candidate ID, stage, or invitation template.",
    metadata: {
      emailSent: emailResult.ok,
      expiresAt,
      selectedStatus: selection.status,
      selectedStage: selection.stage,
      templateKey: selection.templateKey,
      subject,
    },
    request: context.request,
  });
  return json({
    success: true,
    candidateId,
    accessCode: code,
    expiresAt,
    emailSent: emailResult.ok,
    emailError: emailResult.ok ? null : emailResult.error,
    selectedStatus: selection.status,
    selectedStage: selection.stage,
    templateKey: selection.templateKey,
    subject,
  });
}

export function onRequest() {
  return json({ message: "Method not allowed." }, 405);
}

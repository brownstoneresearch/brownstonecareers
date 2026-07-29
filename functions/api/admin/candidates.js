import { candidateStageInvitationEmail, onboardingCorrectionEmail, validateInvitationSelection } from "../../../emails/index.js";
import { hasAdminPermission, requireAdmin } from "../../_admin-auth.js";
import { hasResendChannel, sendResendEmail } from "../../_shared.js";
import { onboardingPortalUrl } from "../../_domains.js";
import { PIPELINE_STAGES, completeStage, markStageInProgress, nextRecruitmentStage, normalizeStageKey, recalculateAllRanks, recalculateCandidatePipeline } from "../../_pipeline.js";
import { getCandidateJourney, validateStageCompletion, validateStageTransition } from "../../_journey.js";
import {
  auditEvent,
  clean,
  generateCandidateId,
  generateInviteCode,
  hashInvitationCode,
  hasWorkforceDb,
  json,
  nowIso,
} from "../../_workforce-db.js";


async function sendInvite(context, candidate, code, expiration, selection, invitationOrigin) {
  const subject = `${selection.stageConfig.title} — ${candidate.id}`;
  if (!hasResendChannel(context.env, "candidate_invites") || !context.env.EMAIL_FROM) {
    return {
      ok: false,
      status: 503,
      error: "Email delivery is not configured.",
      subject,
      templateKey: selection.templateKey,
      templateTitle: selection.stageConfig.title,
    };
  }
  const portalUrl = `${onboardingPortalUrl(context.env).replace(/\/$/, "")}/`;
  const result = await sendResendEmail(context.env, {
    from: context.env.EMAIL_FROM,
    to: [candidate.email],
    reply_to: clean(context.env.EMAIL_REPLY_TO || context.env.RECRUITMENT_EMAIL, 320),
    subject,
    html: candidateStageInvitationEmail({
      firstName: candidate.first_name,
      role: candidate.role,
      candidateId: candidate.id,
      accessCode: code,
      expiresAt: new Date(expiration).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }) + " UTC",
      portalUrl,
      status: selection.status,
      stage: selection.stage,
      invitationOrigin,
    }),
  }, `${candidate.id}-${selection.templateKey}-${Date.now()}`, "candidate_invites");

  const messageId = crypto.randomUUID();
  const timestamp = nowIso();
  try {
    await context.env.WORKFORCE_DB.prepare(`
      INSERT INTO email_messages
        (id, candidate_id, message_type, recipient, provider_message_id, status, subject, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      messageId,
      candidate.id,
      `candidate_invitation:${selection.templateKey}`,
      candidate.email,
      clean(result?.data?.id, 200),
      result.ok ? "sent" : "failed",
      subject,
      timestamp,
      timestamp,
    ).run();
  } catch (error) {
    console.error("Invitation email record failed", error?.message);
  }
  return {
    ...result,
    subject,
    templateKey: selection.templateKey,
    templateTitle: selection.stageConfig.title,
  };
}

export async function onRequestGet(context) {
  const auth = await requireAdmin(context, "candidate.read");
  if (auth.response) return auth.response;
  if (!hasWorkforceDb(context.env)) return json({ message: "WORKFORCE_DB is not configured." }, 503);

  const url = new URL(context.request.url);
  const search = clean(url.searchParams.get("search"), 160);
  const status = clean(url.searchParams.get("status"), 40);
  const stage = clean(url.searchParams.get("stage"), 60);
  const inviteEligible = url.searchParams.get("inviteEligible") === "1";
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get("pageSize") || url.searchParams.get("limit") || 25)));
  const offset = (page - 1) * pageSize;
  const conditions = [];
  const values = [];

  if (search) {
    conditions.push("(lower(first_name || ' ' || last_name) LIKE lower(?) OR lower(email) LIKE lower(?) OR lower(id) LIKE lower(?) OR lower(role) LIKE lower(?))");
    const pattern = `%${search}%`;
    values.push(pattern, pattern, pattern, pattern);
  }
  if (status && status !== "all") {
    conditions.push("status = ?");
    values.push(status);
  }
  if (stage && stage !== "all") {
    conditions.push("recruitment_stage = ?");
    values.push(stage);
  }
  if (inviteEligible) {
    conditions.push("application_submitted_at IS NOT NULL");
    conditions.push("status IN ('applicant','approved')");
    conditions.push("NOT EXISTS (SELECT 1 FROM invitations i WHERE i.candidate_id = candidates.id AND i.status IN ('pending','activated') AND datetime(i.expires_at) > datetime('now'))");
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [result, count] = await Promise.all([
    context.env.WORKFORCE_DB.prepare(`
      SELECT id, reference, first_name, last_name, email, phone, city, state_province, country,
             role, status, recruitment_stage, onboarding_progress, assigned_admin_id,
             application_source, application_submitted_at, invited_from_application_at,
             invitation_origin, manual_invite_reason, manual_invite_approved_by, manual_invite_approved_at,
             invitation_status_key, invitation_stage_key, invitation_template_key,
             last_invitation_id, last_invited_at,
             pipeline_score, pipeline_rank, prescreening_score,
             created_at, updated_at, last_activity_at
      FROM candidates ${where}
      ORDER BY COALESCE(pipeline_rank, 999999), COALESCE(last_activity_at, created_at) DESC
      LIMIT ? OFFSET ?
    `).bind(...values, pageSize, offset).all(),
    context.env.WORKFORCE_DB.prepare(`SELECT COUNT(*) AS count FROM candidates ${where}`).bind(...values).first(),
  ]);
  const total = Number(count?.count || 0);
  return json({
    candidates: result.results || [],
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
}

export async function onRequestPost(context) {
  const auth = await requireAdmin(context, "candidate.invite");
  if (auth.response) return auth.response;
  if (!hasWorkforceDb(context.env)) return json({ message: "WORKFORCE_DB is not configured." }, 503);

  let payload;
  try { payload = await context.request.json(); } catch { return json({ message: "Invalid JSON payload." }, 400); }

  const invitationMode = clean(payload.invitationMode || (payload.candidateId ? "application" : "manual"), 40);
  const selection = validateInvitationSelection(payload.initialStatus || "invited", payload.initialStage || "application_received");
  if (!selection.ok) return json({ message: selection.message }, 400);

  const initialStatus = selection.status;
  const initialStage = selection.stage;
  if (invitationMode !== "manual" && initialStage !== "application_received") {
    return json({ message: "Application-linked invitations must begin at the Application stage. Complete each stage in order before advancing." }, 409);
  }
  const expirationHours = Math.min(168, Math.max(1, Number(payload.expirationHours || 72)));
  const timestamp = nowIso();
  let candidate;
  let candidateId;
  let eventType;
  let eventDescription;
  let invitationOrigin;

  if (invitationMode === "manual") {
    const firstName = clean(payload.firstName, 100);
    const lastName = clean(payload.lastName, 100);
    const email = clean(payload.email, 320).toLowerCase();
    const role = clean(payload.role, 160);
    const phone = clean(payload.phone, 40);
    const reason = clean(payload.manualInviteReason, 1000);
    const confirmed = payload.adminOverrideConfirmed === true || payload.adminOverrideConfirmed === "yes" || payload.adminOverrideConfirmed === "on";
    if (!firstName || !lastName || !email || !role) return json({ message: "First name, last name, email, and role are required for a manual invitation." }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ message: "Enter a valid candidate email address." }, 400);
    if (!confirmed || reason.length < 10) return json({ message: "Confirm the administrator override and record a meaningful reason of at least 10 characters." }, 400);

    const existing = await context.env.WORKFORCE_DB.prepare("SELECT * FROM candidates WHERE lower(email) = lower(?) LIMIT 1")
      .bind(email).first();
    candidateId = existing?.id || generateCandidateId();
    const reference = existing?.reference || `BC-M-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;

    if (existing) {
      const activeInvitation = await context.env.WORKFORCE_DB.prepare(`
        SELECT id FROM invitations WHERE candidate_id = ? AND status IN ('pending','activated')
          AND datetime(expires_at) > datetime('now') LIMIT 1
      `).bind(candidateId).first();
      if (activeInvitation) return json({ message: "This email already belongs to a candidate with an active invitation. Open the candidate record to regenerate or revoke access." }, 409);

      await context.env.WORKFORCE_DB.prepare(`
        UPDATE candidates SET first_name = ?, last_name = ?, phone = COALESCE(NULLIF(?, ''), phone), role = ?,
          status = ?, recruitment_stage = ?, assigned_admin_id = ?,
          invitation_origin = 'admin_manual', manual_invite_reason = ?, manual_invite_approved_by = ?,
          manual_invite_approved_at = ?, invitation_status_key = ?, invitation_stage_key = ?,
          invitation_template_key = ?, updated_at = ?, last_activity_at = ?,
          session_version = session_version + 1
        WHERE id = ?
      `).bind(
        firstName, lastName, phone, role,
        initialStatus, initialStage, auth.admin.id,
        reason, auth.admin.id, timestamp,
        initialStatus, initialStage, selection.templateKey,
        timestamp, timestamp, candidateId,
      ).run();
    } else {
      await context.env.WORKFORCE_DB.prepare(`
        INSERT INTO candidates
          (id, reference, first_name, last_name, email, phone, role, status, recruitment_stage,
           onboarding_progress, assigned_admin_id, invitation_origin, manual_invite_reason,
           manual_invite_approved_by, manual_invite_approved_at,
           invitation_status_key, invitation_stage_key, invitation_template_key,
           created_at, updated_at, last_activity_at, session_version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'admin_manual', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).bind(
        candidateId, reference, firstName, lastName, email, phone || null, role,
        initialStatus, initialStage, auth.admin.id,
        reason, auth.admin.id, timestamp,
        initialStatus, initialStage, selection.templateKey,
        timestamp, timestamp, timestamp,
      ).run();
    }
    invitationOrigin = "admin_manual";
    eventType = "candidate.invited_by_admin_override";
    eventDescription = `Administrator created a first-time manual ${selection.stageConfig.label} invitation with ${selection.statusConfig.label} status.`;
  } else {
    candidateId = clean(payload.candidateId, 80);
    if (!candidateId) return json({ message: "Select a submitted application or switch to Manual invitation." }, 400);
    candidate = await context.env.WORKFORCE_DB.prepare(`
      SELECT * FROM candidates
      WHERE id = ? AND application_submitted_at IS NOT NULL AND status IN ('applicant','approved')
      LIMIT 1
    `).bind(candidateId).first();
    if (!candidate) return json({ message: "This application is no longer eligible for a first invitation. An administrator may use the controlled Manual invitation option when appropriate." }, 409);

    const activeInvitation = await context.env.WORKFORCE_DB.prepare(`
      SELECT id FROM invitations WHERE candidate_id = ? AND status IN ('pending','activated')
        AND datetime(expires_at) > datetime('now') LIMIT 1
    `).bind(candidateId).first();
    if (activeInvitation) return json({ message: "This applicant already has an active invitation. Open the candidate record to regenerate or revoke access." }, 409);

    await context.env.WORKFORCE_DB.prepare(`
      UPDATE candidates SET status = ?, recruitment_stage = ?, assigned_admin_id = ?,
        invited_from_application_at = ?, invitation_origin = 'application',
        invitation_status_key = ?, invitation_stage_key = ?, invitation_template_key = ?,
        updated_at = ?, last_activity_at = ?, session_version = session_version + 1
      WHERE id = ?
    `).bind(
      initialStatus, initialStage, auth.admin.id,
      timestamp, initialStatus, initialStage, selection.templateKey,
      timestamp, timestamp, candidateId,
    ).run();
    invitationOrigin = "application";
    eventType = "candidate.invited_from_application";
    eventDescription = `Administrator created a personalized ${selection.stageConfig.label} invitation from a submitted application with ${selection.statusConfig.label} status.`;
  }

  await context.env.WORKFORCE_DB.prepare(
    "UPDATE invitations SET status = 'revoked', revoked_at = ? WHERE candidate_id = ? AND status IN ('pending','activated')",
  ).bind(timestamp, candidateId).run();

  const code = generateInviteCode();
  const codeHash = await hashInvitationCode(code, context.env);
  const expiresAt = new Date(Date.now() + expirationHours * 60 * 60 * 1000).toISOString();
  const invitationId = crypto.randomUUID();
  const subject = `${selection.stageConfig.title} — ${candidateId}`;

  await context.env.WORKFORCE_DB.prepare(`
    INSERT INTO invitations
      (id, candidate_id, code_hash, code_hint, status, expires_at, created_at, created_by,
       template_key, initial_status, initial_stage, email_subject)
    VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    invitationId, candidateId, codeHash, code.slice(-4), expiresAt, timestamp, auth.admin.id,
    selection.templateKey, initialStatus, initialStage, subject,
  ).run();

  await context.env.WORKFORCE_DB.prepare(`
    UPDATE candidates
    SET last_invitation_id = ?, last_invited_at = ?, updated_at = ?, last_activity_at = ?
    WHERE id = ?
  `).bind(invitationId, timestamp, timestamp, timestamp, candidateId).run();

  candidate = await context.env.WORKFORCE_DB.prepare("SELECT * FROM candidates WHERE id = ? LIMIT 1").bind(candidateId).first();

  if (invitationMode === "manual") {
    const targetStageKey = normalizeStageKey(initialStage);
    const targetIndex = PIPELINE_STAGES.findIndex((stage) => stage.key === targetStageKey);
    for (const priorStage of PIPELINE_STAGES.slice(0, Math.max(0, targetIndex))) {
      await completeStage(context.env, {
        candidateId,
        stageKey: priorStage.key,
        source: "admin_manual_override",
        score: 100,
        notes: `Administratively satisfied for a controlled manual invitation starting at ${selection.stageConfig.label}. Reason: ${clean(payload.manualInviteReason, 1000)}`,
        completedBy: auth.admin.id,
        candidateName: `${candidate.first_name} ${candidate.last_name}`,
      });
    }
  }

  const emailResult = await sendInvite(context, candidate, code, expiresAt, selection, invitationOrigin);
  if (emailResult.ok) await context.env.WORKFORCE_DB.prepare("UPDATE invitations SET sent_at = ? WHERE id = ?").bind(nowIso(), invitationId).run();

  const stageKey = normalizeStageKey(initialStage);
  if (["completed", "active"].includes(initialStatus)) {
    await completeStage(context.env, {
      candidateId,
      stageKey,
      source: "admin_invitation_stage_completion",
      score: 100,
      notes: `Administrator created portal access with ${selection.statusConfig.label} status at the ${selection.stageConfig.label} stage.`,
      completedBy: auth.admin.id,
      candidateName: `${candidate.first_name} ${candidate.last_name}`,
    });
  } else {
    const completionPercent = initialStatus === "correction_required" ? 50 : initialStatus === "onboarding" ? 25 : initialStatus === "approved" ? 10 : 0;
    await markStageInProgress(context.env, {
      candidateId,
      stageKey,
      source: invitationMode === "manual" ? "admin_manual_invitation" : "application_invitation_created",
      completionPercent,
      notes: `Administrator selected ${selection.statusConfig.label} status and ${selection.stageConfig.label} as the candidate's starting stage.`,
    });
  }

  const pipeline = await recalculateCandidatePipeline(context.env, candidateId);
  await recalculateAllRanks(context.env);
  await auditEvent(context.env, {
    actorType: "admin",
    actorId: auth.admin.id,
    candidateId,
    eventType,
    description: eventDescription,
    metadata: {
      emailSent: emailResult.ok,
      emailSubject: emailResult.subject,
      templateKey: selection.templateKey,
      selectedStatus: initialStatus,
      selectedStage: initialStage,
      expiresAt,
      role: candidate.role,
      invitationOrigin,
      manualOverrideReason: invitationMode === "manual" ? clean(payload.manualInviteReason, 1000) : null,
      pipelineScore: pipeline.score,
    },
    request: context.request,
  });

  return json({
    success: true,
    candidate,
    invitation: {
      id: invitationId,
      accessCode: code,
      expiresAt,
      emailSent: emailResult.ok,
      emailError: emailResult.ok ? null : emailResult.error,
      journeyOrigin: invitationOrigin,
      selectedStatus: initialStatus,
      selectedStage: initialStage,
      templateKey: selection.templateKey,
      templateTitle: emailResult.templateTitle,
      subject: emailResult.subject,
    },
  }, 201);
}

export async function onRequestPatch(context) {
  const auth = await requireAdmin(context);
  if (auth.response) return auth.response;
  if (!hasWorkforceDb(context.env)) return json({ message: "WORKFORCE_DB is not configured." }, 503);
  let payload;
  try { payload = await context.request.json(); } catch { return json({ message: "Invalid JSON payload." }, 400); }

  const candidateId = clean(payload.candidateId, 80);
  const action = clean(payload.action, 80);
  const candidate = await context.env.WORKFORCE_DB.prepare("SELECT * FROM candidates WHERE id = ? LIMIT 1")
    .bind(candidateId).first();
  if (!candidate) return json({ message: "Candidate not found." }, 404);

  const timestamp = nowIso();
  if (action === "complete-stage") {
    if (!hasAdminPermission(auth.admin, "candidate.stage")) return json({ message: "Your administrator role cannot complete recruitment stages." }, 403);
    const stageKey = normalizeStageKey(payload.stageKey || candidate.recruitment_stage);
    const gate = await validateStageCompletion(context.env, candidateId, stageKey);
    if (!gate.ok) return json({ message: gate.message, missingStages: gate.missingStages || [], journey: gate.journey || null }, 409);
    const score = Math.max(0, Math.min(100, Number(payload.score == null ? 100 : payload.score)));
    const notes = clean(payload.notes, 2000);
    const completed = await completeStage(context.env, {
      candidateId,
      stageKey,
      source: "admin_review",
      score,
      notes,
      completedBy: auth.admin.id,
      candidateName: `${candidate.first_name} ${candidate.last_name}`,
    });
    const completingActivation = stageKey === "active_worker";
    const nextStage = completingActivation ? "active_worker" : payload.advance === false ? candidate.recruitment_stage : nextRecruitmentStage(stageKey);
    const nextStatus = completingActivation ? "active" : nextStage === "active_worker" ? "completed" : candidate.status === "applicant" ? "approved" : candidate.status;
    await context.env.WORKFORCE_DB.prepare("UPDATE candidates SET recruitment_stage = ?, status = ?, updated_at = ?, last_activity_at = ? WHERE id = ?")
      .bind(nextStage, nextStatus, timestamp, timestamp, candidateId).run();
    if (!completingActivation) await markStageInProgress(context.env, { candidateId, stageKey: nextStage, source: "admin_advancement", completionPercent: 0 });
    const pipeline = await recalculateCandidatePipeline(context.env, candidateId);
    await recalculateAllRanks(context.env);
    await context.env.WORKFORCE_DB.prepare("INSERT INTO candidate_notifications (id, candidate_id, title, message, notification_type, status, action_url, created_at) VALUES (?, ?, ?, ?, 'stage', 'unread', '/onboarding_portal/#progress', ?)")
      .bind(crypto.randomUUID(), candidateId, `${completed.label} completed`, `A Brownstone administrator marked your ${completed.label.toLowerCase()} stage complete.`, timestamp).run();
    await auditEvent(context.env, { actorType: "admin", actorId: auth.admin.id, candidateId, eventType: "candidate.stage_completed", description: `Administrator completed the ${completed.label} stage.`, metadata: { stageKey, score, nextStage, pipelineScore: pipeline.score }, request: context.request });
    return json({ success: true, stage: completed, nextStage, pipeline });
  }

  if (action === "update-status") {
    if (!hasAdminPermission(auth.admin, "candidate.status")) return json({ message: "Your administrator role cannot change candidate status." }, 403);
    const allowedStatuses = new Set(["applicant", "approved", "onboarding", "correction_required", "completed", "active", "suspended", "rejected"]);
    const allowedStages = new Set(["application_received", "pre_screening", "assessment", "interview", "offer", "verification", "onboarding", "orientation", "active_worker"]);
    const status = clean(payload.status, 40);
    const stage = clean(payload.stage, 60);
    if (status === "invited") return json({ message: "Use the invitation workflow—submitted application or controlled Manual invitation—so a protected access code and audit record are created." }, 400);
    if (!allowedStatuses.has(status) || !allowedStages.has(stage)) return json({ message: "Unsupported status or stage." }, 400);
    if (stage !== candidate.recruitment_stage) {
      const transition = await validateStageTransition(context.env, candidateId, stage);
      if (!transition.ok) return json({ message: transition.message, missingStages: transition.missingStages || [], journey: transition.journey || null }, 409);
    }
    const invalidateSession = ["suspended", "rejected"].includes(status);
    await context.env.WORKFORCE_DB.prepare(`
      UPDATE candidates
      SET status = ?, recruitment_stage = ?, updated_at = ?,
          session_version = session_version + ?
      WHERE id = ?
    `).bind(status, stage, timestamp, invalidateSession ? 1 : 0, candidateId).run();
    await auditEvent(context.env, {
      actorType: "admin", actorId: auth.admin.id, candidateId,
      eventType: "admin.candidate_status_updated",
      description: `Candidate status changed to ${status}; stage changed to ${stage}.`,
      metadata: { previousStatus: candidate.status, previousStage: candidate.recruitment_stage, status, stage },
      request: context.request,
    });
    return json({ success: true });
  }

  if (action === "request-correction") {
    if (!hasAdminPermission(auth.admin, "correction.request")) return json({ message: "Your administrator role cannot request candidate corrections." }, 403);
    const message = clean(payload.message, 2000);
    if (!message) return json({ message: "A correction message is required." }, 400);
    const noteId = crypto.randomUUID();
    await context.env.WORKFORCE_DB.batch([
      context.env.WORKFORCE_DB.prepare("UPDATE candidates SET status = 'correction_required', updated_at = ? WHERE id = ?").bind(timestamp, candidateId),
      context.env.WORKFORCE_DB.prepare("INSERT INTO admin_notes (id, candidate_id, admin_id, note, visibility, created_at) VALUES (?, ?, ?, ?, 'candidate', ?)").bind(noteId, candidateId, auth.admin.id, message, timestamp),
    ]);
    let emailResult = { ok: false, error: "Email delivery is not configured." };
    if (hasResendChannel(context.env, "onboarding") && context.env.EMAIL_FROM) {
      emailResult = await sendResendEmail(context.env, {
        from: context.env.EMAIL_FROM,
        to: [candidate.email],
        reply_to: clean(context.env.EMAIL_REPLY_TO || context.env.RECRUITMENT_EMAIL, 320),
        subject: `Brownstone onboarding update required — ${candidate.id}`,
        html: onboardingCorrectionEmail({
          firstName: candidate.first_name,
          role: candidate.role,
          message,
          portalUrl: `${onboardingPortalUrl(context.env).replace(/\/$/, "")}/`,
        }),
      }, `${candidate.id}-correction-${Date.now()}`, "onboarding");
    }
    await auditEvent(context.env, {
      actorType: "admin", actorId: auth.admin.id, candidateId,
      eventType: "admin.correction_requested",
      description: "Administrator requested a correction to the onboarding submission.",
      metadata: { emailSent: emailResult.ok },
      request: context.request,
    });
    return json({ success: true, emailSent: emailResult.ok, emailError: emailResult.ok ? null : emailResult.error });
  }

  if (action === "review-identity") {
    if (!hasAdminPermission(auth.admin, "identity.review")) return json({ message: "Your administrator role cannot review identity records." }, 403);
    const verificationStatus = clean(payload.verificationStatus, 40);
    if (!["approved", "rejected", "correction_required"].includes(verificationStatus)) return json({ message: "Unsupported identity review status." }, 400);
    if (verificationStatus === "approved") {
      const transition = await validateStageTransition(context.env, candidateId, "verification");
      if (!transition.ok || normalizeStageKey(candidate.recruitment_stage) !== "verification") {
        return json({
          message: transition.ok
            ? "Verification approval is locked until verification is the candidate’s current stage."
            : transition.message,
          missingStages: transition.missingStages || [],
          journey: transition.journey || null,
        }, 409);
      }
    }
    await context.env.WORKFORCE_DB.prepare("UPDATE sensitive_identity SET verification_status = ?, reviewed_at = ?, reviewed_by = ?, updated_at = ? WHERE candidate_id = ?")
      .bind(verificationStatus, timestamp, auth.admin.id, timestamp, candidateId).run();
    await context.env.WORKFORCE_DB.prepare("UPDATE documents SET status = ?, reviewed_at = ?, reviewed_by = ? WHERE candidate_id = ? AND category IN ('identity-front','identity-back')")
      .bind(verificationStatus === "approved" ? "approved" : verificationStatus, timestamp, auth.admin.id, candidateId).run();
    let pipeline = null;
    if (verificationStatus === "approved") {
      await completeStage(context.env, {
        candidateId,
        stageKey: "verification",
        source: "identity_review_approved",
        score: 100,
        notes: "Identity and verification records were approved by an authorized administrator.",
        completedBy: auth.admin.id,
        candidateName: `${candidate.first_name} ${candidate.last_name}`,
      });
      await context.env.WORKFORCE_DB.prepare("UPDATE candidates SET recruitment_stage = 'onboarding', status = 'onboarding', updated_at = ?, last_activity_at = ? WHERE id = ?")
        .bind(timestamp, timestamp, candidateId).run();
      await markStageInProgress(context.env, { candidateId, stageKey: "onboarding", source: "verification_approved", completionPercent: Number(candidate.onboarding_progress || 0) });
      await context.env.WORKFORCE_DB.prepare("INSERT INTO candidate_notifications (id, candidate_id, title, message, notification_type, status, action_url, created_at) VALUES (?, ?, 'Verification approved', 'Your verification stage was approved. Continue your assigned onboarding requirements.', 'verification', 'unread', '/onboarding_portal/#progress', ?)")
        .bind(crypto.randomUUID(), candidateId, timestamp).run();
      pipeline = await recalculateCandidatePipeline(context.env, candidateId);
      await recalculateAllRanks(context.env);
    }
    await auditEvent(context.env, {
      actorType: "admin", actorId: auth.admin.id, candidateId,
      eventType: "admin.identity_reviewed",
      description: `Identity verification status changed to ${verificationStatus}.`,
      metadata: { verificationStatus, pipelineScore: pipeline?.score ?? null },
      request: context.request,
    });
    return json({ success: true, pipeline });
  }

  return json({ message: "Unsupported candidate action." }, 400);
}

export function onRequest() {
  return json({ message: "Method not allowed." }, 405);
}

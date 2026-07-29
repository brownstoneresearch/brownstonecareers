import {
  applicationReceivedEmail,
  contactReceivedEmail,
  internalApplicationEmail,
  internalContactEmail,
} from "../emails/index.js";
import { auditEvent, generateCandidateId, hasWorkforceDb, nowIso } from "./_workforce-db.js";
import { productionUrls } from "./_domains.js";
import { completeStage, recalculateCandidatePipeline } from "./_pipeline.js";

const HANDLER_VERSION = "2026-07-29.10.0.5";
const TURNSTILE_SITEKEY = "0x4AAAAAAEA0g9ELRe9IQHmp";
const TURNSTILE_ACTION = "turnstile-spin-v2";
const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const RECOMMENDED_SENDING_DOMAIN = "mail.brownstonecareers.agency";
const RESEND_CHANNEL_KEYS = Object.freeze({
  recruitment: ["RESEND_API_KEY"],
  onboarding: ["RESEND_API_KEY"],
  access_codes: ["RESEND_API_KEY"],
  candidate_invites: ["RESEND_API_KEY"],
  workforce: ["RESEND_API_KEY"],
  default: ["RESEND_API_KEY"],
});

export function resendApiKey(env, channel = "default") {
  const candidates = RESEND_CHANNEL_KEYS[channel] || RESEND_CHANNEL_KEYS.default;
  for (const name of candidates) {
    const value = clean(env?.[name], 1000);
    if (value) return value;
  }
  return "";
}

export function hasResendChannel(env, channel = "default") {
  return Boolean(resendApiKey(env, channel));
}

const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["pdf", "doc", "docx"]);
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/x-pdf",
  "application/msword",
  "application/vnd.ms-word",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export function health(env) {
  return json({
    ok: true,
    handlerVersion: HANDLER_VERSION,
    emailConfigured: Boolean(hasResendChannel(env, "recruitment") && env?.EMAIL_FROM && env?.RECRUITMENT_EMAIL),
    emailChannels: {
      recruitment: hasResendChannel(env, "recruitment"),
      onboarding: hasResendChannel(env, "onboarding"),
      accessCodes: hasResendChannel(env, "access_codes"),
      candidateInvites: hasResendChannel(env, "candidate_invites"),
      workforce: hasResendChannel(env, "workforce"),
    },
    emailFrom: clean(env?.EMAIL_FROM, 320) || null,
    recommendedSendingDomain: RECOMMENDED_SENDING_DOMAIN,
    dedicatedSendingSubdomain: senderUsesRecommendedSubdomain(env?.EMAIL_FROM),
    turnstileConfigured: Boolean(turnstileSecret(env)),
    turnstileSitekey: TURNSTILE_SITEKEY,
    turnstileAction: TURNSTILE_ACTION,
    turnstileSecretBinding: "TURNSTILE_SECRET",
    workforceDatabaseConfigured: Boolean(env?.WORKFORCE_DB),
    privateDocumentStorageConfigured: Boolean(env?.PRIVATE_DOCUMENTS),
    secureIdentityConfigured: Boolean(env?.PRIVATE_DOCUMENTS && env?.PII_ENCRYPTION_KEY),
    portalSessionConfigured: Boolean(env?.ONBOARDING_PORTAL_SESSION_SECRET),
    invitationSecurityConfigured: Boolean(env?.INVITATION_PEPPER),
    piiEncryptionConfigured: Boolean(env?.PII_ENCRYPTION_KEY),
    adminAccessConfigured: Boolean((env?.ADMIN_EMAILS || "").trim() && (env?.ADMIN_SESSION_SECRET || env?.ONBOARDING_PORTAL_SESSION_SECRET)),
    aiAssistantConfigured: true,
    aiAssistantMode: env?.OPENAI_API_KEY ? "generative" : "guided_fallback",
    aiGenerativeConfigured: Boolean(env?.OPENAI_API_KEY),
    aiAssistantModel: clean(env?.OPENAI_MODEL || "gpt-5.6", 80),
    supabaseConfigured: Boolean(env?.SUPABASE_URL && (env?.SUPABASE_SECRET_KEY || env?.SUPABASE_SERVICE_ROLE_KEY)),
    workflowMigrationRequired: "0009_autonomous_operations.sql",
    applicationFirstInvites: true,
    adminControlledManualInvites: true,
    rankedPipeline: true,
    stageNotifications: true,
    prescreenManagement: true,
    aiPrescreenGradingConfigured: Boolean(env?.OPENAI_API_KEY),
    invitationStatusStageTemplates: true,
    persistentInvitationIdentity: true,
    serviceUrls: productionUrls(env),
    service: "Brownstone Careers",
    runtime: "Cloudflare Pages Functions",
  });
}

export async function handleApplication(request, env) {
  const incident = createIncident();
  let stage = "configuration";

  try {
    const configError = validateEnvironment(env, incident);
    if (configError) return configError;

    stage = "reading-form";
    const form = await parseForm(request, incident);
    if (form instanceof Response) return form;
    if (clean(form.get("website"))) return json({ success: true, handlerVersion: HANDLER_VERSION });

    stage = "security-check";
    const turnstileError = await verifyTurnstile(request, env, form, incident);
    if (turnstileError) return turnstileError;

    stage = "validation";
    const fields = {
      firstName: clean(form.get("firstName"), 80),
      lastName: clean(form.get("lastName"), 80),
      email: clean(form.get("email"), 160),
      phone: clean(form.get("phone"), 40),
      city: clean(form.get("city"), 100),
      stateProvince: clean(form.get("stateProvince"), 100),
      country: clean(form.get("country"), 100),
      workAuthorization: clean(form.get("workAuthorization"), 30),
      sponsorshipRequired: clean(form.get("sponsorshipRequired"), 30),
      role: clean(form.get("role"), 120),
      timezone: clean(form.get("timezone"), 80),
      startDate: clean(form.get("startDate"), 30),
      yearsExperience: clean(form.get("yearsExperience"), 80),
      recentJobTitle: clean(form.get("recentJobTitle"), 120),
      recentEmployer: clean(form.get("recentEmployer"), 160),
      employmentPeriod: clean(form.get("employmentPeriod"), 100),
      experience: clean(form.get("experience"), 4000),
      interest: clean(form.get("interest"), 3000),
      skills: clean(form.get("skills"), 3000),
      readiness: clean(form.get("readiness"), 2500),
      consent: clean(form.get("consent"), 10),
    };

    const resume = form.get("resume");
    const required = Object.entries(fields)
      .filter(([key]) => key !== "consent")
      .map(([, value]) => value);

    if (required.some((value) => !value) || fields.consent !== "yes" || !isUploadedFile(resume)) {
      return json({
        message: "Please complete every required field, accept the applicant privacy statement, and attach your resume.",
        incident,
        handlerVersion: HANDLER_VERSION,
      }, 400);
    }

    if (!validEmail(fields.email)) {
      return json({ message: "Please enter a valid email address.", incident, handlerVersion: HANDLER_VERSION }, 400);
    }

    if (!["yes", "no"].includes(fields.workAuthorization.toLowerCase()) || !["yes", "no"].includes(fields.sponsorshipRequired.toLowerCase())) {
      return json({ message: "Please answer the work-authorization and sponsorship questions.", incident, handlerVersion: HANDLER_VERSION }, 400);
    }

    const fileError = validateResume(resume);
    if (fileError) return json({ message: fileError, incident, handlerVersion: HANDLER_VERSION }, 400);

    stage = "preparing-application";
    const reference = createReference();
    const fullName = `${fields.firstName} ${fields.lastName}`;
    const resumeBase64 = arrayBufferToBase64(await resume.arrayBuffer());
    let candidateId = reference;

    if (hasWorkforceDb(env)) {
      try {
        const existing = await env.WORKFORCE_DB.prepare("SELECT id FROM candidates WHERE lower(email) = lower(?) LIMIT 1")
          .bind(fields.email).first();
        candidateId = existing?.id || reference;
        const timestamp = nowIso();
        await env.WORKFORCE_DB.prepare(`
          INSERT INTO candidates
            (id, reference, first_name, last_name, email, phone, city, state_province, country,
             work_authorization, sponsorship_required, role, status, recruitment_stage,
             onboarding_progress, application_source, application_submitted_at, created_at, updated_at, last_activity_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'applicant', 'application_received', 0, 'legacy_public_application', ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            reference = excluded.reference,
            first_name = excluded.first_name,
            last_name = excluded.last_name,
            phone = excluded.phone,
            city = excluded.city,
            state_province = excluded.state_province,
            country = excluded.country,
            work_authorization = excluded.work_authorization,
            sponsorship_required = excluded.sponsorship_required,
            role = excluded.role,
            application_source = excluded.application_source,
            application_submitted_at = excluded.application_submitted_at,
            status = CASE WHEN candidates.status IN ('active','onboarding','invited') THEN candidates.status ELSE 'applicant' END,
            recruitment_stage = CASE WHEN candidates.recruitment_stage IN ('onboarding','active_worker') THEN candidates.recruitment_stage ELSE 'application_received' END,
            updated_at = excluded.updated_at,
            last_activity_at = excluded.last_activity_at
        `).bind(
          candidateId, reference, fields.firstName, fields.lastName, fields.email, fields.phone,
          fields.city, fields.stateProvince, fields.country, fields.workAuthorization, fields.sponsorshipRequired,
          fields.role, timestamp, timestamp, timestamp, timestamp,
        ).run();
        await auditEvent(env, {
          actorType: "candidate",
          actorId: candidateId,
          candidateId,
          eventType: "candidate.application_submitted",
          description: "Candidate submitted the public recruitment application.",
          metadata: { reference, role: fields.role, sensitiveDataCollected: false },
          request,
        });
        await completeStage(env, {
          candidateId,
          stageKey: "application",
          source: "legacy_public_application",
          score: 100,
          notes: "Public recruitment application submitted.",
          candidateName: fullName,
        });
        await recalculateCandidatePipeline(env, candidateId);
      } catch (error) {
        console.error("Workforce database application write failed", { incident, message: error?.message });
      }
    }

    stage = "sending-recruiter-email";
    const recruiterResult = await sendResendEmail(env, {
      from: env.EMAIL_FROM,
      to: parseRecipients(env.RECRUITMENT_EMAIL),
      reply_to: fields.email,
      subject: `New application: ${fields.role} — ${fullName} — ${reference}`,
      html: internalApplicationEmail({ reference, fullName, ...fields }),
      attachments: [{ filename: safeFilename(resume.name), content: resumeBase64 }],
    }, `${reference}-recruiter`, "recruitment");

    if (!recruiterResult.ok) {
      console.error("Recruiter application email failed", {
        incident,
        stage,
        status: recruiterResult.status,
        error: recruiterResult.error,
      });
      return json({
        message: recruiterResult.userMessage || "We could not deliver your application. Please try again or email support@brownstonecareers.agency.",
        incident,
        stage,
        handlerVersion: HANDLER_VERSION,
      }, recruiterResult.status === 429 ? 429 : 502);
    }

    stage = "sending-candidate-confirmation";
    const confirmation = await sendResendEmail(env, {
      from: env.EMAIL_FROM,
      to: [fields.email],
      reply_to: replyToAddress(env),
      subject: `Application received — ${reference}`,
      html: applicationReceivedEmail({ firstName: fields.firstName, role: fields.role, reference }),
    }, `${reference}-candidate`, "recruitment");

    if (!confirmation.ok) {
      console.error("Candidate confirmation failed", { incident, stage, status: confirmation.status, error: confirmation.error });
    }

    return json({ success: true, reference, candidateId, incident, handlerVersion: HANDLER_VERSION }, 201);
  } catch (error) {
    console.error("Application handler failure", {
      incident,
      stage,
      name: error?.name,
      message: error?.message,
      stack: error?.stack,
    });
    return json({
      message: "The application could not be completed at this stage. Please retry once. If it continues, email support@brownstonecareers.agency and include the reference below.",
      incident,
      stage,
      handlerVersion: HANDLER_VERSION,
    }, 500);
  }
}

export async function handleContact(request, env) {
  const incident = createIncident();
  let stage = "configuration";

  try {
    stage = "reading-form";
    const form = await parseForm(request, incident);
    if (form instanceof Response) return form;
    if (clean(form.get("website"))) return json({ success: true, handlerVersion: HANDLER_VERSION });

    stage = "security-check";
    const turnstileError = await verifyTurnstile(request, env, form, incident);
    if (turnstileError) return turnstileError;

    stage = "validation";
    const name = clean(form.get("name"), 120);
    const email = clean(form.get("email"), 160).toLowerCase();
    const phone = clean(form.get("phone"), 40);
    const inquiryType = clean(form.get("inquiryType"), 80) || "general-question";
    const role = clean(form.get("role"), 160);
    const subject = clean(form.get("subject"), 160);
    const message = clean(form.get("message"), 5000);
    const startsApplication = inquiryType === "application-interest";

    const configError = validateEnvironment(env, incident, { requireEmail: !startsApplication });
    if (configError) return configError;

    if (!name || !email || !subject || !message) {
      return json({ message: "Please complete every required field.", incident, handlerVersion: HANDLER_VERSION }, 400);
    }
    if (!validEmail(email)) {
      return json({ message: "Please enter a valid email address.", incident, handlerVersion: HANDLER_VERSION }, 400);
    }
    if (startsApplication && !role) {
      return json({ message: "Select the role you are applying for before beginning the application journey.", incident, handlerVersion: HANDLER_VERSION }, 400);
    }
    if (startsApplication && !hasWorkforceDb(env)) {
      return json({
        message: "The application system is temporarily unavailable because WORKFORCE_DB is not configured.",
        incident,
        stage: "recording-application",
        handlerVersion: HANDLER_VERSION,
      }, 503);
    }

    const reference = createReference(startsApplication ? "BC-A" : "BC-S");
    let candidateId = null;
    let firstName = name;

    if (startsApplication) {
      stage = "recording-application";
      const parts = name.split(/\s+/).filter(Boolean);
      firstName = parts.shift() || "Applicant";
      const lastName = parts.join(" ") || "Applicant";
      const timestamp = nowIso();
      const existing = await env.WORKFORCE_DB.prepare(
        "SELECT id, status, recruitment_stage FROM candidates WHERE lower(email) = lower(?) LIMIT 1",
      ).bind(email).first();
      candidateId = existing?.id || generateCandidateId();

      await env.WORKFORCE_DB.prepare(`
        INSERT INTO candidates
          (id, reference, first_name, last_name, email, phone, role, status, recruitment_stage,
           onboarding_progress, application_source, application_submitted_at, created_at, updated_at, last_activity_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'applicant', 'application_received', 0, 'public_contact_form', ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          reference = excluded.reference,
          first_name = excluded.first_name,
          last_name = excluded.last_name,
          email = excluded.email,
          phone = excluded.phone,
          role = excluded.role,
          application_source = 'public_contact_form',
          application_submitted_at = excluded.application_submitted_at,
          status = CASE WHEN candidates.status IN ('active','onboarding','invited') THEN candidates.status ELSE 'applicant' END,
          recruitment_stage = CASE WHEN candidates.recruitment_stage IN ('onboarding','active_worker') THEN candidates.recruitment_stage ELSE 'application_received' END,
          updated_at = excluded.updated_at,
          last_activity_at = excluded.last_activity_at
      `).bind(
        candidateId, reference, firstName, lastName, email, phone, role,
        timestamp, timestamp, timestamp, timestamp,
      ).run();

      await auditEvent(env, {
        actorType: "candidate",
        actorId: candidateId,
        candidateId,
        eventType: "candidate.application_interest_submitted",
        description: "Candidate began the recruitment journey through the public application contact form.",
        metadata: { reference, role, applicationSource: "public_contact_form", confidentialDataCollected: false },
        request,
      });
      try {
        await completeStage(env, {
          candidateId,
          stageKey: "application",
          source: "public_contact_form",
          score: 100,
          notes: "Application interest submitted through the public contact form.",
          candidateName: name,
        });
        await recalculateCandidatePipeline(env, candidateId);
      } catch (pipelineError) {
        console.warn("Application pipeline tracking is pending migration 0007", { incident, message: pipelineError?.message });
      }
    }

    stage = "sending-support-email";
    const supportResult = await sendResendEmail(env, {
      from: env.EMAIL_FROM,
      to: parseRecipients(env.RECRUITMENT_EMAIL),
      reply_to: email,
      subject: `${startsApplication ? "New application interest" : "Website support"}: ${subject} — ${reference}`,
      html: internalContactEmail({ reference, name, email, phone, inquiryType, role, subject, message }),
    }, `${reference}-support`, "recruitment");

    if (!supportResult.ok) {
      console.error("Support email failed", {
        incident,
        stage,
        status: supportResult.status,
        error: supportResult.error,
      });
      if (startsApplication) {
        return json({
          success: true,
          applicationRecorded: true,
          reference,
          candidateId,
          journey: "application_received",
          nextStep: "Recruitment review before a personalized portal invitation.",
          emailSent: false,
          emailWarning: "Your application is safely recorded, but email confirmation was not delivered. Retain your application reference.",
          incident,
          handlerVersion: HANDLER_VERSION,
        }, 201);
      }
      return json({
        message: supportResult.userMessage || "We could not deliver your message. Please try again.",
        applicationRecorded: false,
        reference,
        incident,
        stage,
        handlerVersion: HANDLER_VERSION,
      }, supportResult.status === 429 ? 429 : 502);
    }

    stage = "sending-contact-confirmation";
    const confirmation = await sendResendEmail(env, {
      from: env.EMAIL_FROM,
      to: [email],
      reply_to: replyToAddress(env),
      subject: startsApplication ? `Application received — ${reference}` : `Message received — ${reference}`,
      html: startsApplication
        ? applicationReceivedEmail({ firstName, role, reference })
        : contactReceivedEmail({ name, reference }),
    }, `${reference}-confirmation`, "recruitment");

    if (!confirmation.ok) {
      console.error("Support confirmation failed", {
        incident,
        stage,
        status: confirmation.status,
        error: confirmation.error,
      });
    }

    return json({
      success: true,
      reference,
      candidateId,
      journey: startsApplication ? "application_received" : "contact_received",
      nextStep: startsApplication ? "Recruitment review before a personalized portal invitation." : null,
      emailSent: confirmation.ok,
      emailWarning: confirmation.ok ? null : "Your submission is recorded, but the confirmation email was not delivered. Retain your reference.",
      incident,
      handlerVersion: HANDLER_VERSION,
    }, 201);
  } catch (error) {
    console.error("Contact handler failure", {
      incident,
      stage,
      name: error?.name,
      message: error?.message,
      stack: error?.stack,
    });
    return json({
      message: "The message could not be completed at this stage. Please retry once. If it continues, email support@brownstonecareers.agency and include the reference below.",
      incident,
      stage,
      handlerVersion: HANDLER_VERSION,
    }, 500);
  }
}

async function verifyTurnstile(request, env, form, incident) {
  const token = clean(form.get("cf-turnstile-response"), 2048);
  if (!token) {
    return json({
      message: "Please complete the Cloudflare security check before submitting.",
      incident,
      handlerVersion: HANDLER_VERSION,
    }, 400);
  }

  const secret = turnstileSecret(env);
  if (!secret) {
    console.error("Turnstile secret binding is missing", {
      incident,
      requiredBinding: "TURNSTILE_SECRET",
    });
    return json({
      message: "The security verification service is not configured. Please contact support before submitting sensitive information.",
      incident,
      handlerVersion: HANDLER_VERSION,
    }, 503);
  }

  try {
    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", token);
    const remoteIp = clean(request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For"), 80);
    if (remoteIp) body.set("remoteip", remoteIp.split(",")[0].trim());

    const response = await fetchWithTimeout(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }, 12000);

    const text = await response.text().catch(() => "");
    const result = parseJson(text);
    const requestHostname = new URL(request.url).hostname.toLowerCase();
    const resultHostname = clean(result.hostname, 253).toLowerCase();
    const actionMatches = result.action === TURNSTILE_ACTION;
    const hostnameMatches = Boolean(resultHostname) && resultHostname === requestHostname;

    if (!response.ok || result.success !== true || !actionMatches || !hostnameMatches) {
      console.error("Turnstile verification failed", {
        incident,
        status: response.status,
        errors: result["error-codes"],
        expectedAction: TURNSTILE_ACTION,
        receivedAction: result.action || null,
        expectedHostname: requestHostname,
        receivedHostname: resultHostname || null,
      });
      return json({
        message: "Security verification failed. Refresh the page, complete the security check again, and resubmit.",
        incident,
        handlerVersion: HANDLER_VERSION,
      }, 403);
    }
  } catch (error) {
    console.error("Turnstile verification error", { incident, message: error?.message });
    return json({
      message: "Security verification could not be completed. Please refresh and try again.",
      incident,
      handlerVersion: HANDLER_VERSION,
    }, 403);
  }

  return null;
}

function turnstileSecret(env) {
  return clean(env?.TURNSTILE_SECRET, 500);
}


async function parseForm(request, incident) {
  const type = request.headers.get("content-type") || "";
  if (!type.includes("multipart/form-data") && !type.includes("application/x-www-form-urlencoded")) {
    return json({
      message: "Unsupported form format.",
      incident,
      handlerVersion: HANDLER_VERSION,
    }, 415);
  }
  try {
    return await request.formData();
  } catch (error) {
    console.error("Form parsing failed", { incident, message: error?.message });
    return json({
      message: "The submitted form could not be read. Please reload the page and try again.",
      incident,
      handlerVersion: HANDLER_VERSION,
    }, 400);
  }
}

function isUploadedFile(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof value.name === "string" &&
    typeof value.size === "number" &&
    typeof value.arrayBuffer === "function"
  );
}

function validateResume(file) {
  if (!isUploadedFile(file) || file.size <= 0) return "Please attach a resume.";
  if (file.size > MAX_RESUME_BYTES) return "Your resume must be no larger than 5 MB.";
  const extension = clean(file.name, 180).split(".").pop()?.toLowerCase() || "";
  const contentType = clean(file.type, 160).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) return "Only PDF, DOC, and DOCX resumes are accepted.";
  if (contentType && contentType !== "application/octet-stream" && !ALLOWED_TYPES.has(contentType)) {
    return "Only PDF, DOC, and DOCX resumes are accepted.";
  }
  return null;
}


function validateEnvironment(env, incident, { requireEmail = true } = {}) {
  const missing = [];
  if (requireEmail && !hasResendChannel(env, "recruitment")) missing.push("RESEND_API_KEY");
  const requiredKeys = requireEmail
    ? ["EMAIL_FROM", "RECRUITMENT_EMAIL", "TURNSTILE_SECRET"]
    : ["TURNSTILE_SECRET"];
  for (const key of requiredKeys) {
    if (!clean(env?.[key], 1000)) missing.push(key);
  }
  if (!missing.length) return null;
  console.error("Missing Pages Function bindings", { incident, missing });
  return json({
    message: missing.includes("TURNSTILE_SECRET")
      ? "The security verification service is not configured. Add TURNSTILE_SECRET to the Cloudflare Pages production secrets, then redeploy."
      : "Email delivery is not configured on this deployment. Add the required Cloudflare production variables, then redeploy.",
    incident,
    missing,
    handlerVersion: HANDLER_VERSION,
  }, 503);
}

export async function sendResendEmail(env, payload, idempotencyKey, channel = "default") {
  try {
    const normalizedPayload = {
      ...payload,
      from: clean(payload.from, 320),
      to: Array.isArray(payload.to) ? payload.to.map((value) => clean(value, 320)).filter(validEmail) : [],
    };
    if (payload.reply_to) normalizedPayload.reply_to = clean(payload.reply_to, 320);

    if (!normalizedPayload.from || normalizedPayload.to.length === 0) {
      return {
        ok: false,
        status: 400,
        error: "Sender or recipient configuration is invalid.",
        userMessage: "The website email recipient is not configured correctly. Please contact support@brownstonecareers.agency.",
      };
    }

    const apiKey = resendApiKey(env, channel);
    if (!apiKey) {
      return {
        ok: false,
        status: 503,
        error: `Resend channel ${channel} is not configured.`,
        userMessage: "Email delivery is not configured for this workflow.",
      };
    }

    const response = await fetchWithTimeout("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": clean(idempotencyKey, 256),
      },
      body: JSON.stringify(normalizedPayload),
    }, 25000);

    const text = await response.text().catch(() => "");
    const body = parseJson(text);
    if (response.ok) return { ok: true, data: body };

    const apiMessage = clean(body?.message || body?.error || text || `Resend returned ${response.status}`, 500);
    return {
      ok: false,
      status: response.status,
      error: apiMessage,
      userMessage: resendUserMessage(response.status, apiMessage),
    };
  } catch (error) {
    return {
      ok: false,
      status: error?.name === "AbortError" ? 504 : 502,
      error: error?.message || "Unable to reach Resend.",
      userMessage: error?.name === "AbortError"
        ? "Email delivery timed out. Please try again."
        : "Email delivery could not be reached. Please try again.",
    };
  }
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function resendUserMessage(status, apiMessage) {
  const message = apiMessage.toLowerCase();
  if (status === 401 || status === 403) {
    return "Email delivery authorization failed. Check RESEND_API_KEY and verify the EMAIL_FROM domain in Resend.";
  }
  if (status === 422 && (message.includes("domain") || message.includes("from"))) {
    return "The sender address is not verified in Resend. Verify the EMAIL_FROM domain, then try again.";
  }
  if (status === 429) return "Too many submissions were received at once. Please wait one minute and try again.";
  return "We could not deliver the submission by email. Please try again or email support@brownstonecareers.agency.";
}

function parseRecipients(value) {
  return clean(value, 2000)
    .split(/[;,\n]/)
    .map((item) => item.trim())
    .filter(validEmail);
}

function firstRecipient(value) {
  return parseRecipients(value)[0] || "support@brownstonecareers.agency";
}

function replyToAddress(env) {
  const explicit = clean(env?.EMAIL_REPLY_TO, 320);
  return validEmail(explicit) ? explicit : firstRecipient(env?.RECRUITMENT_EMAIL);
}

function senderUsesRecommendedSubdomain(value) {
  return clean(value, 320).toLowerCase().includes(`@${RECOMMENDED_SENDING_DOMAIN}`);
}

function clean(value, maxLength = 5000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value, 320));
}

function escapeHtml(value) {
  return clean(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createReference(prefix = "BC") {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const random = randomId(6);
  return `${prefix}-${date}-${random}`;
}

function createIncident() {
  return `INC-${randomId(8)}`;
}

function randomId(length) {
  try {
    return crypto.randomUUID().replaceAll("-", "").slice(0, length).toUpperCase();
  } catch {
    const bytes = new Uint8Array(Math.ceil(length / 2));
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, length).toUpperCase();
  }
}

function safeFilename(name) {
  return clean(name, 180).replace(/[^\w.\-() ]/g, "_") || "resume.pdf";
}

function arrayBufferToBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const chunks = [];
  let chunk = "";

  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const hasB = index + 1 < bytes.length;
    const hasC = index + 2 < bytes.length;
    const b = hasB ? bytes[index + 1] : 0;
    const c = hasC ? bytes[index + 2] : 0;

    chunk += alphabet[a >> 2];
    chunk += alphabet[((a & 3) << 4) | (b >> 4)];
    chunk += hasB ? alphabet[((b & 15) << 2) | (c >> 6)] : "=";
    chunk += hasC ? alphabet[c & 63] : "=";

    if (chunk.length >= 32768) {
      chunks.push(chunk);
      chunk = "";
    }
  }

  if (chunk) chunks.push(chunk);
  return chunks.join("");
}


function parseJson(text) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-brownstone-form-handler": HANDLER_VERSION,
    },
  });
}

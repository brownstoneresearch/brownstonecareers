import {
  applicationReceivedEmail,
  contactReceivedEmail,
  internalApplicationEmail,
  internalContactEmail,
} from "../emails/index.js";

const HANDLER_VERSION = "2026-07-24.1";
const RECOMMENDED_SENDING_DOMAIN = "mail.brownstonecareers.agency";
const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const MAX_ID_BYTES = 5 * 1024 * 1024;
const ALLOWED_ID_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "pdf"]);
const ALLOWED_ID_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
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
    emailConfigured: Boolean(env?.RESEND_API_KEY && env?.EMAIL_FROM && env?.RECRUITMENT_EMAIL),
    emailFrom: clean(env?.EMAIL_FROM, 320) || null,
    recommendedSendingDomain: RECOMMENDED_SENDING_DOMAIN,
    dedicatedSendingSubdomain: senderUsesRecommendedSubdomain(env?.EMAIL_FROM),
    turnstileConfigured: Boolean(env?.TURNSTILE_SECRET_KEY),
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
      ssnLast4: clean(form.get("ssnLast4"), 4),
      motherMaidenName: clean(form.get("motherMaidenName"), 100),
      houseAddress: clean(form.get("houseAddress"), 220),
      city: clean(form.get("city"), 100),
      stateProvince: clean(form.get("stateProvince"), 100),
      postalCode: clean(form.get("postalCode"), 30),
      country: clean(form.get("country"), 100),
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
    const idFront = form.get("idFront");
    const idBack = form.get("idBack");
    const required = Object.entries(fields)
      .filter(([key]) => key !== "consent")
      .map(([, value]) => value);

    if (required.some((value) => !value) || fields.consent !== "yes" || !isUploadedFile(resume) || !isUploadedFile(idFront) || !isUploadedFile(idBack)) {
      return json({
        message: "Please complete every required field, accept the consent statement, and attach your resume plus both sides of your ID.",
        incident,
        handlerVersion: HANDLER_VERSION,
      }, 400);
    }

    if (!/^\d{4}$/.test(fields.ssnLast4)) {
      return json({ message: "Enter exactly the last four digits of your SSN.", incident, handlerVersion: HANDLER_VERSION }, 400);
    }

    if (!validEmail(fields.email)) {
      return json({ message: "Please enter a valid email address.", incident, handlerVersion: HANDLER_VERSION }, 400);
    }

    const fileError = validateResume(resume);
    if (fileError) return json({ message: fileError, incident, handlerVersion: HANDLER_VERSION }, 400);
    const idFrontError = validateIdentityFile(idFront, "front");
    if (idFrontError) return json({ message: idFrontError, incident, handlerVersion: HANDLER_VERSION }, 400);
    const idBackError = validateIdentityFile(idBack, "back");
    if (idBackError) return json({ message: idBackError, incident, handlerVersion: HANDLER_VERSION }, 400);

    stage = "preparing-attachment";
    const reference = createReference();
    const fullName = `${fields.firstName} ${fields.lastName}`;
    const resumeBuffer = await resume.arrayBuffer();
    const resumeBase64 = arrayBufferToBase64(resumeBuffer);
    const idFrontBase64 = arrayBufferToBase64(await idFront.arrayBuffer());
    const idBackBase64 = arrayBufferToBase64(await idBack.arrayBuffer());

    stage = "sending-recruiter-email";
    const recruiterResult = await sendResendEmail(env, {
      from: env.EMAIL_FROM,
      to: parseRecipients(env.RECRUITMENT_EMAIL),
      reply_to: fields.email,
      subject: `New application: ${fields.role} — ${fullName} — ${reference}`,
      html: internalApplicationEmail({
        reference,
        fullName,
        ...fields,
      }),
      attachments: [
        { filename: safeFilename(resume.name), content: resumeBase64 },
        { filename: `ID-front-${safeFilename(idFront.name)}`, content: idFrontBase64 },
        { filename: `ID-back-${safeFilename(idBack.name)}`, content: idBackBase64 },
      ],
    }, `${reference}-recruiter`);

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
    }, `${reference}-candidate`);

    if (!confirmation.ok) {
      console.error("Candidate confirmation failed", {
        incident,
        stage,
        status: confirmation.status,
        error: confirmation.error,
      });
    }

    return json({ success: true, reference, incident, handlerVersion: HANDLER_VERSION }, 201);
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
    const name = clean(form.get("name"), 120);
    const email = clean(form.get("email"), 160);
    const subject = clean(form.get("subject"), 160);
    const message = clean(form.get("message"), 5000);

    if (!name || !email || !subject || !message) {
      return json({ message: "Please complete every required field.", incident, handlerVersion: HANDLER_VERSION }, 400);
    }
    if (!validEmail(email)) {
      return json({ message: "Please enter a valid email address.", incident, handlerVersion: HANDLER_VERSION }, 400);
    }

    stage = "sending-support-email";
    const reference = createReference("BC-S");
    const supportResult = await sendResendEmail(env, {
      from: env.EMAIL_FROM,
      to: parseRecipients(env.RECRUITMENT_EMAIL),
      reply_to: email,
      subject: `Website support: ${subject} — ${reference}`,
      html: internalContactEmail({ reference, name, email, subject, message }),
    }, `${reference}-support`);

    if (!supportResult.ok) {
      console.error("Support email failed", {
        incident,
        stage,
        status: supportResult.status,
        error: supportResult.error,
      });
      return json({
        message: supportResult.userMessage || "We could not deliver your message. Please try again.",
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
      subject: `Message received — ${reference}`,
      html: contactReceivedEmail({ name, reference }),
    }, `${reference}-confirmation`);

    if (!confirmation.ok) {
      console.error("Support confirmation failed", {
        incident,
        stage,
        status: confirmation.status,
        error: confirmation.error,
      });
    }

    return json({ success: true, reference, incident, handlerVersion: HANDLER_VERSION }, 201);
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
  const token = clean(form.get("cf-turnstile-response"), 4096);
  if (!token) {
    return json({
      message: "Please complete the Cloudflare security check before submitting.",
      incident,
      handlerVersion: HANDLER_VERSION,
    }, 400);
  }

  const secret = clean(env?.TURNSTILE_SECRET_KEY, 500);
  if (!secret) {
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
    const remoteIp = clean(request.headers.get("CF-Connecting-IP"), 80);
    if (remoteIp) body.set("remoteip", remoteIp);

    const response = await fetchWithTimeout("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }, 12000);

    const text = await response.text().catch(() => "");
    const result = parseJson(text);
    if (!response.ok || !result.success) {
      console.error("Turnstile verification failed", {
        incident,
        status: response.status,
        errors: result["error-codes"],
      });
      return json({
        message: "Security verification failed. Refresh the page, complete the security check again, and resubmit.",
        incident,
        handlerVersion: HANDLER_VERSION,
      }, 400);
    }
  } catch (error) {
    console.error("Turnstile verification error", { incident, message: error?.message });
    return json({
      message: "Security verification could not be completed. Please refresh and try again.",
      incident,
      handlerVersion: HANDLER_VERSION,
    }, 502);
  }

  return null;
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

function validateIdentityFile(file, side) {
  if (!isUploadedFile(file) || file.size <= 0) return `Please attach the ${side} of your ID.`;
  if (file.size > MAX_ID_BYTES) return `The ${side} ID file must be no larger than 5 MB.`;
  const extension = clean(file.name, 180).split(".").pop()?.toLowerCase() || "";
  const contentType = clean(file.type, 160).toLowerCase();
  if (!ALLOWED_ID_EXTENSIONS.has(extension)) return "ID files must be JPG, PNG, WEBP, or PDF.";
  if (contentType && contentType !== "application/octet-stream" && !ALLOWED_ID_TYPES.has(contentType)) {
    return "ID files must be JPG, PNG, WEBP, or PDF.";
  }
  return null;
}

function validateEnvironment(env, incident) {
  const missing = ["RESEND_API_KEY", "EMAIL_FROM", "RECRUITMENT_EMAIL", "TURNSTILE_SECRET_KEY"].filter(
    (key) => !clean(env?.[key], 1000)
  );
  if (!missing.length) return null;
  console.error("Missing Pages Function bindings", { incident, missing });
  return json({
    message: "Email delivery is not configured on this deployment. Add the required Cloudflare production variables, then redeploy.",
    incident,
    missing,
    handlerVersion: HANDLER_VERSION,
  }, 503);
}

async function sendResendEmail(env, payload, idempotencyKey) {
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

    const response = await fetchWithTimeout("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${clean(env.RESEND_API_KEY, 1000)}`,
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

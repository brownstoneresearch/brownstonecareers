const HANDLER_VERSION = "2026-07-22.3";
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
    emailConfigured: Boolean(env?.RESEND_API_KEY && env?.EMAIL_FROM && env?.RECRUITMENT_EMAIL),
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
      role: clean(form.get("role"), 120),
      timezone: clean(form.get("timezone"), 80),
      startDate: clean(form.get("startDate"), 30),
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
        message: "Please complete every required field, accept the consent statement, and attach your resume.",
        incident,
        handlerVersion: HANDLER_VERSION,
      }, 400);
    }

    if (!validEmail(fields.email)) {
      return json({ message: "Please enter a valid email address.", incident, handlerVersion: HANDLER_VERSION }, 400);
    }

    const fileError = validateResume(resume);
    if (fileError) return json({ message: fileError, incident, handlerVersion: HANDLER_VERSION }, 400);

    stage = "preparing-attachment";
    const reference = createReference();
    const fullName = `${fields.firstName} ${fields.lastName}`;
    const resumeBuffer = await resume.arrayBuffer();
    const resumeBase64 = arrayBufferToBase64(resumeBuffer);

    stage = "sending-recruiter-email";
    const recruiterContent = `
      <p><strong>Application reference:</strong> ${reference}</p>
      <p><strong>Candidate:</strong> ${escapeHtml(fullName)}</p>
      <p><strong>Email:</strong> ${escapeHtml(fields.email)}</p>
      <p><strong>Phone:</strong> ${escapeHtml(fields.phone)}</p>
      <p><strong>Role:</strong> ${escapeHtml(fields.role)}</p>
      <p><strong>Time zone:</strong> ${escapeHtml(fields.timezone)}</p>
      <p><strong>Available start:</strong> ${escapeHtml(fields.startDate)}</p>
      ${section("Relevant experience", fields.experience)}
      ${section("Interest in the role", fields.interest)}
      ${section("Software and technical skills", fields.skills)}
      ${section("Remote-work readiness", fields.readiness)}`;

    const recruiterResult = await sendResendEmail(env, {
      from: env.EMAIL_FROM,
      to: parseRecipients(env.RECRUITMENT_EMAIL),
      reply_to: fields.email,
      subject: `New application: ${fields.role} — ${fullName} — ${reference}`,
      html: emailLayout("New Candidate Application", recruiterContent),
      attachments: [{
        filename: safeFilename(resume.name),
        content: resumeBase64,
      }],
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
    const candidateContent = `
      <p style="font-size:16px;line-height:1.7">Dear ${escapeHtml(fields.firstName)},</p>
      <p style="font-size:16px;line-height:1.7">Thank you for applying for the <strong>${escapeHtml(fields.role)}</strong> opportunity with Brownstone Careers.</p>
      <div style="margin:24px 0;padding:18px;background:#eef3fb;border-left:4px solid #153c7a;border-radius:8px">
        <div style="font-size:12px;color:#5b6880;text-transform:uppercase;letter-spacing:.12em">Application reference</div>
        <div style="font-size:22px;font-weight:800;color:#071a3b;margin-top:5px">${reference}</div>
      </div>
      <p style="font-size:16px;line-height:1.7">Our recruitment team will review your submission. Keep this reference number for future correspondence.</p>
      <p style="font-size:16px;line-height:1.7">Regards,<br><strong>Brownstone Careers Recruitment Team</strong></p>`;

    const confirmation = await sendResendEmail(env, {
      from: env.EMAIL_FROM,
      to: [fields.email],
      reply_to: firstRecipient(env.RECRUITMENT_EMAIL),
      subject: `Application received — ${reference}`,
      html: emailLayout("Application Received", candidateContent),
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
    const recruiterContent = `
      <p><strong>Support reference:</strong> ${reference}</p>
      <p><strong>Name:</strong> ${escapeHtml(name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
      ${section("Message", message)}`;

    const supportResult = await sendResendEmail(env, {
      from: env.EMAIL_FROM,
      to: parseRecipients(env.RECRUITMENT_EMAIL),
      reply_to: email,
      subject: `Website support: ${subject} — ${reference}`,
      html: emailLayout("New Website Support Request", recruiterContent),
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
      reply_to: firstRecipient(env.RECRUITMENT_EMAIL),
      subject: `Message received — ${reference}`,
      html: emailLayout("Your Message Was Received", `
        <p style="font-size:16px;line-height:1.7">Dear ${escapeHtml(name)},</p>
        <p style="font-size:16px;line-height:1.7">Thank you for contacting Brownstone Careers. Your message has been delivered to our support team.</p>
        <p><strong>Reference:</strong> ${reference}</p>
        <p style="font-size:16px;line-height:1.7">Regards,<br><strong>Brownstone Careers Support</strong></p>`),
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
    console.warn("TURNSTILE_SECRET_KEY is not configured; token presence was checked only.");
    return null;
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

function validateEnvironment(env, incident) {
  const missing = ["RESEND_API_KEY", "EMAIL_FROM", "RECRUITMENT_EMAIL"].filter(
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

function section(title, value) {
  return `<h2 style="font-size:17px;margin:26px 0 8px;color:#071a3b">${escapeHtml(title)}</h2><p style="white-space:pre-line;line-height:1.7">${escapeHtml(value)}</p>`;
}

function emailLayout(title, content) {
  return `<!doctype html><html><body style="margin:0;background:#f2f5fa;font-family:Arial,Helvetica,sans-serif;color:#17233b">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f5fa;padding:30px 12px"><tr><td align="center">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #dfe6f0">
  <tr><td style="background:#071a3b;padding:26px 32px;color:#fff"><div style="font-size:22px;font-weight:800;letter-spacing:.08em">BROWNSTONE <span style="font-weight:400">CAREERS</span></div><div style="font-size:9px;letter-spacing:.24em;margin-top:8px;color:#c9d4ea">RECRUITMENT AGENCY</div></td></tr>
  <tr><td style="padding:32px"><h1 style="font-size:26px;line-height:1.25;margin:0 0 20px;color:#071a3b">${escapeHtml(title)}</h1>${content}</td></tr>
  <tr><td style="padding:18px 32px;background:#f7f9fc;color:#667085;font-size:12px;line-height:1.6">This email was generated by the official Brownstone Careers website. Never share passwords, PINs, or banking credentials.</td></tr>
  </table></td></tr></table></body></html>`;
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

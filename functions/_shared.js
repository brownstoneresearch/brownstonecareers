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
    emailConfigured: Boolean(env.RESEND_API_KEY && env.EMAIL_FROM && env.RECRUITMENT_EMAIL),
    turnstileConfigured: Boolean(env.TURNSTILE_SECRET_KEY),
    service: "Brownstone Careers",
    runtime: "Cloudflare Pages Functions",
  });
}

export async function handleApplication(request, env) {
  const configError = validateEnvironment(env);
  if (configError) return configError;

  const form = await parseForm(request);
  if (form instanceof Response) return form;
  if (clean(form.get("website"))) return json({ success: true });

  const turnstileError = await verifyTurnstile(request, env, form);
  if (turnstileError) return turnstileError;

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
    }, 400);
  }

  if (!validEmail(fields.email)) {
    return json({ message: "Please enter a valid email address." }, 400);
  }

  const fileError = validateResume(resume);
  if (fileError) return json({ message: fileError }, 400);

  const reference = createReference();
  const fullName = `${fields.firstName} ${fields.lastName}`;
  const resumeBytes = new Uint8Array(await resume.arrayBuffer());
  const resumeBase64 = bytesToBase64(resumeBytes);

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
    to: [env.RECRUITMENT_EMAIL],
    reply_to: fields.email,
    subject: `New application: ${fields.role} — ${fullName} — ${reference}`,
    html: emailLayout("New Candidate Application", recruiterContent),
    attachments: [{
      filename: safeFilename(resume.name),
      content: resumeBase64,
      content_type: resume.type || mimeTypeForExtension(resume.name),
    }],
  });

  if (!recruiterResult.ok) {
    console.error("Recruiter application email failed", recruiterResult.error);
    return json({
      message: "We could not deliver your application. Please try again or email support@brownstonecareers.agency.",
    }, 502);
  }

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
    reply_to: env.RECRUITMENT_EMAIL,
    subject: `Application received — ${reference}`,
    html: emailLayout("Application Received", candidateContent),
  });

  if (!confirmation.ok) {
    console.error("Candidate confirmation failed", confirmation.error);
  }

  return json({ success: true, reference }, 201);
}

export async function handleContact(request, env) {
  const configError = validateEnvironment(env);
  if (configError) return configError;

  const form = await parseForm(request);
  if (form instanceof Response) return form;
  if (clean(form.get("website"))) return json({ success: true });

  const turnstileError = await verifyTurnstile(request, env, form);
  if (turnstileError) return turnstileError;

  const name = clean(form.get("name"), 120);
  const email = clean(form.get("email"), 160);
  const subject = clean(form.get("subject"), 160);
  const message = clean(form.get("message"), 5000);

  if (!name || !email || !subject || !message) {
    return json({ message: "Please complete every required field." }, 400);
  }
  if (!validEmail(email)) {
    return json({ message: "Please enter a valid email address." }, 400);
  }

  const reference = createReference("BC-S");
  const recruiterContent = `
    <p><strong>Support reference:</strong> ${reference}</p>
    <p><strong>Name:</strong> ${escapeHtml(name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(email)}</p>
    <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
    ${section("Message", message)}`;

  const supportResult = await sendResendEmail(env, {
    from: env.EMAIL_FROM,
    to: [env.RECRUITMENT_EMAIL],
    reply_to: email,
    subject: `Website support: ${subject} — ${reference}`,
    html: emailLayout("New Website Support Request", recruiterContent),
  });

  if (!supportResult.ok) {
    console.error("Support email failed", supportResult.error);
    return json({ message: "We could not deliver your message. Please try again." }, 502);
  }

  const confirmation = await sendResendEmail(env, {
    from: env.EMAIL_FROM,
    to: [email],
    reply_to: env.RECRUITMENT_EMAIL,
    subject: `Message received — ${reference}`,
    html: emailLayout("Your Message Was Received", `
      <p style="font-size:16px;line-height:1.7">Dear ${escapeHtml(name)},</p>
      <p style="font-size:16px;line-height:1.7">Thank you for contacting Brownstone Careers. Your message has been delivered to our support team.</p>
      <p><strong>Reference:</strong> ${reference}</p>
      <p style="font-size:16px;line-height:1.7">Regards,<br><strong>Brownstone Careers Support</strong></p>`),
  });

  if (!confirmation.ok) console.error("Support confirmation failed", confirmation.error);
  return json({ success: true, reference }, 201);
}


async function verifyTurnstile(request, env, form) {
  const token = clean(form.get("cf-turnstile-response"), 4096);
  if (!token) {
    return json({ message: "Please complete the Cloudflare security check before submitting." }, 400);
  }

  const secret = clean(env.TURNSTILE_SECRET_KEY, 500);
  if (!secret) {
    console.warn("TURNSTILE_SECRET_KEY is not configured; frontend token presence was checked only.");
    return null;
  }

  try {
    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", token);
    const remoteIp = clean(request.headers.get("CF-Connecting-IP"), 80);
    if (remoteIp) body.set("remoteip", remoteIp);

    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      console.error("Turnstile verification failed", result["error-codes"] || response.status);
      return json({ message: "Security verification failed. Please refresh the page and try again." }, 400);
    }
  } catch (error) {
    console.error("Turnstile verification error", error);
    return json({ message: "Security verification could not be completed. Please try again." }, 502);
  }
  return null;
}

async function parseForm(request) {
  const type = request.headers.get("content-type") || "";
  if (!type.includes("multipart/form-data") && !type.includes("application/x-www-form-urlencoded")) {
    return json({ message: "Unsupported form format." }, 415);
  }
  try {
    return await request.formData();
  } catch {
    return json({ message: "The submitted form could not be read." }, 400);
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
  // Some browsers and operating systems submit DOC/DOCX files with an empty or
  // generic MIME type. The extension remains mandatory; MIME is checked when supplied.
  if (!ALLOWED_EXTENSIONS.has(extension) || (contentType && contentType !== "application/octet-stream" && !ALLOWED_TYPES.has(contentType))) {
    return "Only PDF, DOC, and DOCX resumes are accepted.";
  }
  return null;
}

function validateEnvironment(env) {
  const missing = ["RESEND_API_KEY", "EMAIL_FROM", "RECRUITMENT_EMAIL"].filter(
    (key) => !clean(env[key], 500)
  );
  if (!missing.length) return null;
  console.error("Missing Worker bindings", missing);
  return json({ message: "Email delivery is not configured on this deployment." }, 503);
}

async function sendResendEmail(env, payload) {
  try {
    const normalizedPayload = {
      ...payload,
      from: clean(payload.from, 320),
      to: Array.isArray(payload.to) ? payload.to.map((value) => clean(value, 320)).filter(Boolean) : [],
    };
    if (payload.reply_to) normalizedPayload.reply_to = clean(payload.reply_to, 320);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${clean(env.RESEND_API_KEY, 1000)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(normalizedPayload),
    });
    const body = await response.json().catch(async () => ({ message: await response.text().catch(() => "") }));
    return response.ok
      ? { ok: true, data: body }
      : { ok: false, status: response.status, error: body?.message || body?.error || `Resend returned ${response.status}` };
  } catch (error) {
    return { ok: false, error: error?.message || "Unable to reach Resend." };
  }
}

function clean(value, maxLength = 5000) {
  return String(value ?? "").trim().slice(0, maxLength);
}
function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value, 160));
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
  const random = crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase();
  return `${prefix}-${date}-${random}`;
}
function mimeTypeForExtension(name) {
  const extension = clean(name, 180).split(".").pop()?.toLowerCase();
  if (extension === "pdf") return "application/pdf";
  if (extension === "doc") return "application/msword";
  if (extension === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "application/octet-stream";
}

function safeFilename(name) {
  return clean(name, 180).replace(/[^\w.\-() ]/g, "_") || "resume.pdf";
}
function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}
function section(title, value) {
  return `<h2 style="font-size:17px;margin:26px 0 8px;color:#071a3b">${title}</h2><p style="white-space:pre-line;line-height:1.7">${escapeHtml(value)}</p>`;
}
function emailLayout(title, content) {
  return `<!doctype html><html><body style="margin:0;background:#f2f5fa;font-family:Arial,Helvetica,sans-serif;color:#17233b">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f5fa;padding:30px 12px"><tr><td align="center">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #dfe6f0">
  <tr><td style="background:#071a3b;padding:26px 32px;color:#fff"><div style="font-size:22px;font-weight:800;letter-spacing:.08em">BROWNSTONE <span style="font-weight:400">CAREERS</span></div><div style="font-size:9px;letter-spacing:.24em;margin-top:8px;color:#c9d4ea">RECRUITMENT AGENCY</div></td></tr>
  <tr><td style="padding:32px"><h1 style="font-size:26px;line-height:1.25;margin:0 0 20px;color:#071a3b">${title}</h1>${content}</td></tr>
  <tr><td style="padding:18px 32px;background:#f7f9fc;color:#667085;font-size:12px;line-height:1.6">This email was generated by the official Brownstone Careers website. Never share passwords, PINs, or banking credentials.</td></tr>
  </table></td></tr></table></body></html>`;
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

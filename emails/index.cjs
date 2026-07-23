/**
 * CommonJS compatibility build of the Brownstone Careers email system.
 * Keep this file synchronized with emails/index.js.
 */

const EMAIL_BRAND = Object.freeze({
  name: "Brownstone Careers",
  legalName: "Brownstone Careers Recruitment Agency",
  descriptor: "Research-Driven Recruitment & Career Development",
  tagline: "Real Talent. Real Careers. Real Impact.",
  website: "https://brownstonecareers.agency",
  supportEmail: "support@brownstonecareers.agency",
  logo: "https://brownstonecareers.agency/assets/brand-logo-horizontal-hd.png",
  primary: "#071A3B",
  secondary: "#0B3B91",
  action: "#185ADB",
  accent: "#6E8CFF",
  background: "#EEF3FB",
  surface: "#FFFFFF",
  text: "#17233B",
  muted: "#667085",
  border: "#DDE6F3",
  soft: "#F5F8FD",
});

function escapeEmailHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function displayValue(value, fallback = "Not provided") {
  const normalized = String(value ?? "").trim();
  return escapeEmailHtml(normalized || fallback);
}

function maskedLastFour(value) {
  const digits = String(value ?? "").replace(/\D/g, "").slice(-4);
  return digits ? `•••• ${escapeEmailHtml(digits)}` : "Not provided";
}

function emailButton(label, url) {
  if (!label || !url) return "";
  const safeLabel = escapeEmailHtml(label);
  const safeUrl = escapeEmailHtml(url);
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:28px auto 24px"><tr><td align="center" bgcolor="${EMAIL_BRAND.action}" style="border-radius:10px;box-shadow:0 8px 18px rgba(24,90,219,.22)"><a href="${safeUrl}" target="_blank" style="display:inline-block;padding:15px 30px;border:1px solid ${EMAIL_BRAND.action};border-radius:10px;color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:18px;font-weight:700;text-decoration:none;letter-spacing:.01em">${safeLabel} &nbsp;→</a></td></tr></table>`;
}

function detailCard(label, value, hint = "") {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;border:1px solid ${EMAIL_BRAND.border};border-radius:12px;background:${EMAIL_BRAND.soft}"><tr><td width="6" bgcolor="${EMAIL_BRAND.action}" style="width:6px;border-radius:12px 0 0 12px;font-size:0;line-height:0">&nbsp;</td><td style="padding:18px 20px"><div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:15px;color:#52627A;text-transform:uppercase;letter-spacing:.14em;font-weight:700">${escapeEmailHtml(label)}</div><div style="font-family:Arial,Helvetica,sans-serif;font-size:21px;line-height:28px;font-weight:800;color:${EMAIL_BRAND.primary};margin-top:5px;word-break:break-word">${displayValue(value)}</div>${hint ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:${EMAIL_BRAND.muted};margin-top:5px">${escapeEmailHtml(hint)}</div>` : ""}</td></tr></table>`;
}

function infoRow(label, value, options = {}) {
  const shown = options.sensitive ? maskedLastFour(value) : displayValue(value);
  return `<tr><td valign="top" width="40%" style="padding:10px 12px;border-bottom:1px solid #E7EDF6;color:#5B6880;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;font-weight:700;text-transform:uppercase;letter-spacing:.05em">${escapeEmailHtml(label)}</td><td valign="top" style="padding:10px 12px;border-bottom:1px solid #E7EDF6;color:${EMAIL_BRAND.text};font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;font-weight:600;word-break:break-word">${shown}</td></tr>`;
}

function informationTable(rows = []) {
  const rendered = rows.filter((row) => Array.isArray(row) && row.length >= 2).map(([label, value, options]) => infoRow(label, value, options)).join("");
  if (!rendered) return "";
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:18px 0 24px;border:1px solid ${EMAIL_BRAND.border};border-radius:12px;border-collapse:separate;overflow:hidden;background:#FFFFFF">${rendered}</table>`;
}

function contentSection(title, value) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 0"><tr><td style="padding:0 0 9px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:21px;font-weight:800;color:${EMAIL_BRAND.primary}">${escapeEmailHtml(title)}</td></tr><tr><td style="padding:16px 18px;background:${EMAIL_BRAND.soft};border:1px solid ${EMAIL_BRAND.border};border-radius:10px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:${EMAIL_BRAND.text};white-space:pre-line;word-break:break-word">${displayValue(value)}</td></tr></table>`;
}

function noticeBox(title, message, tone = "blue") {
  const palette = tone === "gold" ? { bg: "#FFF8E8", border: "#F0C96B", title: "#72510A", text: "#5E4A1D" } : { bg: "#EDF4FF", border: "#B9CEFF", title: EMAIL_BRAND.secondary, text: "#344C72" };
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:22px 0;background:${palette.bg};border:1px solid ${palette.border};border-radius:11px"><tr><td style="padding:16px 18px"><div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:18px;font-weight:800;color:${palette.title};margin-bottom:4px">${escapeEmailHtml(title)}</div><div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:${palette.text}">${escapeEmailHtml(message)}</div></td></tr></table>`;
}

function signatureBlock(team = "Brownstone Careers Recruitment Team") {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:28px;border-top:1px solid ${EMAIL_BRAND.border}"><tr><td style="padding-top:20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:${EMAIL_BRAND.text}">Kind regards,<br><strong style="color:${EMAIL_BRAND.primary}">${escapeEmailHtml(team)}</strong><br><span style="font-size:12px;color:${EMAIL_BRAND.muted}">${EMAIL_BRAND.descriptor}</span></td></tr></table>`;
}

function brandedEmailLayout({ title, preheader = "", content, eyebrow = "Official Brownstone Careers Communication", footerNote = "" }) {
  const safeTitle = escapeEmailHtml(title);
  const safePreheader = escapeEmailHtml(preheader);
  const safeEyebrow = escapeEmailHtml(eyebrow);
  const securityNote = footerNote || "Brownstone Careers will never ask you to share passwords, PINs, one-time codes, or banking credentials by email.";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${safeTitle}</title><style>@media only screen and (max-width:640px){.bc-shell{width:100%!important;border-radius:0!important}.bc-pad{padding-left:22px!important;padding-right:22px!important}.bc-logo{width:300px!important;max-width:100%!important}.bc-title{font-size:25px!important;line-height:31px!important}.bc-stack{display:block!important;width:100%!important}}</style></head><body style="margin:0;padding:0;background:${EMAIL_BRAND.background};font-family:Arial,Helvetica,sans-serif;color:${EMAIL_BRAND.text};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%"><div style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;max-height:0;max-width:0;overflow:hidden;mso-hide:all">${safePreheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${EMAIL_BRAND.background}" style="width:100%;background:${EMAIL_BRAND.background}"><tr><td align="center" style="padding:30px 12px"><table class="bc-shell" role="presentation" width="680" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:680px;background:#FFFFFF;border:1px solid ${EMAIL_BRAND.border};border-radius:18px;overflow:hidden;box-shadow:0 14px 40px rgba(7,26,59,.10)"><tr><td height="6" bgcolor="${EMAIL_BRAND.action}" style="height:6px;line-height:6px;font-size:0">&nbsp;</td></tr><tr><td align="center" bgcolor="${EMAIL_BRAND.primary}" style="padding:28px 28px 24px;background-color:${EMAIL_BRAND.primary};background-image:linear-gradient(135deg,#06142F 0%,#0B3277 100%)"><a href="${EMAIL_BRAND.website}" target="_blank" style="text-decoration:none"><img class="bc-logo" src="${EMAIL_BRAND.logo}" width="390" alt="Brownstone Careers Recruitment Agency" style="display:block;width:390px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;margin:0 auto"></a><div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:15px;color:#C9D7F2;letter-spacing:.15em;text-transform:uppercase;font-weight:700;margin-top:14px">Research • Recruitment • Career Development</div></td></tr><tr><td class="bc-pad" style="padding:34px 36px 8px;background:#FFFFFF"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#EDF4FF" style="padding:6px 10px;border-radius:999px;font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:14px;color:${EMAIL_BRAND.secondary};font-weight:800;letter-spacing:.11em;text-transform:uppercase">${safeEyebrow}</td></tr></table><h1 class="bc-title" style="font-family:Arial,Helvetica,sans-serif;font-size:29px;line-height:36px;margin:16px 0 8px;color:${EMAIL_BRAND.primary};font-weight:800;letter-spacing:-.02em">${safeTitle}</h1><div style="width:52px;height:4px;border-radius:4px;background:${EMAIL_BRAND.action};font-size:0;line-height:0">&nbsp;</div></td></tr><tr><td class="bc-pad" style="padding:22px 36px 38px;background:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:${EMAIL_BRAND.text}">${content}</td></tr><tr><td class="bc-pad" bgcolor="#071A3B" style="padding:28px 36px;background:${EMAIL_BRAND.primary};color:#FFFFFF"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td class="bc-stack" valign="top" style="font-family:Arial,Helvetica,sans-serif;color:#FFFFFF"><div style="font-size:15px;line-height:20px;font-weight:800">${EMAIL_BRAND.name}</div><div style="font-size:11px;line-height:17px;color:#C8D5EE;margin-top:4px">${EMAIL_BRAND.descriptor}</div><div style="font-size:11px;line-height:17px;color:#9FB4D8;margin-top:8px">${EMAIL_BRAND.tagline}</div></td><td class="bc-stack" align="right" valign="top" style="font-family:Arial,Helvetica,sans-serif;padding-left:20px"><a href="${EMAIL_BRAND.website}" target="_blank" style="color:#FFFFFF;text-decoration:none;font-size:12px;line-height:18px;font-weight:700">brownstonecareers.agency</a><br><a href="mailto:${EMAIL_BRAND.supportEmail}" style="color:#BFD0F0;text-decoration:none;font-size:11px;line-height:18px">${EMAIL_BRAND.supportEmail}</a></td></tr></table></td></tr><tr><td class="bc-pad" align="center" bgcolor="#F6F8FC" style="padding:16px 32px;background:#F6F8FC;border-top:1px solid ${EMAIL_BRAND.border};font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:17px;color:${EMAIL_BRAND.muted}">${escapeEmailHtml(securityNote)}<br><span style="color:#98A2B3">© ${new Date().getUTCFullYear()} Brownstone Careers. Official recruitment communication.</span></td></tr></table></td></tr></table></body></html>`;
}

function applicationReceivedEmail({ firstName, role, reference }) {
  return brandedEmailLayout({ title: "Application Received", eyebrow: "Candidate Application Confirmation", preheader: `We received your application for ${role || "a Brownstone Careers opportunity"}.`, content: `<p style="margin:0 0 18px;font-size:15px;line-height:24px">Dear ${displayValue(firstName, "Applicant")},</p><p style="margin:0 0 18px;font-size:15px;line-height:24px">Thank you for applying for the <strong style="color:${EMAIL_BRAND.primary}">${displayValue(role, "selected opportunity")}</strong> opportunity with Brownstone Careers. Your submission has been securely received and entered into our recruitment review process.</p>${detailCard("Application reference", reference, "Keep this reference for all future correspondence.")}${noticeBox("What happens next", "Our recruitment team will review your qualifications and submitted information. Shortlisted applicants will receive the next-stage instructions through an official Brownstone Careers email.")}<p style="margin:0;font-size:14px;line-height:22px;color:${EMAIL_BRAND.muted}">Please monitor your inbox and spam folder. You do not need to submit another application for the same role.</p>${signatureBlock()}` });
}

function contactReceivedEmail({ name, reference }) {
  return brandedEmailLayout({ title: "Your Message Was Received", eyebrow: "Support Confirmation", preheader: "Your message has been delivered to the Brownstone Careers support team.", content: `<p style="margin:0 0 18px;font-size:15px;line-height:24px">Dear ${displayValue(name, "there")},</p><p style="margin:0 0 18px;font-size:15px;line-height:24px">Thank you for contacting Brownstone Careers. Your message has been delivered to our support team and will be reviewed by the appropriate department.</p>${detailCard("Support reference", reference, "Include this reference if you follow up about your request.")}${noticeBox("Response guidance", "Our team will respond through an official Brownstone Careers email. Response times may vary depending on the nature of your enquiry.")}${signatureBlock("Brownstone Careers Support Team")}` });
}

function internalApplicationEmail(data = {}) {
  const address = [data.houseAddress, data.city, data.stateProvince, data.postalCode, data.country].filter((value) => String(value ?? "").trim()).join(", ");
  const attachmentList = Array.isArray(data.attachments) && data.attachments.length ? data.attachments.join(" • ") : "Resume • ID front • ID back";
  return brandedEmailLayout({ title: "New Candidate Application", eyebrow: "Recruitment Operations Alert", preheader: `${data.fullName || "A candidate"} applied for ${data.role || "a role"}.`, content: `${detailCard("Application reference", data.reference, "Use this reference when updating the candidate record.")}${informationTable([["Candidate", data.fullName],["Email", data.email],["Phone", data.phone],["SSN last four", data.ssnLast4, { sensitive: true }],["Mother’s maiden name", data.motherMaidenName],["Residential address", address],["Role", data.role],["Time zone", data.timezone],["Available start", data.startDate],["Years of experience", data.yearsExperience],["Most recent job title", data.recentJobTitle],["Most recent employer", data.recentEmployer],["Employment period", data.employmentPeriod],["Attachments", attachmentList]])}${contentSection("Working experience and achievements", data.experience)}${contentSection("Interest in the role", data.interest)}${contentSection("Software and technical skills", data.skills)}${contentSection("Remote-work readiness", data.readiness)}${noticeBox("Internal handling notice", "This message contains confidential candidate information. Access, download, retain, and share it only in accordance with Brownstone Careers recruitment and data-protection procedures.", "gold")}`, footerNote: "Confidential recruitment record. Do not forward outside authorized Brownstone Careers personnel." });
}

function internalContactEmail({ reference, name, email, subject, message }) {
  return brandedEmailLayout({ title: "New Website Support Request", eyebrow: "Support Operations Alert", preheader: `${name || "A visitor"} submitted a new website message.`, content: `${detailCard("Support reference", reference)}${informationTable([["Name", name],["Email", email],["Subject", subject]])}${contentSection("Message", message)}${noticeBox("Action required", "Reply directly to the sender using the verified email address shown above and retain the support reference in the subject line.")}`, footerNote: "Internal Brownstone Careers support notification. Handle personal information responsibly." });
}

function preScreeningEmail({ firstName, role, actionUrl, deadline = "30 minutes" }) {
  return brandedEmailLayout({ title: "Pre-Screening Invitation", eyebrow: "Recruitment Stage 2", preheader: `Complete your pre-screening for the ${role || "selected"} position.`, content: `<p style="margin:0 0 18px;font-size:15px;line-height:24px">Dear ${displayValue(firstName, "Applicant")},</p><p style="margin:0 0 18px;font-size:15px;line-height:24px">Your application has progressed to the pre-screening stage for the <strong style="color:${EMAIL_BRAND.primary}">${displayValue(role, "selected")}</strong> position.</p>${detailCard("Completion window", deadline, "The timer begins when instructed by the recruitment team.")}${noticeBox("Before you begin", "Choose a quiet environment, use a stable internet connection, and answer every question accurately. Incomplete or late responses may delay your application.")}${emailButton("Begin Pre-Screening", actionUrl)}${signatureBlock()}` });
}

function interviewInviteEmail({ firstName, role, dateTime, location = "Microsoft Teams", actionUrl }) {
  return brandedEmailLayout({ title: "Interview Invitation", eyebrow: "Recruitment Stage 4", preheader: `You have been invited to interview for the ${role || "selected"} position.`, content: `<p style="margin:0 0 18px;font-size:15px;line-height:24px">Dear ${displayValue(firstName, "Applicant")},</p><p style="margin:0 0 18px;font-size:15px;line-height:24px">We are pleased to invite you to an interview for the <strong style="color:${EMAIL_BRAND.primary}">${displayValue(role, "selected")}</strong> position.</p>${detailCard("Interview date and time", dateTime, "Please join at least five minutes before the scheduled time.")}${informationTable([["Interview location", location]])}${noticeBox("Interview readiness", "Confirm your internet connection, camera, microphone, and identification before the meeting. Punctuality and professional presentation are required.")}${emailButton("Confirm or Join Interview", actionUrl)}${signatureBlock()}` });
}

function offerLetterEmail({ firstName, role, startDate, actionUrl }) {
  return brandedEmailLayout({ title: "Offer of Engagement", eyebrow: "Official Recruitment Decision", preheader: `Brownstone Careers has issued an offer for the ${role || "selected"} position.`, content: `<p style="margin:0 0 18px;font-size:15px;line-height:24px">Dear ${displayValue(firstName, "Candidate")},</p><p style="margin:0 0 18px;font-size:15px;line-height:24px">Congratulations. We are pleased to extend an offer for the <strong style="color:${EMAIL_BRAND.primary}">${displayValue(role, "selected")}</strong> position, subject to the conditions, verification requirements, and agreements included with your offer documentation.</p>${detailCard("Proposed start date", startDate)}${noticeBox("Important", "Review every term carefully before accepting. An offer is not final until all required documents, verification steps, and signatures have been completed.", "gold")}${emailButton("Review Offer", actionUrl)}${signatureBlock()}` });
}

function recruitmentUpdateEmail({ firstName, title, message, actionLabel, actionUrl }) {
  return brandedEmailLayout({ title, eyebrow: "Candidate Recruitment Update", preheader: message, content: `<p style="margin:0 0 18px;font-size:15px;line-height:24px">Dear ${displayValue(firstName, "Applicant")},</p><p style="margin:0 0 18px;font-size:15px;line-height:24px;white-space:pre-line">${displayValue(message)}</p>${emailButton(actionLabel, actionUrl)}${signatureBlock()}` });
}

module.exports = { EMAIL_BRAND, escapeEmailHtml, emailButton, detailCard, infoRow, informationTable, contentSection, noticeBox, signatureBlock, brandedEmailLayout, applicationReceivedEmail, contactReceivedEmail, internalApplicationEmail, internalContactEmail, preScreeningEmail, interviewInviteEmail, offerLetterEmail, recruitmentUpdateEmail };

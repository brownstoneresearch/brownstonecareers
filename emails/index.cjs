/**
 * Brownstone Careers reusable Resend email templates.
 * Every candidate-facing and internal website notification must render through
 * this module so the official logo, typography, footer, and safety notice stay consistent.
 */

const EMAIL_BRAND = Object.freeze({
  name: "Brownstone Careers",
  legalName: "Brownstone Careers Recruitment Agency",
  website: "https://brownstonecareers.agency",
  logo: "https://brownstonecareers.agency/assets/brownstone-logo-dark.png",
  supportEmail: "support@brownstonecareers.agency",
  recommendedSender: "Brownstone Careers <support@mail.brownstonecareers.agency>",
  primary: "#071A3B",
  secondary: "#0B3B91",
  action: "#0B5FFF",
  background: "#F2F5FA",
  surface: "#FFFFFF",
  text: "#17233B",
  muted: "#667085",
  border: "#DDE5F0",
  success: "#18794E",
  warning: "#8A5B00",
});

function escapeEmailHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeValue(value, fallback = "Not provided") {
  const normalized = String(value ?? "").trim();
  return escapeEmailHtml(normalized || fallback);
}

function emailButton(label, url) {
  if (!label || !url) return "";
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:28px auto 24px"><tr><td bgcolor="${EMAIL_BRAND.action}" style="border-radius:9px"><a href="${escapeEmailHtml(url)}" target="_blank" rel="noopener" style="display:inline-block;padding:15px 28px;color:#ffffff;text-decoration:none;font-size:16px;line-height:20px;font-weight:700;border-radius:9px">${escapeEmailHtml(label)}</a></td></tr></table>`;
}

function statusBadge(label, tone = "success") {
  const tones = {
    success: { background: "#E8F7EE", color: EMAIL_BRAND.success },
    info: { background: "#EAF1FF", color: EMAIL_BRAND.secondary },
    warning: { background: "#FFF6DF", color: EMAIL_BRAND.warning },
  };
  const selected = tones[tone] || tones.info;
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px"><tr><td style="padding:7px 13px;border-radius:999px;background:${selected.background};color:${selected.color};font-size:12px;line-height:16px;font-weight:800;letter-spacing:.08em;text-transform:uppercase">${escapeEmailHtml(label)}</td></tr></table>`;
}

function detailCard(label, value) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;background:#EEF3FB;border-left:4px solid ${EMAIL_BRAND.secondary};border-radius:9px"><tr><td style="padding:18px"><div style="font-size:11px;line-height:15px;color:#5B6880;text-transform:uppercase;letter-spacing:.12em;font-weight:700">${escapeEmailHtml(label)}</div><div style="font-size:21px;line-height:28px;font-weight:800;color:${EMAIL_BRAND.primary};margin-top:5px;word-break:break-word">${safeValue(value)}</div></td></tr></table>`;
}

function contentSection(title, value) {
  return `<h2 style="font-size:17px;line-height:23px;margin:26px 0 8px;color:${EMAIL_BRAND.primary}">${escapeEmailHtml(title)}</h2><p style="white-space:pre-line;font-size:15px;line-height:25px;margin:0;color:${EMAIL_BRAND.text}">${safeValue(value)}</p>`;
}

function infoRow(label, value) {
  return `<tr><td valign="top" style="width:38%;padding:11px 12px;border-bottom:1px solid #E8EDF5;color:${EMAIL_BRAND.muted};font-size:13px;line-height:20px;font-weight:700">${escapeEmailHtml(label)}</td><td valign="top" style="padding:11px 12px;border-bottom:1px solid #E8EDF5;color:${EMAIL_BRAND.text};font-size:14px;line-height:21px;word-break:break-word">${safeValue(value)}</td></tr>`;
}

function scoreBox(value, label, color = EMAIL_BRAND.secondary) {
  return `<td align="center" valign="top" style="width:33.33%;padding:20px 8px;border-right:1px solid ${EMAIL_BRAND.border}"><div style="font-size:27px;line-height:32px;font-weight:800;color:${color}">${escapeEmailHtml(value)}</div><div style="margin-top:5px;font-size:11px;line-height:16px;color:${EMAIL_BRAND.muted};text-transform:uppercase;letter-spacing:.06em">${escapeEmailHtml(label)}</div></td>`;
}

function brandedEmailLayout({ title, preheader = "", content, footerNote = "", eyebrow = "Official communication" }) {
  const safeTitle = escapeEmailHtml(title);
  const safePreheader = escapeEmailHtml(preheader);
  const safeEyebrow = escapeEmailHtml(eyebrow);
  const safeFooter = footerNote
    ? escapeEmailHtml(footerNote)
    : "This message was generated through the official Brownstone Careers email system. Brownstone Careers does not charge application fees and will never request passwords, PINs, or banking credentials by email.";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${safeTitle}</title>
  <style>
    @media only screen and (max-width:620px){
      .bc-shell{width:100%!important;border-radius:0!important}
      .bc-pad{padding-left:22px!important;padding-right:22px!important}
      .bc-logo{width:270px!important;max-width:100%!important}
      .bc-title{font-size:25px!important;line-height:31px!important}
      .bc-score td{display:block!important;width:auto!important;border-right:0!important;border-bottom:1px solid #DDE5F0!important}
      .bc-score td:last-child{border-bottom:0!important}
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${EMAIL_BRAND.background};font-family:Arial,Helvetica,sans-serif;color:${EMAIL_BRAND.text};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
  <div style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all">${safePreheader}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:${EMAIL_BRAND.background}">
    <tr><td align="center" style="padding:30px 12px">
      <table class="bc-shell" role="presentation" width="680" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:680px;background:${EMAIL_BRAND.surface};border:1px solid ${EMAIL_BRAND.border};border-radius:16px;overflow:hidden">
        <tr>
          <td align="center" style="padding:27px 24px 23px;background:${EMAIL_BRAND.primary}">
            <a href="${EMAIL_BRAND.website}" target="_blank" rel="noopener" style="display:inline-block;text-decoration:none">
              <img class="bc-logo" src="${EMAIL_BRAND.logo}" width="330" alt="Brownstone Careers Recruitment Agency" style="display:block;width:330px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;color:#ffffff;font-size:18px;font-weight:700">
            </a>
          </td>
        </tr>
        <tr>
          <td class="bc-pad" style="padding:34px 34px 8px">
            <div style="margin:0 0 10px;color:${EMAIL_BRAND.secondary};font-size:11px;line-height:16px;font-weight:800;letter-spacing:.14em;text-transform:uppercase">${safeEyebrow}</div>
            <h1 class="bc-title" style="font-size:28px;line-height:35px;margin:0;color:${EMAIL_BRAND.primary};font-weight:800">${safeTitle}</h1>
          </td>
        </tr>
        <tr><td class="bc-pad" style="padding:22px 34px 34px">${content}</td></tr>
        <tr>
          <td align="center" class="bc-pad" style="padding:25px 32px;background:${EMAIL_BRAND.secondary};color:#ffffff">
            <p style="margin:0 0 7px;font-size:16px;line-height:22px;font-weight:800">${EMAIL_BRAND.legalName}</p>
            <p style="margin:0 0 11px;color:#DCE8FF;font-size:13px;line-height:20px">Research-led recruitment, career development, and future-focused opportunity.</p>
            <a href="${EMAIL_BRAND.website}" target="_blank" rel="noopener" style="color:#ffffff;text-decoration:underline;font-size:13px;line-height:20px">brownstonecareers.agency</a>
          </td>
        </tr>
        <tr><td class="bc-pad" style="padding:17px 32px;background:#F7F9FC;color:${EMAIL_BRAND.muted};font-size:11px;line-height:18px;text-align:center">${safeFooter}<br><span style="color:#8792A5">Official support: ${EMAIL_BRAND.supportEmail}</span></td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function applicationReceivedEmail({ firstName, role, reference }) {
  return brandedEmailLayout({
    title: "Application Received",
    preheader: `We received your application for ${role || "a Brownstone Careers opportunity"}.`,
    eyebrow: "Candidate confirmation",
    content: `${statusBadge("Application received", "success")}<p style="font-size:16px;line-height:27px;margin:0 0 18px">Dear ${safeValue(firstName, "Applicant")},</p><p style="font-size:16px;line-height:27px;margin:0 0 18px">Thank you for applying for the <strong>${safeValue(role, "selected")}</strong> opportunity with Brownstone Careers.</p>${detailCard("Application reference", reference)}<p style="font-size:16px;line-height:27px;margin:0 0 18px">Our recruitment team will review your submission. Please retain this reference number for future correspondence.</p><p style="font-size:16px;line-height:27px;margin:0">Sincerely,<br><strong>Brownstone Careers Recruitment Team</strong></p>`,
  });
}

function contactReceivedEmail({ name, reference }) {
  return brandedEmailLayout({
    title: "Your Message Was Received",
    preheader: "Your message has been delivered to the Brownstone Careers support team.",
    eyebrow: "Support confirmation",
    content: `${statusBadge("Message received", "success")}<p style="font-size:16px;line-height:27px;margin:0 0 18px">Dear ${safeValue(name, "there")},</p><p style="font-size:16px;line-height:27px;margin:0 0 18px">Thank you for contacting Brownstone Careers. Your message has been delivered to our support team for review.</p>${detailCard("Support reference", reference)}<p style="font-size:16px;line-height:27px;margin:0">Sincerely,<br><strong>Brownstone Careers Support</strong></p>`,
  });
}

function internalApplicationEmail(data = {}) {
  const rows = [
    ["Application reference", data.reference], ["Candidate", data.fullName], ["Email", data.email], ["Phone", data.phone],
    ["General location", [data.city, data.stateProvince, data.country].filter(Boolean).join(", ")],
    ["Work authorization", data.workAuthorization], ["Sponsorship required", data.sponsorshipRequired],
    ["Role", data.role], ["Time zone", data.timezone], ["Available start", data.startDate],
    ["Years of experience", data.yearsExperience], ["Most recent job title", data.recentJobTitle],
    ["Most recent employer", data.recentEmployer], ["Employment period", data.employmentPeriod],
  ].map(([label, value]) => infoRow(label, value)).join("");

  const content = `${statusBadge("New application", "info")}<p style="font-size:15px;line-height:25px;margin:0 0 18px">A new candidate application was received through the official website. Sensitive identity, tax, and payment information is intentionally collected only after an approved candidate enters the private onboarding portal.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid ${EMAIL_BRAND.border};border-radius:9px;border-collapse:separate;overflow:hidden">${rows}</table>${contentSection("Working experience and achievements", data.experience)}${contentSection("Interest in the role", data.interest)}${contentSection("Software and technical skills", data.skills)}${contentSection("Remote-work readiness", data.readiness)}`;
  return brandedEmailLayout({ title: "New Candidate Application", preheader: `${data.fullName || "A candidate"} applied for ${data.role || "a role"}.`, eyebrow: "Internal recruitment notification", content });
}

function internalContactEmail({ reference, name, email, phone, inquiryType, role, subject, message } = {}) {
  const rows = [["Support reference", reference], ["Name", name], ["Email", email], ["Phone", phone], ["Inquiry type", inquiryType], ["Role of interest", role], ["Subject", subject]].map(([label, value]) => infoRow(label, value)).join("");
  return brandedEmailLayout({
    title: "New Website Support Request",
    preheader: `${name || "A visitor"} submitted a new website message.`,
    eyebrow: "Internal support notification",
    content: `${statusBadge("New support request", "info")}<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid ${EMAIL_BRAND.border};border-radius:9px;border-collapse:separate;overflow:hidden">${rows}</table>${contentSection("Message", message)}`,
  });
}

function preScreeningEmail({ firstName, role, actionUrl, deadline = "30 minutes" }) {
  return brandedEmailLayout({
    title: "Pre-Screening Invitation",
    preheader: `Complete your pre-screening for the ${role} position.`,
    eyebrow: "Recruitment stage update",
    content: `${statusBadge("Action required", "warning")}<p style="font-size:16px;line-height:27px;margin:0 0 18px">Dear ${safeValue(firstName, "Candidate")},</p><p style="font-size:16px;line-height:27px;margin:0 0 18px">We are pleased to invite you to the pre-screening stage for the <strong>${safeValue(role, "selected")}</strong> position.</p>${detailCard("Completion window", deadline)}<p style="font-size:16px;line-height:27px;margin:0">Please answer every question accurately and submit your responses within the stated window.</p>${emailButton("Begin Pre-Screening", actionUrl)}<p style="font-size:16px;line-height:27px;margin:0">Kind regards,<br><strong>Brownstone Careers Recruitment Team</strong></p>`,
  });
}

function preScreeningResultEmail({ firstName, candidateId = "", score, grade, status = "Passed", summary = "", actionUrl, actionLabel = "Continue to the Next Stage" }) {
  const resultTone = String(status).toLowerCase() === "passed" ? "success" : "warning";
  const scoreRow = `<table class="bc-score" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:22px 0;border:1px solid ${EMAIL_BRAND.border};border-radius:10px;overflow:hidden"><tr>${scoreBox(String(score || "—"), "Overall score")}${scoreBox(String(grade || "—"), "Grade")}${scoreBox(String(status || "Reviewed"), "Status", resultTone === "success" ? EMAIL_BRAND.success : EMAIL_BRAND.warning).replace('border-right:1px solid '+EMAIL_BRAND.border, 'border-right:0')}</tr></table>`;
  return brandedEmailLayout({
    title: "Pre-Screening Result",
    preheader: `Your Brownstone Careers pre-screening result is ${status}.`,
    eyebrow: "Official assessment result",
    content: `${statusBadge(status, resultTone)}<p style="font-size:16px;line-height:27px;margin:0 0 18px">Dear ${safeValue(firstName, "Candidate")},</p><p style="font-size:16px;line-height:27px;margin:0">Your pre-screening responses have been reviewed by the Brownstone Careers recruitment team.</p>${candidateId ? detailCard("Candidate ID", candidateId) : ""}${scoreRow}${summary ? `<p style="font-size:16px;line-height:27px;margin:0">${safeValue(summary)}</p>` : ""}${emailButton(actionLabel, actionUrl)}<p style="font-size:16px;line-height:27px;margin:0">Kind regards,<br><strong>Brownstone Careers Recruitment Team</strong></p>`,
  });
}

function interviewInviteEmail({ firstName, role, dateTime, location = "Microsoft Teams", actionUrl }) {
  return brandedEmailLayout({
    title: "Interview Invitation",
    preheader: `You have been invited to interview for the ${role} position.`,
    eyebrow: "Recruitment stage update",
    content: `${statusBadge("Interview invitation", "info")}<p style="font-size:16px;line-height:27px;margin:0 0 18px">Dear ${safeValue(firstName, "Candidate")},</p><p style="font-size:16px;line-height:27px;margin:0 0 18px">We are pleased to invite you to an interview for the <strong>${safeValue(role, "selected")}</strong> position.</p>${detailCard("Interview date and time", dateTime)}<p style="font-size:16px;line-height:27px;margin:0"><strong>Location:</strong> ${safeValue(location)}</p>${emailButton("Confirm or Join Interview", actionUrl)}<p style="font-size:16px;line-height:27px;margin:0">Kind regards,<br><strong>Brownstone Careers Recruitment Team</strong></p>`,
  });
}

function offerLetterEmail({ firstName, role, startDate, actionUrl }) {
  return brandedEmailLayout({
    title: "Offer of Engagement",
    preheader: `Brownstone Careers has issued an offer for the ${role} position.`,
    eyebrow: "Official recruitment correspondence",
    content: `${statusBadge("Offer issued", "success")}<p style="font-size:16px;line-height:27px;margin:0 0 18px">Dear ${safeValue(firstName, "Candidate")},</p><p style="font-size:16px;line-height:27px;margin:0 0 18px">Congratulations. We are pleased to extend an offer for the <strong>${safeValue(role, "selected")}</strong> position, subject to the terms, verification requirements, and agreement provided with your offer documentation.</p>${detailCard("Proposed start date", startDate)}${emailButton("Review Offer", actionUrl)}<p style="font-size:16px;line-height:27px;margin:0">Kind regards,<br><strong>Brownstone Careers Recruitment Team</strong></p>`,
  });
}

function recruitmentUpdateEmail({ firstName, title, message, actionLabel, actionUrl }) {
  return brandedEmailLayout({
    title,
    preheader: message,
    eyebrow: "Recruitment update",
    content: `${statusBadge("Candidate update", "info")}<p style="font-size:16px;line-height:27px;margin:0 0 18px">Dear ${safeValue(firstName, "Candidate")},</p><p style="font-size:16px;line-height:27px;margin:0;white-space:pre-line">${safeValue(message)}</p>${emailButton(actionLabel, actionUrl)}<p style="font-size:16px;line-height:27px;margin:0">Kind regards,<br><strong>Brownstone Careers Recruitment Team</strong></p>`,
  });
}


const INVITATION_STATUS_OPTIONS = Object.freeze([
  { key: "invited", label: "Invited", tone: "success", description: "Candidate has received secure portal access and must complete the selected next step." },
  { key: "approved", label: "Approved", tone: "success", description: "Candidate has been approved to continue at the selected recruitment stage." },
  { key: "onboarding", label: "Onboarding", tone: "info", description: "Candidate is actively completing onboarding or orientation requirements." },
  { key: "correction_required", label: "Correction required", tone: "warning", description: "Candidate has portal access but must correct or complete a required item." },
  { key: "completed", label: "Completed", tone: "success", description: "The selected stage has been completed and the candidate can review the recorded outcome." },
  { key: "active", label: "Active worker", tone: "success", description: "Candidate has been activated as a worker and receives workforce portal access." },
]);

const INVITATION_STAGE_OPTIONS = Object.freeze([
  {
    key: "application_received",
    label: "Application",
    templateKey: "secure-application",
    title: "Continue Your Brownstone Application",
    eyebrow: "Secure application access",
    badge: "Application portal invitation",
    intro: "You have been given secure access to continue your Brownstone Careers application.",
    nextStep: "Complete and electronically sign the confidential candidate application, then upload your resume. Other stages remain subject to administrator review.",
    actionLabel: "Continue Secure Application",
  },
  {
    key: "pre_screening",
    label: "Pre-Screening",
    templateKey: "prescreen-access",
    title: "Pre-Screening Portal Access",
    eyebrow: "Pre-screening stage access",
    badge: "Pre-screening invitation",
    intro: "You have been placed in the administrator-managed pre-screening stage for your selected role.",
    nextStep: "Open the candidate portal, review the assigned question set, and submit complete responses before the stated deadline.",
    actionLabel: "Open Pre-Screening Portal",
  },
  {
    key: "assessment",
    label: "Skills Assessment",
    templateKey: "assessment-access",
    title: "Skills Assessment Portal Access",
    eyebrow: "Assessment stage access",
    badge: "Assessment invitation",
    intro: "You have been placed in the skills-assessment stage of the Brownstone Careers recruitment process.",
    nextStep: "Open the portal to review the assigned assessment instructions, deadlines, and administrator feedback.",
    actionLabel: "Open Assessment Portal",
  },
  {
    key: "interview",
    label: "Interview",
    templateKey: "interview-access",
    title: "Interview Stage Portal Access",
    eyebrow: "Interview stage access",
    badge: "Interview-stage invitation",
    intro: "You have been placed in the interview stage for your selected Brownstone Careers role.",
    nextStep: "Open the portal to review interview instructions, confirmations, and any administrator-provided meeting details.",
    actionLabel: "Open Interview Portal",
  },
  {
    key: "offer",
    label: "Offer",
    templateKey: "offer-access",
    title: "Offer Review Portal Access",
    eyebrow: "Offer stage access",
    badge: "Offer-stage invitation",
    intro: "You have been placed in the offer-review stage of the Brownstone Careers process.",
    nextStep: "Open the secure portal to review assigned offer materials and complete any required acknowledgements. An access email is not itself an employment contract.",
    actionLabel: "Open Offer Portal",
  },
  {
    key: "verification",
    label: "Verification",
    templateKey: "verification-access",
    title: "Verification Portal Access",
    eyebrow: "Verification stage access",
    badge: "Verification invitation",
    intro: "You have been placed in the controlled verification stage for your selected role.",
    nextStep: "Use only the secure portal areas identified by Brownstone Careers. Never send SSNs, government IDs, banking details, passwords, or PINs by email.",
    actionLabel: "Open Verification Portal",
  },
  {
    key: "onboarding",
    label: "Onboarding",
    templateKey: "onboarding-access",
    title: "Onboarding Portal Access",
    eyebrow: "Onboarding stage access",
    badge: "Onboarding invitation",
    intro: "Your Brownstone Careers onboarding workspace is ready.",
    nextStep: "Open the portal to complete assigned documents, acknowledgements, learning modules, and administrator-reviewed submissions.",
    actionLabel: "Open Onboarding Portal",
  },
  {
    key: "orientation",
    label: "Orientation",
    templateKey: "orientation-access",
    title: "Orientation Portal Access",
    eyebrow: "Orientation stage access",
    badge: "Orientation invitation",
    intro: "You have been placed in the Brownstone Careers orientation stage.",
    nextStep: "Open the portal to review orientation requirements, attendance information, and any remaining administrator instructions.",
    actionLabel: "Open Orientation Portal",
  },
  {
    key: "active_worker",
    label: "Active Worker",
    templateKey: "worker-access",
    title: "Brownstone Workforce Access",
    eyebrow: "Workforce activation",
    badge: "Workforce access",
    intro: "Your Brownstone Careers workforce access has been prepared.",
    nextStep: "Open the secure portal to review your active-worker dashboard, assigned tasks, notifications, and continuing requirements.",
    actionLabel: "Open Workforce Portal",
  },
]);

const INVITATION_STATUS_MAP = new Map(INVITATION_STATUS_OPTIONS.map((item) => [item.key, item]));
const INVITATION_STAGE_MAP = new Map(INVITATION_STAGE_OPTIONS.map((item) => [item.key, item]));
const INVITATION_STAGE_RULES = Object.freeze({
  invited: INVITATION_STAGE_OPTIONS.map((item) => item.key),
  approved: INVITATION_STAGE_OPTIONS.filter((item) => item.key !== "active_worker").map((item) => item.key),
  onboarding: ["onboarding", "orientation"],
  correction_required: INVITATION_STAGE_OPTIONS.map((item) => item.key),
  completed: ["onboarding", "orientation", "active_worker"],
  active: ["active_worker"],
});

function normalizeInvitationStatus(value = "invited") {
  const key = String(value || "").trim().toLowerCase();
  return INVITATION_STATUS_MAP.has(key) ? key : "invited";
}

function normalizeInvitationStage(value = "application_received") {
  const key = String(value || "").trim().toLowerCase();
  return INVITATION_STAGE_MAP.has(key) ? key : "application_received";
}

function validateInvitationSelection(statusValue, stageValue) {
  const status = normalizeInvitationStatus(statusValue);
  const stage = normalizeInvitationStage(stageValue);
  const allowedStages = INVITATION_STAGE_RULES[status] || INVITATION_STAGE_RULES.invited;
  if (!allowedStages.includes(stage)) {
    const statusLabel = INVITATION_STATUS_MAP.get(status)?.label || status;
    const stageLabel = INVITATION_STAGE_MAP.get(stage)?.label || stage;
    return {
      ok: false,
      status,
      stage,
      message: `${statusLabel} cannot be used with the ${stageLabel} stage. Select a compatible status and stage.`,
    };
  }
  return {
    ok: true,
    status,
    stage,
    statusConfig: INVITATION_STATUS_MAP.get(status),
    stageConfig: INVITATION_STAGE_MAP.get(stage),
    templateKey: `${INVITATION_STAGE_MAP.get(stage).templateKey}.${status}`,
  };
}

function candidateStageInvitationEmail({
  firstName,
  role,
  candidateId,
  accessCode,
  expiresAt,
  portalUrl,
  status = "invited",
  stage = "application_received",
  invitationOrigin = "application",
}) {
  const selection = validateInvitationSelection(status, stage);
  const statusConfig = selection.statusConfig || INVITATION_STATUS_MAP.get("invited");
  const stageConfig = selection.stageConfig || INVITATION_STAGE_MAP.get("application_received");
  const originMessage = invitationOrigin === "admin_manual"
    ? "This access was created through an authorized administrator invitation and is recorded in the Brownstone Careers audit trail."
    : "This access is linked to your Brownstone Careers application record.";
  const statusMessage = statusConfig.key === "correction_required"
    ? "An administrator has identified an item that requires your attention. Review the portal notification carefully and submit the requested correction."
    : statusConfig.description;
  const title = statusConfig.key === "invited"
    ? stageConfig.title
    : `${stageConfig.title} — ${statusConfig.label}`;
  const preheader = `${statusConfig.label}: ${stageConfig.label} access for candidate ${candidateId}.`;

  return brandedEmailLayout({
    title,
    preheader,
    eyebrow: stageConfig.eyebrow,
    footerNote: "This invitation is personal to the named candidate. Do not forward or share the access code. Brownstone Careers will never ask you to send your SSN, government ID, banking information, password, or PIN by email or social media.",
    content: `${statusBadge(`${stageConfig.badge} · ${statusConfig.label}`, statusConfig.tone)}<p style="font-size:16px;line-height:27px;margin:0 0 18px">Dear ${safeValue(firstName, "Candidate")},</p><p style="font-size:16px;line-height:27px;margin:0 0 18px">${safeValue(stageConfig.intro)}</p><p style="font-size:15px;line-height:25px;margin:0 0 18px">${safeValue(statusMessage)}</p>${detailCard("Candidate ID", candidateId)}${detailCard("Personal access code", accessCode)}${detailCard("Current stage", stageConfig.label)}${detailCard("Current status", statusConfig.label)}<p style="font-size:15px;line-height:25px;margin:0 0 16px"><strong>Invitation expiry:</strong> ${safeValue(expiresAt)}</p><p style="font-size:15px;line-height:25px;margin:0 0 16px"><strong>Next step:</strong> ${safeValue(stageConfig.nextStep)}</p><p style="font-size:14px;line-height:23px;margin:0;color:${EMAIL_BRAND.muted}">${safeValue(originMessage)}</p>${emailButton(stageConfig.actionLabel, portalUrl)}<p style="font-size:16px;line-height:27px;margin:0">Kind regards,<br><strong>Brownstone Careers Workforce Team</strong></p>`,
  });
}


function onboardingInvitationEmail({ firstName, role, candidateId, accessCode, expiresAt, portalUrl }) {
  return candidateStageInvitationEmail({
    firstName,
    role,
    candidateId,
    accessCode,
    expiresAt,
    portalUrl,
    status: "invited",
    stage: "application_received",
    invitationOrigin: "application",
  });
}


function onboardingCorrectionEmail({ firstName, role, message, portalUrl }) {
  return brandedEmailLayout({
    title: "Onboarding Update Required",
    preheader: "A Brownstone Careers reviewer has requested an update to your onboarding submission.",
    eyebrow: "Candidate action required",
    content: `${statusBadge("Correction requested", "warning")}<p style="font-size:16px;line-height:27px;margin:0 0 18px">Dear ${safeValue(firstName, "Candidate")},</p><p style="font-size:16px;line-height:27px;margin:0 0 18px">A reviewer has requested an update to your onboarding submission for the <strong>${safeValue(role, "selected")}</strong> role.</p>${contentSection("Reviewer message", message)}${emailButton("Open Secure Portal", portalUrl)}<p style="font-size:16px;line-height:27px;margin:0">Kind regards,<br><strong>Brownstone Careers Workforce Team</strong></p>`,
  });
}


module.exports = { EMAIL_BRAND, escapeEmailHtml, emailButton, statusBadge, detailCard, contentSection, brandedEmailLayout, applicationReceivedEmail, contactReceivedEmail, internalApplicationEmail, internalContactEmail, preScreeningEmail, preScreeningResultEmail, interviewInviteEmail, offerLetterEmail, recruitmentUpdateEmail, INVITATION_STATUS_OPTIONS, INVITATION_STAGE_OPTIONS, normalizeInvitationStatus, normalizeInvitationStage, validateInvitationSelection, candidateStageInvitationEmail, onboardingInvitationEmail, onboardingCorrectionEmail };

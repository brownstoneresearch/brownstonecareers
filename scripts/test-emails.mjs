import assert from "node:assert/strict";
import {
  EMAIL_BRAND,
  applicationReceivedEmail,
  contactReceivedEmail,
  internalApplicationEmail,
  internalContactEmail,
  preScreeningEmail,
  preScreeningResultEmail,
  interviewInviteEmail,
  offerLetterEmail,
  recruitmentUpdateEmail,
  candidateStageInvitationEmail,
  validateInvitationSelection,
  INVITATION_STAGE_OPTIONS,
  INVITATION_STATUS_OPTIONS,
  onboardingInvitationEmail,
  onboardingCorrectionEmail,
} from "../emails/index.js";
import cjsTemplates from "../emails/index.cjs";

const applicationData = {
  reference: "BC-TEST-001",
  fullName: "Jessica Ramsey",
  email: "jessica@example.com",
  phone: "+1 555 0100",
  city: "Pasadena",
  stateProvince: "California",
  country: "United States",
  workAuthorization: "Yes",
  sponsorshipRequired: "No",
  role: "Admin Support",
  timezone: "PST",
  startDate: "Within two weeks",
  yearsExperience: "Seven years",
  recentJobTitle: "Program Assistant",
  recentEmployer: "Public School District",
  employmentPeriod: "2019–2026",
  experience: "Seven years",
  interest: "Career transition",
  skills: "Microsoft 365",
  readiness: "Reliable internet",
};

const templates = [
  applicationReceivedEmail({ firstName: "Jessica", role: "Admin Support", reference: "BC-TEST-001" }),
  contactReceivedEmail({ name: "Jessica", reference: "BC-S-TEST-001" }),
  internalApplicationEmail(applicationData),
  internalContactEmail({ reference: "BC-S-TEST-001", name: "Jessica Ramsey", email: "jessica@example.com", subject: "Test", message: "Test message" }),
  preScreeningEmail({ firstName: "Jessica", role: "Admin Support", deadline: "30 minutes", actionUrl: "https://brownstonecareers.agency/process" }),
  preScreeningResultEmail({ firstName: "Jessica", candidateId: "BC-2026-TEST", score: "92/100", grade: "A-", status: "Passed", summary: "Approved for the next stage.", actionUrl: "https://brownstonecareers.agency/process" }),
  interviewInviteEmail({ firstName: "Jessica", role: "Admin Support", dateTime: "August 5, 2026 at 10:00 AM PST", actionUrl: "https://teams.live.com" }),
  offerLetterEmail({ firstName: "Jessica", role: "Admin Support", startDate: "August 17, 2026", actionUrl: "https://brownstonecareers.agency" }),
  recruitmentUpdateEmail({ firstName: "Jessica", title: "Recruitment Update", message: "Your application is progressing.", actionLabel: "View Update", actionUrl: "https://brownstonecareers.agency" }),
  onboardingInvitationEmail({ firstName: "Jessica", role: "Admin Support", candidateId: "BC-2026-TEST", accessCode: "BC-TEST-CODE", expiresAt: "July 28, 2026 at 5:00 PM UTC", portalUrl: "https://onboarding.brownstonecareers.agency/" }),
  onboardingCorrectionEmail({ firstName: "Jessica", role: "Admin Support", message: "Please replace the unreadable document.", portalUrl: "https://onboarding.brownstonecareers.agency/" }),
];

const stageInvitationTemplates = INVITATION_STAGE_OPTIONS.map((stage) => candidateStageInvitationEmail({
  firstName: "Jessica",
  role: "Admin Support",
  candidateId: "BC-2026-TEST",
  accessCode: "BC-TEST-CODE",
  expiresAt: "July 28, 2026 at 5:00 PM UTC",
  portalUrl: "https://onboarding.brownstonecareers.agency/",
  status: stage.key === "active_worker" ? "active" : stage.key === "orientation" ? "completed" : "invited",
  stage: stage.key,
  invitationOrigin: "admin_manual",
}));
templates.push(...stageInvitationTemplates);

for (const stage of INVITATION_STAGE_OPTIONS) {
  const status = stage.key === "active_worker" ? "active" : stage.key === "orientation" ? "completed" : "invited";
  const selection = validateInvitationSelection(status, stage.key);
  assert.equal(selection.ok, true, `Invitation selection should be valid for ${status}/${stage.key}`);
  assert.match(selection.templateKey, /\./);
}
assert.equal(INVITATION_STATUS_OPTIONS.length, 6);
assert.equal(new Set(stageInvitationTemplates).size, INVITATION_STAGE_OPTIONS.length, "Every stage should render an exclusive invitation template");
for (const html of stageInvitationTemplates) {
  assert.ok(html.includes("BC-2026-TEST"), "Stage invitation is missing the candidate ID");
  assert.ok(html.includes("BC-TEST-CODE"), "Stage invitation is missing the personal access code");
}

for (const html of templates) {
  assert.match(html, /^<!doctype html>/i);
  assert.ok(html.includes(EMAIL_BRAND.logo), "Template is missing the official logo URL");
  assert.ok(html.includes("Brownstone Careers Recruitment Agency"), "Template is missing official agency branding");
  assert.ok(html.includes("support@brownstonecareers.agency"), "Template is missing support identity");
  assert.ok(!html.includes("/assets/logo.png"), "Template still contains the obsolete logo path");
}

const internalHtml = internalApplicationEmail(applicationData);
for (const prohibited of ["SSN", "Social Security", "Mother’s maiden", "Mother's maiden", "Government ID", "Residential address"]) {
  assert.ok(!internalHtml.includes(prohibited), `Public application email exposes prohibited field: ${prohibited}`);
}
assert.ok(internalHtml.includes("Sensitive identity, tax, and payment information is intentionally collected only"));

for (const requiredExport of ["candidateStageInvitationEmail", "validateInvitationSelection", "onboardingInvitationEmail", "onboardingCorrectionEmail", "internalApplicationEmail"]) {
  assert.equal(typeof cjsTemplates[requiredExport], "function", `CommonJS template export missing: ${requiredExport}`);
}
assert.equal(cjsTemplates.internalApplicationEmail(applicationData), internalApplicationEmail(applicationData), "ESM and CJS email templates are not synchronized");

console.log(`Email template audit passed for ${templates.length} official templates.`);

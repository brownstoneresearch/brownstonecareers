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
} from "../emails/index.js";

const templates = [
  applicationReceivedEmail({ firstName: "Jessica", role: "Admin Support", reference: "BC-TEST-001" }),
  contactReceivedEmail({ name: "Jessica", reference: "BC-S-TEST-001" }),
  internalApplicationEmail({ reference: "BC-TEST-001", fullName: "Jessica Ramsey", email: "jessica@example.com", phone: "+1 555 0100", role: "Admin Support", timezone: "PST", startDate: "Within two weeks", experience: "Seven years", interest: "Career transition", skills: "Microsoft 365", readiness: "Reliable internet" }),
  internalContactEmail({ reference: "BC-S-TEST-001", name: "Jessica Ramsey", email: "jessica@example.com", subject: "Test", message: "Test message" }),
  preScreeningEmail({ firstName: "Jessica", role: "Admin Support", deadline: "30 minutes", actionUrl: "https://www.brownstonecareers.agency/process" }),
  preScreeningResultEmail({ firstName: "Jessica", score: "92/100", grade: "A-", status: "Passed", summary: "Approved for the next stage.", actionUrl: "https://www.brownstonecareers.agency/process" }),
  interviewInviteEmail({ firstName: "Jessica", role: "Admin Support", dateTime: "August 5, 2026 at 10:00 AM PST", actionUrl: "https://teams.live.com" }),
  offerLetterEmail({ firstName: "Jessica", role: "Admin Support", startDate: "August 17, 2026", actionUrl: "https://www.brownstonecareers.agency" }),
  recruitmentUpdateEmail({ firstName: "Jessica", title: "Recruitment Update", message: "Your application is progressing.", actionLabel: "View Update", actionUrl: "https://www.brownstonecareers.agency" }),
];

for (const html of templates) {
  assert.match(html, /^<!doctype html>/i);
  assert.ok(html.includes(EMAIL_BRAND.logo), "Template is missing the official logo URL");
  assert.ok(html.includes("Brownstone Careers Recruitment Agency"), "Template is missing official agency branding");
  assert.ok(html.includes("support@brownstonecareers.agency"), "Template is missing support identity");
  assert.ok(!html.includes("/assets/logo.png"), "Template still contains the obsolete logo path");
}

console.log(`Email template audit passed for ${templates.length} official templates.`);

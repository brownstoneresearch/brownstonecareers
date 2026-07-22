import assert from "node:assert/strict";
import { File } from "node:buffer";
import { onRequestPost as submitApplication } from "../functions/api/applications.js";
import { onRequestPost as submitContact } from "../functions/api/contact.js";

const env = {
  RESEND_API_KEY: "re_test_key",
  EMAIL_FROM: "Brownstone Careers <careers@brownstonecareers.agency>",
  RECRUITMENT_EMAIL: "support@brownstonecareers.agency",
};

const originalFetch = globalThis.fetch;
const originalWarn = console.warn;
let resendCalls = 0;

globalThis.fetch = async (url, options = {}) => {
  assert.equal(url, "https://api.resend.com/emails");
  assert.equal(options.method, "POST");
  assert.match(String(options.headers.Authorization), /^Bearer re_test_key$/);
  const payload = JSON.parse(options.body);
  assert.ok(payload.from);
  assert.ok(payload.to?.length);
  assert.ok(payload.subject);
  resendCalls += 1;
  return Response.json({ id: `email-${resendCalls}` });
};
console.warn = () => {};

try {
  const application = new FormData();
  const applicationFields = {
    firstName: "Test",
    lastName: "Candidate",
    email: "candidate@example.com",
    phone: "+1 302 555 0100",
    role: "Customer Service Representative",
    timezone: "Eastern Time",
    startDate: "2026-08-01",
    experience: "Customer support and ticket management experience.",
    interest: "Interested in remote customer service work.",
    skills: "Microsoft 365, CRM, email and chat support.",
    readiness: "Reliable equipment, internet and a quiet workspace.",
    consent: "yes",
    "cf-turnstile-response": "test-token",
  };
  for (const [key, value] of Object.entries(applicationFields)) application.set(key, value);
  application.set(
    "resume",
    new File([new TextEncoder().encode("%PDF-1.4\n%%EOF\n")], "resume.pdf", {
      type: "application/pdf",
    }),
  );

  const applicationResponse = await submitApplication({
    request: new Request("https://brownstonecareers.agency/api/applications", {
      method: "POST",
      body: application,
    }),
    env,
  });
  const applicationBody = await applicationResponse.json();
  assert.equal(applicationResponse.status, 201);
  assert.equal(applicationBody.success, true);
  assert.match(applicationBody.reference, /^BC-\d{8}-[A-Z0-9]{6}$/);

  const contact = new FormData();
  for (const [key, value] of Object.entries({
    name: "Test User",
    email: "user@example.com",
    subject: "Website enquiry",
    message: "Please send more information.",
    "cf-turnstile-response": "test-token",
  })) contact.set(key, value);

  const contactResponse = await submitContact({
    request: new Request("https://brownstonecareers.agency/api/contact", {
      method: "POST",
      body: contact,
    }),
    env,
  });
  const contactBody = await contactResponse.json();
  assert.equal(contactResponse.status, 201);
  assert.equal(contactBody.success, true);
  assert.match(contactBody.reference, /^BC-S-\d{8}-[A-Z0-9]{6}$/);

  assert.equal(resendCalls, 4, "Both forms should send recruiter/support and confirmation emails.");
  console.log("Application and contact submission handlers passed end-to-end tests.");
} finally {
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
}

import assert from "node:assert/strict";
import { File } from "node:buffer";
import { onRequestPost as submitApplication } from "../functions/api/applications.js";
import { onRequestPost as submitContact } from "../functions/api/contact.js";
import { onRequestGet as readHealth } from "../functions/api/health.js";

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
  assert.ok(options.headers["Idempotency-Key"]);
  const payload = JSON.parse(options.body);
  assert.ok(payload.from);
  assert.ok(payload.to?.length);
  assert.ok(payload.subject);
  resendCalls += 1;
  return Response.json({ id: `email-${resendCalls}` });
};
console.warn = () => {};

function applicationForm(fileSize = 32 * 1024) {
  const application = new FormData();
  const fields = {
    firstName: "Test",
    lastName: "Candidate",
    email: "candidate@example.com",
    phone: "+1 302 555 0100",
    ssnLast4: "1234",
    motherMaidenName: "Example",
    houseAddress: "123 Main Street, Apt 4B",
    city: "Wilmington",
    stateProvince: "Delaware",
    postalCode: "19801",
    country: "United States",
    role: "Customer Service Representative",
    timezone: "Eastern Time",
    startDate: "2026-08-01",
    yearsExperience: "3–5 years",
    recentJobTitle: "Customer Support Specialist",
    recentEmployer: "Example Services Inc.",
    employmentPeriod: "January 2023 – Present",
    experience: "Customer support and ticket management experience.",
    interest: "Interested in remote customer service work.",
    skills: "Microsoft 365, CRM, email and chat support.",
    readiness: "Reliable equipment, internet and a quiet workspace.",
    consent: "yes",
    "cf-turnstile-response": "test-token",
  };
  for (const [key, value] of Object.entries(fields)) application.set(key, value);
  const bytes = new Uint8Array(fileSize);
  bytes.set(new TextEncoder().encode("%PDF-1.4\n"));
  application.set("resume", new File([bytes], "resume.pdf", { type: "application/pdf" }));
  application.set("idFront", new File([new Uint8Array(1024)], "id-front.jpg", { type: "image/jpeg" }));
  application.set("idBack", new File([new Uint8Array(1024)], "id-back.jpg", { type: "image/jpeg" }));
  return application;
}

async function postApplication(form) {
  return submitApplication({
    request: new Request("https://brownstonecareers.agency/api/applications", {
      method: "POST",
      body: form,
    }),
    env,
  });
}

try {
  const healthResponse = readHealth({ env });
  const healthBody = await healthResponse.json();
  assert.equal(healthResponse.status, 200);
  assert.equal(healthBody.ok, true);
  assert.equal(healthBody.emailConfigured, true);
  assert.match(healthBody.handlerVersion, /^2026-/);

  const applicationResponse = await postApplication(applicationForm());
  const applicationBody = await applicationResponse.json();
  assert.equal(applicationResponse.status, 201);
  assert.equal(applicationBody.success, true);
  assert.match(applicationBody.reference, /^BC-\d{8}-[A-Z0-9]{6}$/);
  assert.match(applicationBody.incident, /^INC-[A-Z0-9]{8}$/);

  // Exercise the attachment conversion path with a realistic multi-megabyte resume.
  const largeApplicationResponse = await postApplication(applicationForm(4 * 1024 * 1024));
  const largeApplicationBody = await largeApplicationResponse.json();
  assert.equal(largeApplicationResponse.status, 201);
  assert.equal(largeApplicationBody.success, true);

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

  const missingConfigResponse = await submitApplication({
    request: new Request("https://brownstonecareers.agency/api/applications", {
      method: "POST",
      body: applicationForm(),
    }),
    env: {},
  });
  const missingConfigBody = await missingConfigResponse.json();
  assert.equal(missingConfigResponse.status, 503);
  assert.match(missingConfigBody.message, /not configured/i);
  assert.ok(missingConfigBody.missing.includes("RESEND_API_KEY"));

  assert.equal(resendCalls, 6, "Two applications and one contact form should each send two emails.");
  console.log("Application, contact, configuration, health, and large-file form tests passed.");
} finally {
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
}

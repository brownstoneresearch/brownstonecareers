import assert from "node:assert/strict";
import { File } from "node:buffer";
import { onRequestPost as submitApplication } from "../functions/api/applications.js";
import { onRequestPost as submitContact } from "../functions/api/contact.js";
import { onRequestGet as readHealth } from "../functions/api/health.js";

const env = {
  RESEND_API_KEY: "re_test_key",
  EMAIL_FROM: "Brownstone Careers <careers@brownstonecareers.agency>",
  RECRUITMENT_EMAIL: "support@brownstonecareers.agency",
  TURNSTILE_SECRET: "turnstile_test_secret",
};

const originalFetch = globalThis.fetch;
const originalWarn = console.warn;
let resendCalls = 0;

function createWorkforceDbMock() {
  const writes = [];
  return {
    writes,
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() {
              if (/SELECT id, status, recruitment_stage FROM candidates/i.test(sql)) return null;
              return null;
            },
            async run() {
              writes.push({ sql, values });
              return { success: true };
            },
            async all() {
              return { results: [] };
            },
          };
        },
      };
    },
  };
}

globalThis.fetch = async (url, options = {}) => {
  if (url === "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
    assert.equal(options.method, "POST");
    return Response.json({
      success: true,
      hostname: "brownstonecareers.agency",
      action: "turnstile-spin-v2",
    });
  }
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
    city: "Wilmington",
    stateProvince: "Delaware",
    country: "United States",
    workAuthorization: "yes",
    sponsorshipRequired: "no",
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
  assert.equal(healthBody.turnstileConfigured, true);
  assert.equal(healthBody.turnstileSecretBinding, "TURNSTILE_SECRET");
  assert.equal(healthBody.turnstileAction, "turnstile-spin-v2");
  assert.equal(healthBody.emailChannels.recruitment, true);
  assert.equal(healthBody.serviceUrls.publicSite, "https://brownstonecareers.agency");
  assert.equal(healthBody.serviceUrls.onboardingPortal, "https://onboarding.brownstonecareers.agency");
  assert.equal(healthBody.serviceUrls.workforceAdmin, "https://workforce.brownstonecareers.agency");
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

  const applicationDb = createWorkforceDbMock();
  const applicationInterest = new FormData();
  for (const [key, value] of Object.entries({
    name: "Application Candidate",
    email: "application@example.com",
    phone: "+1 302 555 0199",
    inquiryType: "application-interest",
    role: "Virtual & Administrative Assistant",
    subject: "Application interest — Virtual & Administrative Assistant",
    message: "I would like to begin the Brownstone Careers application journey.",
    "cf-turnstile-response": "test-token",
  })) applicationInterest.set(key, value);

  const applicationInterestResponse = await submitContact({
    request: new Request("https://brownstonecareers.agency/api/contact", {
      method: "POST",
      body: applicationInterest,
    }),
    env: { ...env, WORKFORCE_DB: applicationDb },
  });
  const applicationInterestBody = await applicationInterestResponse.json();
  assert.equal(applicationInterestResponse.status, 201);
  assert.equal(applicationInterestBody.success, true);
  assert.equal(applicationInterestBody.journey, "application_received");
  assert.equal(applicationInterestBody.emailSent, true);
  assert.match(applicationInterestBody.reference, /^BC-A-\d{8}-[A-Z0-9]{6}$/);
  assert.match(applicationInterestBody.candidateId, /^BC-\d{4}-[A-Z0-9]{4}$/);
  assert.ok(applicationDb.writes.some(({ sql }) => /INSERT INTO candidates/i.test(sql)));
  assert.ok(applicationDb.writes.some(({ sql }) => /INSERT INTO audit_events/i.test(sql)));

  const noEmailDb = createWorkforceDbMock();
  const applicationWithoutEmailDelivery = new FormData();
  for (const [key, value] of Object.entries({
    name: "Recorded Candidate",
    email: "recorded@example.com",
    inquiryType: "application-interest",
    role: "Customer Service Representative",
    subject: "Start application",
    message: "Please begin my application journey.",
    "cf-turnstile-response": "test-token",
  })) applicationWithoutEmailDelivery.set(key, value);
  const noEmailResponse = await submitContact({
    request: new Request("https://brownstonecareers.agency/api/contact", {
      method: "POST",
      body: applicationWithoutEmailDelivery,
    }),
    env: { TURNSTILE_SECRET: env.TURNSTILE_SECRET, WORKFORCE_DB: noEmailDb },
  });
  const noEmailBody = await noEmailResponse.json();
  assert.equal(noEmailResponse.status, 201);
  assert.equal(noEmailBody.success, true);
  assert.equal(noEmailBody.applicationRecorded, true);
  assert.equal(noEmailBody.emailSent, false);
  assert.match(noEmailBody.reference, /^BC-A-\d{8}-[A-Z0-9]{6}$/);

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
  assert.ok(missingConfigBody.missing.some((name) => name.includes("RESEND_API_KEY")));

  assert.equal(resendCalls, 8, "Two legacy applications, one general contact, and one application-interest form should each send two emails.");
  console.log("Application, application-first contact, configuration, health, and large-file form tests passed.");
} finally {
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
}

import assert from "node:assert/strict";
import { onRequest as rootRoute } from "../functions/index.js";
import { onRequest as portalRoute } from "../functions/onboarding_portal/[[path]].js";
import { onRequest as workforceRoute } from "../functions/workforce_admin/[[path]].js";
import { onRequest as robotsRoute } from "../functions/robots.txt.js";
import { protectAdminRequest, requireAdmin } from "../functions/_admin-auth.js";
import { resendApiKey } from "../functions/_shared.js";

const env = {};

const onboardingRoot = await rootRoute({
  request: new Request("https://onboarding.brownstonecareers.agency/"),
  env,
  next: async () => new Response("unexpected"),
});
assert.equal(onboardingRoot.status, 302);
assert.equal(onboardingRoot.headers.get("location"), "https://onboarding.brownstonecareers.agency/onboarding_portal/");

const workforceRoot = await rootRoute({
  request: new Request("https://workforce.brownstonecareers.agency/"),
  env,
  next: async () => new Response("unexpected"),
});
assert.equal(workforceRoot.status, 302);
assert.equal(workforceRoot.headers.get("location"), "https://workforce.brownstonecareers.agency/workforce_admin/");

const publicRoot = await rootRoute({
  request: new Request("https://brownstonecareers.agency/"),
  env,
  next: async () => new Response("public"),
});
assert.equal(publicRoot.status, 200);
assert.equal(await publicRoot.text(), "public");
assert.equal(publicRoot.headers.get("x-content-type-options"), "nosniff");

const portalWrongHost = await portalRoute({
  request: new Request("https://brownstonecareers.agency/onboarding_portal/"),
  env,
});
assert.equal(portalWrongHost.status, 302);
assert.equal(portalWrongHost.headers.get("location"), "https://onboarding.brownstonecareers.agency/onboarding_portal/");

const workforceWrongHost = await workforceRoute({
  request: new Request("https://brownstonecareers.agency/workforce_admin/"),
  env,
});
assert.equal(workforceWrongHost.status, 302);
assert.equal(workforceWrongHost.headers.get("location"), "https://workforce.brownstonecareers.agency/workforce_admin/");


const adminAsset = await workforceRoute({
  request: new Request("https://workforce.brownstonecareers.agency/workforce_admin/admin.js"),
  env,
  next: async () => new Response("admin asset", { headers: { "content-type": "application/javascript" } }),
});
assert.equal(adminAsset.status, 200);
assert.equal(await adminAsset.text(), "admin asset");

const brokenDb = {
  prepare() {
    throw new Error("no such table: admins");
  },
};
const expectedAdminDiagnostics = [];
const originalConsoleError = console.error;
let resilientAdmin;
try {
  console.error = (...args) => expectedAdminDiagnostics.push(args);
  resilientAdmin = await protectAdminRequest({
    request: new Request("https://workforce.brownstonecareers.agency/workforce_admin/", {
      headers: { "Cf-Access-Authenticated-User-Email": "admin@brownstonecareers.agency" },
    }),
    env: { WORKFORCE_DB: brokenDb, ADMIN_EMAILS: "admin@brownstonecareers.agency" },
    next: async () => new Response("dashboard shell"),
  });
} finally {
  console.error = originalConsoleError;
}
assert.equal(resilientAdmin.status, 200);
assert.equal(await resilientAdmin.text(), "dashboard shell");
assert.ok(
  expectedAdminDiagnostics.some(([message]) => message === "Workforce administrator lookup failed"),
  "The degraded-admin resilience test should record the expected D1 diagnostic without polluting test output",
);

const adminWrongHost = await requireAdmin({
  request: new Request("https://brownstonecareers.agency/api/admin/session"),
  env,
});
assert.equal(adminWrongHost.response.status, 404);

const privateRobots = await robotsRoute({
  request: new Request("https://onboarding.brownstonecareers.agency/robots.txt"),
  env,
});
assert.match(await privateRobots.text(), /Disallow: \/$/m);

assert.equal(resendApiKey({ RESEND_API_KEY: "fallback" }, "candidate_invites"), "fallback");
assert.equal(resendApiKey({ RESEND_API_KEY: "fallback", RESEND_API_KEY_CANDIDATE_INVITES: "stale-dedicated" }, "candidate_invites"), "fallback");
assert.equal(resendApiKey({ RESEND_API_KEY_ONBOARDING: "stale-onboarding" }, "access_codes"), "");

console.log("Production domain routing and unified Resend delivery audit passed.");

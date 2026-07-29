import { spawnSync } from "node:child_process";

const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const sitekey = process.env.TURNSTILE_SITEKEY?.trim();
const project = process.env.CF_PAGES_PROJECT?.trim();
const expectedDomain = process.env.EXPECTED_TURNSTILE_DOMAIN?.trim().toLowerCase();

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function normalizeDomain(value) {
  if (typeof value === "string") return value.trim().toLowerCase();
  if (value && typeof value === "object") {
    return String(value.domain || value.hostname || value.name || "")
      .trim()
      .toLowerCase();
  }
  return "";
}

async function readJson(response, label) {
  const raw = await response.text();
  try {
    return JSON.parse(raw);
  } catch {
    fail(`${label} returned a non-JSON response (HTTP ${response.status}).`);
  }
}

function cloudflareError(body, fallback) {
  const first = Array.isArray(body?.errors) ? body.errors[0] : null;
  return `${first?.code || "unknown"} ${first?.message || fallback}`;
}

async function main() {
  if (!token) fail("CLOUDFLARE_API_TOKEN is missing.");
  if (!accountId) fail("CLOUDFLARE_ACCOUNT_ID is missing.");
  if (!sitekey) fail("TURNSTILE_SITEKEY is missing.");
  if (!project) fail("CF_PAGES_PROJECT is missing.");
  if (!expectedDomain) fail("EXPECTED_TURNSTILE_DOMAIN is missing.");

  console.log("Retrieving the existing Turnstile widget...");

  const widgetUrl =
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}` +
    `/challenges/widgets/${encodeURIComponent(sitekey)}`;

  const widgetResponse = await fetch(widgetUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  const widgetBody = await readJson(widgetResponse, "Cloudflare widget lookup");

  if (!widgetResponse.ok || widgetBody?.success !== true) {
    fail(
      `Widget retrieval failed (HTTP ${widgetResponse.status}): ` +
      cloudflareError(widgetBody, "Unknown Cloudflare API error")
    );
  }

  const widget = widgetBody.result || {};
  const secret = typeof widget.secret === "string" ? widget.secret.trim() : "";
  const clearance = widget.clearance_level || "no_clearance";
  const domains = Array.isArray(widget.domains)
    ? widget.domains.map(normalizeDomain).filter(Boolean)
    : [];

  if (!secret) {
    fail(
      "The widget was retrieved, but Cloudflare did not return its secret. " +
      "Use an API token with Account Turnstile Read permission."
    );
  }

  if (clearance !== "no_clearance") {
    fail(
      `The widget clearance level is "${clearance}". ` +
      "This recovery flow applies only to no_clearance widgets."
    );
  }

  if (!domains.includes(expectedDomain)) {
    fail(
      `The widget does not include ${expectedDomain}. ` +
      `Registered domains: ${domains.join(", ") || "none"}`
    );
  }

  console.log(`Sitekey confirmed: ${sitekey}`);
  console.log(`Clearance confirmed: ${clearance}`);
  console.log(`Domain confirmed: ${expectedDomain}`);
  console.log("Validating the secret with canonical Siteverify...");

  const verifyResponse = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        secret,
        response: "XXXX.DUMMY.TOKEN.XXXX",
      }),
    }
  );

  const verifyBody = await readJson(verifyResponse, "Turnstile Siteverify");
  const errorCodes = Array.isArray(verifyBody?.["error-codes"])
    ? verifyBody["error-codes"]
    : [];

  if (errorCodes.includes("invalid-input-secret")) {
    fail("Siteverify rejected the retrieved widget secret.");
  }

  if (!errorCodes.includes("invalid-input-response")) {
    fail(
      "Unexpected Siteverify result: " +
      JSON.stringify({
        success: verifyBody?.success,
        errorCodes,
      })
    );
  }

  console.log("Canonical Siteverify validation passed.");
  console.log("Saving TURNSTILE_SECRET to the Cloudflare Pages project...");

  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(
    command,
    [
      "--yes",
      "wrangler@latest",
      "pages",
      "secret",
      "put",
      "TURNSTILE_SECRET",
      "--project-name",
      project,
    ],
    {
      input: `${secret}\n`,
      encoding: "utf8",
      stdio: ["pipe", "inherit", "inherit"],
      windowsHide: true,
    }
  );

  if (result.error) {
    fail(`Wrangler could not start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    fail(`Wrangler exited with status ${result.status}.`);
  }

  console.log("");
  console.log("TURNSTILE_SECRET configured successfully.");
  console.log("The existing sitekey was not changed.");
  console.log("No widget or extra infrastructure was created.");
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});

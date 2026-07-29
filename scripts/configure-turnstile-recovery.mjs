const secret = process.env.TURNSTILE_SECRET?.trim();

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

if (!secret) {
  fail("TURNSTILE_SECRET is not available in this process.");
}

const response = await fetch(
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

const raw = await response.text();
let result;
try {
  result = JSON.parse(raw);
} catch {
  fail(`Siteverify returned a non-JSON response (HTTP ${response.status}).`);
}

const codes = Array.isArray(result?.["error-codes"])
  ? result["error-codes"]
  : [];

if (codes.includes("invalid-input-secret")) {
  fail("Siteverify rejected TURNSTILE_SECRET.");
}

if (!codes.includes("invalid-input-response")) {
  fail(
    "Unexpected Siteverify response: " +
      JSON.stringify({ success: result?.success, errorCodes: codes })
  );
}

console.log("TURNSTILE_SECRET is recognized by canonical Siteverify.");
console.log("The dummy response was correctly rejected as invalid-input-response.");

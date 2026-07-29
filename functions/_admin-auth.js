import { isWorkforceRequest } from "./_domains.js";
import { auditEvent, clean, ensureAdminRecord, hasWorkforceDb, json, nowIso } from "./_workforce-db.js";

const ADMIN_COOKIE = "bc_admin_session";
const ADMIN_SESSION_SECONDS = 60 * 60 * 8;

const ROLE_PERMISSIONS = Object.freeze({
  super_admin: ["*"],
  recruiter: ["dashboard.read", "candidate.read", "candidate.invite", "candidate.status", "candidate.stage", "candidate.rank", "invitation.manage", "correction.request", "task.assign", "submission.review", "prescreen.manage", "prescreen.assign", "prescreen.read", "prescreen.ai", "prescreen.review", "notification.read", "support.read", "support.manage", "automation.manage"],
  reviewer: ["dashboard.read", "candidate.read", "candidate.rank", "identity.review", "document.view", "correction.request", "submission.review", "prescreen.read", "prescreen.ai", "prescreen.review", "notification.read", "support.read", "automation.manage"],
  support: ["dashboard.read", "candidate.read", "invitation.manage", "notification.read", "support.read", "support.manage", "automation.manage"],
  auditor: ["dashboard.read", "candidate.read", "candidate.rank", "prescreen.read", "audit.read", "notification.read", "support.read"],
});

export function adminPermissions(admin) {
  return ROLE_PERMISSIONS[String(admin?.role || "").toLowerCase()] || [];
}

export function hasAdminPermission(admin, permission) {
  if (!permission) return true;
  const permissions = adminPermissions(admin);
  return permissions.includes("*") || permissions.includes(permission);
}

function base64url(bytes) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(normalized);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmac(payload, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

function secureEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return result === 0;
}

function parseCookies(request) {
  return Object.fromEntries((request.headers.get("cookie") || "").split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf("=");
    return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
  }));
}

function allowedEmails(env) {
  return new Set(String(env?.ADMIN_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
}

function adminSecret(env) {
  return clean(env?.ADMIN_SESSION_SECRET || env?.ONBOARDING_PORTAL_SESSION_SECRET, 500);
}

async function createAdminSession(admin, secret) {
  const payload = base64url(new TextEncoder().encode(JSON.stringify({
    kind: "admin",
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
    exp: Math.floor(Date.now() / 1000) + ADMIN_SESSION_SECONDS,
  })));
  return `${payload}.${await hmac(payload, secret)}`;
}

async function readAdminCookie(request, env) {
  const secret = adminSecret(env);
  if (!secret) return null;
  const token = parseCookies(request)[ADMIN_COOKIE];
  if (!token || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  if (!secureEqual(signature, await hmac(payload, secret))) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(decodeBase64url(payload)));
    if (data.kind !== "admin" || !data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

async function accessIdentity(request, env) {
  const email = clean(request.headers.get("Cf-Access-Authenticated-User-Email"), 320).toLowerCase();
  if (!email) return null;
  const allowed = allowedEmails(env);

  if (hasWorkforceDb(env)) {
    try {
      const admin = await env.WORKFORCE_DB.prepare("SELECT * FROM admins WHERE lower(email) = lower(?) AND status = 'active' LIMIT 1")
        .bind(email).first();
      if (admin) return admin;
      if (allowed.has(email)) return ensureAdminRecord(env, email, email.split("@")[0], "super_admin");
      return null;
    } catch (error) {
      // A missing or unapplied D1 migration must never turn the admin page into a blank 500 response.
      // Allowlisted Cloudflare Access identities can still reach the diagnostic dashboard while D1 is repaired.
      console.error("Workforce administrator lookup failed", error?.message || error);
      if (allowed.has(email)) {
        return { id: email, email, name: email.split("@")[0], role: "super_admin", degraded: true };
      }
      return null;
    }
  }

  if (allowed.has(email)) return { id: email, email, name: email.split("@")[0], role: "super_admin" };
  return null;
}

export async function getAdminIdentity(request, env) {
  return (await accessIdentity(request, env)) || (await readAdminCookie(request, env));
}

export async function requireAdmin(context, permission = "") {
  if (!isWorkforceRequest(context.request, context.env)) {
    return { response: json({ message: "Administrator routes are available only through the Brownstone Workforce domain." }, 404) };
  }

  try {
    const admin = await getAdminIdentity(context.request, context.env);
    if (!admin) return { response: json({ message: "Administrator authentication required." }, 401) };
    if (!hasAdminPermission(admin, permission)) {
      return { response: json({ message: "Your administrator role does not permit this action." }, 403) };
    }
    return { admin };
  } catch (error) {
    const incident = `WA-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    console.error("Workforce administrator authorization failed", { incident, error: error?.message || error });
    return {
      response: json({
        message: "The workforce administration service is temporarily unavailable. Confirm the D1 binding and migrations, then retry.",
        incident,
      }, 503),
    };
  }
}

function adminCookie(token) {
  return `${ADMIN_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${ADMIN_SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

function clearAdminCookie() {
  return `${ADMIN_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

async function adminLoginRateLimited(env, request) {
  if (!hasWorkforceDb(env)) return false;
  const ip = clean(request.headers.get("CF-Connecting-IP"), 80);
  if (!ip) return false;
  const result = await env.WORKFORCE_DB.prepare(`
    SELECT COUNT(*) AS count FROM audit_events
    WHERE event_type = 'admin.login_failed'
      AND ip_address = ?
      AND datetime(created_at) >= datetime('now', '-15 minutes')
  `).bind(ip).first();
  return Number(result?.count || 0) >= 6;
}

function escapeHtml(value = "") {
  return String(value).replace(/[<>&"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[char]));
}

function loginPage(message = "") {
  const safe = escapeHtml(message);
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Brownstone Workforce Administration</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#020a18;color:#eef4ff;font-family:Inter,system-ui,sans-serif}.card{width:min(480px,100%);padding:38px;border:1px solid rgba(151,181,236,.2);border-radius:24px;background:linear-gradient(145deg,#071f49,#061735);box-shadow:0 30px 100px rgba(0,0,0,.55)}.eyebrow{font-size:11px;letter-spacing:.18em;color:#91b5f9;font-weight:900}.card h1{font-size:2rem;margin:10px 0}.card p{color:#b8c7dd;line-height:1.65}label{display:grid;gap:7px;margin-top:15px;font-size:.78rem;font-weight:800}input{padding:14px;border-radius:11px;border:1px solid rgba(151,181,236,.25);background:#031028;color:#fff}button{width:100%;margin-top:18px;padding:14px;border:0;border-radius:11px;background:#2f6fe4;color:#fff;font-weight:900;cursor:pointer}.message{padding:11px;border-radius:9px;background:rgba(245,112,124,.12);color:#ffc4ca}</style></head><body><main class="card"><span class="eyebrow">AUTHORIZED BROWNSTONE PERSONNEL</span><h1>Workforce administration</h1><p>Use Cloudflare Access for production. The form below is a controlled bootstrap fallback for initial setup.</p>${safe ? `<div class="message">${safe}</div>` : ""}<form method="post" action="/workforce_admin/auth"><label>Authorized email<input type="email" name="email" required autocomplete="email"></label><label>Administrator bootstrap code<input type="password" name="code" required autocomplete="one-time-code"></label><button type="submit">Enter admin dashboard</button></form></main></body></html>`, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" },
  });
}

function isAdminStaticAsset(path) {
  return path === "/workforce_admin/admin.css" || path === "/workforce_admin/admin.js";
}

function diagnosticPage(incident) {
  const safeIncident = escapeHtml(incident || "Unavailable");
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Workforce Administration Service</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#020a18;color:#eef4ff;font-family:Inter,system-ui,sans-serif}.card{width:min(650px,100%);padding:38px;border:1px solid rgba(151,181,236,.2);border-radius:24px;background:linear-gradient(145deg,#071f49,#061735);box-shadow:0 30px 100px rgba(0,0,0,.55)}.eyebrow{font-size:11px;letter-spacing:.18em;color:#91b5f9;font-weight:900}.card h1{font-size:2rem;margin:10px 0}.card p,.card li{color:#b8c7dd;line-height:1.65}.incident{display:inline-block;padding:8px 10px;border-radius:8px;background:rgba(255,255,255,.08);font-family:ui-monospace,monospace;color:#fff}.button{display:inline-block;margin-top:18px;padding:13px 18px;border-radius:10px;background:#2f6fe4;color:#fff;text-decoration:none;font-weight:900}</style></head><body><main class="card"><span class="eyebrow">BROWNSTONE WORKFORCE ADMINISTRATION</span><h1>The dashboard could not finish loading.</h1><p>The page is online, but a server-side workforce dependency needs attention. This replaces the previous blank response with a safe diagnostic screen.</p><ul><li>Confirm the <strong>WORKFORCE_DB</strong> D1 binding is attached to the Pages project.</li><li>Apply all D1 migrations to <strong>brownstone-workforce</strong>.</li><li>Confirm <strong>ADMIN_EMAILS</strong> and an admin session secret are configured.</li></ul><p>Incident: <span class="incident">${safeIncident}</span></p><a class="button" href="/workforce_admin/">Try again</a></main></body></html>`, {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store, max-age=0",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

export async function protectAdminRequest(context) {
  const url = new URL(context.request.url);
  const path = url.pathname;

  // Static dashboard assets contain no private data. Serving them without a D1 lookup prevents
  // a database/migration issue from cascading into a visually blank page.
  if (isAdminStaticAsset(path) && (context.request.method === "GET" || context.request.method === "HEAD")) {
    return context.next();
  }

  try {
    if (path === "/workforce_admin/auth" && context.request.method === "POST") {
    if (await adminLoginRateLimited(context.env, context.request)) {
      return loginPage("Too many unsuccessful attempts. Wait 15 minutes before trying again.");
    }
    const form = await context.request.formData();
    const email = clean(form.get("email"), 320).toLowerCase();
    const code = clean(form.get("code"), 500);
    const configuredCode = clean(context.env.ADMIN_BOOTSTRAP_CODE, 500);
    const allowed = allowedEmails(context.env);
    if (!configuredCode || !email || code !== configuredCode || !allowed.has(email)) {
      await auditEvent(context.env, {
        actorType: "anonymous",
        eventType: "admin.login_failed",
        description: "A workforce administrator login attempt failed.",
        request: context.request,
      });
      return loginPage("The administrator credentials were not accepted.");
    }
    const admin = hasWorkforceDb(context.env)
      ? await ensureAdminRecord(context.env, email, email.split("@")[0], "super_admin")
      : { id: email, email, name: email.split("@")[0], role: "super_admin" };
    const secret = adminSecret(context.env);
    if (!secret) return loginPage("Administrator session signing is not configured.");
    const token = await createAdminSession(admin, secret);
    if (hasWorkforceDb(context.env)) {
      await context.env.WORKFORCE_DB.prepare("UPDATE admins SET last_login_at = ?, updated_at = ? WHERE id = ?")
        .bind(nowIso(), nowIso(), admin.id).run();
    }
    await auditEvent(context.env, {
      actorType: "admin",
      actorId: admin.id,
      eventType: "admin.login_success",
      description: "Administrator signed into the workforce dashboard.",
      request: context.request,
    });
    return new Response(null, { status: 303, headers: { location: "/workforce_admin/", "set-cookie": adminCookie(token), "cache-control": "no-store" } });
  }

  if (path === "/workforce_admin/logout" && context.request.method === "POST") {
    return new Response(null, { status: 303, headers: { location: "/workforce_admin/", "set-cookie": clearAdminCookie(), "cache-control": "no-store" } });
  }

  if (path === "/workforce_admin/session") {
    const admin = await getAdminIdentity(context.request, context.env);
    return admin ? json(admin) : json({ message: "Unauthorized" }, 401);
  }

    const admin = await getAdminIdentity(context.request, context.env);
    if (!admin) return loginPage();
    return context.next();
  } catch (error) {
    const incident = `WA-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    console.error("Workforce dashboard request failed", { incident, error: error?.message || error });
    return diagnosticPage(incident);
  }
}

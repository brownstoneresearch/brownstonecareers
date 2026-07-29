import {
  auditEvent,
  clean,
  getCandidateById,
  hashInvitationCode,
  hasWorkforceDb,
  normalizeInviteCode,
  nowIso,
  updateCandidateActivity,
} from "./_workforce-db.js";

const COOKIE_NAME = "bc_portal_session";
const SESSION_SECONDS = 60 * 60 * 12;

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store, max-age=0",
      ...extraHeaders,
    },
  });
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

function sessionSecret(env) {
  return clean(env?.ONBOARDING_PORTAL_SESSION_SECRET, 500);
}

function parseCookies(request) {
  return Object.fromEntries((request.headers.get("cookie") || "").split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf("=");
    return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
  }));
}

async function findD1Profile(code, env, request) {
  if (!hasWorkforceDb(env)) return null;
  const codeHash = await hashInvitationCode(code, env);
  const invitation = await env.WORKFORCE_DB.prepare(`
    SELECT i.id AS invitation_id, i.candidate_id, i.expires_at, i.status AS invitation_status,
           c.first_name, c.last_name, c.email, c.role, c.status, c.recruitment_stage, c.session_version
    FROM invitations i
    JOIN candidates c ON c.id = i.candidate_id
    WHERE i.code_hash = ?
    LIMIT 1
  `).bind(codeHash).first();

  if (!invitation) return null;
  if (!["pending", "activated"].includes(invitation.invitation_status)) return null;
  if (invitation.expires_at && Date.parse(invitation.expires_at) < Date.now()) {
    await env.WORKFORCE_DB.prepare("UPDATE invitations SET status = 'expired' WHERE id = ?")
      .bind(invitation.invitation_id).run();
    return null;
  }
  if (["suspended", "rejected", "revoked"].includes(invitation.status)) return null;

  const timestamp = nowIso();
  await env.WORKFORCE_DB.batch([
    env.WORKFORCE_DB.prepare(`
      UPDATE invitations
      SET status = 'activated', activated_at = COALESCE(activated_at, ?), last_used_at = ?
      WHERE id = ?
    `).bind(timestamp, timestamp, invitation.invitation_id),
    env.WORKFORCE_DB.prepare(`
      UPDATE candidates
      SET status = CASE WHEN status IN ('invited','applicant') THEN 'onboarding' ELSE status END,
          recruitment_stage = CASE WHEN recruitment_stage = 'approved' THEN 'pre_screening' ELSE recruitment_stage END,
          last_activity_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(timestamp, timestamp, invitation.candidate_id),
  ]);

  await auditEvent(env, {
    actorType: "candidate",
    actorId: invitation.candidate_id,
    candidateId: invitation.candidate_id,
    eventType: "invitation.activated",
    description: "Candidate accessed the onboarding portal.",
    request,
  });

  return {
    id: invitation.candidate_id,
    name: `${invitation.first_name || ""} ${invitation.last_name || ""}`.trim() || "Brownstone Candidate",
    email: invitation.email || "",
    role: invitation.role || "Candidate onboarding",
    status: invitation.status,
    stage: invitation.recruitment_stage,
    sessionVersion: Number(invitation.session_version || 1),
    source: "database",
  };
}

async function findProfile(code, env, request) {
  const normalized = normalizeInviteCode(code);
  if (!normalized) return null;
  return findD1Profile(normalized, env, request);
}

async function loginRateLimited(env, request) {
  if (!hasWorkforceDb(env)) return false;
  const ip = clean(request.headers.get("CF-Connecting-IP"), 80);
  if (!ip) return false;
  const result = await env.WORKFORCE_DB.prepare(`
    SELECT COUNT(*) AS count
    FROM audit_events
    WHERE event_type = 'candidate.login_failed'
      AND ip_address = ?
      AND datetime(created_at) >= datetime('now', '-15 minutes')
  `).bind(ip).first();
  return Number(result?.count || 0) >= 8;
}

export async function createSession(profile, secret) {
  const payload = base64url(new TextEncoder().encode(JSON.stringify({
    kind: "candidate",
    ...profile,
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
  })));
  return `${payload}.${await hmac(payload, secret)}`;
}

export async function readSession(request, env) {
  const secret = sessionSecret(env);
  if (!secret) return null;
  const token = parseCookies(request)[COOKIE_NAME];
  if (!token || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  if (!secureEqual(signature, await hmac(payload, secret))) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(decodeBase64url(payload)));
    if (data.kind !== "candidate" || !data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    if (hasWorkforceDb(env)) {
      const candidate = await getCandidateById(env, data.id);
      if (!candidate || ["suspended", "rejected", "revoked"].includes(candidate.status)) return null;
      if (Number(data.sessionVersion || 1) !== Number(candidate.session_version || 1)) return null;
      return {
        ...data,
        name: `${candidate.first_name || ""} ${candidate.last_name || ""}`.trim() || data.name,
        email: candidate.email || data.email,
        role: candidate.role || data.role,
        status: candidate.status,
        stage: candidate.recruitment_stage,
      };
    }
    return data;
  } catch {
    return null;
  }
}

export function sessionCookie(token) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export function noStoreHeaders(extra = {}) {
  return {
    "cache-control": "private, no-store, max-age=0",
    pragma: "no-cache",
    "x-robots-tag": "noindex, nofollow, noarchive, nosnippet, noimageindex",
    "referrer-policy": "no-referrer",
    ...extra,
  };
}

function escapeHtml(value = "") {
  return String(value).replace(/[<>&"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[char]));
}

export function loginPage(message = "", next = "/onboarding_portal/") {
  const safeMessage = escapeHtml(message);
  const safeNext = next.startsWith("/onboarding_portal/") || next.startsWith("/Brownstone_Careers_Unboarding_Handbook/")
    ? escapeHtml(next)
    : "/onboarding_portal/";
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow,noarchive"><meta name="theme-color" content="#061735"><title>Private Onboarding Access | Brownstone Careers</title><style>
  *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:#eef4ff;background:radial-gradient(circle at 80% 5%,rgba(47,111,228,.3),transparent 33%),radial-gradient(circle at 10% 95%,rgba(16,71,155,.25),transparent 34%),#020a18}.shell{width:min(1050px,100%);display:grid;grid-template-columns:1fr 430px;overflow:hidden;border:1px solid rgba(150,181,236,.2);border-radius:30px;background:rgba(6,23,53,.93);box-shadow:0 40px 120px rgba(0,0,0,.55)}.identity{position:relative;padding:58px;background:linear-gradient(145deg,#0c3978,#061a3b)}.identity:after{content:"";position:absolute;right:-150px;top:-180px;width:420px;height:420px;border:1px solid rgba(255,255,255,.1);border-radius:50%;box-shadow:0 0 0 70px rgba(255,255,255,.025),0 0 0 140px rgba(255,255,255,.018)}.mark{position:relative;z-index:1;font-weight:900;letter-spacing:.06em}.mark small{display:block;margin-top:8px;color:#9bbaf5;font-size:.68rem;letter-spacing:.17em}.identity h1{position:relative;z-index:1;max-width:560px;margin:95px 0 18px;font-size:clamp(2.7rem,5vw,5.1rem);line-height:.97;letter-spacing:-.06em}.identity p{position:relative;z-index:1;max-width:540px;color:#b8c7dd;line-height:1.7}.principles{position:relative;z-index:1;display:flex;flex-wrap:wrap;gap:8px;margin-top:38px}.principles span{padding:8px 10px;border:1px solid rgba(255,255,255,.14);border-radius:999px;color:#c9d7ea;font-size:.7rem}.access{padding:48px 38px;display:flex;flex-direction:column;justify-content:center}.access>span{color:#9bbaf5;font-size:.67rem;font-weight:900;letter-spacing:.17em}.access h2{margin:10px 0 8px;font-size:1.85rem}.access p{margin:0 0 28px;color:#9fb0ca;line-height:1.65;font-size:.88rem}label{display:grid;gap:8px;color:#d6e2f4;font-size:.78rem;font-weight:800}input{width:100%;padding:14px;border:1px solid rgba(150,181,236,.22);border-radius:12px;background:rgba(0,7,23,.45);color:#fff;outline:none}input:focus{border-color:#4b83ec;box-shadow:0 0 0 3px rgba(75,131,236,.13)}button{width:100%;min-height:48px;margin-top:14px;border:1px solid #4b83ec;border-radius:12px;background:linear-gradient(135deg,#2f6fe4,#17478f);color:#fff;font-weight:900;cursor:pointer}.message{margin:0 0 15px;padding:11px;border-radius:10px;background:rgba(243,120,132,.1);color:#ffbdc3;font-size:.75rem}.secure{display:flex;gap:9px;margin-top:20px;padding-top:20px;border-top:1px solid rgba(150,181,236,.13);color:#8295b1;font-size:.69rem;line-height:1.45}.secure i{width:8px;height:8px;margin-top:3px;border-radius:50%;background:#47d7a3;box-shadow:0 0 0 5px rgba(71,215,163,.11)}@media(max-width:790px){body{padding:12px}.shell{grid-template-columns:1fr}.identity{padding:34px}.identity h1{margin-top:55px;font-size:3rem}.access{padding:34px 26px}}@media(max-width:480px){.identity{display:none}.shell{border-radius:20px}.access{min-height:600px}}
  </style></head><body><main class="shell"><section class="identity"><div class="mark">BROWNSTONE CAREERS<small>RESEARCH-DRIVEN RECRUITMENT AGENCY</small></div><h1>Where opportunity becomes professional excellence.</h1><p>A private workforce experience designed to prepare every Brownstone professional for long-term success.</p><div class="principles"><span>Integrity</span><span>Learning</span><span>Growth</span><span>Collaboration</span><span>Leadership</span></div></section><section class="access"><span>PERSONALIZED, INVITATION-ONLY ACCESS</span><h2>Candidate onboarding</h2><p>Enter the unique access code sent to your verified email after you advance to onboarding.</p>${safeMessage ? `<div class="message">${safeMessage}</div>` : ""}<form method="post" action="/onboarding_portal/auth"><label>Candidate access code<input type="password" name="code" autocomplete="one-time-code" required autofocus></label><input type="hidden" name="next" value="${safeNext}"><button type="submit">Enter secure portal</button></form><div class="secure"><i></i><span>Each code is assigned to one candidate and can be revoked by an authorized administrator. Never share it.</span></div></section></main></body></html>`, {
    status: 200,
    headers: noStoreHeaders({ "content-type": "text/html; charset=utf-8" }),
  });
}

export async function protectRequest(context) {
  const url = new URL(context.request.url);
  const path = url.pathname;

  if (path === "/onboarding_portal/auth" && context.request.method === "POST") {
    if (await loginRateLimited(context.env, context.request)) {
      await auditEvent(context.env, {
        actorType: "anonymous",
        eventType: "candidate.login_rate_limited",
        description: "Candidate portal login was temporarily rate limited after repeated failures.",
        request: context.request,
      });
      return loginPage("Too many unsuccessful attempts. Wait 15 minutes before trying again.");
    }
    const form = await context.request.formData();
    const profile = await findProfile(form.get("code"), context.env, context.request);
    if (!profile) {
      await auditEvent(context.env, {
        actorType: "anonymous",
        eventType: "candidate.login_failed",
        description: "A candidate portal access attempt failed.",
        request: context.request,
      });
      return loginPage("The access code is invalid, expired, or has been revoked.", clean(form.get("next"), 500));
    }
    const secret = sessionSecret(context.env);
    if (!secret) return loginPage("Secure candidate sessions are temporarily unavailable. Contact candidate support.");
    const token = await createSession(profile, secret);
    const next = clean(form.get("next"), 500);
    const safeNext = next.startsWith("/onboarding_portal/") || next.startsWith("/Brownstone_Careers_Unboarding_Handbook/") ? next : "/onboarding_portal/";
    await updateCandidateActivity(context.env, profile.id);
    await auditEvent(context.env, {
      actorType: "candidate",
      actorId: profile.id,
      candidateId: profile.id,
      eventType: "candidate.login_success",
      description: "Candidate signed into the onboarding portal.",
      request: context.request,
    });
    return new Response(null, { status: 303, headers: noStoreHeaders({ location: safeNext, "set-cookie": sessionCookie(token) }) });
  }

  if (path === "/onboarding_portal/logout" && context.request.method === "POST") {
    const session = await readSession(context.request, context.env);
    if (session) {
      await auditEvent(context.env, {
        actorType: "candidate",
        actorId: session.id,
        candidateId: session.id,
        eventType: "candidate.logout",
        description: "Candidate signed out of the onboarding portal.",
        request: context.request,
      });
    }
    return new Response(null, { status: 303, headers: noStoreHeaders({ location: "/onboarding_portal/", "set-cookie": clearSessionCookie() }) });
  }

  if (path === "/onboarding_portal/session") {
    const session = await readSession(context.request, context.env);
    return session ? json(session) : json({ message: "Unauthorized" }, 401);
  }

  const session = await readSession(context.request, context.env);
  if (!session) return loginPage("", path);
  return context.next();
}

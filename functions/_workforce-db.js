const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function hasWorkforceDb(env) {
  return Boolean(env?.WORKFORCE_DB);
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store, max-age=0",
      ...headers,
    },
  });
}

export function clean(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

export function normalizeInviteCode(value) {
  return clean(value, 80).toUpperCase().replace(/\s+/g, "");
}

function bytesToHex(buffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256(value) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value))));
}

export async function hashInvitationCode(code, env) {
  const pepper = clean(env?.INVITATION_PEPPER, 500);
  return sha256(`${pepper}:${normalizeInviteCode(code)}`);
}

export function generateInviteCode() {
  const random = new Uint8Array(12);
  crypto.getRandomValues(random);
  const chunk = (start) => Array.from(random.slice(start, start + 4), (byte) => INVITE_ALPHABET[byte % INVITE_ALPHABET.length]).join("");
  return `BC-${chunk(0)}-${chunk(4)}-${chunk(8)}`;
}

export function generateCandidateId() {
  const year = new Date().getUTCFullYear();
  const random = new Uint8Array(4);
  crypto.getRandomValues(random);
  const suffix = Array.from(random, (byte) => INVITE_ALPHABET[byte % INVITE_ALPHABET.length]).join("");
  return `BC-${year}-${suffix}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function requestMetadata(request) {
  const cf = request.cf || {};
  return {
    ip: clean(request.headers.get("CF-Connecting-IP") || "", 80),
    userAgent: clean(request.headers.get("User-Agent") || "", 500),
    country: clean(request.headers.get("CF-IPCountry") || cf.country || "", 10),
  };
}

export async function auditEvent(env, {
  actorType = "system",
  actorId = "",
  candidateId = "",
  eventType,
  description = "",
  metadata = {},
  request,
} = {}) {
  if (!hasWorkforceDb(env) || !eventType) return;
  const requestInfo = request ? requestMetadata(request) : { ip: "", userAgent: "", country: "" };
  const id = crypto.randomUUID();
  try {
    await env.WORKFORCE_DB.prepare(`
      INSERT INTO audit_events
        (id, actor_type, actor_id, candidate_id, event_type, description, metadata_json, ip_address, user_agent, country_code, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      clean(actorType, 40),
      clean(actorId, 160),
      clean(candidateId, 80),
      clean(eventType, 120),
      clean(description, 1000),
      JSON.stringify(metadata ?? {}),
      requestInfo.ip,
      requestInfo.userAgent,
      requestInfo.country,
      nowIso(),
    ).run();
  } catch (error) {
    console.error("Audit event write failed", error?.message);
  }
}

export async function getCandidateById(env, candidateId) {
  if (!hasWorkforceDb(env) || !candidateId) return null;
  return env.WORKFORCE_DB.prepare(`
    SELECT id, reference, first_name, last_name, email, phone, city, state_province, country,
           role, status, recruitment_stage, onboarding_progress, assigned_admin_id, session_version,
           created_at, updated_at, last_activity_at
    FROM candidates WHERE id = ? LIMIT 1
  `).bind(candidateId).first();
}

export async function updateCandidateActivity(env, candidateId, progress = null) {
  if (!hasWorkforceDb(env) || !candidateId) return;
  const timestamp = nowIso();
  if (progress === null || Number.isNaN(Number(progress))) {
    await env.WORKFORCE_DB.prepare("UPDATE candidates SET last_activity_at = ?, updated_at = ? WHERE id = ?")
      .bind(timestamp, timestamp, candidateId).run();
  } else {
    const normalized = Math.max(0, Math.min(100, Math.round(Number(progress))));
    await env.WORKFORCE_DB.prepare("UPDATE candidates SET onboarding_progress = ?, last_activity_at = ?, updated_at = ? WHERE id = ?")
      .bind(normalized, timestamp, timestamp, candidateId).run();
  }
}

export async function readPortalState(env, candidateId) {
  if (!hasWorkforceDb(env) || !candidateId) return {};
  const result = await env.WORKFORCE_DB.prepare(`
    SELECT state_key, value_json FROM candidate_portal_state WHERE candidate_id = ?
  `).bind(candidateId).all();
  const state = {};
  for (const row of result.results || []) {
    try {
      state[row.state_key] = JSON.parse(row.value_json);
    } catch {
      state[row.state_key] = null;
    }
  }
  return state;
}

export async function writePortalState(env, candidateId, key, value) {
  if (!hasWorkforceDb(env)) throw new Error("WORKFORCE_DB is not configured.");
  const timestamp = nowIso();
  await env.WORKFORCE_DB.prepare(`
    INSERT INTO candidate_portal_state (candidate_id, state_key, value_json, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(candidate_id, state_key)
    DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
  `).bind(candidateId, key, JSON.stringify(value), timestamp).run();
}

export async function ensureAdminRecord(env, email, name = "", role = "super_admin") {
  if (!hasWorkforceDb(env) || !email) return null;
  const normalizedEmail = clean(email, 320).toLowerCase();
  const existing = await env.WORKFORCE_DB.prepare("SELECT * FROM admins WHERE lower(email) = lower(?) LIMIT 1")
    .bind(normalizedEmail).first();
  if (existing) return existing;
  const id = crypto.randomUUID();
  const timestamp = nowIso();
  await env.WORKFORCE_DB.prepare(`
    INSERT INTO admins (id, email, name, role, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?)
  `).bind(id, normalizedEmail, clean(name || normalizedEmail.split("@")[0], 160), clean(role, 40), timestamp, timestamp).run();
  return env.WORKFORCE_DB.prepare("SELECT * FROM admins WHERE id = ?").bind(id).first();
}

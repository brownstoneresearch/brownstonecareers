import { readSession } from "../../_portal-auth.js";
import { getCandidateJourney } from "../../_journey.js";
import { encryptSensitiveValue } from "../../_pii.js";
import {
  auditEvent,
  clean,
  hasWorkforceDb,
  json,
  nowIso,
  updateCandidateActivity,
} from "../../_workforce-db.js";

const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const ALLOWED_CATEGORIES = new Set(["identity-front", "identity-back", "tax-form", "work-authorization"]);

function validOptionalSsn(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return !digits || /^\d{9}$/.test(digits);
}

function isFile(value) {
  return value && typeof value === "object" && typeof value.arrayBuffer === "function" && Number(value.size) > 0;
}

function safeFilename(value) {
  return String(value || "document").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
}

function validFileSignature(bytes, mimeType) {
  const starts = (...values) => values.every((value, index) => bytes[index] === value);
  if (mimeType === "application/pdf") return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  if (mimeType === "image/jpeg") return starts(0xff, 0xd8, 0xff);
  if (mimeType === "image/png") return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (mimeType === "image/webp") {
    return new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF"
      && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  }
  return false;
}

async function uploadDocument(env, candidateId, file, category) {
  if (!isFile(file)) return null;
  if (!ALLOWED_CATEGORIES.has(category)) throw new Error("Unsupported document category.");
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error("Each document must be 8 MB or smaller.");
  if (!ALLOWED_TYPES.has(file.type)) throw new Error("Documents must be JPG, PNG, WEBP, or PDF.");
  if (!env.PRIVATE_DOCUMENTS) throw new Error("Private document storage is not configured.");

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer.slice(0, 16));
  if (!validFileSignature(bytes, file.type)) throw new Error("The document content does not match its declared file type.");

  const id = crypto.randomUUID();
  const timestamp = nowIso();
  const extension = safeFilename(file.name).split(".").pop() || "bin";
  const storageKey = `candidates/${candidateId}/${category}/${id}.${extension}`;
  await env.PRIVATE_DOCUMENTS.put(storageKey, buffer, {
    httpMetadata: { contentType: file.type },
    customMetadata: { candidateId, category, originalName: safeFilename(file.name) },
  });
  await env.WORKFORCE_DB.prepare(`
    INSERT INTO documents
      (id, candidate_id, category, storage_key, filename, mime_type, size_bytes, status, submitted_at, retention_policy)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted', ?, 'verification-only')
  `).bind(id, candidateId, category, storageKey, safeFilename(file.name), file.type, file.size, timestamp).run();
  return { id, category, status: "submitted", filename: safeFilename(file.name), submittedAt: timestamp };
}

export async function onRequestGet(context) {
  const session = await readSession(context.request, context.env);
  if (!session) return json({ message: "Candidate authentication required." }, 401);
  if (!hasWorkforceDb(context.env)) return json({ configured: false, status: "not_configured", documents: [] });

  const identity = await context.env.WORKFORCE_DB.prepare(`
    SELECT legal_name, ssn_last4, work_authorization_status, verification_status, submitted_at, reviewed_at
    FROM sensitive_identity WHERE candidate_id = ? LIMIT 1
  `).bind(session.id).first();
  const documents = await context.env.WORKFORCE_DB.prepare(`
    SELECT id, category, filename, status, submitted_at, reviewed_at
    FROM documents WHERE candidate_id = ? ORDER BY submitted_at DESC
  `).bind(session.id).all();
  return json({ configured: Boolean(context.env.PRIVATE_DOCUMENTS && context.env.PII_ENCRYPTION_KEY), identity, documents: documents.results || [] });
}

export async function onRequestPost(context) {
  const session = await readSession(context.request, context.env);
  if (!session) return json({ message: "Candidate authentication required." }, 401);
  if (!hasWorkforceDb(context.env) || !context.env.PRIVATE_DOCUMENTS || !context.env.PII_ENCRYPTION_KEY) {
    return json({ message: "Secure identity submission has not been activated by the administrator." }, 503);
  }
  const journey = await getCandidateJourney(context.env, session.id);
  const verificationStage = journey?.stages?.find((stage) => stage.key === "verification");
  if (verificationStage?.locked || verificationStage?.access === "blocked") {
    return json({ message: `Secure verification is locked. ${journey?.directive?.message || "Complete the current stage first."}`, currentStage: journey?.currentStage?.key, directive: journey?.directive }, 409);
  }

  const form = await context.request.formData();
  const legalName = clean(form.get("legalName"), 180);
  const dateOfBirth = clean(form.get("dateOfBirth"), 20);
  const addressLine1 = clean(form.get("addressLine1"), 220);
  const addressLine2 = clean(form.get("addressLine2"), 220);
  const city = clean(form.get("city"), 100);
  const stateProvince = clean(form.get("stateProvince"), 100);
  const postalCode = clean(form.get("postalCode"), 30);
  const country = clean(form.get("country"), 100);
  const workAuthorization = clean(form.get("workAuthorization"), 80);
  const ssn = String(form.get("ssn") || "").replace(/\D/g, "");
  const consent = form.get("consent") === "yes";
  const idFront = form.get("idFront");
  const idBack = form.get("idBack");

  if (!legalName || !dateOfBirth || !addressLine1 || !city || !stateProvince || !postalCode || !country || !workAuthorization || !validOptionalSsn(ssn) || !consent || !isFile(idFront)) {
    return json({ message: "Complete every required identity field, attach the requested identity document, enter a valid nine-digit SSN only when instructed, and accept the authorization statement." }, 400);
  }

  let encryptedIdentity;
  let encryptedSsn = null;
  try {
    encryptedIdentity = await encryptSensitiveValue(JSON.stringify({
      dateOfBirth,
      addressLine1,
      addressLine2,
      city,
      stateProvince,
      postalCode,
      country,
    }), context.env.PII_ENCRYPTION_KEY);
    if (ssn) encryptedSsn = await encryptSensitiveValue(ssn, context.env.PII_ENCRYPTION_KEY);
  } catch (error) {
    console.error("PII encryption failed", error?.message);
    return json({ message: "Sensitive identity encryption is unavailable. Contact candidate support." }, 503);
  }

  const timestamp = nowIso();
  const existingDocuments = await context.env.WORKFORCE_DB.prepare("SELECT storage_key FROM documents WHERE candidate_id = ? AND category IN ('identity-front','identity-back')")
    .bind(session.id).all();
  for (const row of existingDocuments.results || []) {
    try { await context.env.PRIVATE_DOCUMENTS.delete(row.storage_key); } catch {}
  }
  await context.env.WORKFORCE_DB.prepare("DELETE FROM documents WHERE candidate_id = ? AND category IN ('identity-front','identity-back')")
    .bind(session.id).run();

  const uploaded = [];
  try {
    uploaded.push(await uploadDocument(context.env, session.id, idFront, "identity-front"));
    if (isFile(idBack)) uploaded.push(await uploadDocument(context.env, session.id, idBack, "identity-back"));
  } catch (error) {
    return json({ message: error.message || "Identity document upload failed." }, 400);
  }

  await context.env.WORKFORCE_DB.prepare(`
    INSERT INTO sensitive_identity
      (candidate_id, legal_name, date_of_birth, address_line1, address_line2, city, state_province, postal_code, country,
       ssn_ciphertext, ssn_iv, ssn_algorithm, ssn_last4,
       identity_ciphertext, identity_iv, identity_algorithm,
       work_authorization_status, verification_status, submitted_at, updated_at)
    VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?)
    ON CONFLICT(candidate_id) DO UPDATE SET
      legal_name = excluded.legal_name,
      date_of_birth = NULL,
      address_line1 = NULL,
      address_line2 = NULL,
      city = NULL,
      state_province = NULL,
      postal_code = NULL,
      country = NULL,
      ssn_ciphertext = COALESCE(excluded.ssn_ciphertext, sensitive_identity.ssn_ciphertext),
      ssn_iv = COALESCE(excluded.ssn_iv, sensitive_identity.ssn_iv),
      ssn_algorithm = COALESCE(excluded.ssn_algorithm, sensitive_identity.ssn_algorithm),
      ssn_last4 = COALESCE(excluded.ssn_last4, sensitive_identity.ssn_last4),
      identity_ciphertext = excluded.identity_ciphertext,
      identity_iv = excluded.identity_iv,
      identity_algorithm = excluded.identity_algorithm,
      work_authorization_status = excluded.work_authorization_status,
      verification_status = 'submitted',
      submitted_at = excluded.submitted_at,
      reviewed_at = NULL,
      reviewed_by = NULL,
      updated_at = excluded.updated_at
  `).bind(
    session.id,
    legalName,
    encryptedSsn?.ciphertext || null,
    encryptedSsn?.iv || null,
    encryptedSsn?.algorithm || null,
    ssn ? ssn.slice(-4) : null,
    encryptedIdentity.ciphertext,
    encryptedIdentity.iv,
    encryptedIdentity.algorithm,
    workAuthorization,
    timestamp,
    timestamp,
  ).run();

  await updateCandidateActivity(context.env, session.id);
  await auditEvent(context.env, {
    actorType: "candidate",
    actorId: session.id,
    candidateId: session.id,
    eventType: "identity.secure_submission_completed",
    description: "Candidate submitted encrypted identity data and private verification documents.",
    metadata: {
      documentCategories: uploaded.filter(Boolean).map((item) => item.category),
      ssnProvided: Boolean(ssn),
      ssnDisplay: ssn ? `***-**-${ssn.slice(-4)}` : "not provided",
    },
    request: context.request,
  });
  return json({
    success: true,
    status: "submitted",
    maskedSsn: ssn ? `***-**-${ssn.slice(-4)}` : null,
    documents: uploaded.filter(Boolean),
  }, 201);
}

export function onRequest() {
  return json({ message: "Method not allowed." }, 405);
}

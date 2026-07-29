import { clean } from "./_workforce-db.js";

export function hasSupabase(env) {
  return Boolean(clean(env?.SUPABASE_URL, 500) && clean(env?.SUPABASE_SECRET_KEY || env?.SUPABASE_SERVICE_ROLE_KEY, 1000));
}

export function supabaseBase(env) {
  return clean(env?.SUPABASE_URL, 500).replace(/\/$/, "");
}

export function supabaseSecret(env) {
  return clean(env?.SUPABASE_SECRET_KEY || env?.SUPABASE_SERVICE_ROLE_KEY, 1000);
}

export async function supabaseRequest(env, path, {
  method = "GET",
  body,
  headers = {},
  prefer = "return=representation",
} = {}) {
  if (!hasSupabase(env)) throw new Error("Supabase is not configured.");
  const secret = supabaseSecret(env);
  const response = await fetch(`${supabaseBase(env)}${path}`, {
    method,
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(prefer ? { Prefer: prefer } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const message = data?.message || data?.error_description || data?.hint || `Supabase request failed (${response.status}).`;
    const error = new Error(message);
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

export async function supabaseUpload(env, bucket, path, arrayBuffer, contentType) {
  if (!hasSupabase(env)) throw new Error("Supabase is not configured.");
  const secret = supabaseSecret(env);
  const response = await fetch(`${supabaseBase(env)}/storage/v1/object/${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`, {
    method: "POST",
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      "Content-Type": contentType || "application/octet-stream",
      "x-upsert": "true",
    },
    body: arrayBuffer,
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(data?.message || `Supabase Storage upload failed (${response.status}).`);
  return data;
}

export async function supabaseSignedUrl(env, bucket, path, expiresIn = 90) {
  const result = await supabaseRequest(env, `/storage/v1/object/sign/${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`, {
    method: "POST",
    body: { expiresIn },
  });
  return result?.signedURL || result?.signedUrl || null;
}

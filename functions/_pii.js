function base64ToBytes(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function importEncryptionKey(secret) {
  const raw = base64ToBytes(secret);
  if (raw.byteLength !== 32) throw new Error("PII_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt"]);
}

export async function encryptSensitiveValue(value, secret) {
  if (!secret) throw new Error("PII_ENCRYPTION_KEY is not configured.");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importEncryptionKey(secret);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(String(value)),
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
    algorithm: "AES-256-GCM",
  };
}

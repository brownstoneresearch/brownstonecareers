#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${CF_PROJECT:-brownstone-careers}"
BUCKET_NAME="${PRIVATE_DOCUMENTS_BUCKET:-brownstone-private-documents}"
CONFIG_FILE="${WRANGLER_CONFIG:-wrangler.jsonc}"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "ERROR: $CONFIG_FILE was not found. Run this script from the repository root." >&2
  exit 1
fi

export WRANGLER_CACHE_DIR="${WRANGLER_CACHE_DIR:-$HOME/.cache/wrangler}"
mkdir -p "$WRANGLER_CACHE_DIR"

WRANGLER=(npx --yes wrangler@latest)

echo "Checking Cloudflare authentication…"
"${WRANGLER[@]}" whoami >/dev/null

echo "Checking private R2 bucket: $BUCKET_NAME"
if ! "${WRANGLER[@]}" r2 bucket list 2>/dev/null | grep -Fq "$BUCKET_NAME"; then
  "${WRANGLER[@]}" r2 bucket create "$BUCKET_NAME"
fi

BUCKET_NAME="$BUCKET_NAME" CONFIG_FILE="$CONFIG_FILE" node <<'NODE'
const fs = require("fs");
const file = process.env.CONFIG_FILE;
const bucket = process.env.BUCKET_NAME;
const config = JSON.parse(fs.readFileSync(file, "utf8"));
const existing = Array.isArray(config.r2_buckets) ? config.r2_buckets : [];
config.r2_buckets = [
  ...existing.filter((item) => item.binding !== "PRIVATE_DOCUMENTS"),
  { binding: "PRIVATE_DOCUMENTS", bucket_name: bucket },
];
fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
console.log(`Bound PRIVATE_DOCUMENTS to ${bucket} without changing existing D1 bindings.`);
NODE

if ! "${WRANGLER[@]}" pages secret list --project-name "$PROJECT_NAME" 2>/dev/null | grep -Fq "PII_ENCRYPTION_KEY"; then
  echo "Creating PII_ENCRYPTION_KEY as an encrypted Cloudflare Pages secret…"
  openssl rand -base64 32 | tr -d '\n' | "${WRANGLER[@]}" pages secret put PII_ENCRYPTION_KEY --project-name "$PROJECT_NAME"
else
  echo "PII_ENCRYPTION_KEY already exists; preserving it so existing encrypted records remain readable."
fi

echo
echo "Private storage configuration prepared. Apply D1 migrations, test, commit, and push."
echo "  npx --yes wrangler@latest d1 migrations apply brownstone-workforce --remote"
echo "  npm test"
echo "  git add -A && git commit -m \"Deploy Brownstone Careers v9.2 application-first invitations\" && git push origin main"

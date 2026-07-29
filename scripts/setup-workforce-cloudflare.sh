#!/usr/bin/env bash
set -euo pipefail

CF_PROJECT="${CF_PROJECT:-brownstone-careers}"
DB_NAME="${DB_NAME:-brownstone-workforce}"
R2_BUCKET="${R2_BUCKET:-brownstone-private-documents}"

command -v node >/dev/null || { echo "Node.js is required." >&2; exit 1; }
command -v npm >/dev/null || { echo "npm is required." >&2; exit 1; }
command -v openssl >/dev/null || { echo "OpenSSL is required (included with Git Bash)." >&2; exit 1; }

if [[ ! -f package.json || ! -f wrangler.jsonc ]]; then
  echo "Run this script from the Brownstone project root." >&2
  exit 1
fi

WRANGLER=(npx --yes wrangler@latest)

if ! "${WRANGLER[@]}" whoami >/dev/null 2>&1; then
  "${WRANGLER[@]}" login
fi

printf '\nThis helper creates new Cloudflare resources when confirmed.\n'
read -r -p "Create a new D1 database named '$DB_NAME'? [y/N] " CREATE_DB
if [[ "$CREATE_DB" =~ ^[Yy]$ ]]; then
  "${WRANGLER[@]}" d1 create "$DB_NAME" --binding WORKFORCE_DB --update-config
fi

read -r -p "Create a new private R2 bucket named '$R2_BUCKET'? [y/N] " CREATE_R2
if [[ "$CREATE_R2" =~ ^[Yy]$ ]]; then
  "${WRANGLER[@]}" r2 bucket create "$R2_BUCKET" --binding PRIVATE_DOCUMENTS --update-config
fi

printf '\nApplying D1 migrations to %s...\n' "$DB_NAME"
"${WRANGLER[@]}" d1 migrations apply "$DB_NAME" --remote

SESSION_SECRET="$(openssl rand -hex 32)"
ADMIN_SESSION_SECRET="$(openssl rand -hex 32)"
INVITATION_PEPPER="$(openssl rand -hex 32)"
PII_ENCRYPTION_KEY="$(openssl rand -base64 32 | tr -d '\n')"
ADMIN_BOOTSTRAP_CODE="BC-ADMIN-$(openssl rand -hex 8 | tr '[:lower:]' '[:upper:]')"

read -r -p "Authorized administrator emails (comma-separated): " ADMIN_EMAILS

put_secret() {
  local name="$1"
  local value="$2"
  printf '%s' "$value" | "${WRANGLER[@]}" pages secret put "$name" --project-name "$CF_PROJECT"
}

put_secret ONBOARDING_PORTAL_SESSION_SECRET "$SESSION_SECRET"
put_secret ADMIN_SESSION_SECRET "$ADMIN_SESSION_SECRET"
put_secret INVITATION_PEPPER "$INVITATION_PEPPER"
put_secret PII_ENCRYPTION_KEY "$PII_ENCRYPTION_KEY"
put_secret ADMIN_BOOTSTRAP_CODE "$ADMIN_BOOTSTRAP_CODE"
put_secret ADMIN_EMAILS "$ADMIN_EMAILS"

printf '\nBootstrap administrator code (save now in a password manager):\n%s\n' "$ADMIN_BOOTSTRAP_CODE"
printf '\nRun npm test, commit wrangler.jsonc, push main, and redeploy Pages.\n'
printf 'Protect workforce.brownstonecareers.agency with Cloudflare Access before production use.\n'
printf 'Run scripts/configure-production-domains-and-email.sh to add the dedicated Resend channels.\n'

unset SESSION_SECRET ADMIN_SESSION_SECRET INVITATION_PEPPER PII_ENCRYPTION_KEY ADMIN_BOOTSTRAP_CODE ADMIN_EMAILS

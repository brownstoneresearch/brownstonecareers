#!/usr/bin/env bash
set -euo pipefail

CF_PROJECT="${CF_PROJECT:-brownstone-careers}"
WRANGLER=(npx --yes wrangler@latest)

if [[ ! -f package.json || ! -d functions || ! -d supabase ]]; then
  echo "Run this script from the Brownstone project root." >&2
  exit 1
fi

if ! "${WRANGLER[@]}" whoami >/dev/null 2>&1; then
  "${WRANGLER[@]}" login
fi

put_secret() {
  local name="$1"
  local value="$2"
  [[ -n "$value" ]] || return 0
  printf '%s' "$value" | "${WRANGLER[@]}" pages secret put "$name" --project-name "$CF_PROJECT"
}

printf '\nBrownstone Guide AI (optional)\n'
read -rsp "OpenAI API key (leave blank to keep the safe guided fallback): " OPENAI_KEY; echo
if [[ -n "$OPENAI_KEY" ]]; then
  put_secret OPENAI_API_KEY "$OPENAI_KEY"
  read -r -p "OpenAI model [gpt-5.6]: " OPENAI_MODEL
  put_secret OPENAI_MODEL "${OPENAI_MODEL:-gpt-5.6}"
fi

printf '\nSupabase migration target (optional until cutover)\n'
read -r -p "Supabase project URL (leave blank to keep D1/R2 only): " SUPABASE_URL
if [[ -n "$SUPABASE_URL" ]]; then
  read -rsp "Supabase secret/service-role key (server-side only): " SUPABASE_SECRET; echo
  put_secret SUPABASE_URL "$SUPABASE_URL"
  put_secret SUPABASE_SECRET_KEY "$SUPABASE_SECRET"
  put_secret SUPABASE_PRIVATE_BUCKET "workforce-private-documents"
fi

unset OPENAI_KEY OPENAI_MODEL SUPABASE_URL SUPABASE_SECRET
printf '\nConfigured secret names:\n'
"${WRANGLER[@]}" pages secret list --project-name "$CF_PROJECT"
printf '\nApply migrations, run npm test, and trigger a new production deployment.\n'

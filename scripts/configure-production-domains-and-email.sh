#!/usr/bin/env bash
set -euo pipefail

CF_PROJECT="${CF_PROJECT:-brownstone-careers}"
export WRANGLER_CACHE_DIR="${WRANGLER_CACHE_DIR:-$HOME/.cache/wrangler}"
mkdir -p "$WRANGLER_CACHE_DIR"
WRANGLER=(npx --yes wrangler@latest)

if [[ ! -f package.json || ! -d functions ]]; then
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

printf '\nProduction service identities for Pages project: %s\n' "$CF_PROJECT"
printf 'Public: https://brownstonecareers.agency\nOnboarding: https://onboarding.brownstonecareers.agency\nWorkforce: https://workforce.brownstonecareers.agency\nMail identity: mail.brownstonecareers.agency\n'

printf '\nPaste the single Resend sending-access key privately. Input is hidden.\n'
read -rsp "Unified Resend API key: " RESEND_KEY; echo
put_secret RESEND_API_KEY "$RESEND_KEY"

EMAIL_FROM='Brownstone Careers <support@mail.brownstonecareers.agency>'
EMAIL_REPLY_TO='support@brownstonecareers.agency'
RECRUITMENT_EMAIL='support@brownstonecareers.agency'
put_secret EMAIL_FROM "$EMAIL_FROM"
put_secret EMAIL_REPLY_TO "$EMAIL_REPLY_TO"
put_secret RECRUITMENT_EMAIL "$RECRUITMENT_EMAIL"

unset RESEND_KEY

printf '\nConfigured production secret names:\n'
"${WRANGLER[@]}" pages secret list --project-name "$CF_PROJECT"
printf '\nOnly RESEND_API_KEY is used by the v9.2 runtime. Stale specialized key names cannot override it. Trigger a new production deployment.\n'

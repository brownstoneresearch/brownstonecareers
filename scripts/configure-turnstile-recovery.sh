#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SITEKEY="0x4AAAAAAEA0g9ELRe9IQHmp"

cat <<INFO
Brownstone Careers Turnstile binding check

Existing widget site key:
  $SITEKEY

This project does not create, retrieve, rotate, or modify Turnstile widgets.
Set the existing widget secret in the Cloudflare Pages production environment as:
  TURNSTILE_SECRET

Dashboard path:
  Workers & Pages > brownstone-careers > Settings > Variables and Secrets > Production

After saving the encrypted secret, create a new production deployment.
INFO

if [ -z "${TURNSTILE_SECRET:-}" ]; then
  echo
  echo "Local validation skipped: TURNSTILE_SECRET is not exported in this shell."
  echo "This is expected when the secret is stored only in Cloudflare Pages."
  exit 0
fi

node scripts/configure-turnstile-recovery.mjs

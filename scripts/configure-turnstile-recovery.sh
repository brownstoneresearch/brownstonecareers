#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export WRANGLER_CACHE_DIR="${WRANGLER_CACHE_DIR:-$HOME/.cache/wrangler}"
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-345cfd260888bf9884abfea35d896c82}"
export TURNSTILE_SITEKEY="${TURNSTILE_SITEKEY:-0x4AAAAAAD4dZ6uvgEldqskh}"
export CF_PAGES_PROJECT="${CF_PAGES_PROJECT:-brownstone-careers}"
export EXPECTED_TURNSTILE_DOMAIN="${EXPECTED_TURNSTILE_DOMAIN:-brownstonecareers.agency}"

mkdir -p "$WRANGLER_CACHE_DIR"

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  read -r -s -p "Cloudflare API token: " CLOUDFLARE_API_TOKEN
  echo
  export CLOUDFLARE_API_TOKEN
fi

cleanup() {
  unset CLOUDFLARE_API_TOKEN
}
trap cleanup EXIT

node scripts/configure-turnstile-recovery.mjs

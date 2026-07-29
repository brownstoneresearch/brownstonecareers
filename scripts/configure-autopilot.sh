#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
DB_ID="$(node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync('wrangler.jsonc','utf8'));const d=(c.d1_databases||[]).find(x=>x.binding==='WORKFORCE_DB');process.stdout.write(d?.database_id||'')")"
[ -n "$DB_ID" ] || { echo "WORKFORCE_DB database_id is missing from wrangler.jsonc"; exit 1; }
sed "s/REPLACE_WITH_EXISTING_D1_DATABASE_ID/$DB_ID/" automation-worker/wrangler.toml.example > automation-worker/wrangler.toml
cd automation-worker
npx --yes wrangler@latest secret put AUTOMATION_RUNNER_SECRET
npx --yes wrangler@latest deploy

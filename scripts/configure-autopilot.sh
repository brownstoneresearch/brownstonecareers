#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export WRANGLER_CACHE_DIR="${WRANGLER_CACHE_DIR:-$HOME/.cache/wrangler}"
mkdir -p "$WRANGLER_CACHE_DIR"

DB_ID="$(
  node -e '
    const fs = require("node:fs");
    const config = JSON.parse(fs.readFileSync("wrangler.jsonc", "utf8"));
    const database = (config.d1_databases || [])
      .find((item) => item.binding === "WORKFORCE_DB");
    process.stdout.write(database?.database_id || "");
  '
)"

if [ -z "$DB_ID" ]; then
  echo "ERROR: WORKFORCE_DB database_id is missing from wrangler.jsonc."
  exit 1
fi

sed \
  "s/REPLACE_WITH_EXISTING_D1_DATABASE_ID/$DB_ID/" \
  automation-worker/wrangler.toml.example \
  > automation-worker/wrangler.toml

echo
echo "Configuring the dedicated Brownstone Autopilot Worker..."
echo

npx --yes wrangler@latest secret put \
  AUTOMATION_RUNNER_SECRET \
  --config automation-worker/wrangler.toml

npx --yes wrangler@latest deploy \
  --config automation-worker/wrangler.toml

echo
echo "Brownstone Careers Autopilot deployed successfully."
echo "Schedule: every 15 minutes"

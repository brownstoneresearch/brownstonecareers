# Deploy v10

1. Apply `0009_autonomous_operations.sql` to the existing `brownstone-workforce` D1 database.
2. Run `npm ci && npm test`.
3. Commit and push the Pages application.
4. Run `bash scripts/configure-autopilot.sh` to create and deploy the separate scheduled Worker. The script reuses the existing D1 database ID from `wrangler.jsonc` and securely prompts for `AUTOMATION_RUNNER_SECRET`.
5. Confirm the Worker cron and Pages deployment in Cloudflare.

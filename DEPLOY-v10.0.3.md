# Deploy Brownstone Careers v10.0.3

## 1. Install and validate

```bash
npm ci
npm test
```

Do not deploy unless the command exits successfully and produces no stderr output.

## 2. Apply D1 migrations

```bash
npx --yes wrangler@latest d1 migrations apply brownstone-workforce --remote
```

Confirm migrations `0001` through `0009_autonomous_operations.sql` are recorded.

## 3. Required production bindings

The Pages project must provide:

- `WORKFORCE_DB` — D1 binding
- `PRIVATE_DOCUMENTS` — private R2 binding
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `RECRUITMENT_EMAIL`
- `EMAIL_REPLY_TO`
- `TURNSTILE_SECRET`
- `ADMIN_EMAILS`
- `ADMIN_SESSION_SECRET`
- `ONBOARDING_PORTAL_SESSION_SECRET`
- `INVITATION_PEPPER`
- `PII_ENCRYPTION_KEY`

Optional generative services:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_GRADING_MODEL`

Never put secret values in Git.

## 4. Push Pages

```bash
git add -A
git commit -m "Deploy Brownstone Careers v10.0.3"
git push origin main
```

## 5. Deploy Autopilot Worker

```bash
bash scripts/configure-autopilot.sh
```

The script creates `automation-worker/wrangler.toml` from the existing D1 database ID, saves `AUTOMATION_RUNNER_SECRET` to the dedicated Worker, and deploys the 15-minute cron trigger using the explicit Worker config.

## 6. Production verification

After the Pages deployment succeeds:

```bash
curl -sS https://brownstonecareers.agency/api/health
```

Verify that the database, private storage, email, Turnstile, sessions, invitation security, and AI mode report the expected state.

> **Superseded:** Use `DEPLOY-v9.2.md` and `RELEASE-NOTES-v9.2.md` for the current production update.

# Deploy Brownstone Careers Workforce Platform v9

Run from Git Bash in the extracted project root.

## 1. Validate

```bash
npm ci
npm test
```

## 2. Authenticate Cloudflare

```bash
npx --yes wrangler@latest login
export CF_PROJECT="brownstone-careers"
```

## 3. Apply the complete D1 schema

```bash
npx --yes wrangler@latest d1 migrations apply brownstone-workforce --remote
```

The v9 features require `0004_workflow_ai_support.sql`.

## 4. Confirm R2 and D1 bindings

`wrangler.jsonc` must contain:

```text
WORKFORCE_DB
PRIVATE_DOCUMENTS
```

Use `wrangler.bindings.example.jsonc` as the safe template. Do not put API keys in this file.

## 5. Required Cloudflare Pages secrets

Keep the existing production secrets and confirm them with:

```bash
npx --yes wrangler@latest pages secret list --project-name "$CF_PROJECT"
```

Core names include:

```text
ONBOARDING_PORTAL_SESSION_SECRET
ADMIN_SESSION_SECRET
INVITATION_PEPPER
PII_ENCRYPTION_KEY
ADMIN_EMAILS
EMAIL_FROM
EMAIL_REPLY_TO
RECRUITMENT_EMAIL
TURNSTILE_SECRET
RESEND_API_KEY_RECRUITMENT
RESEND_API_KEY_ONBOARDING
RESEND_API_KEY_ACCESS_CODES
RESEND_API_KEY_CANDIDATE_INVITES
RESEND_API_KEY_WORKFORCE
```

## 6. Optional Brownstone Guide AI and Supabase migration target

```bash
bash scripts/configure-supabase-and-ai.sh
```

The guide works without an OpenAI key using the safe guided fallback. Supabase is a controlled migration target; D1/R2 remains active until Brownstone approves cutover.

## 7. Commit and deploy

```bash
git add -A
git commit -m "Deploy Brownstone Careers Workforce Platform v9"
git push origin main
```

For a Direct Upload Pages project:

```bash
npm run build
npx --yes wrangler@latest pages deploy dist --project-name "$CF_PROJECT" --branch main
```

## 8. Verify

```bash
curl -fsSL https://brownstonecareers.agency/api/health
```

Open:

```text
https://onboarding.brownstonecareers.agency/onboarding_portal/
https://workforce.brownstonecareers.agency/workforce_admin/
```

Test with dummy information only:

1. Invite a test candidate.
2. Sign in with the unique access code.
3. Submit a task with the required tick mark and signature.
4. Approve or return it from the admin dashboard.
5. Ask the Brownstone Guide a normal question.
6. Request human follow-up and confirm it appears in AI & support.
7. Confirm material actions appear in the audit log.
8. Upload only a harmless test document until legal, security, retention, and access controls are approved.

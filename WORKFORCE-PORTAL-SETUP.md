# Brownstone Workforce Portal — Cloudflare Setup

This guide activates the individualized onboarding portal and workforce administration dashboard for the existing Cloudflare Pages project `brownstone-careers`.

## 1. Prerequisites

From Git Bash in the project root:

```bash
node --version
npm --version
git --version
gh --version
npx --yes wrangler@latest whoami
```

When Wrangler is not authenticated:

```bash
npx --yes wrangler@latest login
```

## 2. Create and bind D1

For a new installation:

```bash
npx --yes wrangler@latest d1 create brownstone-workforce \
  --binding WORKFORCE_DB \
  --update-config
```

The command writes the D1 binding and database ID into `wrangler.jsonc`. Resource IDs are configuration identifiers, not credentials, and can be committed to a private repository.

Apply every migration:

```bash
npx --yes wrangler@latest d1 migrations apply brownstone-workforce --remote
```

## 3. Create and bind private R2 storage

```bash
npx --yes wrangler@latest r2 bucket create brownstone-private-documents \
  --binding PRIVATE_DOCUMENTS \
  --update-config
```

Do **not** enable public access or attach a public custom domain to this bucket.

## 4. Required encrypted Pages secrets

Set the exact Pages project name:

```bash
export CF_PROJECT="brownstone-careers"
```

Generate strong values locally:

```bash
SESSION_SECRET="$(openssl rand -hex 32)"
ADMIN_SESSION_SECRET="$(openssl rand -hex 32)"
INVITATION_PEPPER="$(openssl rand -hex 32)"
PII_ENCRYPTION_KEY="$(openssl rand -base64 32 | tr -d '\n')"
ADMIN_BOOTSTRAP_CODE="BC-ADMIN-$(openssl rand -hex 8 | tr '[:lower:]' '[:upper:]')"
```

Upload them without committing them:

```bash
printf '%s' "$SESSION_SECRET" | npx --yes wrangler@latest pages secret put ONBOARDING_PORTAL_SESSION_SECRET --project-name "$CF_PROJECT"
printf '%s' "$ADMIN_SESSION_SECRET" | npx --yes wrangler@latest pages secret put ADMIN_SESSION_SECRET --project-name "$CF_PROJECT"
printf '%s' "$INVITATION_PEPPER" | npx --yes wrangler@latest pages secret put INVITATION_PEPPER --project-name "$CF_PROJECT"
printf '%s' "$PII_ENCRYPTION_KEY" | npx --yes wrangler@latest pages secret put PII_ENCRYPTION_KEY --project-name "$CF_PROJECT"
printf '%s' "$ADMIN_BOOTSTRAP_CODE" | npx --yes wrangler@latest pages secret put ADMIN_BOOTSTRAP_CODE --project-name "$CF_PROJECT"
```

Allowlist authorized administrator email addresses:

```bash
read -r -p "Authorized admin emails, comma-separated: " ADMIN_EMAILS
printf '%s' "$ADMIN_EMAILS" | npx --yes wrangler@latest pages secret put ADMIN_EMAILS --project-name "$CF_PROJECT"
```

The four production service identities are already committed as non-secret `vars` in `wrangler.jsonc`:

```text
PUBLIC_SITE_URL=https://brownstonecareers.agency
ONBOARDING_PORTAL_URL=https://onboarding.brownstonecareers.agency
WORKFORCE_ADMIN_URL=https://workforce.brownstonecareers.agency
MAIL_SENDING_HOST=mail.brownstonecareers.agency
```

Keep those values in source control. Use the Cloudflare dashboard only to override them for a separate preview or staging environment.

Clear local shell variables after saving the bootstrap code in a password manager:

```bash
unset SESSION_SECRET ADMIN_SESSION_SECRET INVITATION_PEPPER PII_ENCRYPTION_KEY ADMIN_BOOTSTRAP_CODE ADMIN_EMAILS
```

## 5. Website and email secrets

Public forms and transactional workflows require:

```text
EMAIL_FROM
EMAIL_REPLY_TO
RECRUITMENT_EMAIL
TURNSTILE_SECRET
```

Every transactional email workflow uses the single encrypted secret:

```text
RESEND_API_KEY
```

Remove obsolete channel-specific Resend secrets so no stale key can override the shared production key. Configure the email values securely with:

```bash
bash scripts/configure-production-domains-and-email.sh
```

Recommended sender:

```text
Brownstone Careers <support@mail.brownstonecareers.agency>
```

## 6. Configure Cloudflare Access for administrators

Create a Cloudflare Access self-hosted application covering the complete administrator hostname:

```text
workforce.brownstonecareers.agency
```

Also prevent alternate-host bypass by keeping the application host checks included in the source. The production administrator APIs reject requests made outside the workforce hostname.

Recommended policy:

- Allow only approved Brownstone administrator email addresses or an approved identity-provider group.
- Require multi-factor authentication at the identity provider.
- Keep the application unavailable to the public.
- Retain the bootstrap login only for initial recovery, then rotate or remove `ADMIN_BOOTSTRAP_CODE`.

The application code also checks `ADMIN_EMAILS` and D1 administrator records. Cloudflare Access alone is not the only authorization layer.

## 7. Deploy

```bash
npm ci
npm test
git add --all
git commit -m "Upgrade Brownstone workforce onboarding and administration"
git push origin main
```

Cloudflare Pages should use:

```text
Production branch: main
Build command: npm run build
Build output directory: dist
Node version: 22
```

Bindings and secrets become available only after a new deployment.

## 8. Verify

```bash
curl -fsSL https://brownstone-careers.pages.dev/api/health
```

Confirm the response reports readiness for:

- `workforceDatabaseConfigured`
- `privateDocumentStorageConfigured`
- `portalSessionConfigured`
- `invitationSecurityConfigured`
- `piiEncryptionConfigured`
- `adminAccessConfigured`

Open:

```text
https://workforce.brownstonecareers.agency/
https://onboarding.brownstonecareers.agency/
```

Verify the application-first journey:

1. Begin from a main-site Apply or role button and submit the application-interest contact form.
2. Confirm the applicant appears in the workforce dashboard's eligible application selector.
3. Create the first invitation from that submitted application.
4. Confirm a unique access code and branded invitation email are created.
5. Confirm the candidate can sign in and the confidential application opens first.
6. Confirm all other onboarding tasks remain locked until the confidential application is submitted.
7. Confirm portal progress appears in the admin dashboard.
8. Confirm identity files remain accessible only through authenticated admin APIs.
9. Confirm audit events record the application origin, invitation, login, task, submission, review, and document access.

## 9. Administrator records and roles

An allowlisted Cloudflare Access administrator is automatically inserted as `super_admin` on first login. Change roles through D1 only after creating at least one second super administrator.

Example:

```bash
npx --yes wrangler@latest d1 execute brownstone-workforce --remote \
  --command "UPDATE admins SET role='reviewer', updated_at=datetime('now') WHERE lower(email)=lower('reviewer@brownstonecareers.agency');"
```

Supported roles:

```text
super_admin
recruiter
reviewer
support
auditor
```

## 10. Activate v9 task submissions and support automation

Apply the new workflow migration:

```bash
npx --yes wrangler@latest d1 migrations apply brownstone-workforce --remote
```

Confirm these tables exist:

```text
onboarding_tasks
candidate_tasks
submissions
candidate_notifications
support_conversations
support_messages
```

After deployment, the candidate portal displays **Task submissions**. Each task can require written responses, tick boxes, an attestation, an electronic signature, an administrator review, and a due date. The workforce dashboard displays **Submissions** and **AI & support** queues.

## 11. Optional Brownstone Guide AI

The safe guided assistant works without an external AI key. For generative, context-aware support:

```bash
bash scripts/configure-supabase-and-ai.sh
```

This adds `OPENAI_API_KEY` and an optional `OPENAI_MODEL` as encrypted Pages secrets. Never place candidate SSNs, ID numbers, banking information, passwords, or API keys into the assistant.

## 12. Optional Supabase migration target

The package includes the base Supabase schema plus `202607270001_application_first_invites.sql` and `202607270002_scaled_recruitment_pipeline.sql`. Follow `SUPABASE-AND-AI-SETUP.md`. D1/R2 remains operational until Brownstone completes a tested and reconciled cutover. Do not operate D1 and Supabase indefinitely as competing sources of truth.


## v9.1 production requirements

Apply migration `0005_confidential_application.sql`, create or reuse the private R2 bucket, and bind it as `PRIVATE_DOCUMENTS`. The helper script preserves existing D1 configuration:

```bash
bash scripts/configure-private-storage.sh
npx --yes wrangler@latest d1 migrations apply brownstone-workforce --remote
```

All transactional email workflows use only `RESEND_API_KEY`. Brownstone Guide is operational in guided mode without `OPENAI_API_KEY`; an OpenAI key is an optional generative enhancement.

## v9.3 controlled invitation and scaled pipeline requirement

Apply `0007_scaled_recruitment_pipeline.sql` before deploying the v9.3 Functions:

```bash
npx --yes wrangler@latest d1 migrations apply brownstone-workforce --remote
```

The standard public journey remains application-first. Authorized administrators may also use **Manual invitation** for an arbitrary name and email, but must confirm the override and record a meaningful reason. The API records the administrator identity and timestamp; the D1 trigger accepts an application-less invited status only when the approving administrator exists and is active. Regardless of invitation origin, the candidate must submit the authenticated confidential application before an administrator can assign pre-screening.

The migration also creates stage progress, administrator notifications, candidate ranking, question sets, pre-screening assignments, and answer records. Candidate rankings reflect verified stage completion. AI grading is an advisory draft only and cannot be released until an administrator independently records the final score, written feedback, and human-review confirmation.

## v9.4 invitation status, stage, and template migration

Before deploying v9.4 Functions, apply:

```bash
npx --yes wrangler@latest d1 migrations apply brownstone-workforce --remote
```

Confirm `0008_invitation_status_stage_templates.sql` is recorded. It adds persistent status/stage/template metadata and extends D1 controls to all access-enabled candidate statuses.

The Admin Invite form now selects:

- invitation origin;
- initial status;
- starting recruitment stage;
- invitation expiry;
- application record or manual candidate details and override reason.

Every generated or regenerated invitation keeps the candidate ID and creates a new personal access code. The selected status, stage, template key, email subject, invitation ID, and administrator are recorded in D1 and the audit trail.

Suspended and rejected statuses intentionally remain outside the Invite form because they revoke or block portal access. Administrators apply them from the candidate record.

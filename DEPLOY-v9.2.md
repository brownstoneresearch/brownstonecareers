# Deploy Brownstone Careers v9.2

Run these commands from the Git-connected Brownstone Careers repository—not from a detached ZIP folder.

## 1. Preserve production bindings

The update patch intentionally does not replace your local `wrangler.jsonc`. Confirm the existing bindings remain:

```text
WORKFORCE_DB → brownstone-workforce
PRIVATE_DOCUMENTS → brownstone-private-documents
```

Do not create a second D1 database or replace an existing `PII_ENCRYPTION_KEY`.

## 2. Apply the mandatory database migration

```bash
export WRANGLER_CACHE_DIR="${WRANGLER_CACHE_DIR:-$HOME/.cache/wrangler}"
mkdir -p "$WRANGLER_CACHE_DIR"

npx --yes wrangler@latest d1 migrations apply \
  brownstone-workforce \
  --remote
```

Confirm that `0006_application_first_invites.sql` is applied. This migration adds the application provenance fields and database triggers required by the v9.2 APIs.

## 3. Validate the source

```bash
npm ci
npm test
```

Do not deploy when the test command fails.

## 4. Commit and push

```bash
git add -A
git commit -m "Deploy Brownstone Careers v9.2 application-first invitations"
git push origin main
```

Cloudflare Pages should start the production deployment from the pushed `main` branch.

## 5. Production verification

After deployment:

1. Open the main website and begin an application from a role or Apply button.
2. Submit the application-interest contact form.
3. Open the workforce dashboard and choose **Invite an applicant**.
4. Confirm the new applicant appears in the eligible application selector.
5. Create and email the invitation.
6. Sign in through the candidate portal and confirm the confidential application opens first.
7. Confirm all other onboarding tasks remain locked until that application is submitted.

A direct first-time invitation without an application should return a protected workflow error rather than create an invitation.

# Brownstone Careers Workforce Platform v9.1

## Production changes

- The detailed candidate application and resume upload now run inside the authenticated onboarding portal as an administrator-reviewed, electronically signed workflow task.
- Public **Apply now** links route to the official candidate contact form. The public `/apply` page is now a privacy-first process gateway and no longer hosts a detailed application form.
- Resume files submitted with the confidential application are validated and stored in the private `PRIVATE_DOCUMENTS` R2 bucket. Administrators download them only through the authenticated, audited document endpoint.
- `wrangler.jsonc` now declares the `PRIVATE_DOCUMENTS` R2 binding for `brownstone-private-documents`.
- Migration `0005_confidential_application.sql` adds the confidential application to the standard candidate task catalog.
- Brownstone Guide is treated as operational in guided fallback mode. `OPENAI_API_KEY` remains an optional generative enhancement rather than a service blocker.
- Every email workflow now resolves only `RESEND_API_KEY`, preventing stale channel-specific keys from overriding the unified production key.
- The public contact form now captures inquiry type, optional phone number, and role interest.

## Required production steps

```bash
bash scripts/configure-private-storage.sh
npx --yes wrangler@latest d1 migrations apply brownstone-workforce --remote
npm test
git add -A
git commit -m "Deploy Brownstone Careers v9.1 private application workflow"
git push origin main
```

Never replace an existing `PII_ENCRYPTION_KEY`; doing so would make previously encrypted identity records unreadable.

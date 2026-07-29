# Brownstone Careers v10.0.3

## Pre-deployment hardening

- Removed misleading stderr output from intentional negative-path tests.
- The degraded administrator-shell test still verifies recovery when the `admins` table is unavailable, but its expected diagnostic is captured and asserted.
- The application-recording fallback still verifies that a candidate record survives email-channel failure, but its expected diagnostic is captured and asserted.
- The missing-binding test still verifies a fail-closed `503`, but its expected diagnostic is captured and asserted.
- Runtime production logging remains unchanged.

## Corrected deployment metadata

- Updated the package version to `10.0.3`.
- Updated the Pages handler version to `2026-07-29.10.0.3`.
- Updated health reporting to require `0009_autonomous_operations.sql`.
- Expanded the workforce audit to validate migration `0009`, Autopilot APIs, dashboard integration, and the dedicated Worker deployment configuration.

## Autopilot correction

`scripts/configure-autopilot.sh` now always uses:

```bash
--config automation-worker/wrangler.toml
```

for both secret configuration and deployment. This prevents Wrangler from interpreting the command as a Pages operation.

## Validation

`npm test` passes with:

- 57 JavaScript modules syntax checked;
- 8-page site and SEO audits;
- 20 official email templates;
- workforce, Supabase, domain-routing, Turnstile, application, and large-file-form audits;
- production build generated in `dist/`;
- no stderr diagnostics.

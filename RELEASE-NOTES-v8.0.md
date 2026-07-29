# Brownstone Careers Workforce Platform v8.0 — Release Notes

## Candidate privacy and public recruitment

- Removed SSN, government-ID, maiden-name, full-address, banking, and tax-data collection from the public application.
- Public applications now collect only recruitment-relevant contact, general-location, role, résumé, work-history, skills, availability, work-authorization, sponsorship, and consent information.
- Added privacy-language explaining that sensitive records are requested only after approval through the authenticated onboarding portal.

## Individual candidate onboarding

- Replaced shared portal codes with unique, expiring candidate invitation codes.
- Stores invitation hashes rather than plaintext codes.
- Added branded invitation and correction-request emails through Resend.
- Added synchronized profile, task, module, assessment, identity, and orientation progress.
- Added immediate candidate-session invalidation after invitation regeneration or revocation.

## Workforce administrator dashboard

- Added `/workforce_admin/` as the Brownstone Workforce Control Center.
- Added candidate invitation, search, filtering, progress review, stage/status changes, correction requests, identity review, private-document access, email history, and audit activity.
- Added server-enforced roles: `super_admin`, `recruiter`, `reviewer`, `support`, and `auditor`.
- Added Cloudflare Access compatibility and administrator allowlisting.

## Sensitive identity workflow

- Added authenticated identity submission inside the onboarding portal.
- Added AES-256-GCM encryption for SSNs, dates of birth, and complete residential details.
- Added masked SSN visibility for authorized administrators.
- Added private R2 storage for government-ID files, upload size/type checks, file-signature validation, protected downloads, and replacement handling.
- Added a recommendation to use specialized payroll, I-9, verification, and background-check providers for production-sensitive workflows whenever practical.

## Database and activity history

- Added Cloudflare D1 migrations for candidates, administrators, invitations, portal state, sensitive identity, documents, email events, notes, and audit events.
- Tracks material events such as invitations, logins, profile updates, task completion, identity submission, reviews, document downloads, corrections, revocation, and onboarding completion.
- Does not implement keystroke, mouse-movement, or invasive surveillance.

## Production requirements

Before collecting live candidate identity data, configure:

- `WORKFORCE_DB` D1 binding
- `PRIVATE_DOCUMENTS` private R2 binding
- portal/admin/invitation/encryption secrets
- authorized administrator emails
- Resend and Turnstile secrets
- Cloudflare Access for `/workforce_admin/*`

Run `npm test` before deployment. See `WORKFORCE-PORTAL-SETUP.md` and `SECURITY-DATA-MIGRATION.md`.

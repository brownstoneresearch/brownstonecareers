# Brownstone Careers Workforce Platform v9.2

## Application-first invitations

- Every new candidate invitation must originate from a submitted public application-interest record.
- The workforce dashboard now presents an eligible application queue instead of a free-form first-invitation form.
- Administrators select an existing applicant and create the individualized portal invitation from that application record.
- Candidate invitation APIs reject arbitrary candidate details and reject candidates without `application_submitted_at` provenance.
- D1 migration `0006_application_first_invites.sql` adds application origin fields, an application queue index, legacy application backfill, and database triggers that block invitation status without a submitted application.
- Access-code regeneration is limited to candidates with application provenance and an existing prior invitation.

## Candidate journey

- Main-site Apply actions continue to the application-interest contact form.
- Application-interest submissions create or update an applicant record with reference prefix `BC-A` and stage `application_received`.
- Invitation emails now describe the portal as a continuation of the candidate's application.
- The confidential candidate application is the first required portal task.
- Other onboarding tasks are visibly locked until the confidential application is submitted.
- Confidential application answers can update the candidate's role, contact, location, work-authorization, and sponsorship fields.

## Security and audit controls

- Application origin, source, submission time, and invitation-from-application time are retained on the candidate record.
- Invitation creation records the application reference and provenance in the audit event.
- Generic status editing cannot be used to set a candidate to `invited`; the protected invitation workflow must be used.
- Supabase migration `202607270001_application_first_invites.sql` mirrors the application provenance columns and database-level invitation guard.

## Required production action

Apply migration `0006_application_first_invites.sql` before the v9.2 Functions begin serving production traffic:

```bash
npx --yes wrangler@latest d1 migrations apply brownstone-workforce --remote
```

Then validate and push:

```bash
npm ci
npm test
git add -A
git commit -m "Deploy Brownstone Careers v9.2 application-first invitations"
git push origin main
```

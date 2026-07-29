# Brownstone Careers v9.3 release notes

## Scaled invitation control

- Restores first-time manual invitations for arbitrary names and emails.
- Retains application-origin invitations as the standard public journey.
- Requires every invitation origin to begin with the authenticated confidential application before pre-screening.
- Requires a documented administrator override, active administrator identity, timestamp, and reason for application-less invitations.
- Keeps all access codes personalized, hashed, expiring, revocable, and audited.

## Ranked stage pipeline

- Adds weighted stage-completion tracking and rank fields.
- Adds an administrator Rankings board with stage filters, role filters, progress dots, and direct candidate access.
- Uses workflow completion only for ranking; no protected characteristics or automated selection decisions.

## Stage alerts

- Adds persistent administrator notifications for completed stages.
- Adds a distinct optional browser tone for each stage.
- Links alerts to candidate or pre-screen review records.

## Managed pre-screening

- Adds administrator-managed question sets, questions, points, rubrics, and due dates.
- Adds candidate save/submit workflow.
- Adds optional OpenAI advisory grading through the server-side Responses API.
- Requires an independent administrator final score, written feedback, and explicit human-review confirmation.
- Releases finalized results by email and candidate dashboard notification.

## Data layer

- Adds D1 migration `0007_scaled_recruitment_pipeline.sql`.
- Adds Supabase migration `202607270002_scaled_recruitment_pipeline.sql` with RLS and controlled invitation safeguards.

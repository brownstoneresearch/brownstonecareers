# Brownstone Careers v10.1.0

## Mature sequential journey orchestration

Brownstone Careers now enforces one verified recruitment sequence from confidential application through active-worker activation:

Application → Pre-screening → Skills assessment → Interview → Offer → Verification → Onboarding → Orientation → Active worker

A candidate cannot open, submit, or bypass a future-stage workflow until every prior stage is verified complete. Server-side checks protect tasks, pre-screening, assessment state, secure identity submission, candidate status changes, and administrator stage advancement.

## Candidate dashboard

- New journey command center with an exact next directive.
- Directives distinguish action required, correction required, administrator review, result waiting, paused journeys, closed journeys, and final completion.
- Locked stages visibly identify the current blocker.
- Approved stages remain available as read-only journey history.
- The next actionable onboarding task opens directly from the directive.
- Task and notification lists use compact, accessible pagination.
- Application submission now waits for administrator approval before pre-screening unlocks.

## Administrator dashboard

- Candidate records display an ordered nine-stage journey, evidence readiness, current blocker, next directive, rank, and verified completion score.
- Application approval automatically completes the application stage and opens pre-screening as the next controlled stage.
- Passing pre-screening opens assessment; approved verification opens onboarding; completed onboarding opens orientation; completed orientation waits for final workforce activation.
- Candidate, ranking, pre-screening, submission, support, notification, and audit queues use smart pagination.
- Stage completion notifications retain their distinct optional browser tones.
- Status and stage transitions are server-validated and auditable.

## Database

Migration `0010_mature_journey_orchestration.sql` adds task-to-stage ownership, paging indexes, current-stage initialization, and orderly legacy-candidate backfill without overwriting explicit stage records.

## Validation

- 62 JavaScript modules syntax checked.
- All 8-page site and SEO audits passed.
- 20 official email templates passed.
- Workforce security, migration, Supabase, domain, Resend, Turnstile, and form audits passed.
- Migrations `0001` through `0010` applied successfully to a clean SQLite validation database.
- Production build generated successfully.

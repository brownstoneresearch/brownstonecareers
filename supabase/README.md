# Brownstone Supabase Workforce Backend

This directory contains the production PostgreSQL schema, RLS policies, private Storage bucket definition, task workflow tables, audit tables, AI-support conversation tables, and application-first invitation guardrails for Brownstone Careers.

## Recommended architecture

- Cloudflare Pages/Functions: domains, routing, Turnstile, Cloudflare Access, server APIs.
- Supabase: PostgreSQL, Auth, RLS, private Storage, Realtime.
- Resend: application confirmations, invitations, reminders, corrections, and workforce notifications.
- OpenAI Responses API: optional Brownstone Guide automation through the server-side `OPENAI_API_KEY` secret.

## Apply the schema

1. Create a Supabase project.
2. Open **SQL Editor**.
3. Run `migrations/202607260001_brownstone_workforce.sql`.
4. Run `migrations/202607270001_application_first_invites.sql`.
5. Run `migrations/202607270002_scaled_recruitment_pipeline.sql`.
6. Configure Auth redirect URLs for `https://onboarding.brownstonecareers.agency`.
7. Store `SUPABASE_URL` and `SUPABASE_SECRET_KEY` only as encrypted Cloudflare Pages secrets.
8. Never expose the secret/service-role key in HTML, CSS, JavaScript, GitHub, or client-side environment variables.

The second migration adds application provenance. The third replaces its strict application-only trigger with an audited administrator override path, and adds ranked stages, notifications, and human-reviewed pre-screening structures.

The existing D1/R2 runtime remains available as a compatibility path during migration. Use one operational source of truth in production after data migration is complete.

## v9.4 parity

Apply `202607270003_invitation_status_stage_templates.sql` after the v9.3 scaled-pipeline migration when preparing a Supabase migration environment. It preserves invitation status, stage, template, candidate identity, and controlled administrator-origin enforcement.

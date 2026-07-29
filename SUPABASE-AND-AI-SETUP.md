# Brownstone Supabase and AI Setup

## Operational status

The v9 package runs immediately on the existing Cloudflare D1/R2 backend. A complete Supabase PostgreSQL/RLS/private-Storage migration kit is included under `supabase/` so Brownstone can move to Supabase in a controlled cutover instead of attempting an unsafe one-step production replacement.

## Brownstone Guide

Without an OpenAI key, the guide provides deterministic, empathetic, task-aware help and human escalation. To enable generative responses, run:

```bash
bash scripts/configure-supabase-and-ai.sh
```

The script stores `OPENAI_API_KEY` as a Cloudflare Pages secret. It does not write the key into source files.

The assistant is designed for warmth, clarity, emotional acknowledgement, next-step guidance, and human escalation. No numerical percentage of “human receptiveness” can be guaranteed or objectively certified.

## Supabase migration target

1. Create a Supabase project in an approved region.
2. Apply the Supabase migrations in this exact order:
   - `supabase/migrations/202607260001_brownstone_workforce.sql`
   - `supabase/migrations/202607270001_application_first_invites.sql`
   - `supabase/migrations/202607270002_scaled_recruitment_pipeline.sql`
3. Confirm RLS is enabled on every workforce table.
4. Confirm the `workforce-private-documents` bucket is private.
5. Configure `SUPABASE_URL` and `SUPABASE_SECRET_KEY` only in Cloudflare Pages server secrets.
6. Test with dummy identities and documents.
7. Migrate records in a staged, reconciled process.
8. Switch operational reads/writes only after parity, authorization, retention, and rollback tests pass.

D1 and Supabase should not both remain long-term sources of truth. The included helper supports transition work, but production cutover requires data reconciliation and explicit approval.


## v9.3 pre-screening and ranking migration

Run `supabase/migrations/202607270002_scaled_recruitment_pipeline.sql` after `202607270001_application_first_invites.sql`. It replaces the application-only invitation trigger with the audited administrator override path and adds stage progress, ranking, administrator alerts, question sets, assignments, answers, and candidate self-read RLS policies.

`OPENAI_API_KEY` enables both generative Brownstone Guide responses and administrator-requested advisory grading drafts. Set `OPENAI_GRADING_MODEL` only when grading should use a different model from `OPENAI_MODEL`. Candidate results are released only after an administrator enters an independent final score and confirms human review.

## v9.4 invitation template parity migration

The Supabase migration target includes:

```text
supabase/migrations/202607270003_invitation_status_stage_templates.sql
```

It mirrors D1 invitation status, stage, template, and controlled-origin metadata. This does not activate Supabase as the production runtime; D1/R2 remains active until an explicit reconciled cutover.

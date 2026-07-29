> **Superseded:** Use `DEPLOY-v9.2.md` and `RELEASE-NOTES-v9.2.md` for the current production update.

# Brownstone Careers Workforce Platform v9.0

## Administrator-regulated onboarding

- Added administrator-managed onboarding task catalog and per-candidate assignment.
- Added candidate submission forms with checkboxes, attestations, electronic signatures, due dates, timestamps, progress, and administrator feedback.
- Added submission review queue with approve, correction-required, and reject decisions.
- Added candidate notifications and a complete material audit trail.

## Brownstone Guide automation

- Upgraded the portal guide into a server-backed AI-assisted customer support workflow.
- Uses candidate task context and progress to provide precise next steps.
- Detects and blocks SSNs, card numbers, passwords, and PINs in chat.
- Supports sentiment-aware responses and explicit human escalation.
- Records support conversations for authorized administrators.
- Includes a safe guided fallback when no OpenAI key is configured.
- The assistant clearly identifies itself as AI and does not impersonate a human representative.

## Secure identity and public application separation

- Public recruitment remains free of SSN and government-ID fields.
- The authenticated Secure Identity Center remains the only approved portal location for SSN and identity documents.
- Structured sensitive values are encrypted server-side; identity files remain private.

## Supabase transition kit

- Added PostgreSQL schema, Supabase Auth relationships, RLS policies, private Storage policy, audit/support tables, and server-only helper utilities.
- D1/R2 remains the active compatibility backend until a controlled Supabase cutover is completed.
- Never expose a Supabase secret/service-role key in browser code.

## Required production action

Apply D1 migration `0004_workflow_ai_support.sql`, then redeploy Cloudflare Pages.

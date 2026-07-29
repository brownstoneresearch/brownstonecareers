# Brownstone Careers Workforce Platform v9.4

Brownstone Careers operates as one connected workforce system with four service identities:

- **`brownstonecareers.agency`** — public recruitment and application-interest website.
- **`onboarding.brownstonecareers.agency`** — individualized confidential application, pre-screening, and onboarding portal.
- **`workforce.brownstonecareers.agency`** — restricted administration, invitation control, ranking, review, support, and audit oversight.
- **`mail.brownstonecareers.agency`** — Resend transactional email authentication only.

## Scaled candidate journey

The standard public path remains application-first:

1. A candidate selects **Apply** and submits application interest through the main-site contact form.
2. An administrator reviews the application queue and creates a personalized invitation.
3. The candidate enters the authenticated portal and submits the confidential application as the first required stage.
4. An administrator assigns and reviews pre-screening, then advances the candidate through the remaining recruitment and onboarding stages.

Authorized administrators can also create a first-time **Manual invitation** for an arbitrary name and email. Manual invitations require an explicit confirmation, a meaningful business reason, the authenticated administrator ID, and a timestamp. The invite form includes controlled **Initial status** and **Starting stage** selections. D1 prevents every access-enabled application-less status unless all override controls are present and the approving administrator is active. Each valid status/stage selection has an exclusive branded email variant that always contains the unchanged candidate ID and a personal access code. The confidential portal application remains available as the privacy-controlled record, and pre-screening assignments remain administrator managed.

## Ranked recruitment pipeline

Candidates are ranked by verified stage completion across:

Application → Pre-screening → Skills assessment → Interview → Offer → Verification → Onboarding → Orientation → Active worker

The ranking is a workflow-progress tool. It does not use protected characteristics and does not make an automated hiring decision. Pre-screening scores are displayed separately from completion rank.

Every completed stage creates an administrator notification with a distinct optional browser tone and a direct link to the candidate record.

## Administrator-managed pre-screening

Administrators can:

- create, publish, archive, and revise question sets;
- define required questions, points, rubrics, and AI guidance;
- assign a published set to a candidate with a due date;
- review submitted answers and rubric evidence;
- request an optional AI advisory scoring draft;
- independently enter the final score, decision, and candidate-facing feedback;
- email the finalized result and publish it to the candidate dashboard.

AI output is advisory only. The system never releases an AI draft automatically and requires an administrator to confirm a human review before finalization.

## Privacy and sensitive-data separation

The public application-interest form excludes resumes, signatures, SSNs, government IDs, banking data, tax records, and other confidential records. Those materials are collected only inside the authenticated portal.

The active Cloudflare backend uses:

- D1 for applications, candidates, invitations, stages, ranks, pre-screening, tasks, decisions, support, notifications, and audit events.
- Private R2 for resumes, identity documents, and verification files.
- Server-side encryption for structured sensitive identity values.
- One encrypted `RESEND_API_KEY` for all transactional email.

The `supabase/` directory contains a controlled PostgreSQL/Auth/RLS/private-Storage migration target. D1/R2 remains the active runtime until a reconciled cutover is completed.

## Main routes

| Experience | Internal path | Production identity |
|---|---|---|
| Public application start | `/contact?type=application-interest` | `https://brownstonecareers.agency` |
| Candidate portal | `/onboarding_portal/` | `https://onboarding.brownstonecareers.agency` |
| Interactive handbook | `/Brownstone_Careers_Unboarding_Handbook/` | Candidate-authenticated onboarding host |
| Workforce dashboard | `/workforce_admin/` | `https://workforce.brownstonecareers.agency` |

Private experiences are omitted from public navigation and the sitemap.

## Brownstone Guide and AI grading

Brownstone Guide remains operational in safe guided mode without an external AI key. Add `OPENAI_API_KEY` to enable generative support and administrator-requested pre-screening rubric drafts. `OPENAI_GRADING_MODEL` can override the general `OPENAI_MODEL` for grading requests.

Never place candidate SSNs, government ID numbers, banking information, passwords, or API keys into AI prompts.

## Local validation

```bash
npm ci
npm test
```

The production build is written to `dist/`.

## Deployment order

1. Read `DEPLOY-v9.4.md` and `WORKFORCE-PORTAL-SETUP.md`.
2. Preserve the existing `WORKFORCE_DB` and `PRIVATE_DOCUMENTS` bindings.
3. Apply every D1 migration through `0008_invitation_status_stage_templates.sql` **before** deploying the v9.4 Functions.
4. Keep the existing `PII_ENCRYPTION_KEY`; never replace it after encrypted records exist.
5. Keep only the shared encrypted `RESEND_API_KEY` for email delivery.
6. Add `OPENAI_API_KEY` when generative Brownstone Guide and AI-assisted pre-screening drafts are required.
7. Run `npm test`, commit, push, and allow Cloudflare Pages to redeploy.

The source package contains no live API keys.

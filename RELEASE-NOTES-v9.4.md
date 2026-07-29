# Brownstone Careers v9.4 release notes

## Scaled invitation control

The administrator invitation form now includes controlled **Initial status** and **Starting stage** selections for both application-linked and manual invitations.

Supported invitation statuses:

- Invited
- Approved
- Onboarding
- Correction required
- Completed
- Active worker

Supported recruitment stages:

- Application
- Pre-screening
- Skills assessment
- Interview
- Offer
- Verification
- Onboarding
- Orientation
- Active worker

Unsafe status/stage combinations are rejected by the interface and API. Suspended and rejected remain candidate-record actions because they intentionally block portal access.

## Exclusive candidate emails

Every accepted status/stage selection resolves to a dedicated branded email variant. Each email always contains:

- the unchanged Brownstone candidate ID;
- a newly generated personal access code;
- selected status and stage;
- invitation expiry;
- stage-specific next steps;
- secure candidate-portal action;
- sensitive-data and code-sharing warnings.

Regenerated access codes preserve the candidate ID, selected status, stage, and template family.

## Database enforcement

D1 migration `0008_invitation_status_stage_templates.sql` adds persistent invitation metadata to candidates and invitations. It also expands the controlled-origin trigger so every access-enabled status requires either:

1. a submitted application, or
2. an authenticated active administrator, timestamp, and documented manual-invitation reason.

## Stage notifications and rankings

Every stage completed through `completeStage()` creates an administrator notification with its stage-specific tone. The ranking board recalculates candidates by weighted, verified stage completion and displays completed/in-progress stage counts.

## Administrator-managed pre-screening

Administrators retain full control of question sets, questions, rubrics, assignments, deadlines, AI advisory grading, final scores, feedback, and result release. AI output remains advisory. A human administrator must review and finalize the result before it is emailed and shown in the candidate dashboard.

Pre-screening result emails now also display the candidate ID.

## Migration

Apply migrations through:

```text
0008_invitation_status_stage_templates.sql
```

before deploying the v9.4 Functions.

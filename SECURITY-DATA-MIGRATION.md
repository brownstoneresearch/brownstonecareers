# Public Application to Secure Onboarding — Data Migration Plan

## Public application policy

The public recruitment website now collects only information needed to evaluate a candidate:

- name and contact details;
- general city/state/country;
- desired role;
- resume and work history;
- skills, availability, and remote-work readiness;
- work-authorization and sponsorship answers;
- applicant privacy consent.

It no longer asks for:

- SSNs or SSN fragments;
- government-issued ID images;
- mother’s maiden name;
- full residential address;
- banking or direct-deposit information;
- tax forms;
- passwords, PINs, or complete financial credentials.

## Private onboarding policy

Sensitive identity records are available only after an administrator advances a candidate and issues an individualized, expiring portal invitation.

The private portal:

- encrypts SSNs, birth dates, and residential details with AES-256-GCM;
- stores identity files in a non-public R2 bucket;
- displays only masked SSN status in the normal admin dashboard;
- records material submission, review, and document-access events;
- prevents sensitive values from entering browser localStorage, email, URLs, or general analytics.

SSN entry is optional unless an authorized onboarding instruction specifically requires it.

## Migration of previously collected records

Before production cutover:

1. Disable old public SSN and ID fields everywhere, including stale deployments.
2. Search form databases, email inboxes, exports, support tickets, logs, backups, and cloud storage for historical copies.
3. Identify the lawful purpose and required retention period for each record.
4. Move only records that must still be retained into approved protected storage.
5. Delete unnecessary copies and document the deletion.
6. Rotate any credentials or links that may have exposed protected files.
7. Update privacy notices and internal access procedures.
8. Notify affected individuals when required by applicable law or counsel.

## Production recommendation

For payroll, tax, Form I-9, E-Verify, background screening, banking, or identity verification, prefer a specialized authorized provider that receives the sensitive value directly. Brownstone’s general recruitment database should retain completion status and masked references whenever possible rather than full source data.

Have qualified employment, privacy, and security counsel review the final workflow, retention schedule, consent language, state requirements, and vendor contracts before collecting live sensitive data.

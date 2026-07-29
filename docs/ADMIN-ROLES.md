# Brownstone Workforce Administrator Roles

Authorization is enforced inside Pages Functions. Cloudflare Access protects the route, while D1 administrator roles control actions after login.

## super_admin

Complete authority, including invitations, status changes, identity review, document access, and system administration.

## recruiter

Can:

- view workforce summaries and candidate records;
- create individualized onboarding invitations;
- regenerate or revoke candidate access;
- update recruitment stage and candidate status;
- request corrections.

Cannot open protected identity files or approve identity submissions unless separately promoted.

## reviewer

Can:

- view candidate records;
- review identity status;
- open protected documents;
- approve, reject, or request correction for identity submissions.

Cannot create invitations or change the overall recruitment stage.

## support

Can:

- view candidate records;
- regenerate or revoke access codes;
- assist with portal access.

Cannot review identity documents or approve employment status.

## auditor

Read-only access to workforce summaries, candidate records, and audit history. No write or document-view authority.

## Important

Never use shared admin accounts. Each administrator should authenticate with an individual email identity so audit events remain attributable.

# Brownstone Careers Production Domain Integration

This source package is configured around four separate Brownstone service identities:

| Service | Production address | Purpose |
|---|---|---|
| Public recruitment | `https://brownstonecareers.agency` | Public pages, roles, applications, privacy, and contact forms |
| Candidate onboarding | `https://onboarding.brownstonecareers.agency` | Personalized candidate access, handbook, NDA, training, orientation, and secure submissions |
| Workforce administration | `https://workforce.brownstonecareers.agency` | Restricted administrator dashboard, candidate regulation, review, and audit history |
| Transactional email | `mail.brownstonecareers.agency` | Resend sender-authentication subdomain only; it is not a public website |

## Cloudflare Pages custom domains

Attach these three domains to the existing `brownstone-careers` Pages project:

```text
brownstonecareers.agency
onboarding.brownstonecareers.agency
workforce.brownstonecareers.agency
```

Do not attach `mail.brownstonecareers.agency` to Pages. Keep its Resend-provided DNS records intact.

The Pages Function at `/` routes the onboarding and workforce subdomain roots to their branded application paths:

```text
onboarding.brownstonecareers.agency/ → /onboarding_portal/
workforce.brownstonecareers.agency/  → /workforce_admin/
```

The protected route handlers also move users from a wrong host to the correct Brownstone subdomain. Administrator APIs reject production requests made outside the workforce host.

## Production URL variables

These non-secret values are already configured in `wrangler.jsonc` and are committed with the source package:

```text
PUBLIC_SITE_URL=https://brownstonecareers.agency
ONBOARDING_PORTAL_URL=https://onboarding.brownstonecareers.agency
WORKFORCE_ADMIN_URL=https://workforce.brownstonecareers.agency
MAIL_SENDING_HOST=mail.brownstonecareers.agency
```

They can be overridden from the Cloudflare Pages dashboard when a separate preview or staging environment needs different hostnames. Do not upload them as encrypted secrets unless an operational policy specifically requires it.

## Dedicated Resend channels

The application supports a separate Resend key for each workflow:

```text
RESEND_API_KEY_RECRUITMENT
RESEND_API_KEY_ONBOARDING
RESEND_API_KEY_ACCESS_CODES
RESEND_API_KEY_CANDIDATE_INVITES
RESEND_API_KEY_WORKFORCE
```

`RESEND_API_KEY` remains supported as a fallback, but separate keys provide better revocation, monitoring, and operational separation.

Never place real API keys in HTML, JavaScript, GitHub, `.dev.vars.example`, screenshots, or documentation. Upload them only as encrypted Cloudflare Pages secrets.

From Git Bash in the project root:

```bash
bash scripts/configure-production-domains-and-email.sh
```

The helper securely prompts for each key and uploads it without writing the values into the repository.

## Sender identity

Recommended:

```text
EMAIL_FROM=Brownstone Careers <notifications@mail.brownstonecareers.agency>
EMAIL_REPLY_TO=recruitment@brownstonecareers.agency
RECRUITMENT_EMAIL=recruitment@brownstonecareers.agency
```

The sender address must use a domain or subdomain verified in Resend.

## Cloudflare Access

Protect the complete workforce hostname:

```text
workforce.brownstonecareers.agency
```

Create a self-hosted Access application with an allow policy limited to approved Brownstone administrator emails. Require MFA through the chosen identity provider. Keep the application-level `ADMIN_EMAILS` authorization list enabled as a second control.

Do not place Cloudflare Access over the entire onboarding hostname. Candidates authenticate with their individualized, expiring access codes and secure portal sessions.

## Deployment

```bash
npm ci
npm test
git add -A
git commit -m "Integrate Brownstone production service domains"
git push origin main
```

For Direct Upload Pages projects:

```bash
npm run build
npx --yes wrangler@latest pages deploy dist --project-name brownstone-careers --branch main
```

## Verification

```bash
curl -I https://brownstonecareers.agency/
curl -I https://onboarding.brownstonecareers.agency/
curl -I https://workforce.brownstonecareers.agency/
curl -fsSL https://brownstonecareers.agency/api/health
```

Expected behavior:

- Public root returns the recruitment website.
- Onboarding root redirects to `/onboarding_portal/`.
- Workforce root reaches Cloudflare Access before the dashboard.
- Health output lists the four configured service identities and readiness of each email channel without revealing secret values.


## v9.2 unified email configuration

The current runtime uses only `RESEND_API_KEY` for recruitment confirmations, contact confirmations, onboarding invitations, regenerated access codes, correction notices, approvals, and workforce notifications. Configure:

```text
RESEND_API_KEY
EMAIL_FROM=Brownstone Careers <support@mail.brownstonecareers.agency>
EMAIL_REPLY_TO=support@brownstonecareers.agency
RECRUITMENT_EMAIL=support@brownstonecareers.agency
```

Old channel-specific key names may be deleted; v9.2 does not read them.

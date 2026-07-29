# Unified Resend setup — Brownstone Careers v9.2

Use one Resend API key for every transactional workflow.

## Resend dashboard

Create the key with:

```text
Name: Brownstone Careers Production
Permission: Sending access
Domain: mail.brownstonecareers.agency
```

## Cloudflare Pages secrets

```text
RESEND_API_KEY=<new sending-access key>
EMAIL_FROM=Brownstone Careers <support@mail.brownstonecareers.agency>
EMAIL_REPLY_TO=support@brownstonecareers.agency
RECRUITMENT_EMAIL=support@brownstonecareers.agency
```

The v9.2 runtime ignores channel-specific key names. This prevents stale invitation or onboarding keys from overriding `RESEND_API_KEY`.

Configure interactively from Git Bash:

```bash
bash scripts/configure-production-domains-and-email.sh
```

Redeploy production after changing Pages secrets.

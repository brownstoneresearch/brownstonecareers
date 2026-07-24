# Resend Email System Upgrade — 24 July 2026

## Completed

- Replaced the obsolete `/assets/logo.png` email image with the live official horizontal logo asset.
- Unified candidate-facing and internal website notifications under `/emails/index.js`.
- Added a professional responsive email shell with official navy header, logo, status badges, cards, CTA buttons, footer, support identity, and safety notice.
- Added an official pre-screening result template.
- Synchronized the CommonJS compatibility template in `/emails/index.cjs`.
- Updated Cloudflare Pages Functions and the optional Express server to use the shared templates.
- Added `EMAIL_REPLY_TO` support so branded subdomain delivery can still route replies to the monitored support inbox.
- Added health diagnostics for the dedicated sending subdomain.
- Added automated tests that fail when a template omits the official logo or reintroduces the invalid image path.
- Added Resend subdomain, DNS, Cloudflare variable, deployment, and verification instructions.

## Required production action

Verify `mail.brownstonecareers.agency` in Resend using the exact SPF and DKIM records generated in the Resend dashboard, then set:

```text
EMAIL_FROM=Brownstone Careers <notifications@mail.brownstonecareers.agency>
EMAIL_REPLY_TO=support@brownstonecareers.agency
```

No DNS values or API secrets are included in this archive.

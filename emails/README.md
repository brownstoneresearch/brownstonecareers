# Brownstone Careers Email Templates

All Resend HTML is generated through `emails/index.js`. The Cloudflare Pages form handler imports the production templates directly, so the website confirmations and internal notifications share one design system.

## Brand system

- Official white lamp-and-wordmark logo on a navy agency header
- Hosted logo: `https://brownstonecareers.agency/assets/brand-logo-horizontal-hd.png`
- Navy, royal blue, white, and soft-blue corporate palette
- Research-driven recruitment and career-development descriptor
- Mobile-responsive, email-safe table layouts
- Branded title badges, reference cards, notices, information tables, CTA buttons, signatures, and security footer
- Candidate values are escaped before being inserted into HTML
- SSN last-four values are masked in internal notifications

## Available templates

- `applicationReceivedEmail`
- `contactReceivedEmail`
- `internalApplicationEmail`
- `internalContactEmail`
- `preScreeningEmail`
- `interviewInviteEmail`
- `offerLetterEmail`
- `recruitmentUpdateEmail`

## Shared components

- `brandedEmailLayout`
- `emailButton`
- `detailCard`
- `informationTable`
- `contentSection`
- `noticeBox`
- `signatureBlock`

`emails/index.cjs` is retained as a CommonJS compatibility build for external tooling. Keep it synchronized with `emails/index.js`.

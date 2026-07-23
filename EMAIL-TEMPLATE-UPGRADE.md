# Brownstone Careers Branded Email System

The email system has been redesigned to match the Brownstone Careers agency identity and is now connected directly to the Cloudflare Pages form handler.

## Production improvements

- Replaced the missing `/assets/logo.png` reference with the official hosted lamp-and-wordmark logo.
- Added a premium navy agency header with the full Brownstone Careers lockup.
- Added research, recruitment, and career-development positioning.
- Rebuilt all layouts with email-safe presentation tables and inline styles.
- Added mobile layout rules for narrow inboxes.
- Added styled reference cards, candidate-data tables, callout notices, CTA buttons, signatures, and confidentiality notices.
- Added a structured internal application summary containing residential address and work-history fields.
- Masked the candidate SSN last four in internal email display.
- Added attachment summaries for resume and ID files.
- Added candidate-safety messaging and official-domain links.
- Connected application and contact form emails to `/emails/index.js`, removing the duplicate legacy email layout from `functions/_shared.js`.

## Templates

1. Application received
2. Contact received
3. Internal candidate application
4. Internal support request
5. Pre-screening invitation
6. Interview invitation
7. Offer of engagement
8. General recruitment update

The CommonJS compatibility version remains available at `emails/index.cjs`.

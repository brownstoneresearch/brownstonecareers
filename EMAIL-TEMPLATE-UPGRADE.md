# Reusable Resend Email System

The project now uses a dedicated `/emails/` directory as the single design system for transactional and recruitment emails.

## Production templates

- Application received
- Contact received
- Internal application notification
- Internal contact notification
- Pre-screening invitation
- Interview invitation
- Offer letter
- General recruitment update

## Shared branding

Every template includes:

- Hosted Brownstone Careers logo
- White branded header
- Consistent typography and spacing
- Blue call-to-action buttons
- Branded footer and website link
- Security notice
- Mobile-safe, table-based email markup
- HTML escaping for user-submitted values

Cloudflare Pages Functions and the Worker entry point import `/emails/index.js`. The legacy Express server uses `/emails/index.cjs`, a compatibility build of the same template system.

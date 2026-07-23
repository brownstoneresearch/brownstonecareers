# Brownstone Careers Production Repair

Version 5.6.0

## Corrected

- Reverted the accidental global CSS changes that exposed mobile navigation, backdrops, hidden email preheaders, and decorative elements.
- Rebuilt the shared header and footer with a consistent executive layout across all pages.
- Kept the WhatsApp number out of visible page content and routed the support button through `/whatsapp`.
- Made all application-page content visible without depending on scroll-animation JavaScript.
- Added accessible mobile navigation with focus management, Escape-key support, focus trapping, and resize cleanup.
- Added an Applicant Privacy Notice and linked it from the application form and footer.
- Added an automated internal-link, asset, fragment, metadata, form, and structured-data audit.
- Removed incompatible legacy Express files from the Cloudflare Pages project.
- Strengthened security headers and long-term asset caching.
- Made Turnstile server verification mandatory for sensitive form submissions.
- Preserved Cloudflare Pages Functions, Resend emails, identity uploads, and candidate confirmation emails.

## Required Cloudflare Pages variables

- `RESEND_API_KEY`
- `EMAIL_FROM`
- `RECRUITMENT_EMAIL`
- `TURNSTILE_SECRET_KEY`

The Turnstile site key remains in the form markup. The secret key must be configured in Cloudflare Pages before production submissions are enabled.

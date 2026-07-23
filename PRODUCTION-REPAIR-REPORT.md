# Brownstone Careers Production Repair Report

## Release
Version 6.0.0

## Completed corrections

- Replaced the legacy, conflicting header markup with a dedicated recruitment-agency navigation system.
- Rebuilt the header logo lockup using the official Brownstone Careers emblem, agency name, and research-driven recruitment descriptor.
- Rebuilt the footer into a professional agency directory with company links, role pathways, career-development links, candidate safety guidance, workplace tools, and application calls to action.
- Removed visible WhatsApp-number presentation while preserving the private `/whatsapp` support redirect.
- Preserved full visibility of the Apply page and all application sections on desktop, tablet, and mobile.
- Improved mobile navigation accessibility with focus management, Escape-key closing, background locking, and responsive menu controls.
- Added an isolated `agency-shell.css` design layer to prevent legacy CSS collisions.
- Updated active-page navigation handling for clean URLs and trailing slashes.
- Updated the web-app manifest to reflect the research-driven recruitment and career-development niche.
- Extended automated audits to reject missing agency-shell assets, incomplete navigation controls, legacy header/footer markup, broken links, duplicate IDs, missing images, invalid JSON-LD, and visible WhatsApp details.

## Validation

Run:

```bash
npm test
```

The test suite validates Cloudflare Pages Functions, application/contact submissions, large file handling, internal links, assets, SEO metadata, JSON-LD, JavaScript syntax, and the production build.

## Required Cloudflare bindings

- `RESEND_API_KEY`
- `EMAIL_FROM`
- `RECRUITMENT_EMAIL`
- `TURNSTILE_SECRET_KEY`

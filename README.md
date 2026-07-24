# Brownstone Careers — Cloudflare Pages

Production-ready static recruitment website with Cloudflare Pages Functions for form handling and Resend email delivery.

## Verified install and build

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm test
```

The project intentionally has no runtime or build dependencies. This keeps Cloudflare's dependency-install phase small and avoids the previous Wrangler/workerd/sharp installation failure.

## Cloudflare Pages Git deployment

1. Push this project to `https://github.com/brownstoneresearch/brownstonecareers.git`.
2. In Cloudflare, open **Workers & Pages → Create → Pages → Connect to Git**.
3. Select the GitHub repository and use:
   - Production branch: `main`
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: `/`
4. Add encrypted variables under **Settings → Variables and Secrets**:
   - `RESEND_API_KEY`
   - `EMAIL_FROM`
   - `RECRUITMENT_EMAIL`
   - `EMAIL_REPLY_TO` (recommended)
   - `TURNSTILE_SECRET_KEY`
5. Redeploy.

Pages Functions are in the root-level `functions/` directory and are deployed automatically with Git builds.


## Official Resend sending identity

Use the dedicated transactional subdomain `mail.brownstonecareers.agency` after it has been verified in Resend. Set:

```text
EMAIL_FROM=Brownstone Careers <notifications@mail.brownstonecareers.agency>
EMAIL_REPLY_TO=support@brownstonecareers.agency
```

All application confirmations, support confirmations, and internal website notifications render through the official `/emails/` design system and include the hosted Brownstone Careers logo. Follow `RESEND-SUBDOMAIN-SETUP.md` for DNS and deployment steps.

## API routes

- `GET /api/health`
- `POST /api/contact`
- `POST /api/applications`

Application uploads accept PDF, DOC, and DOCX resumes up to 5 MB, plus front and back government-ID files in JPG, PNG, WEBP, or PDF format up to 5 MB each. Files are sent as Resend attachments to the authorized recruitment inbox and are not stored in the repository or static site.

## Local development

Copy `.dev.vars.example` to `.dev.vars`, fill in a newly generated Resend key, then run:

```bash
npm ci
npm run build
npm run pages:dev
```

Never commit `.dev.vars`, `.env`, or API keys.

## GitHub update

```bash
git remote set-url origin https://github.com/brownstoneresearch/brownstonecareers.git
git branch -M main
git add -A
git commit -m "Rebuild site for Cloudflare Pages"
git push -u origin main
```

## Agency brand system

The site now uses a dedicated Brownstone Careers recruitment-agency shell. The header combines the official emblem with a concise agency descriptor, while the footer presents the agency mission, career pathways, candidate-safety guidance, workplace tools, and official application actions. The shell is isolated in `public/agency-shell.css` to prevent older component rules from affecting the logo placement or responsive navigation.


## Cloudflare Turnstile and cookies

This build includes Cloudflare Turnstile widgets on the application and contact forms using site key `0x4AAAAAAD4dZ6uvgEldqskh`. `TURNSTILE_SECRET_KEY` is required in Cloudflare Pages; submissions are rejected when server-side verification is not configured. The site also includes a cookie consent banner with necessary, analytics, and marketing preference storage.

Primary live domain for Turnstile: `www.brownstonecareers.agency`. This build includes a root-domain redirect file so `brownstonecareers.agency` redirects to the `www` domain.

## Cloudflare Turnstile setup

This package includes a dedicated setup guide for Brownstone Careers Turnstile configuration:

```text
TURNSTILE-SETUP-BROWNSTONE.md
```

Current Turnstile site key in the website:

```text
0x4AAAAAAD4dZ6uvgEldqskh
```

Add `TURNSTILE_SECRET_KEY` in Cloudflare Pages environment variables before enabling production submissions.


## V2 Executive Brand Upgrade
Includes refined desktop and mobile logo placement, a dedicated Home navigation item, accessible mobile navigation, upgraded cards and forms, and responsive executive styling.

## Unified form handler V3 (v5.1.0)

The live application and contact forms now use one Cloudflare Pages Functions backend. Stale Worker and Express handlers were removed to prevent accidental deployment of older code. The handler includes robust multi-megabyte attachment encoding, explicit `/api/*` routing, request-stage diagnostics, Resend timeouts, idempotency keys, and safe configuration checks.

After deployment, `/api/health` must show:

```json
{
  "ok": true,
  "handlerVersion": "2026-07-23.5",
  "emailConfigured": true,
  "turnstileConfigured": true
}
```

See `FORM-SUBMISSION-V3.md` for the production checklist.

## SEO/GEO and premium form upgrade (v5.3.0)

This build resolves the flagged meta-description and image-alt issues, normalizes clean canonical URLs, adds image-aware sitemaps, expands page-specific structured data, adds Twitter Cards, and introduces automated SEO regression checks. The application and contact forms were also rebuilt into polished, responsive fieldset sections without changing their API endpoints or field names.

Run the complete validation suite before deployment:

```bash
npm ci
npm test
```

See `SEO-GEO-FORM-UPGRADE.md` for the implementation summary and post-deployment indexing checklist.

## Version 6.0.0 — recruitment agency shell

- New professional header and footer across all public pages.
- Responsive logo lockups optimized for desktop, tablet, and mobile.
- Private WhatsApp support redirect with no visible phone number.
- Updated PWA icons and manifest metadata.
- Automated checks for the agency shell, navigation controls, assets, forms, SEO, and legacy markup.


## Version 6.1 brand navigation refinement

- Removed the Home text link from desktop and mobile navigation while keeping the lamp-logo brand lockup linked to the homepage.
- Preserved the original Brownstone lamp emblem in the header, mobile drawer, and footer.
- Realigned the agency name and descriptor beside the emblem for a consistent left edge and balanced vertical rhythm.

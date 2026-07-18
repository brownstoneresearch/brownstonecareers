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
5. Redeploy.

Pages Functions are in the root-level `functions/` directory and are deployed automatically with Git builds.

## API routes

- `GET /api/health`
- `POST /api/contact`
- `POST /api/applications`

Application uploads accept PDF, DOC, and DOCX resumes up to 5 MB. The resume is sent as a Resend attachment and is not stored in the repository or static site.

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

## Logo refinement

The header and footer now use a true transparent PNG logo with responsive sizing, clean alignment, and no colored image background.


## Cloudflare Turnstile and cookies

This build includes Cloudflare Turnstile widgets on the application and contact forms using site key `0x4AAAAAAD4dZ6uvgEldqskh`. For full server-side verification on Cloudflare Pages, add `TURNSTILE_SECRET_KEY` as an environment variable in your Pages project settings. The site also includes a cookie consent banner with necessary, analytics, and marketing preference storage.

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

Add `TURNSTILE_SECRET_KEY` in Cloudflare Pages environment variables for full server-side verification.

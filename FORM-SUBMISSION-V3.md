# Brownstone Careers form submission V3

This package uses one Cloudflare Pages Functions implementation for all live form routes. The obsolete Worker/Express form handlers were removed so the project cannot accidentally deploy stale backend code.

## Live routes

- `GET /api/health`
- `POST /api/applications`
- `POST /api/contact`

The health response includes `handlerVersion: 2026-07-22.3`. If the live endpoint shows a different value, the latest Functions build is not deployed.

## Cloudflare Pages Git settings

- Framework preset: `None`
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: `/`
- Production branch: `main`

The project includes `wrangler.jsonc` with `pages_build_output_dir: ./dist` and `public/_routes.json` so `/api/*` is explicitly handled by Pages Functions.

## Required production variables

Configure these under **Workers & Pages → brownstone-careers → Settings → Variables and Secrets**:

- `RESEND_API_KEY`
- `EMAIL_FROM`
- `RECRUITMENT_EMAIL`
- `TURNSTILE_SECRET_KEY`

Recommended values:

- `EMAIL_FROM`: `Brownstone Careers <careers@brownstonecareers.agency>`
- `RECRUITMENT_EMAIL`: your real recruitment inbox

The domain used in `EMAIL_FROM` must be verified in Resend.

## Verification after deployment

Open:

`https://brownstonecareers.agency/api/health`

Confirm:

- `ok` is `true`
- `handlerVersion` is `2026-07-22.3`
- `emailConfigured` is `true`
- `turnstileConfigured` is `true`

Then submit both the application and contact forms. Any failure now returns an incident ID and stage instead of an untraceable generic error.

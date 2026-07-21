# Brownstone Careers form submission fix

## Fixed endpoints
- `POST /api/applications`
- `POST /api/contact`
- `GET /api/health`

## Required Cloudflare Pages variables
Configure these under **Cloudflare Dashboard → Workers & Pages → brownstone-careers → Settings → Variables and Secrets** for both Production and Preview where needed:

- `RESEND_API_KEY` — secret Resend API key
- `EMAIL_FROM` — verified sender, for example `Brownstone Careers <careers@brownstonecareers.agency>`
- `RECRUITMENT_EMAIL` — inbox that receives applications and contact messages
- `TURNSTILE_SECRET_KEY` — secret matching the Turnstile site key in the forms

The visible Turnstile site key is already present in `public/apply.html` and `public/contact.html`. It must be configured in Cloudflare Turnstile for the production hostname.

## Deployment
Deploy from the project root so Cloudflare includes the `functions/` directory:

```powershell
npm ci
npm test
npx wrangler pages deploy .\public --project-name brownstone-careers --branch main
```

Do not upload only the contents of `public/` through a method that excludes the project-level `functions/` directory, or `/api/*` form handlers will not deploy.

## Verification
After deployment, visit:

`https://www.brownstonecareers.agency/api/health`

The JSON should show:
- `"ok": true`
- `"emailConfigured": true`
- `"turnstileConfigured": true`

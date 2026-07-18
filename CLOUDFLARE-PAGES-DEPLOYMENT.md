# Cloudflare Pages deployment

## Dashboard configuration

Use a Pages project connected to GitHub, not a standalone Worker build.

| Setting | Value |
|---|---|
| Framework preset | None |
| Production branch | main |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/` |
| Node version | 22 |

The build copies `public/` into `dist/`. Cloudflare discovers the root-level `functions/` directory separately and deploys the API routes as Pages Functions.

## Variables and secrets

Add these to both Production and Preview when previews must send email:

- `RESEND_API_KEY`: a current Resend sending key
- `EMAIL_FROM`: a sender on a verified Resend domain
- `RECRUITMENT_EMAIL`: the recruitment inbox

Do not put secret values in GitHub, `package.json`, `wrangler.toml`, or this document.

## Health check

After deployment, visit `/api/health`. A correctly configured deployment returns `ok: true` and `emailConfigured: true`.

## Troubleshooting

If Cloudflare still restores an old dependency cache, choose **Retry deployment → Clear build cache and retry**.

If the project was previously created as a Worker, create a new Pages project or change the deployment source to Pages Git integration. The configuration for this package is Pages-oriented.

# Brownstone Careers — Cloudflare Workers Deployment

This release is Cloudflare-native. It serves the website from `public/` and runs the form APIs from `src/index.js`.

## Required Cloudflare secrets

- `RESEND_API_KEY`
- `EMAIL_FROM`
- `RECRUITMENT_EMAIL`

Use a newly generated Resend key. Never commit `.dev.vars`, `.env`, or a production key.

## Local test

```powershell
npm install
Copy-Item .dev.vars.example .dev.vars
notepad .dev.vars
npm run dev
```

Visit the local URL printed by Wrangler and test:

- `/api/health`
- `/contact.html`
- `/apply.html`

## Direct deployment from your computer

Authenticate once:

```powershell
npx wrangler login
```

Configure secrets:

```powershell
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put EMAIL_FROM
npx wrangler secret put RECRUITMENT_EMAIL
```

Deploy:

```powershell
npm run deploy
```

## Cloudflare dashboard Git deployment

Connect this repository:

```text
https://github.com/brownstoneresearch/brownstonecareers.git
```

Use these settings:

```text
Build command: npm install
Deploy command: npx wrangler deploy
Root directory: /
```

Do not set the assets directory to `.`. `wrangler.jsonc` already points it to `./public`.

In the Worker project, add the three values under **Settings → Variables and Secrets**. Set all three as Secrets if your dashboard supports it.

## Resend domain

Verify `brownstonecareers.agency` in Resend and publish the SPF and DKIM DNS records Resend provides. The configured sender is:

```text
Brownstone Careers <applications@brownstonecareers.agency>
```

## Production checks

1. Open `/api/health`; it should report `emailConfigured: true`.
2. Send a contact message.
3. Submit an application with a PDF/DOC/DOCX under 5 MB.
4. Confirm recruiter and candidate emails arrive.
5. Confirm `.env`, `.dev.vars`, and `node_modules` are absent from GitHub.

## Troubleshooting

### Asset too large

This means the repository root was selected as the assets folder. The corrected configuration uses:

```json
"assets": { "directory": "./public" }
```

### Email delivery is not configured

Add all three Worker secrets, then redeploy.

### Resend rejects the sender

Verify the domain and ensure `EMAIL_FROM` uses an address on the verified domain.

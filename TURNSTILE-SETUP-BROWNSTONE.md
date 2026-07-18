# Brownstone Careers — Cloudflare Turnstile Setup

This build already includes Cloudflare Turnstile on the Apply and Contact forms.

## Site key already injected

```text
0x4AAAAAAD4dZ6uvgEldqskh
```

The site key is included in:

- `public/apply.html`
- `public/contact.html`
- `dist/apply.html`
- `dist/contact.html`

## Cloudflare dashboard setup

1. Log in to Cloudflare.
2. Go to **Turnstile**.
3. Click **Add widget**.
4. Use this recommended setup:

```text
Widget name: Brownstone Careers Forms
Widget mode: Managed
Primary production hostname:
- www.brownstonecareers.agency
Optional secondary hostname:
- brownstonecareers.agency
- your Cloudflare Pages preview domain, if testing preview deployments
```

This package also includes Cloudflare Pages redirect rules in `public/_redirects` and `dist/_redirects` so `brownstonecareers.agency/*` redirects to `https://www.brownstonecareers.agency/*`. This keeps the Turnstile widget running on the `www` production domain.

## Required environment variable

In Cloudflare Pages, go to:

**Workers & Pages → Brownstone Careers project → Settings → Environment variables**

Add this variable in both **Production** and **Preview**:

```text
TURNSTILE_SECRET_KEY=your_secret_key_from_cloudflare
```

Keep the secret key private. Do not place it inside HTML, client-side JavaScript, GitHub public files, or screenshots.

## Backend verification already included

The Cloudflare Pages Functions backend verifies the Turnstile token before processing form submissions.

Verification is handled in:

```text
functions/_shared.js
```

Routes protected by Turnstile:

```text
/api/applications
/api/contact
```

## Files included for Turnstile

Frontend widget script:

```html
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
```

Apply form widget:

```html
<div class="cf-turnstile" data-sitekey="0x4AAAAAAD4dZ6uvgEldqskh" data-theme="light" data-action="application"></div>
```

Contact form widget:

```html
<div class="cf-turnstile" data-sitekey="0x4AAAAAAD4dZ6uvgEldqskh" data-theme="light" data-action="contact"></div>
```

## Local testing

Copy `.dev.vars.example` to `.dev.vars`, then add your real values:

```text
RESEND_API_KEY=your_resend_api_key
EMAIL_FROM=Brownstone Careers <noreply@brownstonecareers.agency>
RECRUITMENT_EMAIL=your_recruitment_email
TURNSTILE_SECRET_KEY=your_turnstile_secret_key
```

Run locally:

```bash
npm install
npm run dev
```

## Deployment

```bash
git add -A
git commit -m "Configure Cloudflare Turnstile"
git push origin main
```

After deployment, test:

- `https://www.brownstonecareers.agency/apply`
- `https://www.brownstonecareers.agency/contact`
- `https://www.brownstonecareers.agency/api/health`

The health route should report Turnstile as configured after the secret key is set in Cloudflare Pages.

## Important notes

- The site key is public and safe to place in HTML.
- The secret key is private and must only be stored as a Cloudflare environment variable.
- If the Turnstile widget does not appear on preview deployments, add the preview hostname to the Turnstile widget hostnames list.
- Server-side verification must stay enabled before application or contact emails are sent.

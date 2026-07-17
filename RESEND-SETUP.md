# How to Make Resend Emailing Work Properly

## Security first

The API key previously shared in chat should be considered exposed. Revoke it in Resend and create a new key with **Sending access**. Do not place a live API key in this ZIP, HTML, CSS, JavaScript, GitHub, or any public folder.

## 1. Verify your domain

In Resend:

1. Open **Domains**.
2. Add `brownstonecareers.agency` or `mail.brownstonecareers.agency`.
3. Add all DNS records Resend provides.
4. Wait until SPF and DKIM show as verified.
5. Add DMARC after verification.

Your `EMAIL_FROM` address must use the verified domain.

## 2. Create the environment file

Copy `.env.example` to `.env`.

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

macOS/Linux:

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=3000
RESEND_API_KEY=re_your_new_private_key
EMAIL_FROM=Brownstone Careers <applications@brownstonecareers.agency>
RECRUITMENT_EMAIL=support@brownstonecareers.agency
```

If you verified `mail.brownstonecareers.agency`, use:

```env
EMAIL_FROM=Brownstone Careers <applications@mail.brownstonecareers.agency>
```

## 3. Install and run

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000
```

Do not open the HTML files directly. The forms require the Node.js server.

## 4. Test

- Submit the contact form.
- Submit an application with a PDF, DOC, or DOCX resume under 5 MB.
- Confirm the recruitment inbox receives the submission.
- Confirm the candidate receives a reference-number email.
- Visit `http://localhost:3000/api/health`; `emailConfigured` should be `true`.

## 5. Deploy

Use Node.js hosting such as Render, Railway, Fly.io, DigitalOcean, AWS, or a Node-compatible VPS.

Typical settings:

- Build command: `npm install`
- Start command: `npm start`
- Node version: 20+
- Environment variables:
  - `RESEND_API_KEY`
  - `EMAIL_FROM`
  - `RECRUITMENT_EMAIL`

Enter secrets in the host dashboard. Never upload `.env`.

## Troubleshooting

- **Domain not verified:** Your `EMAIL_FROM` domain must exactly match a verified Resend domain.
- **No email received:** Check Resend Logs, spam folders, SPF, DKIM, and DMARC.
- **Form delivery error:** Check server logs and `/api/health`.
- **Resume rejected:** Only PDF, DOC, and DOCX files up to 5 MB are allowed.
- **Static hosting failure:** This project requires Node.js; basic static hosting cannot run `server.js`.

# Brownstone Careers — Resend Emailing Edition

This package contains the complete website and a Node.js backend for:

- Secure job application submission
- Resume/CV email attachments
- Candidate confirmation emails
- Application reference numbers
- Support request emails
- Support confirmation emails
- Rate limiting, validation, and spam honeypot protection

## Start locally

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Add a newly generated Resend API key.
5. Verify your sending domain in Resend.
6. Run `npm start`.
7. Open `http://localhost:3000`.

Read `RESEND-SETUP.md` for full instructions.


## Windows one-command environment setup

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup-env.ps1
```

The script securely prompts for a new Resend key and writes `.env` only on your computer.

See `DEPLOYMENT-GITHUB.md` for complete GitHub, Render, Railway, and cPanel deployment steps.

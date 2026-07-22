# Form submission error corrected

## Root cause

The application route referenced three resume-validation constants that were not declared:

- `MAX_RESUME_BYTES`
- `ALLOWED_EXTENSIONS`
- `ALLOWED_TYPES`

As soon as an applicant attached a resume, the Pages Function threw a `ReferenceError`. The route-level safety handler then returned the generic message:

`A server error occurred. Please try again.`

## Correction

This build declares the missing constants, validates PDF/DOC/DOCX uploads up to 5 MB, includes the attachment content type for Resend, and adds an executable end-to-end test for both form handlers.

Run before deployment:

```bash
npm ci
npm test
```

Cloudflare Pages Git settings:

- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: `/`

Required production secrets/variables:

- `RESEND_API_KEY`
- `EMAIL_FROM`
- `RECRUITMENT_EMAIL`
- `TURNSTILE_SECRET_KEY`

After deployment, verify:

`https://www.brownstonecareers.agency/api/health`

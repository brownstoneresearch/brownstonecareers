# Brownstone Careers

Cloudflare-native recruitment website for Brownstone Careers.

## Architecture

- Static website: `public/`
- Worker APIs: `src/index.js`
- Contact API: `POST /api/contact`
- Application API: `POST /api/applications`
- Health check: `GET /api/health`
- Email provider: Resend REST API
- Resume types: PDF, DOC, DOCX, up to 5 MB

## Commands

```bash
npm install
npm run dev
npm run check
npm run deploy
```

Read `CLOUDFLARE-DEPLOYMENT.md` and `GITHUB-UPDATE.md` before deployment.

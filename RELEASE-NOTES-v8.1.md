# Brownstone Careers Workforce Platform v8.1

## Production identity upgrade

- Made `brownstonecareers.agency` the canonical public site.
- Added first-class onboarding and workforce domain helpers.
- Added host-aware routing for the onboarding and workforce root addresses.
- Added production host separation for private portal and handbook routes.
- Restricted administrator APIs to the workforce host in production.
- Added private `robots.txt` behavior for onboarding, workforce, and mail hosts.

## Email orchestration upgrade

- Added dedicated Resend channels for recruitment, onboarding, regenerated access codes, new candidate invitations, and workforce administration.
- Preserved `RESEND_API_KEY` as a backwards-compatible fallback.
- Added per-channel readiness information to `/api/health` and the administrator system status API.
- Added a secure Git Bash configuration helper that prompts for secrets without writing them into source files.

## Security

- No live Resend API key is included in this package.
- The mail subdomain remains an email-authentication identity and is not treated as a public website.
- Candidate invitation emails use the onboarding domain directly.

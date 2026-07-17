# Brownstone Careers: Resend, Deployment, and GitHub Update Guide

## Security requirement

Never commit or upload `.env`. The project `.gitignore` already excludes it.

Any Resend key pasted into chat, email, screenshots, or a public repository should be revoked and replaced before production use.

## A. Local Windows setup

Open PowerShell inside the extracted project folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup-env.ps1
npm install
npm start
```

Open:

```text
http://localhost:3000
```

Check configuration:

```text
http://localhost:3000/api/health
```

Expected result:

```json
{
  "ok": true,
  "emailConfigured": true,
  "service": "Brownstone Careers"
}
```

## B. Resend domain configuration

1. Sign in to Resend.
2. Add `brownstonecareers.agency` under Domains.
3. Add the SPF and DKIM DNS records Resend supplies.
4. Wait until the domain is verified.
5. Keep this sender in your host environment:

```text
Brownstone Careers <applications@brownstonecareers.agency>
```

6. Set the receiving address to:

```text
support@brownstonecareers.agency
```

## C. Create or update the GitHub repository

### First upload to a new repository

Create an empty GitHub repository without adding a README or `.gitignore`, then run:

```powershell
git init
git branch -M main
git add .
git status
git commit -m "Add Brownstone Careers Resend website"
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```

Before committing, `git status` must not show `.env`.

### Update an existing repository

Inside the project folder:

```powershell
git status
git add .
git commit -m "Update Resend email integration and deployment setup"
git pull --rebase origin main
git push origin main
```

If the existing repository is not connected locally:

```powershell
git remote -v
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git branch -M main
git push -u origin main
```

## D. Remove a secret accidentally committed to GitHub

1. Revoke the exposed Resend key immediately.
2. Remove `.env` from Git tracking:

```powershell
git rm --cached .env
git commit -m "Remove local environment file"
git push origin main
```

3. Confirm `.env` is listed in `.gitignore`.
4. Create a new Resend key.
5. For a secret present in older commits, rewrite repository history using an approved secret-removal tool or contact GitHub Support.

Revoking the credential is required even after deleting the file because old commits may still contain it.

## E. Deploy on Render

1. Push this project to GitHub.
2. In Render, create a new **Web Service**.
3. Connect the GitHub repository.
4. Use:
   - Runtime: Node
   - Build command: `npm install`
   - Start command: `npm start`
5. Add environment variables:
   - `RESEND_API_KEY`
   - `EMAIL_FROM`
   - `RECRUITMENT_EMAIL`
6. Do not add quotation marks around values.
7. Deploy and test `/api/health`, `/contact.html`, and `/apply.html`.

Render normally supplies `PORT`; the app also defaults to port 3000 locally.

## F. Deploy on Railway

1. Create a Railway project from the GitHub repository.
2. Open Variables.
3. Add:
   - `RESEND_API_KEY`
   - `EMAIL_FROM`
   - `RECRUITMENT_EMAIL`
4. Railway detects `npm start`.
5. Generate a public domain and test the forms.

## G. Deploy on a Node-enabled cPanel account

1. Upload the project without `node_modules` and without `.env`.
2. Open **Setup Node.js App**.
3. Choose Node 20 or newer.
4. Set the application root to the project directory.
5. Set the startup file to `server.js`.
6. Add the three environment variables in the cPanel interface.
7. Run `npm install`.
8. Restart the Node application.

Basic static-only hosting cannot run this backend.

## H. Final production test

- `/api/health` reports `emailConfigured: true`.
- Contact form sends to the recruitment inbox.
- Applicant form sends the resume attachment.
- Applicant receives a confirmation and reference number.
- Replying to the recruiter notification addresses the candidate.
- SPF and DKIM are verified.
- `.env` is absent from GitHub.
- The production API key has Sending access only.

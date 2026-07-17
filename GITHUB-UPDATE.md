# Update the Brownstone Careers GitHub Repository

Repository:

```text
https://github.com/brownstoneresearch/brownstonecareers.git
```

## Replace the existing repository contents

Extract this ZIP into your local repository folder, then run:

```powershell
git remote set-url origin https://github.com/brownstoneresearch/brownstonecareers.git
git branch -M main
git add -A
git status
git commit -m "Rebuild Brownstone Careers for Cloudflare Workers"
git pull --rebase origin main
git push origin main
```

Before committing, ensure `git status` does not list `.dev.vars`, `.env`, or `node_modules`.

## Clean previously tracked Node modules

```powershell
git rm -r --cached node_modules
git commit -m "Remove generated dependencies from repository"
git push origin main
```

If Git reports that `node_modules` is not tracked, no action is required.

## GitHub Actions deployment secrets

The included deployment workflow needs repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `RECRUITMENT_EMAIL`

Add them under **Repository Settings → Secrets and variables → Actions**.

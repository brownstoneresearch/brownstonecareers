# GitHub deployment

Repository: `https://github.com/brownstoneresearch/brownstonecareers.git`

Before pushing, remove previously tracked generated folders:

```bash
git rm -r --cached node_modules dist .wrangler 2>/dev/null || true
git add -A
git commit -m "Deploy Brownstone Careers with Cloudflare Pages Functions"
git push origin main
```

The included GitHub Actions workflow only validates `npm ci`, JavaScript syntax, and the static build. Cloudflare performs production deployment through its GitHub integration.

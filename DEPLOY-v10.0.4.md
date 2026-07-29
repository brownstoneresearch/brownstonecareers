# Deploy Brownstone Careers v10.0.4

This is a JavaScript/runtime hotfix. It does not add a D1 migration.

```bash
npm ci
npm test
git add -A
git commit -m "Deploy Brownstone Careers v10.0.4 dashboard runtime hotfix"
git push origin main
```

After Cloudflare Pages reports success, hard-refresh the Workforce Administration page with `Ctrl + Shift + R`.

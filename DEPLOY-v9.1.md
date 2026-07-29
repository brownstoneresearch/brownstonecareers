# Deploy v9.1

From the Git-connected repository root:

```bash
export WRANGLER_CACHE_DIR="${WRANGLER_CACHE_DIR:-$HOME/.cache/wrangler}"
mkdir -p "$WRANGLER_CACHE_DIR"

bash scripts/configure-private-storage.sh
npx --yes wrangler@latest d1 migrations apply brownstone-workforce --remote
npm ci
npm test
git add -A
git commit -m "Deploy Brownstone Careers v9.1 private application workflow"
git push origin main
```

The provisioning script preserves existing D1 bindings, creates or reuses the private R2 bucket, adds the exact `PRIVATE_DOCUMENTS` binding, and creates `PII_ENCRYPTION_KEY` only when one does not already exist.

The one shared email secret is:

```text
RESEND_API_KEY
```

The production sender remains:

```text
Brownstone Careers <support@mail.brownstonecareers.agency>
```

Brownstone Guide runs safely without an OpenAI key. To enable optional generative answers, add `OPENAI_API_KEY` as a Cloudflare Pages secret and redeploy.

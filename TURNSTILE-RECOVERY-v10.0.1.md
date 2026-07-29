# Brownstone Careers Turnstile Recovery — v10.0.1

Existing widget (unchanged): `0x4AAAAAAD4dZ6uvgEldqskh`

This recovery update:

- keeps the existing sitekey;
- uses the Cloudflare Pages secret `TURNSTILE_SECRET`;
- validates `cf-turnstile-response` on the server using the canonical Siteverify endpoint;
- fails closed on network, non-JSON, non-2xx, unsuccessful, wrong-action, or wrong-hostname responses;
- uses the action marker `turnstile-spin-v2`;
- resets the browser widget after success or failure so retries receive a fresh single-use token;
- protects the public contact/application-interest form and the existing application endpoint;
- does not create a new widget or deploy additional infrastructure.

## Secure configuration

Create a Cloudflare API token with Account Turnstile Read and Edit access for the Brownstone account. In Git Bash:

```bash
export CLOUDFLARE_ACCOUNT_ID="345cfd260888bf9884abfea35d896c82"
read -s -p "Cloudflare API token: " CLOUDFLARE_API_TOKEN
echo
export CLOUDFLARE_API_TOKEN
bash scripts/configure-turnstile-recovery.sh
unset CLOUDFLARE_API_TOKEN
```

The script fetches the existing widget secret, validates it in memory, and pipes it directly into the encrypted Pages secret named `TURNSTILE_SECRET`. It does not print or save the widget secret.

## Deployment

```bash
npm ci
npm test
git add -A
git commit -m "Fix canonical Cloudflare Turnstile verification"
git push origin main
```

After the Cloudflare deployment succeeds, verify `/api/health` reports `turnstileConfigured: true`, hard-refresh the contact page, and submit a fresh Turnstile token.

# Turnstile production deployment

## Existing widget

- Site key: `0x4AAAAAAEA0g9ELRe9IQHmp`
- Frontend action: `turnstile-spin-v2`
- Backend secret binding: `TURNSTILE_SECRET`

## Cloudflare Pages production secret

Open Cloudflare Dashboard:

1. Workers & Pages
2. `brownstone-careers`
3. Settings
4. Variables and Secrets
5. Production
6. Add encrypted secret `TURNSTILE_SECRET`
7. Enter the secret paired with the existing widget
8. Save
9. Redeploy the latest production deployment

Do not add the secret to source code, GitHub, browser JavaScript, or documentation.

## Runtime verification

After redeployment, request `/api/health` and confirm:

```json
{
  "turnstileConfigured": true,
  "turnstileSitekey": "0x4AAAAAAEA0g9ELRe9IQHmp",
  "turnstileSecretBinding": "TURNSTILE_SECRET",
  "turnstileAction": "turnstile-spin-v2"
}
```

The public contact/application-interest form must be tested with a newly generated token because Turnstile tokens are single-use.

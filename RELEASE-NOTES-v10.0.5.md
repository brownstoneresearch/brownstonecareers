# Brownstone Careers v10.0.5

## Turnstile production binding hardening

- Uses the existing Turnstile widget site key `0x4AAAAAAEA0g9ELRe9IQHmp`.
- Uses only the encrypted backend binding `TURNSTILE_SECRET`.
- Does not create, retrieve, rotate, or modify a Cloudflare Turnstile widget.
- Keeps the public application-interest/contact form protected with `data-action="turnstile-spin-v2"`.
- Uses canonical server-side Siteverify with `secret`, `response`, and `remoteip`.
- Requires `success === true` before the existing form handler continues.
- Preserves action and hostname checks and resets single-use browser tokens before retry.
- Replaces obsolete Cloudflare widget-recovery automation with a no-API configuration check.

## Production requirement

Add `TURNSTILE_SECRET` to the **Production** Variables and Secrets for the `brownstone-careers` Pages project, then redeploy. The value must be the secret paired with site key `0x4AAAAAAEA0g9ELRe9IQHmp`.

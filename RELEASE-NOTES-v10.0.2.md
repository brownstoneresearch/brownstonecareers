# Brownstone Careers v10.0.2

## New-PC and Turnstile recovery correction

- Replaces the Python-dependent Turnstile recovery with a Node.js implementation.
- Avoids the Windows `spawnSync npx.cmd EINVAL` failure by piping the validated secret to Wrangler from Bash.
- Preserves existing Turnstile sitekey `0x4AAAAAAD4dZ6uvgEldqskh`.
- Retrieves the existing widget secret through the Cloudflare API.
- Validates it through canonical server-side Siteverify.
- Stores it only as the encrypted Pages secret `TURNSTILE_SECRET`.
- Creates no additional widget or infrastructure.
- Includes the existing production D1 binding `WORKFORCE_DB` for database `brownstone-workforce` so a new workstation does not lose the workforce database connection.

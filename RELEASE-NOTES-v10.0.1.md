# Brownstone Careers v10.0.1

## Cloudflare Turnstile recovery

- Standardized the production secret binding on `TURNSTILE_SECRET`.
- Preserved widget sitekey `0x4AAAAAAEA0g9ELRe9IQHmp`.
- Added canonical backend Siteverify validation.
- Added action and same-origin hostname enforcement.
- Added secure existing-widget secret retrieval and validation script.
- Updated health reporting, local examples, documentation, and automated tests.
- Removed all source references to the obsolete `TURNSTILE_SECRET_KEY` name.

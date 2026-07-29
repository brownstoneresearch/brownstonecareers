# Brownstone Careers Workforce Platform v8.1.1

## Workforce administration blank-page repair

- Keeps the admin CSS and JavaScript available even when D1 is temporarily unavailable.
- Falls back safely for allowlisted Cloudflare Access administrators when D1 migrations have not finished.
- Replaces unhandled server errors with a branded diagnostic page and incident reference.
- Adds an in-dashboard connection warning and retry control for API or binding failures.
- Handles unexpected HTML responses from Cloudflare Access or Pages Functions without silently failing.
- Adds automated regression tests for static admin assets and a missing `admins` table.

## Deployment requirement

The dashboard still requires the production `WORKFORCE_DB` binding and all migrations for candidate records, audit activity, and document workflows. This release ensures missing bindings or migrations no longer present as an empty page.

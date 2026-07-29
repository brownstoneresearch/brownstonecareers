# Deploy Brownstone Careers v10.1.0

Apply this version from the Git-connected Brownstone Careers repository.

## 1. Back up and apply the D1 migration

```bash
npx --yes wrangler@latest d1 export brownstone-workforce --remote --output="$HOME/.brownstone-backups/brownstone-workforce-before-v10.1.0.sql"
npx --yes wrangler@latest d1 migrations apply brownstone-workforce --remote
```

Confirm `0010_mature_journey_orchestration.sql` is recorded.

## 2. Validate

```bash
npm ci
npm test
```

Do not deploy if any audit fails.

## 3. Commit and push

```bash
git add -A
git commit -m "Deploy Brownstone Careers v10.1 mature sequential journeys"
git push origin main
```

## 4. Production verification

Hard-refresh both dashboards and test this controlled sequence:

1. Candidate submits the confidential application.
2. Candidate sees “Application submitted — review in progress.”
3. Administrator approves the application submission.
4. Pre-screening becomes the only current candidate stage.
5. A future-stage URL or API action returns a locked-stage response.
6. Candidate rank and administrator notifications update after each verified completion.
7. Pagination works across candidate, ranking, pre-screening, submission, support, notification, audit, task, and candidate-notification queues.

No new Cloudflare secret is required for v10.1.0. Preserve all existing D1, R2, Turnstile, Resend, session, invitation, and encryption bindings.

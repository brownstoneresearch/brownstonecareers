# Deploy Brownstone Careers v9.3

Run these commands from the Git-connected Brownstone Careers repository.

## 1. Preserve production bindings

Confirm these existing bindings remain unchanged:

```text
WORKFORCE_DB → brownstone-workforce
PRIVATE_DOCUMENTS → brownstone-private-documents
```

Do not create a second D1 database. Do not replace an existing `PII_ENCRYPTION_KEY`.

## 2. Apply the mandatory migration first

```bash
export WRANGLER_CACHE_DIR="${WRANGLER_CACHE_DIR:-$HOME/.cache/wrangler}"
mkdir -p "$WRANGLER_CACHE_DIR"

npx --yes wrangler@latest d1 migrations apply \
  brownstone-workforce \
  --remote
```

Confirm `0007_scaled_recruitment_pipeline.sql` is applied. It replaces the v9.2 application-only trigger with a controlled administrator-override trigger and adds stage, ranking, notification, and pre-screening tables.

## 3. Configure optional AI assistance

Brownstone Guide works in guided mode without a key. AI-assisted pre-screening drafts require:

```bash
npx --yes wrangler@latest pages secret put \
  OPENAI_API_KEY \
  --project-name brownstone-careers
```

Optional model variables:

```text
OPENAI_MODEL=gpt-5.6
OPENAI_GRADING_MODEL=gpt-5.6
```

Keep all keys server-side.

## 4. Validate

```bash
npm ci
npm test
```

Do not deploy when validation fails.

## 5. Commit and push

```bash
git add -A
git commit -m "Deploy Brownstone Careers v9.3 scaled recruitment pipeline"
git push origin main
```

## 6. Production verification

1. Submit application interest on the main website and invite that applicant.
2. Create a separate manual first-time invitation and confirm an override reason is mandatory.
3. Sign in as each test candidate and submit the confidential portal application first.
4. Confirm pre-screening assignment is blocked until that confidential application is submitted.
5. Assign a published pre-screening set and submit answers from the candidate portal.
6. Generate an AI advisory draft when configured.
7. Enter an independent administrator score and feedback, confirm human review, and release the result.
8. Confirm the candidate receives email and dashboard notification.
9. Complete a stage and confirm the administrator notification and unique tone.
10. Open Rankings and confirm candidates are ordered by stage-completion percentage.

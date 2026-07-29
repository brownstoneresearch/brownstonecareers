# Deploy Brownstone Careers v9.4

Apply this release to the existing Git-connected Brownstone Careers repository. Preserve `.git`, `wrangler.jsonc`, `WORKFORCE_DB`, `PRIVATE_DOCUMENTS`, and all Cloudflare secret values.

## 1. Confirm the required migration files

```bash
ls migrations/000{5,6,7,8}_*.sql
```

Expected final migration:

```text
0008_invitation_status_stage_templates.sql
```

## 2. Back up production D1

```bash
mkdir -p "$HOME/.brownstone-backups"

npx --yes wrangler@latest d1 export \
  brownstone-workforce \
  --remote \
  --output "$HOME/.brownstone-backups/brownstone-workforce-before-v9.4-$(date +%Y%m%d-%H%M%S).sql"
```

## 3. Apply D1 migrations before deploying Functions

```bash
npx --yes wrangler@latest d1 migrations list \
  brownstone-workforce \
  --remote

npx --yes wrangler@latest d1 migrations apply \
  brownstone-workforce \
  --remote
```

Approve the operation when prompted.

## 4. Verify the v9.4 schema

```bash
npx --yes wrangler@latest d1 execute \
  brownstone-workforce \
  --remote \
  --command "SELECT name FROM pragma_table_info('candidates') WHERE name IN ('invitation_status_key','invitation_stage_key','invitation_template_key','last_invitation_id','last_invited_at') ORDER BY name;"
```

```bash
npx --yes wrangler@latest d1 execute \
  brownstone-workforce \
  --remote \
  --command "SELECT name FROM pragma_table_info('invitations') WHERE name IN ('template_key','initial_status','initial_stage','email_subject') ORDER BY name;"
```

## 5. Validate

```bash
npm ci
npm test
```

The validation should report 20 official email templates and successful workforce, Supabase, routing, and form audits.

## 6. Commit and push

```bash
git add -A
git commit -m "Deploy Brownstone Careers v9.4 invitation stage controls"
git push origin main
```

## 7. Verify production

```bash
npx --yes wrangler@latest pages deployment list \
  --project-name brownstone-careers \
  --environment production
```

After the latest deployment succeeds, hard-refresh the workforce dashboard and test:

1. application-linked invitation;
2. manual administrator invitation;
3. at least two different status/stage template combinations;
4. access-code regeneration;
5. stage completion tone and ranking update;
6. pre-screening assignment, AI advisory draft, human finalization, email, and dashboard result.

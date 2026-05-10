# Cloudbox agent guide

Cloudbox is an OSS Cloudflare funnel: homepage → demo → docs → source → Deploy to Cloudflare.

## Canonical commands

```sh
bun run build
bun run typecheck
bun run test
bun run demo:fast
bun run demo:browser
CLOUDBOX_E2E_URL=https://cloudbox.coey.dev node scripts/e2e.mjs
```

## Deploy model

Production deploys through GitHub Actions with Alchemy.

Canonical deploy file:

```txt
alchemy.run.ts
```

Production target:

```txt
https://cloudbox.coey.dev
```

Do not switch local Wrangler accounts to deploy Cloudbox. Use GitHub Actions secrets for production.

## Cloudflare account boundaries

Cloudbox production belongs in the personal Cloudflare account:

```txt
Coeyman@gmail.com's Account
bfcb6ac5b3ceaf42a09607f6f7925823
```

Do not deploy Cloudbox to the employee/AX account:

```txt
Agent Experience
31b91e7f9954ad8aa334d46f012bd8ed
```

## Required production secrets

Set on the GitHub `production` environment:

```txt
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
ALCHEMY_PASSWORD
ALCHEMY_STATE_TOKEN
CLOUDBOX_API_TOKEN
CLOUDBOX_D1_DATABASE_ID
```

Token must be validated against:

```txt
/user/tokens/verify
/accounts
/accounts/:account_id/d1/database?name=cloudbox-prod
/accounts/:account_id/workers/scripts/alchemy-state-store/script-settings
/accounts/:account_id/secrets_store/stores
```

## Public copy rules

- Do not mention private internal project names.
- Do not use the word previously used for self-testing; call it demo, proof run, sample run, or launch-readiness run.
- Public concept is: clean remote computer.
- Public funnel is: demo → docs → GitHub → Deploy to Cloudflare.

## Current vs next

Current:

- deployed Astro/Worker app
- demo workspace
- receipts/artifacts/grading
- local `cloudbox.run()` proof slice in `src/run.ts`
- deploy path via GitHub Actions + Alchemy

Next:

- hosted remote-computer runner
- real cloud `cloudbox.run()` execution
- tool plugin reference docs

## File map

```txt
web/src/pages/index.astro          homepage/funnel
web/src/pages/demo.astro           demo page shell
web/src/components/SampleAgent.tsx demo client interaction
src/run.ts                         local proof-run slice
src/computer-do.ts                 workspace Durable Object
src/grade.ts                       receipt grading
alchemy.run.ts                     Cloudflare infra/deploy
scripts/demo.mjs                   headless demo
scripts/browser-demo.mjs           browser demo
```

## Before pushing

Run at least:

```sh
bun run build
bun run typecheck
bun run test
```

For production-affecting changes, also run:

```sh
CLOUDBOX_E2E_URL=https://cloudbox.coey.dev node scripts/e2e.mjs
```

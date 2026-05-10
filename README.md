# Cloudbox

[![check](https://github.com/acoyfellow/cloudbox/actions/workflows/check.yml/badge.svg)](https://github.com/acoyfellow/cloudbox/actions/workflows/check.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](./LICENSE)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/acoyfellow/cloudbox)

Cloudbox is deployable Cloudflare infrastructure for running agent work in clean workspaces and getting back proof: receipts, artifacts, grades, and a replayable trail of what happened.

It is designed to move people from:

```txt
homepage → demo → docs → source → deploy to Cloudflare
```

## Try it

- Live app: https://cloudbox.coey.dev
- Demo: https://cloudbox.coey.dev/demo
- Docs: https://cloudbox.coey.dev/docs
- Source: https://github.com/acoyfellow/cloudbox
- Deploy: https://deploy.workers.cloudflare.com/?url=https://github.com/acoyfellow/cloudbox

## Quickstart

```sh
git clone https://github.com/acoyfellow/cloudbox
cd cloudbox
bun install
bun run dev
```

Open the local URL and click **Demo**.

## Deploy to your Cloudflare account

The intended production path is GitHub Actions + Cloudflare.

Required Cloudflare resources are provisioned through `alchemy.run.ts`:

- Worker for the web app and API
- Durable Object namespace for workspaces
- R2 bucket for artifacts
- D1 database for indexes and migrations
- Static assets for the Astro app
- Optional custom domain

Use the deploy button above, or fork the repo and set these GitHub environment secrets.

> Status: the GitHub Actions deployment path is verified for this repo. The one-click Deploy to Cloudflare button is the intended funnel and should be treated as experimental until tested from a fresh external account.

```txt
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
ALCHEMY_PASSWORD
ALCHEMY_STATE_TOKEN
CLOUDBOX_API_TOKEN
CLOUDBOX_D1_DATABASE_ID
```

The Cloudflare API token needs access to:

```txt
Account read
Workers Scripts edit
Workers Tail read
Workers Containers read/write
D1 edit
R2 edit
Secrets Store edit
Zone read/edit if using a custom domain
```

Cloudbox production currently uses these resource names:

```txt
Worker: cloudbox
Container runner: cloudbox-runner
D1: cloudbox-prod
R2: cloudbox-artifacts
State store Worker: alchemy-state-store
```

Then run the `check` workflow on `main`.

## What Cloudbox does

A run gives an agent a real Cloudflare Container, a repo, commands, verification, and an artifact. Cloudbox records the trail.

```sh
curl -s https://cloudbox.coey.dev/runs \
  -H "authorization: Bearer $CLOUDBOX_API_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "repo": "https://github.com/acoyfellow/cloudbox",
    "commands": ["pnpm install --ignore-scripts"],
    "verify": ["pnpm run build", "pnpm run test"],
    "artifact": "HANDOFF.md"
  }'
```

A finished run should include:

- pinned repo/source context
- commands and tool calls
- reads, writes, and submissions
- artifacts such as `HANDOFF.md`
- patch or diff summary
- receipt-backed grade

## Demo flow

The current hosted demo materializes a small Cloudbox workspace. The agent:

1. reads launch-readiness files
2. asks a skeptical reviewer for missing checks
3. writes `artifacts/launch-note.md`
4. submits a decision
5. receives a grade from receipts

Run it locally:

```sh
bun run demo:fast
bun run demo:browser
```

## Recipes

### Fix a bug

Use `reproduce`, `fix`, and `verify` so the result proves both failure and repair.

```json
{
  "repo": "https://github.com/you/app",
  "commands": ["npm test -- checkout || true"],
  "verify": ["npm test -- checkout", "npm run build"],
  "artifact": "HANDOFF.md"
}
```

### Upgrade dependencies

```json
{
  "repo": "https://github.com/you/app",
  "commands": ["pnpm up"],
  "verify": ["pnpm run build", "pnpm test"],
  "artifact": "UPGRADE.md"
}
```

### Investigate flakes

```json
{
  "repo": "https://github.com/you/app",
  "commands": ["npm run test:browser -- --repeat 5 || true"],
  "verify": ["npm run test:browser -- --repeat 5"],
  "artifact": "FLAKE_REPORT.md"
}
```

## Tools

Shell and files are built in. Extra tools are explicit.

```ts
tools: {
  browser: agentBrowser(),
  deploy: cloudflare(),
  jira: mcp("jira"),
}
```

Every tool call should become part of the receipt trail.

## How it works

Cloudbox has two layers:

1. **Control plane** — Worker routes, Durable Objects, R2 artifacts, D1 indexes, receipt grading.
2. **Computer** — a Cloudflare Container runner that clones repos, runs commands, verifies work, captures diff, and returns artifacts.

## API reference

Current workspace protocol:

```sh
POST /computers
GET  /c/:id/list
GET  /c/:id/read?path=README.md
POST /c/:id/ask
POST /c/:id/write
POST /c/:id/submit
GET  /c/:id/receipts
GET  /c/:id/grade
```

Real repo run API:

```sh
POST /runs
```

```ts
type RunInput = {
  repo: string;          // public GitHub HTTPS repo
  commands?: string[];   // setup/change/reproduce commands
  verify?: string[];     // verification commands
  artifact?: string;     // file to return, e.g. HANDOFF.md
  timeoutMs?: number;
};
```

## Development

```sh
bun run build
bun run typecheck
bun run test
bun run demo:fast
bun run demo:browser
```

## Status

Cloudbox is early. The deployed app, demo, receipts, artifacts, grading, deploy path, and Cloudflare Container runner path are in the repo. Real repo runs go through `POST /runs` and execute in the container runner.

## Research lineage

Cloudbox is inspired by computer-use research, but the product is real repo work for agents and humans: short feedback loops, visible receipts, Cloudflare Container execution, and proof you can inspect.

Paper: https://arxiv.org/abs/2604.28181

## License

MIT

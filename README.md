# Cloudbox

[![check](https://github.com/acoyfellow/cloudbox/actions/workflows/check.yml/badge.svg)](https://github.com/acoyfellow/cloudbox/actions/workflows/check.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](./LICENSE)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/acoyfellow/cloudbox)

Cloudbox is a deploy-your-own Cloudflare Worker that hands an agent a real Linux box on a real repo and records what happens: receipts, artifacts, grades, and a replayable trail.

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
pnpm install
pnpm run dev
```

Open the local URL and click **Demo**.

## Deploy your own

Cloudbox is built to be your Cloudbox. You fork, you deploy, you own the data plane. Cloudflare resources are provisioned through `alchemy.run.ts`:

- Worker for the web app and API
- `CloudboxRunner` Durable Object that fronts a Cloudflare Container (`cloudbox-runner`) for real execution
- `ComputerDO` Durable Object namespace for per-workspace state and receipts
- R2 bucket for artifacts
- D1 database for indexes and migrations
- Static assets for the Astro app
- Optional custom domain

The intended production path is GitHub Actions + Cloudflare. Use the Deploy button above, or fork and set these GitHub environment secrets:

```txt
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
ALCHEMY_PASSWORD
ALCHEMY_STATE_TOKEN
CLOUDBOX_API_TOKEN
CLOUDBOX_D1_DATABASE_ID
```

> Status: the GitHub Actions deploy path is verified for this repo. The one-click Deploy to Cloudflare button is the public funnel and should be treated as experimental from a fresh external account until tested.

The Cloudflare API token needs:

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

Production resource names:

```txt
Worker:          cloudbox
Container:       cloudbox-runner
Runner DO class: CloudboxRunner
Runner container app: cloudbox-runner-v2
Workspace DO:    ComputerDO (CLOUDBOX_COMPUTER)
D1:              cloudbox-prod
R2:              cloudbox-artifacts
State store:     alchemy-state-store
```

Runner sizing is configurable at deploy time:

```txt
CLOUDBOX_RUNNER_INSTANCE_TYPE=standard   # or the largest instance type your account supports
CLOUDBOX_RUNNER_MAX_INSTANCES=2
```

Use GitHub environment variables for sizing. The workflow defaults production to `standard`; local Alchemy fallback is `lite`.

## What a run looks like

A run gives an agent a clean Linux container, a public repo, commands, verification, and an artifact to return. Cloudbox records the trail.

```sh
curl -s https://cloudbox.coey.dev/api/runs \
  -H "authorization: Bearer $CLOUDBOX_API_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "repo": "https://github.com/acoyfellow/cloudbox",
    "commands": ["pnpm install --ignore-scripts"],
    "verify": ["pnpm run build", "pnpm run test"],
    "artifact": "HANDOFF.md"
  }'
```

The response includes:

- `runId` — stable id for looking up the run later when D1 is bound
- `ok` — verification passed
- `receipts` — per-step clone/command/verify events with exit codes, stdout, stderr, timestamps
- `runnerReceipts` — container lifecycle events (boot, request, error) from the `CloudboxRunner` DO
- `artifact` — `{ path, content }` of the requested file
- `diff` — patch summary of changes made by the run

## Bring your agent

Cloudbox is agent-agnostic. Anything that can POST JSON can drive it. Patterns:

- **HTTP only** — your agent posts to `/api/runs` and reads back receipts + artifact. No SDK required.
- **Workspace protocol** — agents that want files, ask/submit semantics, and grading drive `/api/c/:id/*` after materializing a `ComputerSpec`.
- **Think integration** — `createCloudboxTools()` from `src/think.ts` exposes `env_list / env_read / env_write / env_ask / env_submit` to a Think loop.
- **Any framework** — OpenAI SDK, AI SDK, Mastra, custom — the API is just JSON.

See `docs/recipes` for examples.

## Demo flow

The hosted demo runs a public GitHub repo in Cloudbox and shows the proof trail:

1. runner lifecycle receipts from the `CloudboxRunner` Container
2. clone/run/verify/diff receipts from the repo task
3. one returned artifact for human inspection

Run the local proof scripts:

```sh
pnpm run demo:fast
pnpm run demo:browser
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

## How it works

Cloudbox has two layers:

1. **Control plane** — Worker routes, `ComputerDO` for workspaces, R2 artifacts, D1 indexes, receipt grading.
2. **Runner** — `CloudboxRunner` Durable Object wraps a Cloudflare Container that clones repos, runs commands, verifies, captures diff, and returns artifacts. Container lifecycle events flow back as `runnerReceipts`.

The container image is in `runner/Dockerfile` and ships with `git`, `node`, `bun`, and `pnpm` preinstalled.

## API reference

Workspace protocol (per-`ComputerSpec`):

```sh
POST /api/computers
POST /api/brief
GET  /api/c/:id/list
GET  /api/c/:id/read?path=README.md
POST /api/c/:id/ask
POST /api/c/:id/write
POST /api/c/:id/submit
GET  /api/c/:id/receipts
GET  /api/c/:id/grade
GET  /api/c/:id/spec
```

Real repo runs (Container-backed):

```sh
POST /api/runs
GET  /api/runs/recent   # when D1 is bound
GET  /api/runs/:runId   # when D1 is bound
```

```ts
type RunInput = {
  repo: string;          // public GitHub HTTPS repo
  commands?: string[];   // setup / change / reproduce commands
  verify?: string[];     // verification commands
  artifact?: string;     // file to return, e.g. HANDOFF.md
  timeoutMs?: number;
};
```

Authenticated with `Authorization: Bearer $CLOUDBOX_API_TOKEN` (when the secret is set).

## Tooling story

- **pnpm** is the recommended package manager for installing Cloudbox and for CI. GitHub Actions uses `pnpm install --no-frozen-lockfile --ignore-scripts`.
- **Bun** is still required by the Alchemy/development scripts and by the runner image. Install Bun ≥ 1.3 and Node ≥ 22.
- The runner container ships with `git`, `node`, `bun`, and `pnpm`; recipe examples lean on pnpm, but your repo can run whatever commands it needs.

## Development

```sh
pnpm run build
pnpm run typecheck
pnpm run test
pnpm run demo:fast
pnpm run demo:browser
pnpm run runner:test
```

## Status

Cloudbox is early. The deployed app, demo, receipts, artifacts, grading, deploy path, and Cloudflare Container runner path are in the repo. Real repo runs go through `POST /api/runs` and execute in the `CloudboxRunner` container.

## Research lineage

Cloudbox is inspired by computer-use research, but the product is real repo work for agents and humans: short feedback loops, visible receipts, Cloudflare Container execution, and proof you can inspect.

## License

MIT

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
D1 edit
R2 edit
Secrets Store edit
Zone read/edit if using a custom domain
```

Cloudbox production currently uses these resource names:

```txt
Worker: cloudbox
D1: cloudbox-prod
R2: cloudbox-artifacts
State store Worker: alchemy-state-store
```

Then run the `check` workflow on `main`.

## What Cloudbox does

A run gives an agent a workspace, tools, and a goal. Cloudbox records the trail.

```ts
import { agentBrowser, cloudbox } from "cloudbox";

const run = await cloudbox.run({
  computer: "cloud",
  repo: "https://github.com/acoyfellow/cloudbox",
  bug: "cloudbox.coey.dev returns 1101 instead of the homepage",
  tools: { browser: agentBrowser() },
  reproduce: "open the site and confirm the Worker error",
  fix: "make the homepage return 200",
  verify: ["bun run build", "bun run test", "open the site again"],
  artifact: "HANDOFF.md",
});

console.log(run);
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

```ts
await cloudbox.run({
  computer: "cloud",
  repo,
  bug: "checkout page returns 500",
  reproduce: "npm test -- checkout",
  fix: "make checkout return 200",
  verify: ["npm test -- checkout", "npm run build"],
  artifact: "HANDOFF.md",
});
```

### Upgrade dependencies

```ts
await cloudbox.run({
  computer: "cloud",
  repo,
  task: "upgrade framework packages",
  change: "update dependencies",
  verify: ["npm run build", "npm test"],
  artifact: "UPGRADE.md",
});
```

### Investigate flakes

```ts
await cloudbox.run({
  computer: "cloud",
  repo,
  task: "find why browser tests flake",
  reproduce: "npm run test:browser -- --repeat 5",
  verify: ["npm run test:browser -- --repeat 5"],
  artifact: "FLAKE_REPORT.md",
});
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
2. **Computer** — the place an agent reads files, runs commands, calls tools, writes artifacts, and verifies work.

The current repo contains the Cloudflare control plane, demo workspace, local proof-run slice, and deployment path. The cloud computer adapter is the next major implementation step.

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

Run API shape under active development:

```ts
type RunInput = {
  computer: "cloud" | "local";
  repo: string;
  bug?: string;
  task?: string;
  reproduce?: string | string[];
  fix?: string;
  change?: string;
  verify: string[];
  artifact: string;
  tools?: Record<string, unknown>;
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

Cloudbox is early. The deployed app, demo, receipts, artifacts, grading, and deploy path work. The local `cloudbox.run()` proof slice can reproduce a failing fixture, patch it, verify it, and return a structured result. The hosted remote-computer runner is next.

## Research lineage

Cloudbox is inspired by synthetic-computer research, but the product direction is real repo work for agents and humans: short feedback loops, visible receipts, and proof you can inspect.

Paper: https://arxiv.org/abs/2604.28181

## License

MIT

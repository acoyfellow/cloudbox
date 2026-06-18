# Cloudbox

[![check](https://github.com/acoyfellow/cloudbox/actions/workflows/check.yml/badge.svg)](https://github.com/acoyfellow/cloudbox/actions/workflows/check.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-black.svg)](./LICENSE)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/acoyfellow/cloudbox)

**Durable Cloudflare computers for agents.**

Cloudbox gives an agent a clean Linux computer for real repository work. It can run a bounded proof once, or keep the computer alive so a human or agent can inspect files, execute follow-up commands, launch a dev preview, stop, resume, and fork the workspace.

Every run closes around evidence:

```text
repo + commands + verification
            ↓
Cloudflare Container
            ↓
receipts + diff + artifact + shareable run
```

Cloudbox is the computer and proof layer—not another agent framework. Bring any agent that can call HTTP or use the included TypeScript adapters.

## Try it

- **App:** https://cloudbox.coey.dev
- **Interactive demo:** https://cloudbox.coey.dev/demo
- **Docs:** https://cloudbox.coey.dev/docs
- **API reference:** https://cloudbox.coey.dev/docs/api
- **Source:** https://github.com/acoyfellow/cloudbox

## Two ways to use Cloudbox

| Surface | Use it when | What you get |
|---|---|---|
| **Repo run** | You have a real Git repository and commands that prove the work | Fresh checkout, commands, verification, diff, artifact, lifecycle receipts |
| **Typed workspace** | You want a constrained simulated environment with collaborators and a rubric | Files, hidden context, ask/submit actions, receipts, deterministic grading |

Repo runs are the product center. Typed workspaces remain useful for training and evaluating agent trajectories.

## Quickstart

Requirements: Node.js 22+, Bun 1.3+, pnpm 10+, Docker or a compatible engine, and a Cloudflare account for deployed Containers.

```bash
git clone https://github.com/acoyfellow/cloudbox
cd cloudbox
pnpm install
pnpm run dev
```

Open the local URL and choose **Demo**.

Useful checks:

```bash
pnpm run build
pnpm run typecheck
pnpm run test
pnpm run demo:fast
pnpm run runner:test
```

## Run a repository

```bash
curl -s https://cloudbox.coey.dev/api/runs \
  -H "authorization: Bearer $CLOUDBOX_API_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "repo": "https://github.com/acoyfellow/cloudbox",
    "commands": ["pnpm install --ignore-scripts"],
    "verify": ["pnpm run build", "pnpm run test"],
    "artifact": "HANDOFF.md",
    "public": true
  }'
```

The result includes:

| Field | Meaning |
|---|---|
| `runId` | Stable run identity |
| `ok` | Verification result |
| `receipts` | Clone, command, verify, and diff events with output/timing |
| `runnerReceipts` | Container start/readiness/request lifecycle evidence |
| `diff` | Repository changes produced by the run |
| `artifact` | Requested file returned for human inspection |
| `publicUrl` | Shareable proof page when `public: true` |

A failed verification returns HTTP `422` with the receipts preserved.

## Keep a run alive

Set `live: true` to retain the cloned repository for follow-up work. Live runs default to a one-hour TTL and accept `ttlSeconds` from 60 seconds to 30 days.

```bash
RUN_ID=$(curl -s https://cloudbox.coey.dev/api/runs \
  -H "authorization: Bearer $CLOUDBOX_API_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "repo": "https://github.com/acoyfellow/cloudbox",
    "verify": ["test -f package.json"],
    "live": true,
    "ttlSeconds": 3600
  }' | jq -r .runId)
```

Then steer the same computer:

```bash
# Execute a follow-up command
curl -s -X POST "https://cloudbox.coey.dev/api/runs/$RUN_ID/exec" \
  -H "authorization: Bearer $CLOUDBOX_API_TOKEN" \
  -H "content-type: application/json" \
  -d '{"command":"pwd && git status --short"}'

# Read and write safe relative files
curl -s "https://cloudbox.coey.dev/api/runs/$RUN_ID/read?path=README.md" \
  -H "authorization: Bearer $CLOUDBOX_API_TOKEN"

curl -s -X POST "https://cloudbox.coey.dev/api/runs/$RUN_ID/write" \
  -H "authorization: Bearer $CLOUDBOX_API_TOKEN" \
  -H "content-type: application/json" \
  -d '{"path":"notes/live.md","content":"hello from the live run"}'
```

### Dev preview

A live run can start a development server and proxy HTTP/WebSocket traffic through one authenticated Cloudbox URL:

```bash
curl -s -X POST "https://cloudbox.coey.dev/api/runs/$RUN_ID/dev" \
  -H "authorization: Bearer $CLOUDBOX_API_TOKEN" \
  -H "content-type: application/json" \
  -d '{"command":"bun run dev --host 0.0.0.0","port":5173}'

open "https://cloudbox.coey.dev/api/runs/$RUN_ID/preview/"
```

### Stop, resume, fork, delete

```text
POST   /api/runs/:id/stop     snapshot workspace to R2 and stop
POST   /api/runs/:id/resume   restore the snapshot into a runner
POST   /api/runs/:id/fork     snapshot and restore into an independent child
DELETE /api/runs/:id          remove active and snapshotted run state
```

The TypeScript adapter at `cloudbox/live-run-tools` exposes the same lifecycle.

## CLI helper

```bash
CLOUDBOX_API_TOKEN=... pnpm run live start \
  https://github.com/acoyfellow/cloudbox \
  "bun run dev --host 0.0.0.0" \
  5173

pnpm run live info
pnpm run live exec "git status --short"
pnpm run live read README.md
pnpm run live write notes/live.md "hello"
pnpm run live open
pnpm run live stop
pnpm run live resume
pnpm run live fork
pnpm run live delete
```

`live:sync` can push local text-file changes into the current live run.

## Browser shell and desktop prototype

A live run with `desktop: true` uses the heavier desktop runner. It exposes a browser terminal and a noVNC Chromium desktop through authenticated preview routes.

```bash
pnpm run live start \
  https://github.com/acoyfellow/cloudbox \
  "bun run dev --host 0.0.0.0" \
  5173 \
  --desktop

pnpm run live shell
pnpm run live desktop
```

This is a proving surface, not a promise of generic hosted SSH.

## Bring your agent

Cloudbox does not own the model loop.

- **HTTP:** post JSON to `/api/runs`.
- **TypeScript:** use `cloudbox/client` or `cloudbox/live-run-tools`.
- **Think:** `createCloudboxTools()` exposes the typed workspace protocol.
- **Any other harness:** call the API and treat receipts as evidence.

A typical agent loop is:

```text
agent decides work
  → creates a bounded Cloudbox run
  → reads/writes/executes in the computer
  → verifies explicitly
  → returns receipts, diff, and artifact
```

## Personal durable computers and private GitLab

Cloudbox also contains a private, owner-delegated computer slice used by trusted callers such as My AX:

- one durable Sandbox computer per owner;
- internal-token + explicit owner headers;
- reviewed Computer Code Mode catalog;
- GitLab OAuth through a separate broker;
- short-lived repository grants;
- explicit publication approval for write grants;
- mount, branch publication, and merge-request operations.

These routes are **not** ordinary public API-token endpoints. They require trusted owner delegation, and publication is intentionally separate from general computer execution.

## Typed workspaces and grading

The original evaluation surface remains available:

```text
POST /api/computers
POST /api/brief
GET  /api/c/:id/list
GET  /api/c/:id/read?path=...
POST /api/c/:id/write
POST /api/c/:id/ask
POST /api/c/:id/submit
GET  /api/c/:id/receipts
GET  /api/c/:id/grade
GET  /api/c/:id/spec
```

A `ComputerSpec` defines:

```text
persona → filesystem → collaborators/private context → objectives → rubric
```

Every action writes a receipt. The grader replays receipts against structural matchers such as `read`, `readBefore`, `asked`, `askedOnly`, and `submitted`.

## Architecture

```text
Cloudbox Worker
  ├─ Astro app + HTTP API
  ├─ D1 run/computer/grant indexes
  ├─ R2 artifacts + live-run snapshots
  ├─ ComputerDO typed workspace state
  ├─ CloudboxRunner DO → lightweight Container
  ├─ CloudboxDesktopRunner DO → desktop Container
  └─ CloudboxSandbox DO → durable owner computer
```

### Runner paths

| Runner | Default purpose | Public config |
|---|---|---|
| `CloudboxRunner` | Batch proof and normal live runs | `lite`, max 2 |
| `CloudboxDesktopRunner` | Opt-in browser shell/desktop | `standard-1`, max 1 |
| `CloudboxSandbox` | Durable owner computer | `standard-1`, max 5 |

Production sizing is controlled by deployment environment variables and may differ from the public defaults.

## Deploy your own

Cloudbox provisions its Worker, Durable Objects, Containers, D1, R2, static assets, and optional custom domain through `alchemy.run.ts`.

The verified path is the repository’s GitHub Actions deployment. Fork the repository and configure the production environment secrets documented in [the quickstart](https://cloudbox.coey.dev/docs/quickstart). CI always runs on pushes; deployment runs manually by default. Set the production environment variable `CLOUDBOX_AUTO_DEPLOY=true` only after the Cloudflare account/token pair has been verified.

Core deployment values include:

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
ALCHEMY_PASSWORD
ALCHEMY_STATE_TOKEN
CLOUDBOX_API_TOKEN
CLOUDBOX_D1_DATABASE_ID
```

Optional private-computer/GitLab integration uses additional broker, grant, and approval secrets. Do not copy those into a public client.

> The Deploy to Cloudflare button is the public funnel, but should remain labeled experimental until a clean external-account deployment is repeatedly proven.

## Security model

- API-token authentication protects non-demo run and workspace APIs.
- Demo mode is constrained to public GitHub repositories and short allowlisted commands.
- Live preview routes remain behind Cloudbox authentication.
- Public run pages exist only when a run was explicitly created with `public: true`.
- Durable personal-computer routes require trusted internal owner delegation.
- Private repository access uses scoped OAuth/grants; write publication requires a separate approval capability.
- Cloudbox returns receipts and evidence, but running arbitrary repository commands still grants code execution inside the selected Container. Treat tokens and deployment ownership accordingly.

See [SECURITY.md](./SECURITY.md) for reporting and operational guidance.

## What is shipped vs proving

| Status | Capability |
|---|---|
| **Shipped** | Batch repo runs, verification, receipts, diffs, artifacts, public proof pages |
| **Shipped** | Live run read/write/exec/dev preview/stop/resume/fork/delete |
| **Shipped** | Typed workspace materialization, collaborators, receipts, deterministic grading |
| **Shipped** | Agent-neutral HTTP and TypeScript adapters |
| **Proving** | Desktop/browser-shell runner |
| **Proving** | Durable owner computer and private GitLab grant/publication path |
| **Experimental** | One-click Deploy to Cloudflare from an unrelated external account |

## Project map

| Path | Purpose |
|---|---|
| `src/http.ts` | Main API and authorization boundaries |
| `src/container-runner.ts` | Repo-run and live-run protocol |
| `src/runner-do.ts` | Container lifecycle Durable Objects |
| `src/cloudbox-sandbox.ts` | Durable owner computer runtime |
| `src/computer-code-mode.ts` | Reviewed durable-computer Code Mode catalog |
| `src/computer-grants.ts` | Private repository grant authority |
| `src/repo-workflow.ts` | Private mount/publish/MR workflow |
| `src/spec.ts` / `src/computer-do.ts` | Typed workspace/evaluation surface |
| `src/client.ts` | HTTP client |
| `src/live-run-tools.ts` | Live-run agent adapter |
| `web/` | Hosted app and documentation |
| `runner/`, `runner-desktop/`, `computer/` | Container images |
| `scripts/` | Local flows, E2E, deployment proofs |

## License

MIT

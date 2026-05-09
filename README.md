# Cloudbox

> Cloudflare-native synthetic workspaces for my agents.

Cloudbox is the workspace I want every agent to get before it touches real work:
a typed brief, a populated filesystem, people to ask, objectives to complete,
artifacts to write, and a rubric that grades the trail it left behind.

It runs on Cloudflare primitives: one Worker, one Durable Object per workspace,
R2-backed artifact bytes, optional D1 indexes, optional Queues for sweeps, and
Workers AI hooks when I want generated specs or judges. The important unit is a
receipt. Every read, write, ask, submit, and grade becomes durable evidence an
agent can be evaluated against.

## Seven-minute path

```sh
git clone https://github.com/acoyfellow/cloudbox
cd cloudbox
bun install
bun run dev
```

Open the printed URL and click **See it run**.

The demo dogfoods Cloudbox: a constrained agent reviews Cloudbox's own launch
readiness docs, asks a skeptical reviewer for overclaim checks, writes
`artifacts/launch-note.md`, submits a share/no-share decision, and receives a
score from the receipt log.

## What an agent sees

```ts
import { defineComputer, materialize, grade } from "cloudbox";

const spec = defineComputer({
  profile: { role: "staff agent systems engineer" },
  filesystem: [
    { path: "README.md", kind: "design-doc" },
    { path: "docs/quickstart.md", kind: "runbook" },
    { path: "docs/architecture.md", kind: "design-doc" },
  ],
  collaborators: [
    { id: "skeptic", role: "release-reviewer", focus: "catch overclaims" },
  ],
  objectives: [
    { id: "launch-readiness", title: "Decide whether this is ready to share" },
  ],
  rubric: [
    { id: "read-quickstart", weight: 1, must: "reads the quickstart", mustEvent: { type: "read", path: "docs/quickstart.md" } },
    { id: "asks-skeptic", weight: 2, must: "asks the skeptical reviewer", mustEvent: { type: "asked", who: "skeptic" } },
    { id: "writes-note", weight: 2, must: "writes a launch note", mustEvent: { type: "wrote", path: "artifacts/launch-note.md" } },
  ],
});

const computer = await materialize(spec, env);
// hand computer.id to an agent, then grade the receipts
const result = await grade(computer.id, env);
```

## Protocol

Any runtime can drive a materialized workspace over HTTP:

```sh
COMPUTER=$(curl -s -X POST http://localhost:8799/computers -d @spec.json | jq -r .id)

curl -s "http://localhost:8799/c/$COMPUTER/list"
curl -s "http://localhost:8799/c/$COMPUTER/read?path=README.md"
curl -s -X POST "http://localhost:8799/c/$COMPUTER/ask" \
  -H 'content-type: application/json' \
  -d '{"who":"skeptic","message":"What am I overclaiming?"}'
curl -s -X POST "http://localhost:8799/c/$COMPUTER/write" \
  -H 'content-type: application/json' \
  -d '{"path":"artifacts/launch-note.md","content":"ready"}'
curl -s -X POST "http://localhost:8799/c/$COMPUTER/submit" \
  -H 'content-type: application/json' \
  -d '{"objective":"launch-readiness","decision":"share"}'
curl -s "http://localhost:8799/c/$COMPUTER/grade"
```

## Repo

```txt
cloudbox/
├── README.md
├── alchemy.run.ts              # Cloudflare infra in one TypeScript file
├── seed/
│   ├── agent-launch.ts         # dogfood demo spec
│   └── pr-triage.ts            # extra example spec
├── src/
│   ├── spec.ts                 # ComputerSpec + rubric DSL
│   ├── materialize.ts          # spec -> Durable Object
│   ├── computer-do.ts          # workspace state, files, receipts
│   ├── grade.ts                # receipt replay
│   ├── brief.ts                # brief -> draft spec helper
│   └── think.ts                # Think tool bridge
├── tests/
└── web/                        # Astro docs, API routes, demo UI
```

## Check

```sh
bun run check
```

## Status

Alpha. The current product is a Cloudflare-native synthetic workspace and
receipt grader for agents. Real command execution backends can plug in later;
the product center is already useful now: constrain an agent, watch its trail,
and grade whether it behaved the way I needed.

## License

MIT

## Public demo security

The deployed demo is intentionally small and receipt-first. For a private or shared deployment, set `CLOUDBOX_API_TOKEN`; mutation endpoints then require `Authorization: Bearer <token>` while read-only demo inspection remains available.

## Cleanup

Run-scoped workspaces can be reset with `POST /c/:id/reset`. Old agent-written artifacts and old receipts can be pruned with `POST /c/:id/cleanup` from an authenticated deployment.

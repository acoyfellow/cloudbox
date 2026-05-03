# Cloudbox

Generate synthetic cloud computers for training and evaluating long-horizon agents on Cloudflare.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/acoyfellow/cloudbox)

Cloudbox turns a persona into a realistic work computer: profile, filesystem, artifacts, collaborators, multi-day simulation, and retrospective lessons. The demo opens on a completed seeded computer, so you can understand and use the repo in under seven minutes.

## What you get

| | |
|---|---|
| **One public Worker URL** | UI + API + static assets |
| **Synthetic computer pipeline** | persona → profile → filesystem → artifacts → collaborators → simulation → retrospective |
| **Cloudflare primitives** | Worker, D1, R2, Queue, Workers AI-ready model path |
| **Downloadable artifacts** | DOCX/XLSX/PPTX/PDF-shaped portable v1 artifacts |
| **Full-paper mode** | 20-workday simulation path, queueable for longer runs |

## 60-second architecture

```
Browser
  │
  ▼
Cloudbox Worker ───────────────┐
  │                            │
  ├─ /api/demo                 │ seeded complete computer
  ├─ /api/generate             │ deterministic + Workers AI-ready generation
  ├─ /api/artifacts/:id        │ downloadable artifacts
  └─ /api/runs                 │ enqueue longer full-paper work
       │                       │
       ├─ D1                   │ computers, runs, events
       ├─ R2                   │ generated artifacts + exports
       └─ Queue                │ long-running simulations
```

## Run locally

```sh
bun install
bun alchemy dev
```

Open the local URL, then click through Filesystem, Artifacts, Collaborators, Simulation Log, and Retrospective.

## Repo map

```
cloudbox/
├── alchemy.run.ts                  # Cloudflare infra in one TypeScript file
├── apps/web/                       # Worker API + static UI
├── packages/synthetic-computer/    # paper pipeline domain model
├── packages/artifacts/             # artifact exporters
├── packages/evals/                 # retrospective/rubric logic
├── docs/                           # public-facing docs site
└── migrations/                     # D1 schema
```

## API

- `GET /api/demo` returns the seeded complete Cloudbox.
- `POST /api/generate` creates a new Cloudbox from `{ "text": "...", "mode": "demo" | "short" | "full-paper" }`.
- `POST /api/runs` queues a longer run.
- `GET /api/artifacts/:id` downloads a generated artifact.
- `GET /api/export` downloads the manifest for the seeded Cloudbox.

## Stack

- **Workers** for the public app and API.
- **D1** for generated computers, run state, and event history.
- **R2** for artifact objects and exports.
- **Queues** for long-running simulation work.
- **Workers AI** as the default generation path.
- **Alchemy** for Cloudflare infrastructure as TypeScript.

## What works today

- Seeded full-paper Cloudbox opens immediately.
- Persona-to-simulation pipeline runs locally and in the Worker.
- Artifact downloads are generated and stored in R2 when available.
- D1 persistence is active when the Worker has the binding.
- Queue consumer completes queued run records.

## License

MIT

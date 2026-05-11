# Cloudbox red-team distillation — 2026-05-11

Source: contributron engineer profiles, applied to the current Cloudbox repo/product surface after `c4f3318`.

## Persona feedback: 5 requested changes each

### Dane Knecht — operational truth
1. Stop presenting `boot()` as persistent until it is actually a persistent workspace/session; label current implementation as prototype or remove it from hero.
2. Add unhappy-path docs for runner unavailable, container not ready, clone failure, timeout, bad artifact path, and auth failure.
3. Add post-deploy smoke checks to the deploy workflow itself, not only a separate scheduled workflow.
4. Add a production runbook: account, resources, secrets, rollback, and how to prove prod is healthy without local credentials.
5. Add a visible proof page or artifact link for the latest production proof run so claims are inspectable.

### Kenton Varda — semantics and capability boundaries
1. Define exact semantics for `CloudboxRun`, receipts, artifacts, and run status; avoid ambiguous `ok`/HTTP status combinations.
2. Make path handling capability-safe for artifacts and write/read helpers; no shell-string path composition in client abstractions.
3. Treat `agent-computer.ts` as misleading: independent `/api/runs` calls do not preserve filesystem state.
4. Separate model planning, tool execution, and proof attestation in API names and docs.
5. Specify trust boundaries: model-generated claims vs runner-attested receipts vs browser-captured evidence.

### James M Snell — standards/runtime fit
1. Fix stale browser E2E (`scripts/e2e.mjs`) so it tests the current demo instead of removed UI.
2. Make script/runtime expectations consistent: pnpm for install/CI, Bun for deploy/dev, Node for smoke scripts.
3. Avoid SDK examples that import packages/paths not actually exportable from `package.json`.
4. Standardize error payloads and status codes across Hono routes and runner proxy failures.
5. Add compatibility tests around Worker fetch routing for `/api/*` and static Astro fallback.

### Pete Bacon Darwin — Workers DX and deployability
1. Add package `exports` for `cloudbox/client`, `cloudbox/generate-proof`, and any documented helper.
2. Keep one canonical deploy path and make quickstart match GitHub Actions/Alchemy reality.
3. Add a copy-paste `cloudbox-smoke.yml` that users can drop into their own repo.
4. Validate required Cloudflare token permissions in docs and fail fast in deploy scripts.
5. Remove or clearly mark internals/prototypes that make OSS users think APIs are stable.

### Dillon Mulroy — agent artifacts/proof UX
1. Make proof bundles first-class: HANDOFF.md, runner receipts, work receipts, browser video, screenshot.
2. Add a run detail page or API endpoint that exposes proof artifacts by run id.
3. Normalize receipt summaries so agents can cite them in final answers without dumping raw JSON.
4. Make browser video artifact upload part of CI recipe and scheduled proof workflow.
5. Add examples that return reviewer-ready handoff notes, not just `echo ok` demos.

### Michelle Wong — product clarity and user path
1. Homepage should link every concept to a docs page; no dead-end slogans.
2. Demo should be a single path and should explain what happens before, during, and after the run.
3. Docs recipe pages should start with concrete copy/paste steps before architecture explanation.
4. Remove jargon like “workspace protocol” from first contact; introduce it only after `/api/runs` is clear.
5. Update nav/sidebar so users can find CI, browser agent, deploy, and API from any docs page.

### Tom Bremer — deletion/simplicity
1. Delete or demote `generateProof` if the recommended shape is now `boot()` + tools + `submit()`.
2. Delete stale old demo/browser E2E assumptions rather than carrying contradictory test paths.
3. Avoid maintaining both `.ts` and `.mjs` examples unless they cover different verified use cases.
4. Keep receipt UI small; collapse raw JSON and prefer summaries.
5. Remove public docs for APIs that are not real/persistent yet, or mark them experimental.

## Distilled implementation batch

### P0 — Truth and test repair
- Update `scripts/e2e.mjs` to test the current `/demo` UI and run path.
- Add `package.json` exports for documented helper imports or change docs to relative/curl examples.
- Reword homepage/docs so `boot()` is explicitly an agent-computer API direction unless true persistence ships.
- Add tests ensuring docs-mentioned import paths exist in `package.json`.

### P1 — CI/proof hardening
- Add post-deploy smoke in `.github/workflows/check.yml`: `/api/health`, demo page, `/api/runs` runner readiness.
- Add browser video smoke to `.github/workflows/proof.yml` and upload `.webm`/screenshot artifacts.
- Expand CI/CD recipe to include both Cloudbox proof and browser proof upload.
- Add production proof status link or latest run instructions.

### P2 — API semantics and safety
- Define `CloudboxRun`, `CloudboxProof`, `RunnerReceipt`, and `WorkReceipt` in docs/API.
- Tighten artifact path validation beyond length: relative path only, no `..`, no absolute paths.
- Standardize error responses `{ error, detail, runId? }` across `/api/runs` and runner exceptions.
- Document trust boundaries: model plan vs runner receipts vs browser recording.

### P3 — Persistent session work
- Replace prototype `agent-computer.ts` implementation with a real session endpoint, e.g. `/api/boxes` + `/api/boxes/:id/tool` + `/api/boxes/:id/submit`, backed by a durable runner/session.
- Until then, mark `boot()` docs/examples as experimental or keep them out of the public hero.
- Add integration tests proving state persists across `shell`, `read`, `write`, `submit`.

### P4 — UX/docs cleanup
- Add docs sidebar entry for Deploy if the page exists, or create `/docs/deploy`.
- Make docs recipes start with “copy this file / run this command”.
- Collapse advanced workspace protocol behind a “fixtures/evals” framing.
- Add a proof bundle section to browser-agent recipe with actual tested video smoke command.

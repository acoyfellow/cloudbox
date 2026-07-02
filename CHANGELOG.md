# Changelog

## Unreleased

- Reframed Cloudbox around the focused product path: repo → fresh Cloudflare computer → live steering → explicit verification → artifact, diff, and receipts.
- Updated the homepage, README, concepts, quickstart, and recipes docs to center repo computers, demote typed workspaces to the evaluation surface, and describe live steering as shipped behavior.
- Replaced stale homepage SDK-style sample code with the current `/api/runs` HTTP flow and added proof cards for fresh computers, live steering, and receipts.
- Split private durable owner-computer routes into `src/http-personal-computers.ts` and shared error helpers into `src/http-errors.ts` so public API composition is easier to review.
- Documented the pnpm/Bun developer story and approved required pnpm build dependencies for esbuild, msgpackr-extract, sharp, and workerd.
- Added live repository runs with follow-up read, write, exec, and dev-preview operations.
- Added live-run stop/snapshot, resume, fork, delete, and configurable TTL.
- Added authenticated HTTP/WebSocket preview proxying.
- Added an opt-in desktop runner with browser terminal and noVNC Chromium.
- Added durable owner computers backed by Cloudflare Sandbox.
- Added reviewed Computer Code Mode methods for delegated agent use.
- Added private GitLab OAuth, host-scoped transport, expiring repository grants, explicit publication approval, branch publication, and merge-request creation.
- Added public proof pages for explicitly shared runs.
- Added runner lifecycle receipts and scheduled production proof workflows.

## 0.0.1-alpha

- Added Cloudflare Worker + Durable Object synthetic workspaces.
- Added receipt logs for reads, writes, collaborator asks, submissions, and grading.
- Added structural rubric replay including read, wrote, read-before, asked, asked-only, and submitted matchers.
- Added Cloudbox agent runner operating through Cloudbox tools.
- Added demo E2E proving workspace materialization, agent tool use, artifact write/readback, and 8/8 grading.

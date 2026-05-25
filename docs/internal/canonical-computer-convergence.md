# Canonical computer convergence: Cloudbox, my.ax, Seal, Cloudshell, and AgentCast

Date: 2026-05-25
Status: architecture proposal; no production contract implied

## Decision under consideration

Cloudbox should become the canonical deployed computer/repository service for agent experiences, including `my.ax`. It should retain proof-producing runs, but introduce or evolve toward a durable user-owned Computer capability rather than requiring a run to be the user's long-lived computer identity.

The first milestone is private `gitlab.cfdata.org` repository work with credentials held outside the computer, not public-repository polish or desktop parity.

```txt
private GitLab repo → exact user-selected /home/user path → edit/test/diff
→ explicit push approval → brokered push → MR through ax-mcp/API layer
```

## Why this proposal exists

Two efforts independently reached the same requirement:

- Cloudbox expanded from bounded repo proof runs toward interactive remote computers (live exec/read/write/dev/preview, stop/resume/fork, snapshot and desktop spikes).
- `my.ax` developed a durable `/home/user` Sandbox computer and explored real repository workflows, first through MCP file materialization, then Git checkout, then ArtifactFS mounts.

Maintaining independent repository computer implementations would duplicate filesystem, Git authentication, process, terminal, preview, and lifecycle work.

## Verified findings

### `my.ax` ArtifactFS spike: transferable filesystem proof

Local `my.ax` work proved in its deployed Sandbox environment that:

- `/dev/fuse` is present;
- ArtifactFS can be built into a Sandbox image;
- `fuse3` and corporate/WARP CA trust are required image prerequisites;
- a real public Git repository can be mounted via ArtifactFS;
- exact destination path semantics matter: an agent-selected `/home/user/src/capa` cannot be represented by a generated sibling mount plus symlink without breaking the computer contract.

This is useful proof, but ArtifactFS ownership belongs in Cloudbox if Cloudbox is the canonical computer service. Cloudbox must independently live-prove FUSE/ArtifactFS in its own intended container stack.

### Seal: secure private GitLab Git transport is implemented

Direct inspection confirms that Seal implements the needed security architecture:

- `../cto-agent-research/apps/oauth-proxy/src/index.ts` configures GitLab OAuth with `read_repository` and `write_repository` scopes and CF Access service headers.
- `../cto-agent-research/apps/oauth-proxy/src/worker-entrypoint.ts` exposes server-side `oauthFetch(userId, appId, request)` backed by per-user OAuth state.
- `../cto-agent-research/apps/oauth-proxy/src/fetch.ts` distinguishes Git smart HTTP requests and injects `Basic oauth2:<token>` authentication for Git paths while using bearer auth for API calls; it also inserts `.git` to avoid redirect/header-loss behavior.
- `../cto-agent-research/apps/seal/worker/objects/sandbox/seal-sandbox.ts` uses `interceptHttpsByHost = true` and `setOutboundByHosts(...)` for trusted per-host interception.
- `../cto-agent-research/apps/seal/worker/lib/egress/gitlab.ts` classifies Git transport and API requests into repo read/write decisions with repository keys such as `gitlab:gitlab.cfdata.org:group/project`.
- Seal grant code distinguishes `git_repo_read` from `git_repo_write`; read does not grant publication rights.

The key property is appropriate for Cloudbox: ordinary Git runs inside the computer while reusable OAuth and Access credentials remain in trusted Worker-side infrastructure.

### Cloudbox: right product locus, wrong current GitLab credential boundary

Cloudbox already owns relevant repo computer concepts:

- live run container APIs in `src/container-runner.ts`, `src/http.ts`, `src/live-run-tools.ts`, and `runner/server.mjs`;
- current local spikes for lifecycle and optional desktop behavior in `docs/internal/box-parity-first-pass.md` and related uncommitted files;
- GitLab-shaped API input (`auth?: "gitlab"`) and a Stratus smoke script.

However, `runner/server.mjs` currently reads `CLOUDBOX_GITLAB_TOKEN`/`GITLAB_TOKEN` inside the container and embeds it in a clone URL. This is not an acceptable durable personal-computer boundary. It must not become the production private-repository path.

### Cloudshell: terminal and capability-ticket primitives

Cloudshell contains implemented, reusable patterns:

- app-origin browser terminal routing with short-lived user/session/tab tickets (`README.md`, `shared/terminal-ticket.ts`, `src/routes/ws/terminal/+server.ts`, `src/lib/server/worker.ts`, `worker/index.ts`, `worker/container/main.go`);
- xterm.js rather than a bespoke or shellinabox-first terminal surface;
- a server-held OAuth/MCP bridge in which a container receives only a scoped short-lived capability ticket (`worker/user-agent.ts`, `worker/mcp-bridge.ts`, `worker/mcp-oauth.ts`).

Cloudbox should prefer a Cloudshell-derived authenticated terminal architecture over making `shellinabox` the canonical UI.

Cloudshell also records prior FUSE/tigrisfs startup trouble in its container stack, reinforcing the need for a separate Cloudbox ArtifactFS production proof.

### AgentCast: browser control, not full desktop

AgentCast and its exploration application contain implemented browser primitives:

- browser container lifecycle and session status (`agentcast/src/browser.ts`, `agentcast/src/browser-agent.ts`);
- CDP screencast viewer and CDP WebSocket proxy (`agentcast-exploration/apps/worker/src/index.ts`, `viewer.ts`);
- real-time mouse/keyboard/text control through CDP;
- Playwright/Chromium container implementation (`agentcast-exploration/apps/container/src/index.ts`, `Dockerfile`).

This is a better candidate for a controlled Chromium surface than defaulting to noVNC for browser-oriented use cases. It is not a terminal or general Linux GUI replacement.

### `spawn-agent-cloud`: useful preview/session ideas, currently scaffolded

`spawn-agent-cloud` proposes an agent/container/Artifacts/Worker Loader composition (`src/Api.ts`, `src/SessionDO.ts`, `src/Sandbox.ts`, `src/Repos.ts`). Its source still explicitly marks essential container endpoints and ACP integration as TODO. It is useful architectural input for agent streams and Worker preview, not a proven filesystem or computer substrate.

## Proposed ownership split

```txt
my.ax
  personal-agent experience: chat, skills, jobs, connector UX, browser proof,
  invoking computer actions and presenting outcomes

Cloudbox
  canonical deployed Computer service: durable filesystem, repository mounts,
  commands/tests/diffs, process/preview lifecycle, snapshots/forks, terminals,
  browser sessions, receipts and artifacts

Seal-derived module/service
  per-user GitLab OAuth, CF Access forwarding, smart-HTTP auth injection,
  repo-scoped read/write grants; no reusable token inside computer

Cloudshell-derived terminal
  xterm.js + authenticated app-origin WebSocket PTY and capability tickets

AgentCast-derived browser surface
  interactive controlled Chromium where required

ax-mcp / cf-portal
  MR/API/metadata operations after or alongside real Git transport
```

## Product-model tension to resolve explicitly

The existing Cloudbox architecture describes `/api/runs` as the product center and says interactive runs should not introduce an external workspace product. This remains valuable for bounded proof work.

The `my.ax` use case introduces a different need: a persistent personal computer used by multiple conversations, jobs, repositories and processes over time. It must not be forced into a generated-folder Workspace abstraction, but it may require a durable `Computer` identity above individual proof runs.

Recommended reconciliation:

```txt
Computer = durable owner-scoped machine and filesystem
Run/Task = bounded auditable operation executed inside a Computer
```

Do not discard `/api/runs`; subordinate it to a Computer for persistent-agent use cases while retaining clean ephemeral runs for the public proof funnel.

## Identity and delegation recommendation

Cloudbox must derive computer ownership from verified human identity, not caller-supplied email. For browser-mediated user work, protect Cloudbox with first-party user authentication compatible with `my.ax`'s verified identity.

For `my.ax` server-side turns/jobs, use short-lived audience-bound delegated capabilities carrying only scoped permissions, for example:

```txt
subject: verified user id
computer: personal default computer
scopes: computer.exec, fs.read, fs.write, repo.mount.read
issuer: my.ax
audience: cloudbox
expiry: short-lived
originating session/job id: audited
```

Publication (`repo.push`) must require explicit fresh user approval or a narrow operation-scoped grant. GitLab OAuth remains stored by Cloudbox/trusted auth infrastructure, never placed in `/home/user` or an agent-visible environment.

Seal's workspace-scoped grant model should be adapted as:

```txt
user + computer + repo + permission + expiry
```

rather than importing Seal's product-specific Workspace UI/model.

## Immediate milestone sequence

### Phase 0: preserve spikes and avoid further divergence

- Preserve `my.ax` ArtifactFS spike as proof/reference rather than extending it as the final product.
- Preserve Cloudbox's local lifecycle/desktop spike before restructuring it.
- Record this architecture decision proposal before code is promoted.

### Phase 1: define a minimal Cloudbox Computer contract

A first Sandbox-backed vertical slice has now been started under `/api/personal-computers/:owner/*` with `exec`, `read`, and `write` only. The `:owner` argument is deliberately not a production identity contract: these routes are bounded internal scaffolding requiring an internal token plus matching owner assertion, and must not be exposed as an end-user API until verified identity/delegation is implemented.

Specify owner-scoped computer operations without implementing broad UI:

```txt
computer.get/create
computer.exec/read/write/list
computer.mountRepo(path, remote, ref)
computer.snapshot/resume/fork
computer.startPreview
computer.terminalConnection
computer.authorizeRepoRead / approvePublication
```

Support arbitrary user-selected paths under `/home/user`; do not invent generated workspace folder layouts.

### Phase 2: private GitLab transport proof first

Adopt/extract the minimum Seal components required for:

```txt
per-user GitLab OAuth → intercepted smart HTTP clone/fetch/push
→ repo-scoped read/write grants → no token in container
```

First proof should clone or fetch one permitted private `gitlab.cfdata.org` repository in Cloudbox and verify token non-exposure.

### Phase 3: ArtifactFS in Cloudbox

Port ArtifactFS build/runtime lessons from `my.ax`, including direct exact-path mounting. Prove private GitLab mount through the brokered transport at the exact requested path.

### Phase 4: publication and MR

After local edits/tests/diffs, require explicit approval, push through brokered write transport, and create MR through `ax-mcp` or API capability. Record receipts for approval, ref, test output, push and MR URL.

### Phase 5: integrate `my.ax`

Replace direct repository-computer implementation in `my.ax` with Cloudbox Computer calls. Retain `my.ax`'s agent/user-experience responsibilities.

### Phase 6: interactive surfaces

Adopt Cloudshell terminal, retain dev preview proxy, evaluate AgentCast for controlled browser, and defer full noVNC desktop unless arbitrary GUI use is demanded.

## Spike disposition recommendation

### `my.ax`

Treat the local ArtifactFS work as verified proof and porting reference. Once Cloudbox supplies the computer contract, remove/deprecate direct repository-mount tooling from `my.ax`. Do not continue positioning public-GitHub-only mounting as the product workflow.

### Cloudbox

Retain/refine live operation and lifecycle work. Do not ship token-in-container GitLab authentication as the private-repo solution. Keep noVNC as feasibility/fallback evidence rather than the default UX decision. Recast durable personal-computer needs explicitly rather than stretching a proof run silently into a long-lived user machine.

## First-class acceptance target

```txt
Signed-in user authorizes GitLab access outside their computer
→ Cloudbox mounts/clones a private gitlab.cfdata.org repo at /home/user/src/project
→ agent reads, edits, tests and diffs in the real filesystem
→ agent/environment cannot access reusable GitLab credentials
→ user explicitly approves push
→ Cloudbox publishes through brokered transport
→ caller creates MR through ax-mcp/API layer
```

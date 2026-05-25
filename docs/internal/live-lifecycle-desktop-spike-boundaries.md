# Live lifecycle and desktop spike boundaries

Date: 2026-05-25
Status: local implementation spike preserved for evaluation; not the canonical private-repository or interactive-UI architecture

## What this spike proves

This local Cloudbox work extends the existing run surface with experimental live-computer behaviors:

```txt
live run → exec/read/write/dev/preview
         → stop/snapshot → resume
         → fork
         → delete
```

It also proves that a separately sized desktop image can boot a browser shell/noVNC/Chromium stack without inflating the normal proof runner image.

## What this spike does not decide

This spike predates the convergence review in `canonical-computer-convergence.md`. It must not be read as deciding any of the following:

- that a long-lived personal computer should permanently be modeled only as a `Run`;
- that noVNC/shellinabox is the canonical product UI instead of Cloudshell/AgentCast-derived surfaces;
- that the base64 snapshot round trip is scalable persistence;
- that current GitLab credential handling is acceptable.

## Security boundary: private GitLab auth is not ready in this spike

The current runner still contains the pre-existing proof path that reads:

```txt
CLOUDBOX_GITLAB_TOKEN / GITLAB_TOKEN
```

inside the container and embeds it in an authenticated Git URL. That is not acceptable for a durable agent-visible computer. Do not deploy or position `auth: "gitlab"` as the intended private repository implementation.

The required replacement is the Seal-derived transport architecture recorded in `canonical-computer-convergence.md`:

```txt
ordinary Git in computer
→ trusted per-host egress interception
→ repo-scoped read/write grant
→ Worker-side per-user OAuth injection for Git smart HTTP
→ no reusable GitLab credential in container/filesystem/process environment
```

## What can be retained

The following portions are useful independent of the eventual Computer-versus-Run decision:

- endpoint/client shapes for follow-up exec/read/write/dev/preview;
- stop/resume/fork lifecycle semantics;
- separation between a lightweight runner and any optional heavy visual runtime;
- tests documenting lifecycle state restrictions and routing;
- proof scripts as experimental operator tools.

## Next proof milestone

Before production deployment of private repo workflows, Cloudbox must safely prove:

```txt
signed-in user authorizes one private gitlab.cfdata.org repository outside the container
→ repo is cloned or mounted at an exact requested filesystem path
→ agent can edit/test/diff
→ reusable GitLab credentials cannot be observed in env/files/command output
→ push is separately approval-gated
```

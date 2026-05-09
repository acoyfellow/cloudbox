// Dogfood scenario used by /demo: Cloudbox evaluates an agent helping ship Cloudbox.

import { defineComputer } from "../src/spec.ts";

export const agentLaunchSpec = defineComputer({
  name: "agent-launch-readiness",
  profile: {
    role: "staff agent systems engineer",
    seniority: "staff",
    owner: "you and your agents",
  },
  filesystem: [
    {
      path: "README.md",
      kind: "design-doc",
      state: "draft",
      description: "Cloudbox product positioning, promise, and seven-minute path.",
    },
    {
      path: "docs/quickstart.md",
      kind: "runbook",
      description: "The constrained path an agent or human follows from clone to live demo.",
    },
    {
      path: "docs/architecture.md",
      kind: "design-doc",
      description: "Cloudflare-native control plane: Worker, Durable Objects, R2, D1, Queues, Workers AI.",
    },
    {
      path: "package.json",
      kind: "config",
      description: "Scripts an agent should trust before claiming the repo is ready.",
    },
  ],
  collaborators: [
    {
      id: "owner",
      role: "product-owner",
      style: "direct",
      focus: "design this for my agents; keep the demo constrained and shippable",
    },
    {
      id: "skeptic",
      role: "release-reviewer",
      style: "skeptical",
      focus: "catch overclaims, missing checks, and anything that would waste agent time",
    },
  ],
  objectives: [
    {
      id: "launch-readiness",
      title: "Decide whether Cloudbox is ready to share",
      description: "Inspect the product docs, ask for skeptical review, create a launch note, and submit a clear go/no-go decision.",
      expectedArtifact: "artifacts/launch-note.md",
    },
  ],
  rubric: [
    {
      id: "read-positioning-first",
      weight: 2,
      must: "reads README.md before docs/architecture.md so positioning leads implementation detail",
      mustEvent: { type: "readBefore", before: "README.md", after: "docs/architecture.md" },
    },
    {
      id: "read-quickstart",
      weight: 1,
      must: "reads docs/quickstart.md before deciding",
      mustEvent: { type: "read", path: "docs/quickstart.md" },
    },
    {
      id: "asks-skeptic",
      weight: 2,
      must: "asks skeptic to check for overclaims before launch",
      mustEvent: { type: "asked", who: "skeptic" },
    },
    {
      id: "writes-launch-note",
      weight: 2,
      must: "writes artifacts/launch-note.md as a durable handoff",
      mustEvent: { type: "wrote", path: "artifacts/launch-note.md" },
    },
    {
      id: "submits-go",
      weight: 1,
      must: "submits a launch-readiness decision",
      mustEvent: { type: "submitted", objective: "launch-readiness" },
    },
  ],
});

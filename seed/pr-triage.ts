// The seeded ComputerSpec used by the live /demo page and quickstart.
//
// PR-triage scenario: a staff engineer triaging an open PR with failing CI
// and three reviewer threads. The rubric tests two behaviors that
// long-horizon agents commonly miss:
//
//   1. Reads the design doc before editing the diff.
//   2. Routes the architectural question to the architectural reviewer,
//      not the nitpicky one.
//
// Author this kind of spec by hand, generate one with fromBrief(), or load
// from JSON. Pass it to materialize() to turn it into a running computer.

import { defineComputer } from "../src/spec.ts";

export const prTriageSpec = defineComputer({
  name: "pr-triage",
  profile: {
    role: "staff platform engineer",
    onCall: "primary",
    seniority: "staff",
  },
  filesystem: [
    {
      path: "src/auth/login.ts",
      kind: "diff",
      state: "open-pr",
      description: "PR diff: switches login from sync session lookup to a queue-backed flow.",
    },
    {
      path: ".github/workflows/ci.yml",
      kind: "log",
      state: "failing",
      description: "Latest CI run; integration tests failed twice in a row with different errors.",
    },
    {
      path: "docs/auth-redesign.md",
      kind: "design-doc",
      description: "Design doc the PR implements. Defines the queue-vs-sync tradeoff.",
    },
    {
      path: "runbooks/auth-pager.md",
      kind: "runbook",
      description: "On-call runbook for the auth service. Touched by this PR.",
    },
  ],
  collaborators: [
    {
      id: "author",
      role: "pr-author",
      style: "anxious",
      focus: "shipping the PR before the on-call rotation",
    },
    {
      id: "arch",
      role: "reviewer",
      style: "architectural",
      focus: "design",
    },
    {
      id: "nit",
      role: "reviewer",
      style: "nitpicky",
      focus: "style",
    },
  ],
  objectives: [
    {
      id: "triage",
      title: "Decide approve / request-changes / needs-discussion on the PR",
      description: "Read the diff, understand the design intent, route any open questions to the right reviewer, and submit a decision.",
    },
  ],
  rubric: [
    {
      id: "design-first",
      weight: 2,
      must: "reads docs/auth-redesign.md before editing src/auth/login.ts",
      mustEvent: {
        type: "readBefore",
        before: "docs/auth-redesign.md",
        after: "src/auth/login.ts",
      },
    },
    {
      id: "right-reviewer",
      weight: 3,
      must: "asks `arch` about architecture, not `nit`",
      mustEvent: {
        type: "askedOnly",
        who: "arch",
        notWho: "nit",
      },
    },
    {
      id: "decided",
      weight: 1,
      must: "submits a triage decision",
      mustEvent: {
        type: "submitted",
        objective: "triage",
      },
    },
  ],
});

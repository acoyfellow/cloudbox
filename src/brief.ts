// Cloudbox — fromBrief().
//
// Drafts a ComputerSpec from a one-line brief. v0 is a deterministic stub
// that returns a minimal spec the user can edit. The real implementation
// (Workers AI-backed structured generation) lands in a later phase.

import type { ComputerSpec } from "./spec.ts";

export type BriefEnv = {
  AI?: Ai;
};

/**
 * Draft a spec from a sentence. v0: deterministic stub. The brief itself is
 * surfaced as a `description` on a single design-doc file so the caller can
 * see Cloudbox received the input. Edit the result before materializing.
 */
export async function fromBrief(text: string, _env: BriefEnv): Promise<ComputerSpec> {
  const trimmed = text.trim();
  return {
    name: "draft",
    profile: {
      role: extractRole(trimmed),
      seniority: extractSeniority(trimmed),
    },
    filesystem: [
      {
        path: "BRIEF.md",
        kind: "design-doc",
        description: trimmed,
      },
    ],
    collaborators: [
      { id: "reviewer", role: "reviewer" },
    ],
    objectives: [
      { id: "complete", title: "Complete the work described in BRIEF.md" },
    ],
    rubric: [
      {
        id: "read-brief",
        weight: 1,
        must: "reads BRIEF.md before starting work",
        mustEvent: { type: "read", path: "BRIEF.md" },
      },
    ],
  };
}

function extractRole(text: string): string {
  // Simple heuristic for v0: take the first noun phrase after "A "/"An ".
  const m = text.match(/^\s*An?\s+([^,.]+?)(?:\s+responsible|\s+working|\s+who|[,.])/i);
  if (m) return m[1].trim().toLowerCase();
  return "knowledge worker";
}

function extractSeniority(text: string): string | undefined {
  const m = text.match(/\b(junior|senior|staff|principal|lead)\b/i);
  return m ? m[1].toLowerCase() : undefined;
}
